import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'
// Public — called from guest booking portal to autofill returning drivers

// GET /api/v2/saved-drivers?tenantId=
router.get('/', async (req: Request, res: Response) => {
  const { tenantId } = req.query
  if (!tenantId) return res.status(400).json({ success: false, error: { message: 'tenantId is required' } })
  try {
    const { rows } = await pool.query(
      `SELECT id, name, phone, vehicle_registration FROM saved_drivers
       WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 100`,
      [tenantId]
    )
    return res.json({ success: true, data: rows })
  } catch (err: any) {
    if (err.code === '42P01') return res.json({ success: true, data: [] })
    console.error('[saved-drivers GET]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/saved-drivers — upsert by name + vehicle_registration
router.post('/', async (req: Request, res: Response) => {
  const { tenant_id, name, phone, vehicle_registration } = req.body
  if (!tenant_id || !name || !vehicle_registration) {
    return res.status(400).json({ success: false, error: { message: 'tenant_id, name, vehicle_registration are required' } })
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO saved_drivers (tenant_id, name, phone, vehicle_registration)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, vehicle_registration)
       DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, updated_at = NOW()
       RETURNING id, name, phone, vehicle_registration`,
      [tenant_id, name, phone ?? null, vehicle_registration]
    )
    return res.status(201).json({ success: true, data: rows[0] })
  } catch (err: any) {
    if (err.code === '42P01') return res.status(201).json({ success: true, data: null })
    console.error('[saved-drivers POST]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// DELETE /api/v2/saved-drivers/:id — auth-protected, visitor portal
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const result = await pool.query(
      `DELETE FROM saved_drivers WHERE id = $1 AND tenant_id = $2`,
      [id, DEFAULT_TENANT_ID]
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

export default router
