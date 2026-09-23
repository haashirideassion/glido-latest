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

/** Roles allowed to write to a vessel record at all. Mirrors PlannerGuard on the frontend. */
const VESSEL_WRITE_ROLES = ['planner', 'super_admin']

function denyUnlessPlanner(req: Request, res: Response): boolean {
  if (!req.user || !VESSEL_WRITE_ROLES.includes(req.user.role)) {
    res.status(403).json({ success: false, error: { message: 'Forbidden' } })
    return true
  }
  return false
}

/**
 * Mirrors usePlannerPermissions on the frontend: super_admin always holds the right, every other
 * planner takes the per-tenant flag from tenants.working_hours.planner_permissions, defaulting to
 * true when it has never been configured.
 *
 * FRD 2.4.2.1 requires Add Vessel to be offered only to users holding this right. Until now that
 * was a UI-only gate — POST /api/vessels carried requireAuth alone, so any logged-in user of any
 * role could create a vessel with a direct API call.
 */
async function canCreateVessel(role: string): Promise<boolean> {
  if (role === 'super_admin') return true
  const result = await pool.query(
    `SELECT working_hours->'planner_permissions'->>'can_create_vessel' AS flag
     FROM tenants WHERE id = $1`,
    [DEFAULT_TENANT_ID]
  )
  return result.rows[0]?.flag !== 'false'
}

// The first milestone the vessel has actually reached wins, falling back to ETA —
// FRD 2.4.2.1 "sort sequence - slotted, discharged, etd, eta".
const VESSEL_SORT_KEY = 'COALESCE(v.slotted_at, v.discharged_at, v.etd, v.eta)'

// Columns Add Vessel may set. container_count is deliberately absent — it is derived from the
// trips actually linked to the vessel, never typed in.
const VESSEL_INSERT_COLUMNS = [
  'vessel_name', 'vessel_code', 'eta', 'etd', 'port', 'status',
  'capacity', 'voyage_number', 'lloyd_number', 'slotted_at', 'discharged_at',
] as const

// GET /api/vessels — search (name/code/voyage/Lloyd) + status filter
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query
    const conditions: string[] = ['tenant_id = $1']
    const params: unknown[] = [DEFAULT_TENANT_ID]
    let i = 2

    if (status) { conditions.push(`status = $${i++}`); params.push(status) }
    if (search) {
      // FRD 2.4.2.1: "search the vessels by the vessel name and the vessel ID voyage & Lloyd".
      conditions.push(
        `(vessel_name ILIKE $${i} OR vessel_code ILIKE $${i} OR voyage_number ILIKE $${i} OR lloyd_number ILIKE $${i})`
      )
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
       WHERE ${conditions.join(' AND ')} ORDER BY ${VESSEL_SORT_KEY} ASC NULLS LAST, v.vessel_name ASC`,
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
  if (denyUnlessPlanner(req, res)) return

  const b = req.body
  if (!b.vessel_name?.trim()) {
    return res.status(400).json({ success: false, error: { message: 'Vessel name is required' } })
  }
  if (b.status && !['scheduled', 'in_transit', 'arrived'].includes(b.status)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid status' } })
  }
  // Capacity is a container count — reject anything that isn't a non-negative whole number rather
  // than letting Postgres coerce or throw.
  let capacity: number | null = null
  if (b.capacity != null && b.capacity !== '') {
    capacity = Number(b.capacity)
    if (!Number.isInteger(capacity) || capacity < 0) {
      return res.status(400).json({ success: false, error: { message: 'Capacity must be a whole number of containers' } })
    }
  }

  try {
    if (!(await canCreateVessel(req.user!.role))) {
      return res.status(403).json({ success: false, error: { message: 'You do not have permission to create a vessel' } })
    }

    // A user-supplied duplicate ID must surface as a 409; a collision on a code we generated
    // ourselves is our problem, so retry with a fresh one before giving up.
    const suppliedCode: string | null = b.vessel_code?.trim() || null
    const values = (code: string) => [
      b.vessel_name.trim(),
      code,
      b.eta || null,
      b.etd || null,
      b.port?.trim() || null,
      b.status ?? 'scheduled',
      capacity,
      b.voyage_number?.trim() || null,
      b.lloyd_number?.trim() || null,
      b.slotted_at || null,
      b.discharged_at || null,
      DEFAULT_TENANT_ID,
      req.user!.id,
    ]
    const sql =
      `INSERT INTO vessels (${VESSEL_INSERT_COLUMNS.join(', ')}, tenant_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`

    let vessel: any = null
    for (let attempt = 0; attempt < (suppliedCode ? 1 : 5); attempt++) {
      try {
        const result = await pool.query(sql, values(suppliedCode ?? generateVesselCode()))
        vessel = result.rows[0]
        break
      } catch (err: any) {
        if (err.code !== '23505') throw err
        if (suppliedCode) {
          return res.status(409).json({ success: false, error: { message: 'A vessel with this ID already exists' } })
        }
        // else: generated code collided — loop and try another
      }
    }
    if (!vessel) {
      return res.status(500).json({ success: false, error: { message: 'Could not allocate a vessel ID. Please try again.' } })
    }

    // A freshly created vessel has no trips linked to it yet, but keep the shape of the response
    // identical to GET so the client never sees the raw stored column.
    vessel.container_count = 0

    const statusVerb = vessel.status === 'in_transit' ? 'now in transit' : vessel.status === 'arrived' ? 'arrived' : 'scheduled for arrival'
    logPlannerActivity('vessel', `Vessel ${vessel.vessel_name} ${statusVerb}`, DEFAULT_TENANT_ID, req.user!.id)
    return res.status(201).json({ success: true, data: vessel })
  } catch (err: any) {
    console.error('[vessels POST /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/vessels/:id/status — advance Scheduled → In Transit → Arrived
router.patch('/:id/status', requireAuth, async (req: Request, res: Response) => {
  // Advancing a vessel is a planner action, not a create — gated on role only, not on
  // can_create_vessel. Previously this carried requireAuth alone.
  if (denyUnlessPlanner(req, res)) return

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
