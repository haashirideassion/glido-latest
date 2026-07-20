import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()

// Columns safe to expose on the PUBLIC (unauthenticated) tenant endpoint.
// This is an explicit allowlist — NEVER use `SELECT *` here. The tenants table
// also holds secrets (stripe_secret_key, smtp_password, cargowise_api_key, …)
// and internal/PII fields (contact_email, contact_phone, settings) which must
// not leak to anonymous callers on the kiosk/book/login pages.
const PUBLIC_TENANT_COLUMNS = [
  // branding / display
  'id', 'name', 'slug', 'logo_url', 'primary_color', 'timezone',
  // EFT payment instructions shown during booking
  'eft_bank_name', 'eft_account_name', 'eft_bsb', 'eft_account_number', 'compay_client_number',
  // booking config (JSONB): periods, kiosk_terms, pricing sub-object, required docs
  'working_hours', 'required_documents',
  // public pricing + slot config used by the booking wizard
  'storage_rate_per_cbm', 'shrink_wrap_rate_per_pallet', 'slot_fee_pickup', 'slot_fee_dropoff',
  'advance_booking_days', 'same_day_cutoff_time', 'slot_hold_duration_min',
  'require_payment_to_confirm',
  // Stripe PUBLISHABLE key only — the secret key is intentionally excluded
  'stripe_public_key',
] as const

const PUBLIC_TENANT_SELECT = PUBLIC_TENANT_COLUMNS.join(', ')

// GET /api/tenants/:id — PUBLIC (used on login/kiosk/book pages before auth).
// Returns only non-sensitive columns; see PUBLIC_TENANT_COLUMNS above.
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_TENANT_SELECT} FROM tenants WHERE id = $1`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Tenant not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[tenants GET /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/tenants/:id/full — AUTHENTICATED: returns the complete tenant row
// (including secrets) so admin settings pages can populate their edit forms.
router.get('/:id/full', requireAuth, async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [req.params.id])
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Tenant not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[tenants GET /:id/full]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/v2/tenants/:id — requires auth
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const updates = req.body
  const fields = Object.keys(updates)
  if (fields.length === 0) {
    return res.status(400).json({ success: false, error: { message: 'No fields to update' } })
  }
  try {
    const setClauses: string[] = []
    const params: unknown[] = [req.params.id]
    let i = 2
    for (const key of fields) {
      setClauses.push(`${key} = $${i++}`)
      params.push(updates[key])
    }
    setClauses.push(`updated_at = NOW()`)
    const { rows } = await pool.query(
      `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Tenant not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[tenants PATCH /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
