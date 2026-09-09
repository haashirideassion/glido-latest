import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import { createNotification } from '../lib/notifications'

const router = Router()
router.use(requireAuth)

// GET /api/v2/walk-ins
router.get('/', async (req: Request, res: Response) => {
  const { tenantId, active, visitorName } = req.query
  try {
    const conditions: string[] = []
    const params: unknown[] = []
    let i = 1

    if (tenantId)     { conditions.push(`tenant_id = $${i++}`);                   params.push(tenantId) }
    if (active === 'true') { conditions.push(`dismissed = FALSE`) }
    if (visitorName)  { conditions.push(`visitor_name ILIKE $${i++}`);            params.push(visitorName) }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const { rows } = await pool.query(
      `SELECT * FROM walk_ins ${where} ORDER BY arrived_at DESC`,
      params
    )
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('[walk-ins GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/walk-ins
router.post('/', async (req: Request, res: Response) => {
  const b = req.body
  try {
    const { rows } = await pool.query(
      `INSERT INTO walk_ins (tenant_id, purpose, visitor_name, contact_number, company_name, person_being_visited, reason, licence_captured)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        b.tenant_id   ?? b.tenantId,
        b.purpose,
        b.visitor_name ?? b.visitorName,
        b.contact_number       ?? b.contactNumber       ?? null,
        b.company_name         ?? b.companyName         ?? null,
        b.person_being_visited ?? b.personBeingVisited  ?? null,
        b.reason ?? null,
        b.licence_captured     ?? b.licenceCaptured     ?? false,
      ]
    )
    const w = rows[0]
    const purposeLabel =
      w.purpose === 'visit_office'    ? 'an office visit'
      : w.purpose === 'visit_yard'    ? 'yard access'
      : w.purpose === 'walk_in_pickup'  ? 'a pick up'
      : w.purpose === 'walk_in_dropoff' ? 'a drop off'
      : w.purpose === 'visit_person'    ? 'a visit'
      : w.purpose === 'office'          ? 'an office visit'
      : w.purpose === 'yard'            ? 'yard access'
      : 'a visit'
    createNotification(
      'walkin',
      'Walk-in Arrival',
      `${w.visitor_name} is here requesting ${purposeLabel}${w.person_being_visited ? ` · Visiting ${w.person_being_visited}` : ''}.`,
      w.id,
    )
    return res.status(201).json({ success: true, data: w })
  } catch (err) {
    console.error('[walk-ins POST /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/v2/walk-ins/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM walk_ins WHERE id = $1 LIMIT 1`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[walk-ins GET /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/v2/walk-ins/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const updates = req.body
  const fields = Object.keys(updates)
  if (fields.length === 0) {
    return res.status(400).json({ success: false, error: { message: 'No fields to update' } })
  }
  try {
    // Map camelCase to snake_case for known fields
    const colMap: Record<string, string> = {
      dismissed: 'dismissed',
      dismissedAt: 'dismissed_at',
      licenceCaptured: 'licence_captured',
      visitorName: 'visitor_name',
      contactNumber: 'contact_number',
      companyName: 'company_name',
      personBeingVisited: 'person_being_visited',
      reason: 'reason',
    }
    const setClauses: string[] = []
    const params: unknown[] = [req.params.id]
    let i = 2
    for (const key of fields) {
      const col = colMap[key] ?? key
      setClauses.push(`${col} = $${i++}`)
      params.push(updates[key])
    }
    const { rows } = await pool.query(
      `UPDATE walk_ins SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[walk-ins PATCH /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
