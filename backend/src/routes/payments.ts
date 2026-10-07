import { Router, Request, Response } from 'express'
import { getStripeClient } from '../lib/stripe'
import { pool } from '../db'
import { optionalAuth } from '../middleware/auth'

const router = Router()

// ── Booking state changes (all idempotent, all tenant-scoped) ────────────────
// Used by the webhook AND by the return-visit verification below, so whichever
// reaches us first wins and the other is a harmless no-op.

function parseBookingIds(raw: unknown): string[] {
  return String(raw ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

async function markBookingsPaid(bookingIds: string[], tenantId: string): Promise<number> {
  if (bookingIds.length === 0) return 0
  const { rowCount } = await pool.query(
    `UPDATE bookings SET payment_status = 'paid' WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND payment_status = 'pending'`,
    [bookingIds, tenantId]
  )
  return rowCount ?? 0
}

// Only an unpaid booking can fail — never downgrade one that is already paid.
async function markBookingsFailed(bookingIds: string[], tenantId: string): Promise<number> {
  if (bookingIds.length === 0) return 0
  const { rowCount } = await pool.query(
    `UPDATE bookings SET payment_status = 'failed' WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND payment_status = 'pending'`,
    [bookingIds, tenantId]
  )
  return rowCount ?? 0
}

// Only a paid booking can be refunded.
async function markBookingsRefunded(bookingIds: string[], tenantId: string): Promise<number> {
  if (bookingIds.length === 0) return 0
  const { rowCount } = await pool.query(
    `UPDATE bookings SET payment_status = 'refunded' WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND payment_status = 'paid'`,
    [bookingIds, tenantId]
  )
  return rowCount ?? 0
}

// POST /api/payments/create-checkout-session
// Body: { bookingIds: string[] }
// Starts a Stripe Checkout session covering the given bookings. The amount charged
// is computed from the bookings' own total_amount in the database — never from a
// client-supplied number — so a tampered request can't check out for less than the
// booking actually costs.
router.post('/create-checkout-session', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { bookingIds } = req.body ?? {}
    if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
      return res.status(400).json({ success: false, error: { message: 'bookingIds is required' } })
    }

    const { rows } = await pool.query(
      `SELECT id, reference_number, total_amount, payment_status, tenant_id FROM bookings WHERE id = ANY($1::uuid[])`,
      [bookingIds]
    )
    if (rows.length !== bookingIds.length) {
      return res.status(404).json({ success: false, error: { message: 'One or more bookings were not found' } })
    }
    if (rows.some(r => r.payment_status === 'paid')) {
      return res.status(409).json({ success: false, error: { message: 'One or more of these bookings are already paid' } })
    }

    // Every booking in one Checkout session has to go through a single Stripe
    // account, and each tenant has their own — so a bookingIds list that spans
    // more than one tenant has no single account to charge through.
    const tenantId = rows[0].tenant_id
    if (rows.some(r => r.tenant_id !== tenantId)) {
      return res.status(400).json({ success: false, error: { message: 'All bookings must belong to the same tenant' } })
    }

    const { rows: tenantRows } = await pool.query(
      `SELECT stripe_secret_key FROM tenants WHERE id = $1`,
      [tenantId]
    )
    const stripeSecretKey = tenantRows[0]?.stripe_secret_key
    if (!stripeSecretKey) {
      return res.status(400).json({ success: false, error: { message: 'Card payments are not configured for this tenant yet' } })
    }

    const totalDollars = rows.reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0)
    if (!(totalDollars > 0)) {
      return res.status(400).json({ success: false, error: { message: 'Nothing to charge for these bookings' } })
    }

    const refs = rows.map(r => r.reference_number).join(', ')
    const frontendOrigin = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',')[0].trim()
    const stripe = getStripeClient(stripeSecretKey)

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'aud',
            product_data: { name: `Glido booking${rows.length > 1 ? 's' : ''} ${refs}` },
            unit_amount: Math.round(totalDollars * 100),
          },
          quantity: 1,
        },
      ],
      metadata: { booking_ids: rows.map(r => r.id).join(','), tenant_id: tenantId },
      // Copied onto the PaymentIntent (and so the Charge) so later events that only carry a
      // charge — refunds — can still be traced back to these bookings.
      payment_intent_data: { metadata: { booking_ids: rows.map(r => r.id).join(','), tenant_id: tenantId } },
      // Back to the booking wizard, which rebuilds the normal confirmation screen from a
      // snapshot saved in the browser before the redirect (see WizardContext loadCardReturn).
      // Stripe swaps {CHECKOUT_SESSION_ID} for the real id; the wizard uses it to ask
      // /verify-session whether the payment really went through (webhook safety net).
      success_url: `${frontendOrigin}/book?payment=success&session_id={CHECKOUT_SESSION_ID}&t=${tenantId}`,
      cancel_url: `${frontendOrigin}/bookings?payment=cancelled`,
    })

    return res.json({ success: true, data: { url: session.url } })
  } catch (err) {
    console.error('[payments POST /create-checkout-session]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error creating checkout session' } })
  }
})

// GET /api/payments/verify-session?session_id=cs_...&tenant_id=<uuid>
// Safety net for a late or missed webhook: when the customer lands back on the site,
// the frontend calls this. We ask Stripe directly (using the tenant's own key) whether
// the session was paid, and if so mark the bookings paid — exactly what the webhook
// would have done. Idempotent, so the webhook arriving afterwards is a no-op.
// The session id is an unguessable secret known only to the customer's browser, and the
// bookings come from the session's own metadata, never from the request.
router.get('/verify-session', async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.query.session_id ?? '')
    const tenantId  = String(req.query.tenant_id ?? '')
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId) || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
      return res.status(400).json({ success: false, error: { message: 'Invalid session or tenant' } })
    }

    const { rows } = await pool.query(`SELECT stripe_secret_key FROM tenants WHERE id = $1`, [tenantId])
    const stripeSecretKey = rows[0]?.stripe_secret_key
    if (!stripeSecretKey) {
      return res.status(400).json({ success: false, error: { message: 'Card payments are not configured for this tenant' } })
    }

    const stripe = getStripeClient(stripeSecretKey)
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    // The session must belong to this tenant — a session id from another tenant's Stripe
    // account wouldn't even resolve with this key, but check anyway.
    if (session.metadata?.tenant_id !== tenantId) {
      return res.status(404).json({ success: false, error: { message: 'Session not found' } })
    }

    const paid = session.payment_status === 'paid'
    if (paid) {
      const updated = await markBookingsPaid(parseBookingIds(session.metadata?.booking_ids), tenantId)
      if (updated > 0) console.log('[verify-session] marked paid (webhook had not yet):', session.metadata?.booking_ids)
    }
    return res.json({ success: true, data: { paid, status: session.status, paymentStatus: session.payment_status } })
  } catch (err) {
    console.error('[payments GET /verify-session]', err)
    return res.status(500).json({ success: false, error: { message: 'Could not verify payment' } })
  }
})

export default router

// Mounted directly on the Express app in index.ts at /api/payments/webhook/:tenantId
// — BEFORE express.json() — with express.raw() so the exact raw request bytes are
// available here for Stripe's signature check. Each tenant registers their OWN
// webhook endpoint in their OWN Stripe dashboard, pointing at this URL with their
// own tenant id in the path, and the signature is checked against THAT tenant's own
// webhook secret — never a global one — since each tenant's events come from a
// different Stripe account.
export async function stripeWebhookHandler(req: Request, res: Response) {
  const tenantId = req.params.tenantId
  const signature = req.headers['stripe-signature']

  if (!tenantId) {
    return res.status(400).send('Missing tenant id')
  }

  let tenant: { stripe_secret_key?: string; stripe_webhook_secret?: string } | undefined
  try {
    const { rows } = await pool.query(
      `SELECT stripe_secret_key, stripe_webhook_secret FROM tenants WHERE id = $1`,
      [tenantId]
    )
    tenant = rows[0]
  } catch (err) {
    console.error('[stripe webhook] failed to load tenant:', err)
    return res.status(500).send('Server error')
  }

  if (!tenant?.stripe_webhook_secret || !tenant?.stripe_secret_key) {
    console.error('[stripe webhook] tenant is not configured for Stripe:', tenantId)
    return res.status(400).send('Stripe is not configured for this tenant')
  }

  const stripe = getStripeClient(tenant.stripe_secret_key)

  let event: import('stripe').Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(req.body, signature as string, tenant.stripe_webhook_secret)
  } catch (err: any) {
    console.error('[stripe webhook] signature verification failed:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    switch (event.type) {
      // Card payments: the session is paid the moment it completes. Delayed methods
      // (not enabled today, but harmless to support) complete unpaid and settle later.
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as import('stripe').Stripe.Checkout.Session
        if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
          // Belt-and-braces on top of the signature check: only touch bookings that
          // belong to this tenant, so an event from tenant A's Stripe account can never
          // mark a booking under a different tenant as paid.
          const ids = parseBookingIds(session.metadata?.booking_ids)
          const n = await markBookingsPaid(ids, tenantId)
          console.log(`[stripe webhook] ${event.type}: marked paid (${n}/${ids.length}):`, ids)
        } else {
          console.log(`[stripe webhook] ${event.type}: session not paid yet (${session.payment_status}), leaving bookings pending`)
        }
        break
      }

      // A delayed payment finally failed.
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as import('stripe').Stripe.Checkout.Session
        const ids = parseBookingIds(session.metadata?.booking_ids)
        const n = await markBookingsFailed(ids, tenantId)
        console.log(`[stripe webhook] async payment failed: marked failed (${n}/${ids.length}):`, ids)
        break
      }

      // The customer abandoned Checkout (or it timed out after 24h). Nothing was charged.
      // The bookings stay 'pending' — not 'failed' — so they can still be paid another way.
      case 'checkout.session.expired': {
        const session = event.data.object as import('stripe').Stripe.Checkout.Session
        console.log('[stripe webhook] checkout session expired unpaid; bookings stay pending:', session.metadata?.booking_ids)
        break
      }

      // Money went back to the customer. Only a FULL refund flips the booking to
      // 'refunded'; a partial refund is logged for reception to handle by hand.
      case 'charge.refunded': {
        const charge = event.data.object as import('stripe').Stripe.Charge
        const ids = parseBookingIds(charge.metadata?.booking_ids)
        if (ids.length === 0) {
          console.warn('[stripe webhook] charge.refunded with no booking metadata (charge predates tracking?):', charge.id)
        } else if (charge.refunded) {
          const n = await markBookingsRefunded(ids, tenantId)
          console.log(`[stripe webhook] charge fully refunded: marked refunded (${n}/${ids.length}):`, ids)
        } else {
          console.warn('[stripe webhook] PARTIAL refund on', charge.id, '- bookings left as paid:', ids)
        }
        break
      }

      default:
        // Ignore everything else, but acknowledge it so Stripe doesn't keep retrying.
        break
    }
    return res.json({ received: true })
  } catch (err) {
    console.error('[stripe webhook] handler error:', err)
    return res.status(500).send('Webhook handler error')
  }
}
