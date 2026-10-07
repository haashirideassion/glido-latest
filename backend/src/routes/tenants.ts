import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth, requireRole } from '../middleware/auth'

const router = Router()

// Columns that must NEVER be echoed back in an API response, from this endpoint or
// any other — these are write-only via PATCH. A GET only ever reports whether each
// one is currently set (see `${col}_set` below), never the value itself. This is the
// actual fix for the /full exposure: even if the role check below were ever removed
// or widened by mistake, these columns still can't leak through this response.
const SECRET_TENANT_COLUMNS = ['stripe_secret_key', 'stripe_webhook_secret', 'smtp_password', 'cargowise_api_key'] as const

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

// Columns the frontend actually sends to PATCH /:id today — built from every real
// updateTenant() call site (General/EFT/Stripe/ComPay/pricing/slot-config/docs/working
// hours/staff-permissions in reception/SettingsPage.tsx, plus SMTP/CargoWise in
// admin/AdminIntegrationsPage.tsx). This is an explicit allowlist for the same reason
// PUBLIC_TENANT_COLUMNS is above: PATCH previously built its UPDATE from whatever keys
// the client sent, with no restriction at all, so any authenticated account — including
// an ordinary customer login — could overwrite ANY tenant column. Concretely: a visitor
// account could have PATCHed eft_bank_name/eft_account_number to their own bank details,
// redirecting the next customer's bank-transfer payment to the attacker, or set their own
// stripe_secret_key. Anything not on this list is now rejected rather than silently
// written, so a request that tries to smuggle in an unlisted column fails loudly (400)
// instead of quietly doing nothing or quietly succeeding.
const PATCHABLE_TENANT_COLUMNS = new Set([
  // General
  'name', 'address', 'logo_url', 'primary_color', 'timezone', 'contact_email', 'contact_phone',
  // EFT
  'eft_bank_name', 'eft_account_name', 'eft_bsb', 'eft_account_number',
  // Stripe (per-tenant keys — see saveStripe() in reception/SettingsPage.tsx). Each
  // tenant connects their own Stripe account, so each one also has their own webhook
  // signing secret (see stripeWebhookHandler in routes/payments.ts).
  'stripe_public_key', 'stripe_secret_key', 'stripe_webhook_secret',
  // ComPay
  'compay_client_number',
  // Payment preference
  'require_payment_to_confirm',
  // Pricing
  'storage_rate_per_cbm', 'shrink_wrap_rate_per_pallet', 'slot_fee_pickup', 'slot_fee_dropoff',
  // Working hours / kiosk terms / staff permissions (all stored inside this one JSONB column)
  'working_hours',
  // Slot configuration
  'slot_duration_min', 'max_bookings_per_slot', 'advance_booking_days', 'same_day_cutoff_time',
  'slot_hold_duration_min', 'slot_capacity_matrix',
  // Document requirements
  'required_documents',
  // SMTP (admin/AdminIntegrationsPage.tsx)
  'smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 'smtp_from_address', 'smtp_from_name',
  // CargoWise / ICS (admin/AdminIntegrationsPage.tsx)
  'cargowise_api_url', 'cargowise_api_key', 'cargowise_tenant_code', 'cargowise_refresh_interval',
])

// Strips secret columns from a tenant row before it's sent back in any response,
// replacing each with a `${col}_set` boolean. Shared by GET /:id/full and PATCH /:id —
// a PATCH's `RETURNING *` would otherwise hand the caller every current secret back in
// the very response confirming their own unrelated change was saved.
function redactSecrets(tenant: Record<string, any>) {
  for (const col of SECRET_TENANT_COLUMNS) {
    tenant[`${col}_set`] = tenant[col] != null && tenant[col] !== ''
    delete tenant[col]
  }
  return tenant
}

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

// GET /api/tenants/:id/full — STAFF ONLY (reception_staff/reception_admin/super_admin),
// never a visitor/customer-portal login. Returns the tenant row for internal settings
// pages, with secret columns stripped out and replaced by `${col}_set` booleans — see
// SECRET_TENANT_COLUMNS above. This previously ran `requireAuth` with no role check and
// `SELECT *`, so ANY authenticated account (including a customer-portal visitor login)
// could pull the raw Stripe secret key, SMTP password, and CargoWise API key in one
// request — the public GET /:id above is a careful allowlist specifically to prevent
// that, and this endpoint was quietly undoing it.
router.get('/:id/full', requireAuth, requireRole('reception_staff', 'reception_admin', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [req.params.id])
    const tenant = rows[0]
    if (!tenant) return res.status(404).json({ success: false, error: { message: 'Tenant not found' } })

    return res.json({ success: true, data: redactSecrets(tenant) })
  } catch (err) {
    console.error('[tenants GET /:id/full]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/tenants/:id — STAFF ONLY (reception_staff/reception_admin/super_admin),
// never a visitor/customer-portal login, and restricted to PATCHABLE_TENANT_COLUMNS.
// This previously ran `requireAuth` with no role check and built its UPDATE from
// whatever keys the client sent, with no column restriction at all — see the long
// comment on PATCHABLE_TENANT_COLUMNS above for exactly what that allowed.
router.patch('/:id', requireAuth, requireRole('reception_staff', 'reception_admin', 'super_admin'), async (req: Request, res: Response) => {
  const updates = req.body ?? {}
  const fields = Object.keys(updates)
  if (fields.length === 0) {
    return res.status(400).json({ success: false, error: { message: 'No fields to update' } })
  }
  const disallowed = fields.filter(f => !PATCHABLE_TENANT_COLUMNS.has(f))
  if (disallowed.length > 0) {
    return res.status(400).json({ success: false, error: { message: `These fields cannot be updated: ${disallowed.join(', ')}` } })
  }
  // Reject values that can't possibly be Stripe keys. A password-type field in the
  // Settings form can get browser-autofilled with a saved login, and saving that
  // silently breaks every checkout with "Invalid API Key" — fail loudly here instead.
  if (updates.stripe_secret_key && !/^(sk|rk)_(test|live)_/.test(String(updates.stripe_secret_key))) {
    return res.status(400).json({ success: false, error: { message: 'Stripe secret key must start with sk_test_, sk_live_, rk_test_ or rk_live_' } })
  }
  if (updates.stripe_public_key && !/^pk_(test|live)_/.test(String(updates.stripe_public_key))) {
    return res.status(400).json({ success: false, error: { message: 'Stripe publishable key must start with pk_test_ or pk_live_' } })
  }
  try {
    const setClauses: string[] = []
    const params: unknown[] = [req.params.id]
    let i = 2
    for (const key of fields) {
      setClauses.push(`${key} = $${i++}`)
      const val = updates[key]
      // node-postgres auto-JSON.stringifies plain objects for jsonb columns, but encodes a
      // JS array as a Postgres ARRAY literal instead — invalid for a jsonb column whose value
      // is a top-level array (e.g. required_documents). Stringify arrays explicitly so they're
      // sent as JSON text, which Postgres coerces into the jsonb column correctly.
      params.push(Array.isArray(val) ? JSON.stringify(val) : val)
    }
    setClauses.push(`updated_at = NOW()`)
    const { rows } = await pool.query(
      `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params
    )
    const tenant = rows[0]
    if (!tenant) return res.status(404).json({ success: false, error: { message: 'Tenant not found' } })
    // Never echo secrets back — not even to the staff member who just set them. The
    // frontend already tracks what it just typed locally; it doesn't need it confirmed
    // back in the response, and this is the same RETURNING * that would otherwise hand
    // back every other current secret on an unrelated save (see redactSecrets above).
    return res.json({ success: true, data: redactSecrets(tenant) })
  } catch (err) {
    console.error('[tenants PATCH /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
