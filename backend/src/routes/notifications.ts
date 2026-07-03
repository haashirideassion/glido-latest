import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

// GET /api/notifications — list latest 60 + unread count
router.get('/', requireAuth, async (_req, res) => {
  try {
    const [listRes, countRes] = await Promise.all([
      pool.query(
        `SELECT * FROM notifications WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 60`,
        [DEFAULT_TENANT_ID],
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM notifications WHERE tenant_id = $1 AND read = FALSE`,
        [DEFAULT_TENANT_ID],
      ),
    ])
    return res.json({
      success: true,
      data: listRes.rows,
      unread: Number(countRes.rows[0]?.count ?? 0),
    })
  } catch (err: any) {
    // Table might not exist yet on first boot
    if (err.code === '42P01') return res.json({ success: true, data: [], unread: 0 })
    console.error('[notifications GET]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/notifications/unread-count — lightweight poll
router.get('/unread-count', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS count FROM notifications WHERE tenant_id = $1 AND read = FALSE`,
      [DEFAULT_TENANT_ID],
    )
    return res.json({ success: true, unread: Number(rows[0]?.count ?? 0) })
  } catch (err: any) {
    if (err.code === '42P01') return res.json({ success: true, unread: 0 })
    console.error('[notifications unread-count GET]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/notifications/read-all — mark all read
router.patch('/read-all', requireAuth, async (_req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET read = TRUE WHERE tenant_id = $1 AND read = FALSE`,
      [DEFAULT_TENANT_ID],
    )
    return res.json({ success: true })
  } catch (err: any) {
    if (err.code === '42P01') return res.json({ success: true })
    console.error('[notifications read-all PATCH]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/notifications/:id/read — mark one read
router.patch('/:id/read', requireAuth, async (req: Request, res: Response) => {
  try {
    await pool.query(
      `UPDATE notifications SET read = TRUE WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, DEFAULT_TENANT_ID],
    )
    return res.json({ success: true })
  } catch (err: any) {
    console.error('[notifications /:id/read PATCH]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
