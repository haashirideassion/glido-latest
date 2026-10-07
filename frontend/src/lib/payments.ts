import { fetcher, postFetcher } from './fetcher'

// Starts a Stripe Checkout session for one or more already-created bookings and
// returns the Stripe-hosted URL to redirect the browser to. The charge amount is
// computed server-side from the bookings' own total_amount — never trust a client-
// supplied amount for something that moves money.
export async function createCheckoutSession(bookingIds: string[]): Promise<string> {
  const res = await postFetcher('/api/payments/create-checkout-session', { bookingIds })
  const url = res?.data?.url
  if (!url) throw new Error(res?.error?.message || 'Could not start Stripe checkout')
  return url
}

export interface PaymentVerification {
  paid: boolean
  status: string | null          // Stripe session status: open | complete | expired
  paymentStatus: string | null   // paid | unpaid | no_payment_required
}

// Asks the backend to check a Checkout session directly with Stripe. This is the safety
// net for a late/missed webhook: if Stripe says it's paid, the backend marks the bookings
// paid right now. Returns null if the check itself couldn't be completed (network/server).
export async function verifyPayment(sessionId: string, tenantId: string): Promise<PaymentVerification | null> {
  try {
    const qs = new URLSearchParams({ session_id: sessionId, tenant_id: tenantId })
    const res = await fetcher(`/api/payments/verify-session?${qs.toString()}`)
    if (!res?.success) return null
    return res.data as PaymentVerification
  } catch {
    return null
  }
}
