import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

// GET /api/store-types?tenantId=&activeOnly=
// Public — the customer portal's Service Request wizard needs this list for the "Store" pop-up.
router.get('/', async (req: Request, res: Response) => {
  const tenantId = (req.query.tenantId as string) ?? DEFAULT_TENANT_ID
  const activeOnly = req.query.activeOnly === 'true'
  try {
    const conditions = ['tenant_id = $1']
    const params: unknown[] = [tenantId]
    if (activeOnly) conditions.push('active = TRUE')
    const { rows } = await pool.query(
      `SELECT id, name, active FROM store_types WHERE ${conditions.join(' AND ')} ORDER BY name ASC`,
      params
    )
    return res.json({ success: true, data: rows })
  } catch (err: any) {
    if (err.code === '42P01') return res.json({ success: true, data: [] })
    console.error('[store-types GET]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/store-types — CFS admin only
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { tenant_id, name } = req.body
  const tenantId = tenant_id ?? DEFAULT_TENANT_ID
  if (!name?.trim()) return res.status(400).json({ success: false, error: { message: 'name is required' } })
  try {
    const { rows } = await pool.query(
      `INSERT INTO store_types (tenant_id, name) VALUES ($1, $2) RETURNING id, name, active`,
      [tenantId, name.trim()]
    )
    return res.status(201).json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[store-types POST]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/store-types/:id — CFS admin only, rename or toggle active
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const { name, active } = req.body
  const sets: string[] = []
  const params: unknown[] = []
  let i = 1
  if (name !== undefined)   { sets.push(`name = $${i++}`);   params.push(String(name).trim()) }
  if (active !== undefined) { sets.push(`active = $${i++}`); params.push(!!active) }
  if (!sets.length) return res.status(400).json({ success: false, error: { message: 'No fields to update' } })
  params.push(req.params.id)
  try {
    const { rows } = await pool.query(
      `UPDATE store_types SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, name, active`,
      params
    )
    if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[store-types PATCH]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// DELETE /api/store-types/:id — CFS admin only
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`DELETE FROM store_types WHERE id = $1`, [req.params.id])
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true })
  } catch (err) {
    console.error('[store-types DELETE]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
