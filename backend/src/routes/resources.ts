import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import { logAllocatorActivity } from '../lib/allocatorActivity'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

function generateResourceCode(prefix: string): string {
  const seq = String(Math.floor(Math.random() * 900) + 100)
  return `SYD-${prefix}-${seq}`
}

// GET /api/resources — combined "All Resources" tab (FRD 2.4.3.1). Query: search, status
// Normalizes trucks/trailers/drivers into one shape for the combined card list.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query as { search?: string; status?: string }
    const searchTerm = search ? `%${search}%` : null

    const trucks = await pool.query(
      `SELECT id, resource_code, 'truck' AS resource_type, status, truck_type AS type, capacity, location, last_service_date
       FROM trucks WHERE tenant_id = $1
         AND ($2::text IS NULL OR resource_code ILIKE $2)
         AND ($3::text IS NULL OR status = $3)`,
      [DEFAULT_TENANT_ID, searchTerm, status || null]
    )
    const trailers = await pool.query(
      `SELECT id, resource_code, 'trailer' AS resource_type, status, trailer_type AS type, capacity, NULL AS location, last_service_date
       FROM trailers WHERE tenant_id = $1
         AND ($2::text IS NULL OR resource_code ILIKE $2)
         AND ($3::text IS NULL OR status = $3)`,
      [DEFAULT_TENANT_ID, searchTerm, status || null]
    )
    const drivers = await pool.query(
      `SELECT id, resource_code, 'driver' AS resource_type, status, license_class AS type, NULL AS capacity, NULL AS location, NULL AS last_service_date
       FROM drivers WHERE tenant_id = $1
         AND ($2::text IS NULL OR (resource_code ILIKE $2 OR driver_name ILIKE $2))
         AND ($3::text IS NULL OR status = $3)`,
      [DEFAULT_TENANT_ID, searchTerm, status || null]
    )

    return res.json({ success: true, data: [...trucks.rows, ...trailers.rows, ...drivers.rows] })
  } catch (err) {
    console.error('[resources GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// ── Trucks ──────────────────────────────────────────────────────────────────
router.get('/trucks', requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query as { search?: string; status?: string }
    const result = await pool.query(
      `SELECT * FROM trucks WHERE tenant_id = $1
         AND ($2::text IS NULL OR resource_code ILIKE $2)
         AND ($3::text IS NULL OR status = $3)
       ORDER BY resource_code`,
      [DEFAULT_TENANT_ID, search ? `%${search}%` : null, status || null]
    )
    return res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[resources GET /trucks]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

router.get('/trucks/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM trucks WHERE (id::text = $1 OR resource_code = $1) AND tenant_id = $2 LIMIT 1`, [req.params.id, DEFAULT_TENANT_ID])
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    // Assigned Resources — the trailer + driver currently attached to this truck.
    const [trailer, driver] = await Promise.all([
      pool.query(`SELECT * FROM trailers WHERE attached_truck_id = $1 LIMIT 1`, [result.rows[0].id]),
      pool.query(`SELECT * FROM drivers WHERE assigned_truck_id = $1 LIMIT 1`, [result.rows[0].id]),
    ])
    return res.json({ success: true, data: { ...result.rows[0], assignedTrailer: trailer.rows[0] ?? null, assignedDriver: driver.rows[0] ?? null } })
  } catch (err) {
    console.error('[resources GET /trucks/:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

router.post('/trucks', requireAuth, async (req: Request, res: Response) => {
  const b = req.body
  try {
    const result = await pool.query(
      `INSERT INTO trucks (resource_code, truck_type, capacity, location, status, last_service_date, custom_field_value, tenant_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.resource_code?.trim() || generateResourceCode('TRK'), b.truck_type ?? null, b.capacity ?? null, b.location ?? null, b.status ?? 'available', b.last_service_date ?? null, b.custom_field_value ?? null, DEFAULT_TENANT_ID, req.user!.id]
    )
    logAllocatorActivity('resource', `Truck ${result.rows[0].resource_code} added to fleet`, DEFAULT_TENANT_ID, req.user!.id)
    return res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: { message: 'A truck with this resource code already exists' } })
    console.error('[resources POST /trucks]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

router.patch('/trucks/:id/status', requireAuth, async (req: Request, res: Response) => {
  const { status } = req.body as { status?: string }
  if (!status || !['available', 'on_trip', 'maintenance'].includes(status)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid status' } })
  }
  try {
    const result = await pool.query(`UPDATE trucks SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [status, req.params.id])
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[resources PATCH trucks/:id/status]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// Full edit — Truck (also called PATCH, distinct from the status-only route above)
router.patch('/trucks/:id', requireAuth, async (req: Request, res: Response) => {
  const b = req.body
  if (b.status && !['available', 'on_trip', 'maintenance'].includes(b.status)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid status' } })
  }
  try {
    const result = await pool.query(
      `UPDATE trucks SET
         truck_type = COALESCE($1, truck_type),
         capacity = COALESCE($2, capacity),
         location = COALESCE($3, location),
         status = COALESCE($4, status),
         last_service_date = COALESCE($5, last_service_date),
         custom_field_value = CASE WHEN $6::text IS NULL THEN custom_field_value WHEN $6 = '' THEN NULL ELSE $6 END,
         updated_at = NOW()
       WHERE id = $7 AND tenant_id = $8 RETURNING *`,
      [b.truck_type ?? null, b.capacity ?? null, b.location ?? null, b.status ?? null, b.last_service_date ?? null, b.custom_field_value ?? null, req.params.id, DEFAULT_TENANT_ID]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[resources PATCH /trucks/:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// Assign a trailer / driver to this truck — unassigns whatever was previously attached to this truck first,
// so each truck pulls at most one trailer and has at most one driver at a time.
router.patch('/trucks/:id/assign', requireAuth, async (req: Request, res: Response) => {
  const { trailer_id, driver_id } = req.body as { trailer_id?: string | null; driver_id?: string | null }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (trailer_id !== undefined) {
      await client.query(`UPDATE trailers SET attached_truck_id = NULL WHERE attached_truck_id = $1`, [req.params.id])
      if (trailer_id) await client.query(`UPDATE trailers SET attached_truck_id = $1 WHERE id = $2 AND tenant_id = $3`, [req.params.id, trailer_id, DEFAULT_TENANT_ID])
    }
    if (driver_id !== undefined) {
      await client.query(`UPDATE drivers SET assigned_truck_id = NULL WHERE assigned_truck_id = $1`, [req.params.id])
      if (driver_id) await client.query(`UPDATE drivers SET assigned_truck_id = $1 WHERE id = $2 AND tenant_id = $3`, [req.params.id, driver_id, DEFAULT_TENANT_ID])
    }
    await client.query('COMMIT')
    const [truck, trailer, driver] = await Promise.all([
      pool.query(`SELECT * FROM trucks WHERE id = $1`, [req.params.id]),
      pool.query(`SELECT * FROM trailers WHERE attached_truck_id = $1 LIMIT 1`, [req.params.id]),
      pool.query(`SELECT * FROM drivers WHERE assigned_truck_id = $1 LIMIT 1`, [req.params.id]),
    ])
    if (!truck.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: { ...truck.rows[0], assignedTrailer: trailer.rows[0] ?? null, assignedDriver: driver.rows[0] ?? null } })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[resources PATCH /trucks/:id/assign]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  } finally {
    client.release()
  }
})

// ── Trailers ────────────────────────────────────────────────────────────────
router.get('/trailers', requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query as { search?: string; status?: string }
    const result = await pool.query(
      `SELECT * FROM trailers WHERE tenant_id = $1
         AND ($2::text IS NULL OR resource_code ILIKE $2)
         AND ($3::text IS NULL OR status = $3)
       ORDER BY resource_code`,
      [DEFAULT_TENANT_ID, search ? `%${search}%` : null, status || null]
    )
    return res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[resources GET /trailers]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

router.get('/trailers/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM trailers WHERE (id::text = $1 OR resource_code = $1) AND tenant_id = $2 LIMIT 1`, [req.params.id, DEFAULT_TENANT_ID])
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[resources GET /trailers/:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

router.post('/trailers', requireAuth, async (req: Request, res: Response) => {
  const b = req.body
  try {
    const result = await pool.query(
      `INSERT INTO trailers (resource_code, trailer_type, capacity, attached_truck_id, status, last_service_date, tenant_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.resource_code?.trim() || generateResourceCode('TRL'), b.trailer_type ?? null, b.capacity ?? null, b.attached_truck_id ?? null, b.status ?? 'available', b.last_service_date ?? null, DEFAULT_TENANT_ID, req.user!.id]
    )
    logAllocatorActivity('resource', `Trailer ${result.rows[0].resource_code} added to fleet`, DEFAULT_TENANT_ID, req.user!.id)
    return res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: { message: 'A trailer with this resource code already exists' } })
    console.error('[resources POST /trailers]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

router.patch('/trailers/:id/status', requireAuth, async (req: Request, res: Response) => {
  const { status } = req.body as { status?: string }
  if (!status || !['available', 'on_trip', 'maintenance'].includes(status)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid status' } })
  }
  try {
    const result = await pool.query(`UPDATE trailers SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [status, req.params.id])
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[resources PATCH trailers/:id/status]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// Full edit — Trailer. attached_truck_id may be explicitly set to '' to detach.
router.patch('/trailers/:id', requireAuth, async (req: Request, res: Response) => {
  const b = req.body
  if (b.status && !['available', 'on_trip', 'maintenance'].includes(b.status)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid status' } })
  }
  try {
    const result = await pool.query(
      `UPDATE trailers SET
         trailer_type = COALESCE($1, trailer_type),
         capacity = COALESCE($2, capacity),
         attached_truck_id = CASE WHEN $3::text IS NULL THEN attached_truck_id WHEN $3 = '' THEN NULL ELSE $3::uuid END,
         status = COALESCE($4, status),
         last_service_date = COALESCE($5, last_service_date),
         updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7 RETURNING *`,
      [b.trailer_type ?? null, b.capacity ?? null, b.attached_truck_id ?? null, b.status ?? null, b.last_service_date ?? null, req.params.id, DEFAULT_TENANT_ID]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[resources PATCH /trailers/:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// ── Drivers ─────────────────────────────────────────────────────────────────
router.get('/drivers', requireAuth, async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query as { search?: string; status?: string }
    const result = await pool.query(
      `SELECT * FROM drivers WHERE tenant_id = $1
         AND ($2::text IS NULL OR (resource_code ILIKE $2 OR driver_name ILIKE $2))
         AND ($3::text IS NULL OR status = $3)
       ORDER BY driver_name`,
      [DEFAULT_TENANT_ID, search ? `%${search}%` : null, status || null]
    )
    return res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[resources GET /drivers]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

router.get('/drivers/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM drivers WHERE (id::text = $1 OR resource_code = $1) AND tenant_id = $2 LIMIT 1`, [req.params.id, DEFAULT_TENANT_ID])
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[resources GET /drivers/:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

router.post('/drivers', requireAuth, async (req: Request, res: Response) => {
  const b = req.body
  if (!b.driver_name?.trim()) {
    return res.status(400).json({ success: false, error: { message: 'Driver name is required' } })
  }
  try {
    const result = await pool.query(
      `INSERT INTO drivers (resource_code, driver_name, license_class, experience_years, assigned_truck_id, status, tenant_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.resource_code?.trim() || generateResourceCode('DRV'), b.driver_name.trim(), b.license_class ?? null, b.experience_years ?? null, b.assigned_truck_id ?? null, b.status ?? 'off_duty', DEFAULT_TENANT_ID, req.user!.id]
    )
    logAllocatorActivity('driver', `Driver ${result.rows[0].driver_name} added`, DEFAULT_TENANT_ID, req.user!.id)
    return res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: { message: 'A driver with this resource code already exists' } })
    console.error('[resources POST /drivers]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

router.patch('/drivers/:id/status', requireAuth, async (req: Request, res: Response) => {
  const { status } = req.body as { status?: string }
  if (!status || !['on_duty', 'off_duty', 'on_leave'].includes(status)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid status' } })
  }
  try {
    const result = await pool.query(`UPDATE drivers SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [status, req.params.id])
    const driver = result.rows[0]
    if (!driver) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    logAllocatorActivity('driver', `Driver ${driver.driver_name} ${status === 'on_duty' ? 'approved for duty' : status === 'on_leave' ? 'marked on leave' : 'went off duty'}`, DEFAULT_TENANT_ID, req.user!.id)
    return res.json({ success: true, data: driver })
  } catch (err) {
    console.error('[resources PATCH drivers/:id/status]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// Full edit — Driver. assigned_truck_id may be explicitly set to '' to unassign.
router.patch('/drivers/:id', requireAuth, async (req: Request, res: Response) => {
  const b = req.body
  if (b.status && !['on_duty', 'off_duty', 'on_leave'].includes(b.status)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid status' } })
  }
  if (b.driver_name !== undefined && !b.driver_name?.trim()) {
    return res.status(400).json({ success: false, error: { message: 'Driver name is required' } })
  }
  try {
    const result = await pool.query(
      `UPDATE drivers SET
         driver_name = COALESCE(NULLIF($1, ''), driver_name),
         license_class = COALESCE($2, license_class),
         experience_years = COALESCE($3, experience_years),
         assigned_truck_id = CASE WHEN $4::text IS NULL THEN assigned_truck_id WHEN $4 = '' THEN NULL ELSE $4::uuid END,
         status = COALESCE($5, status),
         updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7 RETURNING *`,
      [b.driver_name?.trim() ?? null, b.license_class ?? null, b.experience_years ?? null, b.assigned_truck_id ?? null, b.status ?? null, req.params.id, DEFAULT_TENANT_ID]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[resources PATCH /drivers/:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
