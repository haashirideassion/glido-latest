import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

// GET /api/v2/dashboard
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows: bookings } = await pool.query(
      `SELECT status, ics_status FROM bookings
       WHERE slot_date = CURRENT_DATE AND status != 'cancelled'`
    )
    const { rows: recent } = await pool.query(
      `SELECT * FROM bookings
       WHERE slot_date = CURRENT_DATE AND status != 'cancelled'
       ORDER BY created_at DESC LIMIT 5`
    )
    return res.json({
      success: true,
      data: {
        todaysVisitors: bookings.filter(b =>
          ['scheduled', 'checked_in', 'completed'].includes(b.status)
        ).length,
        checkedIn: bookings.filter(b => b.status === 'checked_in').length,
        pending:   bookings.filter(b => b.status === 'scheduled').length,
        icsHeld:   bookings.filter(b => b.ics_status === 'held').length,
        recentVisitors: recent,
      },
    })
  } catch (err) {
    console.error('[dashboard GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
