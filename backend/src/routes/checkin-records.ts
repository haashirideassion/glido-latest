import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import { createNotification } from '../lib/notifications'

const router = Router()
router.use(requireAuth)

// GET /api/v2/checkin-records?bookingId=
router.get('/', async (req: Request, res: Response) => {
  const { bookingId, tenantId, isWalkIn, walkInId } = req.query
  try {
    const conditions: string[] = []
    const params: unknown[] = []
    let i = 1

    if (bookingId)              { conditions.push(`booking_id = $${i++}`);  params.push(bookingId) }
    if (walkInId)               { conditions.push(`walk_in_id = $${i++}`);  params.push(walkInId) }
    if (tenantId)               { conditions.push(`tenant_id = $${i++}`);   params.push(tenantId) }
    if (isWalkIn !== undefined) { conditions.push(`is_walk_in = $${i++}`);  params.push(isWalkIn === 'true') }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const { rows } = await pool.query(
      `SELECT * FROM checkin_records ${where} ORDER BY check_in_time DESC`,
      params
    )
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('[checkin-records GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/checkin-records
router.post('/', async (req: Request, res: Response) => {
  const b = req.body
  try {
    const { rows } = await pool.query(
      `INSERT INTO checkin_records (
        booking_id, walk_in_id, tenant_id, is_walk_in, walk_in_purpose, visit_person_name, walk_in_reason,
        licence_scan_method, licence_name, licence_number, licence_dob, licence_expiry,
        licence_address, name_match_result, name_match_score, expiry_valid
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        b.booking_id          ?? b.bookingId          ?? null,
        b.walk_in_id          ?? b.walkInId           ?? null,
        b.tenant_id           ?? b.tenantId,
        b.is_walk_in          ?? b.isWalkIn           ?? false,
        b.walk_in_purpose     ?? b.walkInPurpose      ?? null,
        b.visit_person_name   ?? b.visitPersonName    ?? null,
        b.walk_in_reason      ?? b.walkInReason       ?? null,
        b.licence_scan_method ?? b.licenceScanMethod  ?? null,
        b.licence_name        ?? b.licenceName        ?? null,
        b.licence_number      ?? b.licenceNumber      ?? null,
        b.licence_dob         ?? b.licenceDob         ?? null,
        b.licence_expiry      ?? b.licenceExpiry      ?? null,
        b.licence_address     ?? b.licenceAddress     ?? null,
        b.name_match_result   ?? b.nameMatchResult    ?? 'not_checked',
        b.name_match_score    ?? b.nameMatchScore     ?? null,
        b.expiry_valid        ?? b.expiryValid        ?? null,
      ]
    )
    const rec = rows[0]
    const name  = rec.licence_name ?? rec.visit_person_name ?? 'Unknown'
    const isWalkIn = rec.is_walk_in
    createNotification(
      'checkin',
      isWalkIn ? 'Walk-in checked in' : 'Driver checked in',
      `${name} has ${isWalkIn ? 'completed walk-in check-in' : 'checked in via kiosk'}${rec.booking_id ? ` · Booking ${rec.booking_id.slice(0, 8)}` : ''}.`,
      rec.booking_id ?? rec.walk_in_id ?? undefined,
    )
    return res.status(201).json({ success: true, data: rec })
  } catch (err) {
    console.error('[checkin-records POST /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
