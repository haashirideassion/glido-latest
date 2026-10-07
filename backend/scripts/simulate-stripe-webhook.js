/**
 * Simulate a Stripe `checkout.session.completed` webhook delivery to the local
 * backend, without needing the Stripe CLI. Useful when something on this
 * machine (antivirus/EDR) blocks stripe.exe's own network access, since this
 * script never talks to Stripe at all — it just signs a fake event payload
 * with the SAME HMAC-SHA256 scheme Stripe uses, against whatever webhook
 * secret is currently saved for the tenant, and POSTs it straight to the
 * local webhook route.
 *
 * This proves the webhook HANDLER works end-to-end (signature verification +
 * marking the booking paid). It does NOT prove a real webhook endpoint
 * registered in the Stripe Dashboard will be reachable — that still needs a
 * public URL (a deployed backend, or a tunnel) once you're ready for that.
 *
 * Usage:
 *   node scripts/simulate-stripe-webhook.js [bookingId[,bookingId2,...]] [tenantId] [--event=<name>]
 *
 * --event picks which Stripe event to send (default "completed"):
 *   completed       checkout.session.completed, paid        -> booking becomes 'paid'
 *   unpaid          checkout.session.completed, NOT paid    -> booking stays 'pending'
 *   expired         checkout.session.expired                -> booking stays 'pending'
 *   async-failed    checkout.session.async_payment_failed   -> pending booking becomes 'failed'
 *   refunded        charge.refunded (full)                  -> paid booking becomes 'refunded'
 *   partial-refund  charge.refunded (partial)               -> booking stays 'paid' (warning logged)
 *
 * If bookingId is omitted, the most recent booking in the state that event
 * acts on (pending for most events, paid for the refund ones) is used.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
const crypto = require('crypto')
const { Pool } = require('pg')

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'
const PORT = process.env.PORT || 3001

async function main() {
  const args = process.argv.slice(2)
  const eventFlag = args.find(a => a.startsWith('--event='))
  const eventName = eventFlag ? eventFlag.slice('--event='.length) : 'completed'
  const [bookingIdsArg, tenantIdArg] = args.filter(a => !a.startsWith('--'))
  const tenantId = tenantIdArg || DEFAULT_TENANT_ID

  const EVENTS = ['completed', 'unpaid', 'expired', 'async-failed', 'refunded', 'partial-refund']
  if (!EVENTS.includes(eventName)) {
    console.error(`✗ Unknown --event=${eventName}. Choose one of: ${EVENTS.join(', ')}`)
    process.exit(1)
  }
  const isRefund = eventName === 'refunded' || eventName === 'partial-refund'
  const wantStatus = isRefund ? 'paid' : 'pending'

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  const { rows: tenantRows } = await pool.query(
    'SELECT stripe_webhook_secret FROM tenants WHERE id = $1',
    [tenantId]
  )
  const webhookSecret = tenantRows[0]?.stripe_webhook_secret
  if (!webhookSecret) {
    console.error(`✗ Tenant ${tenantId} has no stripe_webhook_secret saved yet.`)
    console.error('  Paste ANY string (e.g. "whsec_local_dev_testing_only") into')
    console.error('  Settings -> Payment -> Stripe -> Webhook Signing Secret, save, then re-run this.')
    await pool.end()
    process.exit(1)
  }

  let bookingIds = (bookingIdsArg || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (bookingIds.length === 0) {
    const { rows } = await pool.query(
      `SELECT id FROM bookings WHERE tenant_id = $1 AND payment_status = $2 ORDER BY created_at DESC LIMIT 1`,
      [tenantId, wantStatus]
    )
    if (!rows[0]) {
      console.error(`✗ No ${wantStatus} booking found for this tenant, and none was given on the command line.`)
      console.error('  Usage: node scripts/simulate-stripe-webhook.js <bookingId>')
      await pool.end()
      process.exit(1)
    }
    bookingIds = [rows[0].id]
    console.log(`No booking id given -- using most recent ${wantStatus} booking: ${bookingIds[0]}`)
  }

  await pool.end()

  const metadata = { booking_ids: bookingIds.join(','), tenant_id: tenantId }
  const stamp = Date.now()
  let type, object
  switch (eventName) {
    case 'completed':
    case 'unpaid':
      type = 'checkout.session.completed'
      object = { id: `cs_simulated_${stamp}`, object: 'checkout.session', payment_status: eventName === 'completed' ? 'paid' : 'unpaid', metadata }
      break
    case 'expired':
      type = 'checkout.session.expired'
      object = { id: `cs_simulated_${stamp}`, object: 'checkout.session', payment_status: 'unpaid', metadata }
      break
    case 'async-failed':
      type = 'checkout.session.async_payment_failed'
      object = { id: `cs_simulated_${stamp}`, object: 'checkout.session', payment_status: 'unpaid', metadata }
      break
    default: // refunded | partial-refund
      type = 'charge.refunded'
      object = { id: `ch_simulated_${stamp}`, object: 'charge', refunded: eventName === 'refunded', metadata }
  }

  const payload = JSON.stringify({
    id: `evt_simulated_${stamp}`,
    object: 'event',
    type,
    data: { object },
  })

  // Same scheme Stripe itself uses: HMAC-SHA256 over "<timestamp>.<payload>",
  // header format "t=<timestamp>,v1=<hex signature>". See
  // https://docs.stripe.com/webhooks#verify-manually
  const timestamp = Math.floor(Date.now() / 1000)
  const signedPayload = `${timestamp}.${payload}`
  const signature = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload, 'utf8')
    .digest('hex')
  const stripeSignatureHeader = `t=${timestamp},v1=${signature}`

  console.log(`Sending simulated ${type} (${eventName}) for booking(s): ${bookingIds.join(', ')}`)

  const res = await fetch(`http://localhost:${PORT}/api/payments/webhook/${tenantId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': stripeSignatureHeader,
    },
    body: payload,
  })

  const text = await res.text()
  console.log(`Response: ${res.status} ${text}`)
  if (res.ok) {
    console.log("Sent -- check the booking's payment_status in the app / backend logs.")
  } else {
    console.error('✗ Backend rejected the simulated webhook -- see response above.')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('✗ Failed:', err.message)
  process.exit(1)
})
