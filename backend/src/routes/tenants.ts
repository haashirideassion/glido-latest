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

// `working_hours` is on the public allowlist because the booking wizard and
// kiosk need the opening periods, kiosk_terms and pricing sub-object out of it.
// It also carries `staff_permissions` (the reception permission matrix), which
// is internal config and has no business reaching anonymous callers — so that
// one key is stripped from the public response. Staff screens read it through
// the authenticated /:id/full route instead.
function stripInternalWorkingHours(row: Record<string, unknown>): Record<string, unknown> {
  const wh = row.working_hours
  if (!wh || typeof wh !== 'object' || Array.isArray(wh)) return row
  const { staff_permissions, ...publicHours } = wh as Record<string, unknown>
  return { ...row, working_hours: publicHours }
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
    return res.json({ success: true, data: stripInternalWorkingHours(rows[0]) })
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

// Column names for the PATCH SET clause come straight from the request body and
// are interpolated into SQL — values are parameterised, but identifiers cannot
// be. So each key is checked against the live schema before it is used, and the
// column list is cached after the first lookup.
let tenantColumnsCache: Set<string> | null = null

async function getTenantColumns(): Promise<Set<string>> {
  if (tenantColumnsCache) return tenantColumnsCache
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tenants'`
  )
  tenantColumnsCache = new Set(rows.map((r: { column_name: string }) => r.column_name))
  return tenantColumnsCache
}

// Never rewritable through the API, even though they are real columns.
const IMMUTABLE_COLUMNS = new Set(['id', 'created_at'])

// PATCH /api/v2/tenants/:id — requires auth
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const updates = req.body
  const fields = Object.keys(updates ?? {})
  if (fields.length === 0) {
    return res.status(400).json({ success: false, error: { message: 'No fields to update' } })
  }
  try {
    const validColumns = await getTenantColumns()
    const rejected = fields.filter(f => !validColumns.has(f) || IMMUTABLE_COLUMNS.has(f))
    if (rejected.length > 0) {
      return res.status(400).json({
        success: false,
        error: { message: `Unknown or immutable field(s): ${rejected.join(', ')}` },
      })
    }

    const setClauses: string[] = []
    const params: unknown[] = [req.params.id]
    let i = 2
    for (const key of fields) {
      // Safe to interpolate: verified above to be a real, mutable column.
      setClauses.push(`"${key}" = $${i++}`)
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
