import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()

// GET /api/allocator-settings — get-or-create the logged-in allocator's own settings row.
// Settings apply only to the logged-in user's profile (FRD 2.4.3.4) — never shared.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const existing = await pool.query(`SELECT * FROM allocator_settings WHERE user_id = $1`, [req.user!.id])
    if (existing.rows[0]) return res.json({ success: true, data: existing.rows[0] })

    const created = await pool.query(
      `INSERT INTO allocator_settings (user_id) VALUES ($1) RETURNING *`,
      [req.user!.id]
    )
    return res.json({ success: true, data: created.rows[0] })
  } catch (err) {
    console.error('[allocator-settings GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/allocator-settings
router.patch('/', requireAuth, async (req: Request, res: Response) => {
  const b = req.body
  const sets: string[] = []
  const params: unknown[] = []
  let i = 1

  if (b.default_view !== undefined)             { sets.push(`default_view = $${i++}`);             params.push(b.default_view) }
  if (b.automated_allocation !== undefined)      { sets.push(`automated_allocation = $${i++}`);      params.push(!!b.automated_allocation) }
  if (b.operation_start_time !== undefined && b.operation_end_time !== undefined) {
    if (b.operation_end_time <= b.operation_start_time) {
      return res.status(400).json({ success: false, error: { message: 'End time must be later than start time' } })
    }
  }
  if (b.operation_start_time !== undefined)      { sets.push(`operation_start_time = $${i++}`);      params.push(b.operation_start_time) }
  if (b.operation_end_time !== undefined)        { sets.push(`operation_end_time = $${i++}`);        params.push(b.operation_end_time) }
  if (b.new_trip_notifications !== undefined)    { sets.push(`new_trip_notifications = $${i++}`);    params.push(!!b.new_trip_notifications) }
  if (b.resource_conflict_alerts !== undefined)  { sets.push(`resource_conflict_alerts = $${i++}`);  params.push(!!b.resource_conflict_alerts) }
  if (b.maintenance_reminders !== undefined)     { sets.push(`maintenance_reminders = $${i++}`);     params.push(!!b.maintenance_reminders) }
  if (b.email_notifications !== undefined)       { sets.push(`email_notifications = $${i++}`);       params.push(!!b.email_notifications) }

  if (!sets.length) return res.status(400).json({ success: false, error: { message: 'No fields to update' } })
  sets.push(`updated_at = NOW()`)
  params.push(req.user!.id)

  try {
    // Upsert — the get-or-create above should already have inserted a row, but this is
    // resilient if settings are patched before the first GET for some reason.
    await pool.query(`INSERT INTO allocator_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [req.user!.id])
    const result = await pool.query(
      `UPDATE allocator_settings SET ${sets.join(', ')} WHERE user_id = $${i} RETURNING *`,
      params
    )
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[allocator-settings PATCH /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
