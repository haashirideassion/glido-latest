import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()
// Slots are public — guests need to see availability when booking

function calcBusyness(confirmed: number, held: number, capacity: number): string {
  const occupied = confirmed + held
  if (occupied >= capacity) return 'full'
  if (occupied / capacity >= 0.6) return 'busy'
  return 'available'
}

function generateDefaultSlots(date: string, capacity = 10) {
  return Array.from({ length: 12 }, (_, i) => {
    const h = i + 6
    const start = `${String(h).padStart(2, '0')}:00`
    const end   = `${String(h + 1).padStart(2, '0')}:00`
    return { id: `gen-${date}-${h}`, date, start_time: start, end_time: end, capacity, confirmed: 0, held: 0, busyness: 'available' }
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
      const held      = s.held      ?? 0
      return { ...s, busyness: calcBusyness(confirmed, held, capacity) }
    })
    return res.json({ success: true, data: result })
  } catch (err) {
    console.error('[slots GET /busyness]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/slots/:id/hold — increment held when a user picks a slot in the wizard
router.post('/:id/hold', async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { rows } = await pool.query(
      `UPDATE time_slots SET held = held + 1 WHERE id = $1 RETURNING id, held`,
      [id]
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Slot not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[slots POST /:id/hold]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/slots/:id/release — decrement held when hold expires or slot is deselected
router.post('/:id/release', async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { rows } = await pool.query(
      `UPDATE time_slots SET held = GREATEST(held - 1, 0) WHERE id = $1 RETURNING id, held`,
      [id]
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Slot not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[slots POST /:id/release]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
