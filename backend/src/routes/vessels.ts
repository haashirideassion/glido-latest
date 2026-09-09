import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import { logPlannerActivity } from '../lib/plannerActivity'
import { notifyRoleIfEnabled, plannerSystemNotifEnabled } from '../lib/userNotifications'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

function generateVesselCode(): string {
  const seq = String(Math.floor(Math.random() * 900000) + 100000)
  return `VSL-${seq}`
}

// GET /api/vessels — search (name/code) + status filter
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query
    const conditions: string[] = ['tenant_id = $1']
    const params: unknown[] = [DEFAULT_TENANT_ID]
    let i = 2

    if (status) { conditions.push(`status = $${i++}`); params.push(status) }
    if (search) {
      conditions.push(`(vessel_name ILIKE $${i} OR vessel_code ILIKE $${i})`)
      params.push(`%${search}%`)
      i++
    }

    // "Containers" (FR — Planner Vessels) is the count of containers assigned to the vessel via
    // actual created business requests (trips), not the manually-typed value from Add Vessel —
    // overrides the stored container_count column with a live count.
    const result = await pool.query(
      `SELECT v.*, COALESCE(t.trip_count, 0)::int AS container_count
       FROM vessels v
       LEFT JOIN (SELECT vessel_id, COUNT(*) AS trip_count FROM trips WHERE vessel_id IS NOT NULL GROUP BY vessel_id) t
         ON t.vessel_id = v.id
       WHERE ${conditions.join(' AND ')} ORDER BY eta ASC NULLS LAST`,
      params
    )
    return res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[vessels GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/vessels/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT v.*, COALESCE((SELECT COUNT(*) FROM trips WHERE vessel_id = v.id), 0)::int AS container_count
       FROM vessels v
       WHERE (v.id::text = $1 OR v.vessel_code = $1) AND v.tenant_id = $2 LIMIT 1`,
      [req.params.id, DEFAULT_TENANT_ID]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[vessels GET /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/vessels — Add Vessel
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const b = req.body
  if (!b.vessel_name?.trim()) {
    return res.status(400).json({ success: false, error: { message: 'Vessel name is required' } })
  }
  try {
    const result = await pool.query(
      `INSERT INTO vessels (vessel_name, vessel_code, eta, port, status, container_count, tenant_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        b.vessel_name.trim(),
        b.vessel_code?.trim() || generateVesselCode(),
        b.eta ?? null,
        b.port ?? null,
        b.status ?? 'scheduled',
        b.container_count ?? 0,
        DEFAULT_TENANT_ID,
        req.user!.id,
      ]
    )
    const vessel = result.rows[0]
    const statusVerb = vessel.status === 'in_transit' ? 'now in transit' : vessel.status === 'arrived' ? 'arrived' : 'scheduled for arrival'
    logPlannerActivity('vessel', `Vessel ${vessel.vessel_name} ${statusVerb}`, DEFAULT_TENANT_ID, req.user!.id)
    return res.status(201).json({ success: true, data: vessel })
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: { message: 'A vessel with this ID already exists' } })
    console.error('[vessels POST /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/vessels/:id/status — advance Scheduled → In Transit → Arrived
router.patch('/:id/status', requireAuth, async (req: Request, res: Response) => {
  const { status } = req.body as { status?: string }
  if (!status || !['scheduled', 'in_transit', 'arrived'].includes(status)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid status' } })
  }
  try {
    const result = await pool.query(
      `UPDATE vessels SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [status, req.params.id, DEFAULT_TENANT_ID]
    )
    const vessel = result.rows[0]
    if (!vessel) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    const statusVerb = status === 'in_transit' ? 'now in transit' : status === 'arrived' ? 'arrived' : 'scheduled for arrival'
    logPlannerActivity('vessel', `Vessel ${vessel.vessel_name} ${statusVerb}`, DEFAULT_TENANT_ID, req.user!.id)
    if (status === 'arrived') {
      notifyRoleIfEnabled('planner', DEFAULT_TENANT_ID, 'vessel_arrival',
        'Vessel arrived', `Vessel ${vessel.vessel_name} (${vessel.vessel_code}) has arrived.`,
        userId => plannerSystemNotifEnabled(userId, 'vessel_arrival'))
    }
    // Keep container_count consistent with GET's live-computed value (count of actual linked
    // trips), not the raw stored column on this row.
    const liveCount = await pool.query(`SELECT COUNT(*)::int AS n FROM trips WHERE vessel_id = $1`, [vessel.id])
    vessel.container_count = liveCount.rows[0]?.n ?? 0
    return res.json({ success: true, data: vessel })
  } catch (err) {
    console.error('[vessels PATCH status]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
