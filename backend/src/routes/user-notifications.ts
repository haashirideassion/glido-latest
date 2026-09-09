import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()

// GET /api/user-notifications — the logged-in user's own notifications (Planner/Allocator bell)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM user_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [req.user!.id]
    )
    return res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[user-notifications GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/user-notifications/read-all — mark all of the logged-in user's notifications as read
router.patch('/read-all', requireAuth, async (req: Request, res: Response) => {
  try {
    await pool.query(`UPDATE user_notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE`, [req.user!.id])
    return res.json({ success: true })
  } catch (err) {
    console.error('[user-notifications PATCH read-all]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
