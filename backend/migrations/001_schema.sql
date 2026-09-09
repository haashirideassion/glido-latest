-- ============================================================
-- Glido — Full Schema Migration
-- Run this once against your Neon database to create all tables
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── app_users ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                   TEXT UNIQUE NOT NULL,
  name                    TEXT NOT NULL,
  role                    TEXT NOT NULL DEFAULT 'reception_staff',
  -- Allowed roles: reception_admin, reception_staff, visitor_registered
  password_hash           TEXT,
  -- NULL = user migrated from Supabase, must reset password on first login
  password_reset_required BOOLEAN NOT NULL DEFAULT FALSE,
  password_reset_token    TEXT,
  password_reset_expires  TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── tenants ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE,
  logo_url        TEXT,
  primary_color   TEXT,        -- hex e.g. #FC6514
  eft_bank_name   TEXT,
  eft_account_name TEXT,
  eft_bsb         TEXT,
  eft_account_number TEXT,
  compay_client_number TEXT,
  working_hours   JSONB DEFAULT '{}'::jsonb,
  settings        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default tenant (matches DEFAULT_TENANT_ID from Glido)
INSERT INTO tenants (id, name, slug)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Glido Default', 'glido')
ON CONFLICT (id) DO NOTHING;

-- ── time_slots ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_slots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date       DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  capacity   INTEGER NOT NULL DEFAULT 10,
  confirmed  INTEGER NOT NULL DEFAULT 0,
  held       INTEGER NOT NULL DEFAULT 0,
  tenant_id  UUID REFERENCES tenants(id),
  UNIQUE(date, start_time, tenant_id)
);

-- ── bookings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number      TEXT UNIQUE NOT NULL,
  session_id            UUID,
  status                TEXT NOT NULL DEFAULT 'scheduled',
  -- scheduled | checked_in | completed | cancelled
  service_type          TEXT,
  load_type             TEXT,
  slot_date             DATE NOT NULL,
  slot_start_time       TIME NOT NULL,
  slot_end_time         TIME NOT NULL,
  guest_name            TEXT,
  guest_email           TEXT,
  guest_phone           TEXT,
  company_name          TEXT,
  driver_name           TEXT NOT NULL,
  driver_phone          TEXT,
  house_bill_number     TEXT,
  container_number      TEXT,
  weight_kg             NUMERIC,
  volume_cbm            NUMERIC,
  package_count         INTEGER,
  pallet_count          INTEGER,
  pallet_type           TEXT,
  storage_start_date    DATE,
  storage_days          INTEGER,
  storage_charge        NUMERIC,
  shrink_wrap_charge    NUMERIC,
  slot_fee              NUMERIC,
  subtotal              NUMERIC,
  gst_amount            NUMERIC,
  total_amount          NUMERIC,
  payment_method        TEXT,
  payment_status        TEXT DEFAULT 'pending',
  ics_status            TEXT,
  ics_last_checked_at   TIMESTAMPTZ,
  checked_in_at         TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  completion_notes      TEXT,
  container_size        TEXT,
  entry_number          TEXT,
  purpose               TEXT,
  consolidator          TEXT,
  booking_reference     TEXT,
  vehicle_registration  TEXT,
  booking_group_id      UUID,
  slot_index            INTEGER,
  group_reference       TEXT,
  booking_source        TEXT,
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  user_id               UUID REFERENCES app_users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_slot_date     ON bookings(slot_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status        ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_id     ON bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_reference     ON bookings(reference_number);
CREATE INDEX IF NOT EXISTS idx_bookings_group_ref     ON bookings(group_reference);

-- ── walk_ins ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS walk_ins (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  purpose               TEXT NOT NULL,
  visitor_name          TEXT NOT NULL,
  contact_number        TEXT,
  person_being_visited  TEXT,
  reason                TEXT,
  arrived_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  licence_captured      BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed             BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_walk_ins_tenant_id ON walk_ins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_walk_ins_dismissed ON walk_ins(dismissed);

-- ── checkin_records ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checkin_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            UUID REFERENCES bookings(id),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  is_walk_in            BOOLEAN NOT NULL DEFAULT FALSE,
  walk_in_purpose       TEXT,
  visit_person_name     TEXT,
  walk_in_reason        TEXT,
  licence_scan_method   TEXT,
  licence_name          TEXT,
  licence_number        TEXT,
  licence_dob           TEXT,
  licence_expiry        TEXT,
  licence_address       TEXT,
  name_match_result     TEXT DEFAULT 'not_checked',
  name_match_score      NUMERIC,
  expiry_valid          BOOLEAN,
  check_in_time         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at          TIMESTAMPTZ,
  dismissed_by          TEXT
);

CREATE INDEX IF NOT EXISTS idx_checkin_records_booking_id ON checkin_records(booking_id);
CREATE INDEX IF NOT EXISTS idx_checkin_records_tenant_id  ON checkin_records(tenant_id);

-- ── cfs_shipments ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cfs_shipments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  house_bill_number     TEXT NOT NULL,
  container_number      TEXT,
  weight_kg             NUMERIC,
  volume_cbm            NUMERIC,
  package_count         INTEGER,
  pallet_count          INTEGER,
  pallet_type           TEXT,
  storage_start_date    DATE,
  ready_for_collection  BOOLEAN NOT NULL DEFAULT FALSE,
  description           TEXT,
  ics_status            TEXT,
  ics_last_checked_at   TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cfs_shipments_tenant_id ON cfs_shipments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cfs_shipments_hbl       ON cfs_shipments(house_bill_number);
