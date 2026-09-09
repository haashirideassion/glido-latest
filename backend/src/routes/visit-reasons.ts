import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

// GET /api/v2/visit-reasons?tenantId=&category=office|yard&activeOnly=
// Public — the kiosk (an unauthenticated terminal) needs this list for the Reason for Visit step.
router.get('/', async (req: Request, res: Response) => {
  const tenantId = (req.query.tenantId as string) ?? DEFAULT_TENANT_ID
  const category = req.query.category as string | undefined
  const activeOnly = req.query.activeOnly === 'true'
  if (category && category !== 'office' && category !== 'yard') {
    return res.status(400).json({ success: false, error: { message: "category must be 'office' or 'yard'" } })
  }
  try {
    const conditions = ['tenant_id = $1']
    const params: unknown[] = [tenantId]
    if (category) { conditions.push(`category = $${params.length + 1}`); params.push(category) }
    if (activeOnly) conditions.push('active = TRUE')
    const { rows } = await pool.query(
      `SELECT id, category, name, active FROM visit_reasons WHERE ${conditions.join(' AND ')} ORDER BY category ASC, name ASC`,
      params
    )
    return res.json({ success: true, data: rows })
  } catch (err: any) {
    if (err.code === '42P01') return res.json({ success: true, data: [] })
    console.error('[visit-reasons GET]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/visit-reasons — staff only
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { tenant_id, category, name } = req.body
  const tenantId = tenant_id ?? DEFAULT_TENANT_ID
  if (category !== 'office' && category !== 'yard') {
    return res.status(400).json({ success: false, error: { message: "category must be 'office' or 'yard'" } })
  }
  if (!name?.trim()) return res.status(400).json({ success: false, error: { message: 'name is required' } })
  try {
    const { rows } = await pool.query(
      `INSERT INTO visit_reasons (tenant_id, category, name) VALUES ($1, $2, $3) RETURNING id, category, name, active`,
      [tenantId, category, name.trim()]
    )
    return res.status(201).json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[visit-reasons POST]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/v2/visit-reasons/:id — staff only, rename or toggle active
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
      `UPDATE visit_reasons SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, category, name, active`,
      params
    )
    if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[visit-reasons PATCH]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// DELETE /api/v2/visit-reasons/:id — staff only
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`DELETE FROM visit_reasons WHERE id = $1`, [req.params.id])
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true })
  } catch (err) {
    console.error('[visit-reasons DELETE]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
