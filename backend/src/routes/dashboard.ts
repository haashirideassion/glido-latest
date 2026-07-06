import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

// GET /api/v2/dashboard?date=YYYY-MM-DD — date should be the caller's local "today"
// (e.g. Australia/Sydney), not the DB server's CURRENT_DATE, which may be a different
// calendar day in UTC and silently returned all-zero stats for most of the Sydney day.
router.get('/', async (req: Request, res: Response) => {
  try {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? String(req.query.date) : null
    const dateClause = date ? `slot_date = $1` : `slot_date = CURRENT_DATE`
    const params = date ? [date] : []
    const { rows: bookings } = await pool.query(
      `SELECT status, ics_status FROM bookings
       WHERE ${dateClause} AND status != 'cancelled'`,
      params,
    )
    const { rows: recent } = await pool.query(
      `SELECT * FROM bookings
       WHERE ${dateClause} AND status != 'cancelled'
       ORDER BY created_at DESC LIMIT 5`,
      params,
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
