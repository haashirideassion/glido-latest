-- Each tenant has their own Stripe account, so each one also needs their own
-- webhook signing secret (a webhook secret is tied to one specific endpoint
-- registered in one specific Stripe account — there's no single global secret
-- that works for every tenant's Stripe account).
-- Safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='stripe_webhook_secret') THEN
    ALTER TABLE tenants ADD COLUMN stripe_webhook_secret TEXT;
  END IF;
END $$;
