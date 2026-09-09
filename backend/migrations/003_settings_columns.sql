-- Migration 003: Add all columns needed by SettingsPage
-- Safe to run multiple times

DO $$
BEGIN

  -- ── app_users additions ───────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_users' AND column_name='is_active') THEN
    ALTER TABLE app_users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='app_users' AND column_name='last_login_at') THEN
    ALTER TABLE app_users ADD COLUMN last_login_at TIMESTAMPTZ;
  END IF;

  -- ── tenants: general ─────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='address') THEN
    ALTER TABLE tenants ADD COLUMN address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='timezone') THEN
    ALTER TABLE tenants ADD COLUMN timezone TEXT DEFAULT 'Australia/Sydney';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='contact_email') THEN
    ALTER TABLE tenants ADD COLUMN contact_email TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='contact_phone') THEN
    ALTER TABLE tenants ADD COLUMN contact_phone TEXT;
  END IF;

  -- ── tenants: payment ─────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='stripe_public_key') THEN
    ALTER TABLE tenants ADD COLUMN stripe_public_key TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='stripe_secret_key') THEN
    ALTER TABLE tenants ADD COLUMN stripe_secret_key TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='require_payment_to_confirm') THEN
    ALTER TABLE tenants ADD COLUMN require_payment_to_confirm BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  -- ── tenants: pricing ─────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='storage_rate_per_cbm') THEN
    ALTER TABLE tenants ADD COLUMN storage_rate_per_cbm NUMERIC DEFAULT 8.50;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='shrink_wrap_rate_per_pallet') THEN
    ALTER TABLE tenants ADD COLUMN shrink_wrap_rate_per_pallet NUMERIC DEFAULT 12.00;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='slot_fee_pickup') THEN
    ALTER TABLE tenants ADD COLUMN slot_fee_pickup NUMERIC DEFAULT 5.00;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='slot_fee_dropoff') THEN
    ALTER TABLE tenants ADD COLUMN slot_fee_dropoff NUMERIC DEFAULT 5.00;
  END IF;

  -- ── tenants: slot configuration ──────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='slot_duration_min') THEN
    ALTER TABLE tenants ADD COLUMN slot_duration_min INTEGER DEFAULT 60;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='max_bookings_per_slot') THEN
    ALTER TABLE tenants ADD COLUMN max_bookings_per_slot INTEGER DEFAULT 5;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='advance_booking_days') THEN
    ALTER TABLE tenants ADD COLUMN advance_booking_days INTEGER DEFAULT 30;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='same_day_cutoff_time') THEN
    ALTER TABLE tenants ADD COLUMN same_day_cutoff_time TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='slot_hold_duration_min') THEN
    ALTER TABLE tenants ADD COLUMN slot_hold_duration_min INTEGER DEFAULT 10;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='slot_capacity_by_hour') THEN
    ALTER TABLE tenants ADD COLUMN slot_capacity_by_hour JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='slot_capacity_by_combo') THEN
    ALTER TABLE tenants ADD COLUMN slot_capacity_by_combo JSONB DEFAULT '{"pickup-lcl":5,"pickup-fcl":5,"dropoff-lcl":5,"dropoff-fcl":5}'::jsonb;
  END IF;

  -- ── tenants: integrations (CargoWise) ────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='cargowise_api_url') THEN
    ALTER TABLE tenants ADD COLUMN cargowise_api_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='cargowise_api_key') THEN
    ALTER TABLE tenants ADD COLUMN cargowise_api_key TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='cargowise_tenant_code') THEN
    ALTER TABLE tenants ADD COLUMN cargowise_tenant_code TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='cargowise_refresh_interval') THEN
    ALTER TABLE tenants ADD COLUMN cargowise_refresh_interval INTEGER DEFAULT 30;
  END IF;

  -- ── tenants: integrations (SMTP) ─────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='smtp_host') THEN
    ALTER TABLE tenants ADD COLUMN smtp_host TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='smtp_port') THEN
    ALTER TABLE tenants ADD COLUMN smtp_port INTEGER DEFAULT 587;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='smtp_username') THEN
    ALTER TABLE tenants ADD COLUMN smtp_username TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='smtp_password') THEN
    ALTER TABLE tenants ADD COLUMN smtp_password TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='smtp_from_address') THEN
    ALTER TABLE tenants ADD COLUMN smtp_from_address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='smtp_from_name') THEN
    ALTER TABLE tenants ADD COLUMN smtp_from_name TEXT;
  END IF;

  -- ── tenants: document requirements (JSONB array) ─────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='required_documents') THEN
    ALTER TABLE tenants ADD COLUMN required_documents JSONB DEFAULT '[]'::jsonb;
  END IF;

END $$;
