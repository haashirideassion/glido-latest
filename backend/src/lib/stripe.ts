import Stripe from 'stripe'

// Each tenant connects their OWN Stripe account — their own secret key, their own
// webhook signing secret — stored on that tenant's row (tenants.stripe_secret_key /
// tenants.stripe_webhook_secret). There is no single global Stripe client, so this
// builds one from whichever tenant's key the caller already looked up. Constructing
// a Stripe client is cheap; no pooling/caching needed.
export function getStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey)
}
