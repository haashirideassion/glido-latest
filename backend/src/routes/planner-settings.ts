import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()

// GET /api/planner-settings — get-or-create the logged-in planner's own settings row.
// Settings apply only to the logged-in user's profile (FRD 2.4.2.3) — never shared.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const existing = await pool.query(`SELECT * FROM planner_settings WHERE user_id = $1`, [req.user!.id])
    if (existing.rows[0]) return res.json({ success: true, data: existing.rows[0] })

    const created = await pool.query(
      `INSERT INTO planner_settings (user_id) VALUES ($1) RETURNING *`,
      [req.user!.id]
    )
    return res.json({ success: true, data: created.rows[0] })
  } catch (err) {
    console.error('[planner-settings GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/planner-settings
router.patch('/', requireAuth, async (req: Request, res: Response) => {
  const b = req.body
  const sets: string[] = []
  const params: unknown[] = []
  let i = 1

  if (b.default_landing_page !== undefined)   { sets.push(`default_landing_page = $${i++}`);   params.push(b.default_landing_page) }
  if (b.items_per_page !== undefined) {
    const n = Number(b.items_per_page)
    if (!Number.isInteger(n) || n < 5 || n > 100) {
      return res.status(400).json({ success: false, error: { message: 'Items per page must be between 5 and 100' } })
    }
    sets.push(`items_per_page = $${i++}`); params.push(n)
  }
  if (b.show_completed_default !== undefined) { sets.push(`show_completed_default = $${i++}`); params.push(!!b.show_completed_default) }
  if (b.email_notifications !== undefined)    { sets.push(`email_notifications = $${i++}`);     params.push(JSON.stringify(b.email_notifications)) }
  if (b.system_notifications !== undefined)   { sets.push(`system_notifications = $${i++}`);    params.push(JSON.stringify(b.system_notifications)) }

  if (!sets.length) return res.status(400).json({ success: false, error: { message: 'No fields to update' } })
  sets.push(`updated_at = NOW()`)
  params.push(req.user!.id)

  try {
    // Upsert — the get-or-create above should already have inserted a row, but this is
    // resilient if settings are patched before the first GET for some reason.
    await pool.query(`INSERT INTO planner_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [req.user!.id])
    const result = await pool.query(
      `UPDATE planner_settings SET ${sets.join(', ')} WHERE user_id = $${i} RETURNING *`,
      params
    )
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[planner-settings PATCH /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
