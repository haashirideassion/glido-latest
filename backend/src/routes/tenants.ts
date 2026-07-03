import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()

// GET /api/v2/tenants/:id — public (used on login/kiosk pages before auth)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [req.params.id])
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Tenant not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[tenants GET /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/v2/tenants/:id — requires auth
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const updates = req.body
  const fields = Object.keys(updates)
  if (fields.length === 0) {
    return res.status(400).json({ success: false, error: { message: 'No fields to update' } })
  }
  try {
    const setClauses: string[] = []
    const params: unknown[] = [req.params.id]
    let i = 2
    for (const key of fields) {
      setClauses.push(`${key} = $${i++}`)
      params.push(updates[key])
    }
    setClauses.push(`updated_at = NOW()`)
    const { rows } = await pool.query(
      `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Tenant not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[tenants PATCH /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
