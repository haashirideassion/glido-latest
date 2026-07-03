import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()
// Slots are public — guests need to see availability when booking

function generateDefaultSlots(date: string, capacity = 10) {
  return Array.from({ length: 12 }, (_, i) => {
    const h = i + 6
    const start = `${String(h).padStart(2, '0')}:00`
    const end   = `${String(h + 1).padStart(2, '0')}:00`
    const confirmed = 0
    let busyness = 'available'
    if (confirmed >= capacity) busyness = 'full'
    else if (confirmed / capacity >= 0.6) busyness = 'busy'
    return { id: `gen-${date}-${h}`, date, start_time: start, end_time: end, capacity, confirmed, held: 0, busyness }
  })
}

// GET /api/v2/slots — supports ?date= or ?from=&to=
router.get('/', async (req: Request, res: Response) => {
  const { date, from, to } = req.query
  try {
    if (date) {
      const { rows } = await pool.query(
        `SELECT * FROM time_slots WHERE date = $1 ORDER BY start_time ASC`,
        [date]
      )
      const slots = rows.length > 0 ? rows : generateDefaultSlots(date as string)
      return res.json({ success: true, data: slots })
    }
    if (from && to) {
      const { rows } = await pool.query(
        `SELECT * FROM time_slots WHERE date >= $1 AND date <= $2 ORDER BY date ASC, start_time ASC`,
        [from, to]
      )
      return res.json({ success: true, data: rows })
    }
    return res.status(400).json({ success: false, error: { message: 'Provide date or from+to' } })
  } catch (err) {
    console.error('[slots GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/v2/slots/busyness?date=
router.get('/busyness', async (req: Request, res: Response) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ success: false, error: { message: 'date is required' } })
  try {
    const { rows } = await pool.query(
      `SELECT id, start_time, end_time, capacity, confirmed, held FROM time_slots WHERE date = $1 ORDER BY start_time ASC`,
      [date]
    )
    const slots = rows.length > 0 ? rows : generateDefaultSlots(date as string)
    const result = slots.map((s: any) => {
      const capacity  = s.capacity  ?? 10
      const confirmed = s.confirmed ?? 0
      let busyness = 'available'
      if (confirmed >= capacity) busyness = 'full'
      else if (confirmed / capacity >= 0.6) busyness = 'busy'
      return { ...s, busyness }
    })
    return res.json({ success: true, data: result })
  } catch (err) {
    console.error('[slots GET /busyness]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
