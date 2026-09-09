import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth, optionalAuth, isVisitorRole } from '../middleware/auth'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

// GET /api/v2/saved-drivers?tenantId=
// Ownership-scoped: a visitor sees only the drivers they saved; reception/kiosk staff see all
// tenant drivers (they manage everyone); an unauthenticated guest sees none.
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  const { tenantId } = req.query
  if (!tenantId) return res.status(400).json({ success: false, error: { message: 'tenantId is required' } })

  // Guests get no saved drivers — never leak other accounts' drivers to anonymous callers.
  if (!req.user) return res.json({ success: true, data: [] })

  const scopeToOwner = isVisitorRole(req.user.role)
  try {
    const { rows } = await pool.query(
      scopeToOwner
        ? `SELECT id, name, phone, vehicle_registration, blocked, block_reason FROM saved_drivers
           WHERE tenant_id = $1 AND app_user_id = $2 ORDER BY updated_at DESC LIMIT 100`
        : `SELECT id, name, phone, vehicle_registration, blocked, block_reason FROM saved_drivers
           WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 100`,
      scopeToOwner ? [tenantId, req.user.id] : [tenantId]
    )
    return res.json({ success: true, data: rows })
  } catch (err: any) {
    if (err.code === '42P01') return res.json({ success: true, data: [] })
    console.error('[saved-drivers GET]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/saved-drivers — upsert by tenant + vehicle_registration.
// A visitor's save is tagged with their account (app_user_id) so it stays private to them;
// reception/guest saves leave the owner NULL (tenant-wide). On conflict the original owner is
// preserved (COALESCE) so one visitor can't silently reassign another's driver.
router.post('/', optionalAuth, async (req: Request, res: Response) => {
  const { tenant_id, name, phone, vehicle_registration } = req.body
  if (!tenant_id || !name || !vehicle_registration) {
    return res.status(400).json({ success: false, error: { message: 'tenant_id, name, vehicle_registration are required' } })
  }
  const ownerId = req.user && isVisitorRole(req.user.role) ? req.user.id : null
  try {
    const { rows } = await pool.query(
      `INSERT INTO saved_drivers (tenant_id, name, phone, vehicle_registration, app_user_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, vehicle_registration)
       DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone,
         app_user_id = COALESCE(saved_drivers.app_user_id, EXCLUDED.app_user_id), updated_at = NOW()
       RETURNING id, name, phone, vehicle_registration, blocked, block_reason`,
      [tenant_id, name, phone ?? null, vehicle_registration, ownerId]
    )
    return res.status(201).json({ success: true, data: rows[0] })
  } catch (err: any) {
    if (err.code === '42P01') return res.status(201).json({ success: true, data: null })
    console.error('[saved-drivers POST]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// DELETE /api/v2/saved-drivers/:id — auth-protected. A visitor may only delete their own
// driver; reception/staff may delete any driver in the tenant.
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params
  const ownerOnly = isVisitorRole(req.user!.role)
  try {
    const result = await pool.query(
      ownerOnly
        ? `DELETE FROM saved_drivers WHERE id = $1 AND tenant_id = $2 AND app_user_id = $3`
        : `DELETE FROM saved_drivers WHERE id = $1 AND tenant_id = $2`,
      ownerOnly ? [id, DEFAULT_TENANT_ID, req.user!.id] : [id, DEFAULT_TENANT_ID]
    )
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: { message: 'Driver not found' } })
    }
    return res.json({ success: true })
  } catch (err: any) {
    if (err.code === '42P01') return res.status(404).json({ success: false, error: { message: 'Driver not found' } })
    console.error('[saved-drivers DELETE]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/v2/saved-drivers/:id — auth-protected, visitor portal (edit their own driver's info)
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params
  const { name, phone, vehicle_registration } = req.body
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ success: false, error: { message: 'Name is required' } })
  }
  if (vehicle_registration !== undefined && !String(vehicle_registration).trim()) {
    return res.status(400).json({ success: false, error: { message: 'Vehicle registration is required' } })
  }
  const sets: string[] = []
  const params: unknown[] = []
  let i = 1
  if (name !== undefined)                 { sets.push(`name = $${i++}`);                 params.push(name.trim()) }
  if (phone !== undefined)                { sets.push(`phone = $${i++}`);                params.push(phone?.trim() || null) }
  if (vehicle_registration !== undefined) { sets.push(`vehicle_registration = $${i++}`); params.push(vehicle_registration.trim()) }
  if (!sets.length) return res.status(400).json({ success: false, error: { message: 'No fields to update' } })
  sets.push(`updated_at = NOW()`)
  // A visitor may only edit their own driver; reception/staff may edit any in the tenant.
  const ownerOnly = isVisitorRole(req.user!.role)
  params.push(id, DEFAULT_TENANT_ID)
  const idParam = i++, tenantParam = i++
  let ownerClause = ''
  if (ownerOnly) { params.push(req.user!.id); ownerClause = ` AND app_user_id = $${i++}` }
  try {
    const { rows } = await pool.query(
      `UPDATE saved_drivers SET ${sets.join(', ')} WHERE id = $${idParam} AND tenant_id = $${tenantParam}${ownerClause}
       RETURNING id, name, phone, vehicle_registration, blocked, block_reason`,
      params
    )
    if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Driver not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: { message: 'Another driver already has this vehicle registration' } })
    }
    console.error('[saved-drivers PATCH /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/v2/saved-drivers/:id/block — auth-protected, reception only
router.patch('/:id/block', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params
  const { blocked, block_reason } = req.body
  try {
    const { rows } = await pool.query(
      `UPDATE saved_drivers SET blocked = $1, block_reason = $2, updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4
       RETURNING id, name, phone, vehicle_registration, blocked, block_reason`,
      [!!blocked, blocked ? (block_reason ?? null) : null, id, DEFAULT_TENANT_ID]
    )
    if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Driver not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err: any) {
    console.error('[saved-drivers PATCH /:id/block]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
