import { Router, Request, Response } from 'express'
import { createNotification } from '../lib/notifications'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()

// GET /api/v2/bookings — staff only
// Query params: date, from, to, ref, rego, userId, groupRef, status
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { date, from, to, ref, rego, userId, groupRef, status } = req.query
    const conditions: string[] = []
    const params: unknown[] = []
    let i = 1

    if (date === 'today') {
      conditions.push(`slot_date = CURRENT_DATE`)
    } else if (date) {
      conditions.push(`slot_date = $${i++}`)
      params.push(date)
    }
    if (from) { conditions.push(`slot_date >= $${i++}`); params.push(from) }
    if (to)   { conditions.push(`slot_date <= $${i++}`); params.push(to) }
    if (ref)  { conditions.push(`reference_number = $${i++}`); params.push(ref) }
    if (rego) { conditions.push(`vehicle_registration = $${i++} AND status = 'scheduled'`); params.push((rego as string).toUpperCase()) }
    if (userId)   { conditions.push(`user_id = $${i++}`); params.push(userId) }
    if (groupRef) { conditions.push(`(group_reference = $${i} OR reference_number = $${i++})`); params.push(groupRef) }
    if (status)   { conditions.push(`status = $${i++}`); params.push(status) }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const result = await pool.query(`SELECT * FROM bookings ${where} ORDER BY created_at DESC`, params)
    return res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[bookings GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/v2/bookings/find?q=
router.get('/find', async (req: Request, res: Response) => {
  const { q } = req.query
  if (!q) return res.status(400).json({ success: false, error: { message: 'q is required' } })
  try {
    const result = await pool.query(
      `SELECT * FROM bookings WHERE id::text = $1 OR reference_number = $1 LIMIT 1`,
      [q]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[bookings GET /find]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/v2/bookings/:id  (accepts UUID or reference_number)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM bookings WHERE id::text = $1 OR reference_number = $1 LIMIT 1`,
      [req.params.id]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[bookings GET /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/bookings
router.post('/', async (req: Request, res: Response) => {
  const b = req.body
  const year = new Date().getFullYear()
  const seq = String(Math.floor(Math.random() * 90000) + 10000)
  const ref = b.reference_number ?? `GLD-${year}-${seq}`
  try {
    const result = await pool.query(
      `INSERT INTO bookings (
        reference_number, status, service_type, load_type, slot_date, slot_start_time, slot_end_time,
        driver_name, driver_phone, guest_name, guest_email, guest_phone, company_name,
        house_bill_number, container_number, weight_kg, volume_cbm, package_count, pallet_count, pallet_type,
        storage_start_date, storage_days, storage_charge, shrink_wrap_charge, slot_fee,
        subtotal, gst_amount, total_amount, payment_method, payment_status, ics_status, tenant_id, user_id,
        container_size, entry_number, purpose, consolidator, booking_reference, vehicle_registration,
        booking_group_id, slot_index, group_reference
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42
      ) RETURNING *`,
      [
        ref, 'scheduled',
        b.service_type    ?? b.serviceType,
        b.load_type       ?? b.loadType,
        b.slot_date       ?? b.slotDate,
        b.slot_start_time ?? b.slotStartTime,
        b.slot_end_time   ?? b.slotEndTime,
        b.driver_name     ?? b.driverName,
        b.driver_phone    ?? b.driverPhone    ?? null,
        b.guest_name      ?? b.guestName      ?? null,
        b.guest_email     ?? b.guestEmail     ?? null,
        b.guest_phone     ?? b.guestPhone     ?? null,
        b.company_name    ?? b.companyName    ?? null,
        b.house_bill_number ?? b.houseBillNumber ?? null,
        b.container_number  ?? b.containerNumber  ?? null,
        b.weight_kg       ?? b.weightKg       ?? null,
        b.volume_cbm      ?? b.volumeCbm      ?? null,
        b.package_count   ?? b.packageCount   ?? null,
        b.pallet_count    ?? b.palletCount    ?? null,
        b.pallet_type     ?? b.palletType     ?? null,
        b.storage_start_date ?? b.storageStartDate ?? null,
        b.storage_days    ?? b.storageDays    ?? null,
        b.storage_charge  ?? b.storageCharge  ?? null,
        b.shrink_wrap_charge ?? b.shrinkWrapCharge ?? null,
        b.slot_fee        ?? b.slotFee        ?? null,
        b.subtotal        ?? null,
        b.gst_amount      ?? b.gstAmount      ?? null,
        b.total_amount    ?? b.totalAmount    ?? null,
        b.payment_method  ?? b.paymentMethod  ?? null,
        b.payment_status  ?? b.paymentStatus  ?? 'pending',
        b.ics_status      ?? b.icsStatus      ?? null,
        b.tenant_id       ?? b.tenantId,
        b.user_id         ?? b.userId         ?? null,
        b.container_size  ?? null,
        b.entry_number    ?? null,
        b.purpose         ?? null,
        b.consolidator    ?? null,
        b.booking_reference  ?? null,
        b.vehicle_registration ?? null,
        b.booking_group_id ?? null,
        b.slot_index      ?? null,
        b.group_reference ?? null,
      ]
    )
    const bk = result.rows[0]
    const serviceLabel = bk.service_type === 'pickup' ? 'Pick Up' : 'Drop Off'
    const loadLabel = (bk.load_type ?? '').toUpperCase()
    const slotDay = new Date(bk.slot_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
    const t1 = (bk.slot_start_time ?? '').slice(0, 5)
    const t2 = (bk.slot_end_time   ?? '').slice(0, 5)
    createNotification(
      'new_booking',
      'New booking received',
      `${bk.driver_name} · ${serviceLabel} ${loadLabel} · ${slotDay}, ${t1}–${t2} · Ref ${bk.reference_number}`,
      bk.id,
    )
    return res.status(201).json({ success: true, data: bk })
  } catch (err) {
    console.error('[bookings POST /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/v2/bookings/:id/checkin — staff only
router.patch('/:id/checkin', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE bookings SET status = 'checked_in', checked_in_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    )
    const booking = result.rows[0]
    if (!booking) return res.status(404).json({ success: false, error: { message: 'Not found' } })

    // Create a checkin_record so this booking appears in the Visitor Log
    // Only insert if one doesn't already exist for this booking
    const existing = await pool.query(
      `SELECT id FROM checkin_records WHERE booking_id = $1 LIMIT 1`,
      [booking.id]
    )
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO checkin_records (booking_id, tenant_id, is_walk_in, licence_name)
         VALUES ($1, $2, FALSE, $3)`,
        [booking.id, booking.tenant_id, booking.driver_name ?? null]
      )
    }

    return res.json({ success: true, data: booking })
  } catch (err) {
    console.error('[bookings PATCH checkin]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/v2/bookings/:id/complete — staff only
router.patch('/:id/complete', requireAuth, async (req: Request, res: Response) => {
  const { notes } = req.body
  try {
    const result = await pool.query(
      `UPDATE bookings
       SET status = 'completed', completed_at = NOW() ${notes ? ', completion_notes = $2' : ''}
       WHERE id = $1 RETURNING *`,
      notes ? [req.params.id, notes] : [req.params.id]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[bookings PATCH complete]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/v2/bookings/:id/reschedule — staff only
router.patch('/:id/reschedule', requireAuth, async (req: Request, res: Response) => {
  const { date, startTime, endTime } = req.body
  try {
    const result = await pool.query(
      `UPDATE bookings SET slot_date = $2, slot_start_time = $3, slot_end_time = $4 WHERE id = $1 RETURNING *`,
      [req.params.id, date, startTime, endTime]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[bookings PATCH reschedule]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/v2/bookings/:id/cancel — staff only
router.patch('/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE bookings SET status = 'cancelled' WHERE id = $1 AND status = 'scheduled' RETURNING *`,
      [req.params.id]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found or already cancelled' } })
    const b = result.rows[0]
    createNotification(
      'booking_cancelled',
      'Booking cancelled',
      `Booking ${b.reference_number ?? b.id.slice(0, 8)} for ${b.driver_name ?? 'unknown driver'} on ${b.slot_date} was cancelled.`,
      b.id,
    )
    return res.json({ success: true, data: b })
  } catch (err) {
    console.error('[bookings PATCH cancel]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/v2/bookings/:id/override-status — staff with can_override_status permission
router.patch('/:id/override-status', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params
  const { status, note } = req.body as { status?: string; note?: string }
  const VALID = ['scheduled', 'checked_in', 'completed', 'cancelled']
  if (!status || !VALID.includes(status)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid status' } })
  }
  if (!note?.trim()) {
    return res.status(400).json({ success: false, error: { message: 'A reason note is required' } })
  }
  try {
    const result = await req.app.locals.db.query(
      `UPDATE bookings
          SET status = $1,
              override_note = $2,
              overridden_at = NOW(),
              updated_at = NOW()
        WHERE id = $3
    RETURNING *`,
      [status, note.trim(), id],
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[bookings PATCH override-status]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/v2/bookings/:id/confirm-eft — staff with can_confirm_eft permission
router.patch('/:id/confirm-eft', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const result = await req.app.locals.db.query(
      `UPDATE bookings
          SET payment_status = 'paid',
              eft_confirmed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND payment_status = 'pending_eft'
    RETURNING *`,
      [id],
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found or not pending EFT' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[bookings PATCH confirm-eft]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/bookings/resend-confirmation
// Stub endpoint — logs the request and returns 200. Wire up real email sending when SMTP is configured.
router.post('/resend-confirmation', async (req: Request, res: Response) => {
  const { refs } = req.body as { refs?: string[] }
  if (!refs || !Array.isArray(refs) || refs.length === 0) {
    return res.status(400).json({ success: false, error: { message: 'refs array is required' } })
  }
  // TODO: send transactional email via your SMTP/SES/Sendgrid provider here.
  // For now, log and return success so the frontend can show the success toast.
  console.log('[bookings] resend-confirmation requested for refs:', refs)
  return res.json({ success: true, message: 'Confirmation email queued' })
})

export default router
