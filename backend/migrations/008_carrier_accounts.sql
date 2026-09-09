-- Migration 008: carriers are derived from visitor accounts, not a manual roster.
-- Adds company/phone to app_users (self-service via registration + profile), and a
-- carrier_profiles extension table for reception-only fields (ABN, address, notes,
-- rating, active/inactive status) that don't belong on the account itself.

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS phone        TEXT;

CREATE TABLE IF NOT EXISTS carrier_profiles (
  user_id     UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  abn         TEXT,
  address     TEXT,
  notes       TEXT,
  rating      NUMERIC(3,1) CHECK (rating BETWEEN 0 AND 5),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
