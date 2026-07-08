import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { getTenantSlotSettings, computeDaySlots, getMatrixCapacity, comboKey, COMBOS } from '../lib/slotAvailability'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'
// Slots are public — guests need to see availability when booking

function calcBusyness(confirmed: number, capacity: number): 'available' | 'busy' | 'full' {
  if (capacity <= 0 || confirmed >= capacity) return 'full'
  if (confirmed / capacity >= 0.6) return 'busy'
  return 'available'
}

/**
 * The single source of truth for "what can be booked on this date" — Operating Hours ∩
 * enabled Slot Periods decide which hours exist; the Capacity Matrix (hour × combo) caps
 * each exact pairing. Confirmed counts come live from `bookings`, grouped by hour+combo in
 * one query, so they can never drift from what's actually booked.
 *
 * With serviceType+loadType: each bucket's capacity/confirmed/busyness reflect THAT combo
 * only. Without them (e.g. a date-range heatmap): capacity is the sum of all 4 combos'
 * capacities for that hour, confirmed is the sum of all combos' live counts — a coarse
 * "how busy overall" view, not itself an enforcement gate.
 */
async function buildDaySlots(tenantId: string, date: string, serviceType?: string, loadType?: string) {
  const settings = await getTenantSlotSettings(tenantId)
  const buckets = computeDaySlots(date, settings)
  if (buckets.length === 0) return []

  const { rows: bookingRows } = await pool.query(
    `SELECT slot_start_time::text AS start_time, service_type, load_type, COUNT(*)::int AS n
     FROM bookings
     WHERE tenant_id = $1 AND slot_date = $2 AND status != 'cancelled'
     GROUP BY slot_start_time, service_type, load_type`,
    [tenantId, date]
  )

  // countByHourCombo["08:00"]["pickup-lcl"] = n
  const countByHourCombo = new Map<string, Map<string, number>>()
  for (const r of bookingRows) {
    const hour = String(r.start_time).slice(0, 5)
    const key = comboKey(r.service_type, r.load_type)
    if (!countByHourCombo.has(hour)) countByHourCombo.set(hour, new Map())
    countByHourCombo.get(hour)!.set(key, r.n)
  }

  const singleCombo = serviceType && loadType ? comboKey(serviceType, loadType) : null

  return buckets.map(b => {
    const hourCounts = countByHourCombo.get(b.start_time)

    if (singleCombo) {
      const capacity = getMatrixCapacity(settings, b.start_time, serviceType!, loadType!)
      const confirmed = hourCounts?.get(singleCombo) ?? 0
      return {
        // "gen-" prefix is meaningful, not decorative — the frontend's hold/release helpers
        // skip calling the server for ids with this prefix (see holdSlot/releaseSlot in
        // Step4ShipmentDetails.tsx), since capacity is now resolved live from `bookings`
        // rather than a persisted time_slots row for this id to reference.
        id: `gen-${date}-${b.start_time.replace(':', '')}-${singleCombo}`,
        date, start_time: b.start_time, end_time: b.end_time,
        capacity, confirmed, held: 0,
        busyness: calcBusyness(confirmed, capacity),
      }
    }

    // Aggregate across all 4 combos for a coarse day-level view
    let capacity = 0, confirmed = 0
    for (const c of COMBOS) {
      const [svc, load] = c.split('-')
      capacity += getMatrixCapacity(settings, b.start_time, svc, load)
      confirmed += hourCounts?.get(c) ?? 0
    }
    return {
      id: `gen-${date}-${b.start_time.replace(':', '')}`,
      date, start_time: b.start_time, end_time: b.end_time,
      capacity, confirmed, held: 0,
      busyness: calcBusyness(confirmed, capacity),
    }
  })
}

// GET /api/v2/slots — supports ?date= or ?from=&to=, optional &tenantId=&serviceType=&loadType=
router.get('/', async (req: Request, res: Response) => {
  const { date, from, to, tenantId, serviceType, loadType } = req.query
  const tid = (tenantId as string) || DEFAULT_TENANT_ID
  try {
    if (date) {
      const slots = await buildDaySlots(tid, date as string, serviceType as string | undefined, loadType as string | undefined)
      return res.json({ success: true, data: slots })
    }
    if (from && to) {
      // Range view (e.g. a monthly heatmap) — no combo narrowing, just per-day totals
      const dates: string[] = []
      const d = new Date(`${from}T00:00:00Z`)
      const end = new Date(`${to}T00:00:00Z`)
      while (d <= end) { dates.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) }
      const perDay = await Promise.all(dates.map(dt => buildDaySlots(tid, dt)))
      return res.json({ success: true, data: perDay.flat() })
    }
    return res.status(400).json({ success: false, error: { message: 'Provide date or from+to' } })
  } catch (err) {
    console.error('[slots GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/v2/slots/busyness?date= — legacy alias, same computation
router.get('/busyness', async (req: Request, res: Response) => {
  const { date, tenantId } = req.query
  if (!date) return res.status(400).json({ success: false, error: { message: 'date is required' } })
  try {
    const slots = await buildDaySlots((tenantId as string) || DEFAULT_TENANT_ID, date as string)
    return res.json({ success: true, data: slots })
  } catch (err) {
    console.error('[slots GET /busyness]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/slots/:id/hold — increment held when a user picks a slot in the wizard.
// NOTE: capacity is now per (hour, combo), resolved live against `bookings`; time_slots'
// held/confirmed are no longer read for capacity decisions. This keeps the endpoint (and the
// hold-timer pill it drives) working for any legacy real time_slots rows, but it's no longer
// authoritative — see bookings.ts for the real enforcement.
router.post('/:id/hold', async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { rows } = await pool.query(
      `UPDATE time_slots SET held = held + 1 WHERE id = $1 RETURNING id, held`,
      [id]
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Slot not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[slots POST /:id/hold]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/slots/:id/release — decrement held when hold expires or slot is deselected
router.post('/:id/release', async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { rows } = await pool.query(
      `UPDATE time_slots SET held = GREATEST(held - 1, 0) WHERE id = $1 RETURNING id, held`,
      [id]
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Slot not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[slots POST /:id/release]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
