import { pool } from '../db'

// ── Shapes matching what SettingsPage.tsx actually saves ──────────────────────
// working_hours JSONB = { mon: DayHours, ..., sun: DayHours, periods: { morning, afternoon, evening } }
interface DayHours { enabled: boolean; open: string; close: string }
interface SlotPeriod { enabled: boolean; start: string; end: string }

export const COMBOS = ['pickup-lcl', 'pickup-fcl', 'dropoff-lcl', 'dropoff-fcl'] as const

export interface TenantSlotSettings {
  workingHours: Record<string, DayHours>     // keyed mon..sun
  periods: Record<string, SlotPeriod>        // keyed morning/afternoon/evening
  slotDurationMin: number
  maxBookingsPerSlot: number
  // Single hour × combo capacity matrix — replaces the old separate "per-hour total" and
  // "per-combo total" settings, which could both claim to cap the same booking with no
  // defined precedence. One cell = the answer for that exact hour+combo pairing, period.
  // e.g. { "08:00": { "pickup-lcl": 5, "pickup-fcl": 3, ... }, "09:00": { ... } }
  capacityMatrix: Record<string, Record<string, number>>
  // Legacy columns — read only as a per-cell fallback (see getMatrixCapacity) for tenants
  // who configured the old two-section UI but haven't saved from the new matrix table yet.
  // NOT pre-merged into capacityMatrix here: a tenant who only ever set combo-wide values
  // (no specific hours) has an empty legacyByHour, so iterating "hours with legacy data"
  // would silently drop their combo settings entirely — resolving per-cell on read avoids
  // needing to guess which hours to backfill.
  legacyCapacityByHour: Record<string, number>
  legacyCapacityByCombo: Record<string, number>
}

const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export async function getTenantSlotSettings(tenantId: string): Promise<TenantSlotSettings> {
  const { rows } = await pool.query(
    `SELECT working_hours, slot_duration_min, max_bookings_per_slot,
            slot_capacity_matrix, slot_capacity_by_hour, slot_capacity_by_combo
     FROM tenants WHERE id = $1`,
    [tenantId]
  )
  const t = rows[0] ?? {}
  const wh = t.working_hours ?? {}
  const { periods, staff_permissions, ...days } = wh

  return {
    workingHours: days ?? {},
    periods: periods ?? {},
    slotDurationMin: t.slot_duration_min ?? 60,
    maxBookingsPerSlot: t.max_bookings_per_slot ?? 5,
    capacityMatrix: t.slot_capacity_matrix ?? {},
    legacyCapacityByHour: t.slot_capacity_by_hour ?? {},
    legacyCapacityByCombo: t.slot_capacity_by_combo ?? {},
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}
function toHHMM(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export interface DaySlotBucket { start_time: string; end_time: string }

/**
 * Which hour buckets exist at all on a date — Operating Hours ∩ enabled Slot Periods.
 * Capacity is deliberately NOT part of this: it's now per (hour, combo), resolved by
 * getMatrixCapacity, since a single per-bucket number can't represent that.
 * Returns [] if the day is closed or has an invalid open/close window.
 */
export function computeDaySlots(date: string, settings: TenantSlotSettings): DaySlotBucket[] {
  const dow = DOW_KEYS[new Date(date + 'T00:00:00Z').getUTCDay()]
  const day = settings.workingHours[dow]
  if (!day || !day.enabled || !day.open || !day.close) return []

  const dayStart = toMinutes(day.open)
  const dayEnd = toMinutes(day.close)
  if (dayEnd <= dayStart) return []

  const enabledPeriods = Object.values(settings.periods).filter(p => p && p.enabled && p.start && p.end)
  // No periods configured/enabled at all → treat the whole operating window as one period,
  // so a tenant that's never touched Slot Periods still gets working availability.
  const ranges: Array<[number, number]> = enabledPeriods.length
    ? enabledPeriods.map(p => [Math.max(dayStart, toMinutes(p.start)), Math.min(dayEnd, toMinutes(p.end))])
    : [[dayStart, dayEnd]]

  const duration = settings.slotDurationMin > 0 ? settings.slotDurationMin : 60
  const seen = new Set<string>()
  const buckets: DaySlotBucket[] = []

  for (const [rangeStart, rangeEnd] of ranges) {
    if (rangeEnd <= rangeStart) continue
    for (let t = rangeStart; t + duration <= rangeEnd; t += duration) {
      const start = toHHMM(t)
      if (seen.has(start)) continue   // overlapping periods shouldn't double up the same hour
      seen.add(start)
      buckets.push({ start_time: start, end_time: toHHMM(t + duration) })
    }
  }
  return buckets.sort((a, b) => a.start_time.localeCompare(b.start_time))
}

export function comboKey(serviceType: string, loadType: string): string {
  return `${serviceType}-${loadType}`
}

/**
 * The capacity for one exact (hour, combo) cell, resolved in order:
 *   1. The matrix cell itself (what the new merged Settings table saves)
 *   2. The legacy per-hour value for this hour (old "Per-hour Capacity" section)
 *   3. The legacy per-combo value for this combo (old "Capacity by Booking Type" section)
 *   4. The tenant's default max-per-slot
 * Resolved per-cell rather than pre-merged into a full matrix on load, so a tenant who only
 * ever configured combo-wide values (no specific hours) doesn't lose them just because no
 * hour key exists to hang them off. 0 at any tier is a real, explicit "blocked" value.
 */
export function getMatrixCapacity(settings: TenantSlotSettings, startTime: string, serviceType: string, loadType: string): number {
  const key = comboKey(serviceType, loadType)
  const cell = settings.capacityMatrix[startTime]?.[key]
  if (typeof cell === 'number') return cell
  const legacyHour = settings.legacyCapacityByHour[startTime]
  if (typeof legacyHour === 'number') return legacyHour
  const legacyCombo = settings.legacyCapacityByCombo[key]
  if (typeof legacyCombo === 'number') return legacyCombo
  return settings.maxBookingsPerSlot
}

/**
 * Live count of non-cancelled bookings for one specific combo in one specific hour —
 * computed straight from `bookings`, not a denormalized counter, so it can never drift
 * from what's actually booked.
 */
export async function getComboBookingCount(
  tenantId: string, date: string, startTime: string, serviceType: string, loadType: string,
): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM bookings
     WHERE tenant_id = $1 AND slot_date = $2 AND slot_start_time = $3
       AND service_type = $4 AND load_type = $5 AND status != 'cancelled'`,
    [tenantId, date, startTime, serviceType, loadType]
  )
  return rows[0]?.n ?? 0
}
