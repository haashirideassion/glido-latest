-- ============================================================
-- Migration 045 — Packing & Unpacking module
--
-- A "request" is raised by a customer (or keyed in by staff) for ONE direction:
--   import  -> Unpacking   (manifest + ICS data is fetched and validated)
--   export  -> Packing     (the CFS keys the data in; it is pushed out to ICS)
-- A request holds many containers; each container holds many shipments (house bills).
-- The CONTAINER is the unit that moves through the sidebar stages:
--   new_request -> manifested -> planned -> result_validation -> completed
--
-- Tables are prefixed pu_ to stay clear of the existing cfs_shipments table, which is
-- the ICS shipment cache used by the booking wizard. Safe to re-run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Request-number counters (I-101, I-102 … / E-101 …) ───────
CREATE TABLE IF NOT EXISTS pu_counters (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  direction TEXT NOT NULL CHECK (direction IN ('import', 'export')),
  last_seq  INTEGER NOT NULL DEFAULT 100,
  PRIMARY KEY (tenant_id, direction)
);

-- ── Locations (warehouse / yard bays) ────────────────────────
CREATE TABLE IF NOT EXISTS pu_locations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  name             TEXT NOT NULL,
  kind             TEXT NOT NULL DEFAULT 'warehouse' CHECK (kind IN ('warehouse', 'yard')),
  capacity_per_day INTEGER NOT NULL DEFAULT 6,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pu_locations_tenant ON pu_locations(tenant_id);

-- ── Teams ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pu_teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  name       TEXT NOT NULL,
  direction  TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('import', 'export', 'both')),
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pu_teams_tenant ON pu_teams(tenant_id);

-- ── Per-direction settings ───────────────────────────────────
CREATE TABLE IF NOT EXISTS pu_settings (
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  direction            TEXT NOT NULL CHECK (direction IN ('import', 'export')),
  default_team_id      UUID REFERENCES pu_teams(id) ON DELETE SET NULL,
  notification_emails  TEXT NOT NULL DEFAULT '',
  report_emails        TEXT NOT NULL DEFAULT '',
  -- Manifest-vs-ICS rules (import). require_resolution: every mismatching field must have a
  -- chosen source before Confirm Manifest. min_match_pct: block Confirm below this overall %.
  require_resolution   BOOLEAN NOT NULL DEFAULT TRUE,
  min_match_pct        NUMERIC NOT NULL DEFAULT 0,
  -- Numeric fields within this % of each other count as a near-match, not a mismatch.
  numeric_tolerance_pct NUMERIC NOT NULL DEFAULT 1,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, direction)
);

-- ── Requests ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pu_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  direction        TEXT NOT NULL CHECK (direction IN ('import', 'export')),
  seq              INTEGER NOT NULL,
  request_ref      TEXT NOT NULL,                       -- I-101 / E-101
  status           TEXT NOT NULL DEFAULT 'submitted'
                   CHECK (status IN ('submitted', 'accepted', 'declined', 'cancelled')),
  source           TEXT NOT NULL DEFAULT 'customer' CHECK (source IN ('customer', 'staff')),
  customer_name    TEXT NOT NULL,
  customer_email   TEXT,
  customer_phone   TEXT,
  customer_logo_url TEXT,
  customer_user_id UUID REFERENCES app_users(id),
  related_services TEXT[] NOT NULL DEFAULT '{}',        -- export: lcl_collection, empty_collection, pra, storage, fcl_delivery …
  customer_notes   TEXT,
  decline_reason   TEXT,
  accepted_at      TIMESTAMPTZ,
  accepted_by      UUID REFERENCES app_users(id),
  created_by       UUID REFERENCES app_users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, request_ref)
);
CREATE INDEX IF NOT EXISTS idx_pu_requests_tenant_dir ON pu_requests(tenant_id, direction, status);
CREATE INDEX IF NOT EXISTS idx_pu_requests_customer   ON pu_requests(customer_user_id);

-- ── Containers (the unit that moves through the stages) ──────
CREATE TABLE IF NOT EXISTS pu_containers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  request_id           UUID NOT NULL REFERENCES pu_requests(id) ON DELETE CASCADE,
  direction            TEXT NOT NULL CHECK (direction IN ('import', 'export')),
  container_number     TEXT NOT NULL,                   -- NOT unique: can repeat across requests
  seal_number          TEXT,
  container_type       TEXT,
  net_weight_kg        NUMERIC,
  volume_cbm           NUMERIC,
  package_count        INTEGER,
  vessel               TEXT,
  voyage               TEXT,
  lloyds_number        TEXT,
  load_port            TEXT,
  discharge_port       TEXT,
  eta                  DATE,
  etd                  DATE,
  status               TEXT NOT NULL DEFAULT 'new_request'
                       CHECK (status IN ('new_request', 'manifested', 'planned', 'result_validation', 'completed', 'cancelled')),
  -- Compliance (shown on every card; updated by other modules too)
  inspection_status    TEXT NOT NULL DEFAULT 'not_required'
                       CHECK (inspection_status IN ('not_required', 'pending', 'passed', 'failed')),
  fumigation_status    TEXT NOT NULL DEFAULT 'not_required'
                       CHECK (fumigation_status IN ('not_required', 'pending', 'completed', 'failed')),
  match_pct            NUMERIC,                         -- overall manifest vs ICS (import)
  manifest_fetched_at  TIMESTAMPTZ,
  manifest_confirmed_at TIMESTAMPTZ,
  manifest_confirmed_by UUID REFERENCES app_users(id),
  ics_push_status      TEXT,                            -- export: pushed | stubbed | failed
  ics_push_ref         TEXT,
  ics_pushed_at        TIMESTAMPTZ,
  -- Plan
  location_id          UUID REFERENCES pu_locations(id) ON DELETE SET NULL,
  team_id              UUID REFERENCES pu_teams(id) ON DELETE SET NULL,
  planned_date         DATE,
  planned_start        TIME,
  planned_end          TIME,
  plan_confirmed_at    TIMESTAMPTZ,
  plan_confirmed_by    UUID REFERENCES app_users(id),
  tablet_pushed_at     TIMESTAMPTZ,
  tablet_payload       JSONB,
  -- Result
  result_submitted_at  TIMESTAMPTZ,
  validated_at         TIMESTAMPTZ,
  validated_by         UUID REFERENCES app_users(id),
  completed_at         TIMESTAMPTZ,
  shared_with_customer_at TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pu_containers_tenant_stage ON pu_containers(tenant_id, direction, status);
CREATE INDEX IF NOT EXISTS idx_pu_containers_request      ON pu_containers(request_id);
CREATE INDEX IF NOT EXISTS idx_pu_containers_number       ON pu_containers(LOWER(container_number));
CREATE INDEX IF NOT EXISTS idx_pu_containers_plan         ON pu_containers(tenant_id, planned_date, location_id);

-- ── Shipments (house bills) ──────────────────────────────────
-- Plain columns hold the WORKING values. For imports, `manifest` and `ics` hold the two source
-- rows as fetched, and `field_sources` records which one the user picked per mismatching field.
CREATE TABLE IF NOT EXISTS pu_shipments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  container_id          UUID NOT NULL REFERENCES pu_containers(id) ON DELETE CASCADE,
  house_bill_number     TEXT NOT NULL,
  job_reference         TEXT,
  weight_kg             NUMERIC,
  volume_cbm            NUMERIC,
  package_count         INTEGER,
  consignee             TEXT,
  consignor             TEXT,
  goods_description     TEXT,
  marks_numbers         TEXT,
  handling_instructions TEXT,
  manifest              JSONB,
  ics                   JSONB,
  field_sources         JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_pct             NUMERIC,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pu_shipments_container ON pu_shipments(container_id);

-- ── Photos ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pu_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  request_id    UUID REFERENCES pu_requests(id) ON DELETE CASCADE,
  container_id  UUID REFERENCES pu_containers(id) ON DELETE CASCADE,
  shipment_id   UUID REFERENCES pu_shipments(id) ON DELETE CASCADE,
  source        TEXT NOT NULL DEFAULT 'customer' CHECK (source IN ('customer', 'tablet', 'staff')),
  storage_path  TEXT NOT NULL,
  file_name     TEXT,
  caption       TEXT,
  uploaded_by   UUID REFERENCES app_users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pu_photos_container ON pu_photos(container_id);
CREATE INDEX IF NOT EXISTS idx_pu_photos_request   ON pu_photos(request_id);

-- ── Notes (internal free text) ───────────────────────────────
CREATE TABLE IF NOT EXISTS pu_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  container_id UUID NOT NULL REFERENCES pu_containers(id) ON DELETE CASCADE,
  author_id    UUID REFERENCES app_users(id),
  author_name  TEXT,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pu_notes_container ON pu_notes(container_id);

-- ── Messages to the customer ─────────────────────────────────
CREATE TABLE IF NOT EXISTS pu_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  request_id      UUID NOT NULL REFERENCES pu_requests(id) ON DELETE CASCADE,
  container_id    UUID REFERENCES pu_containers(id) ON DELETE CASCADE,
  shipment_id     UUID REFERENCES pu_shipments(id) ON DELETE SET NULL,
  sent_by         UUID REFERENCES app_users(id),
  sent_by_name    TEXT,
  recipient_email TEXT,
  subject         TEXT,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pu_messages_request ON pu_messages(request_id);

-- ── Activity / audit trail ───────────────────────────────────
CREATE TABLE IF NOT EXISTS pu_activity (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  request_id   UUID REFERENCES pu_requests(id) ON DELETE CASCADE,
  container_id UUID REFERENCES pu_containers(id) ON DELETE CASCADE,
  actor_id     UUID REFERENCES app_users(id),
  actor_name   TEXT,
  action       TEXT NOT NULL,
  detail       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pu_activity_container ON pu_activity(container_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pu_activity_request   ON pu_activity(request_id, created_at DESC);

-- ── Tablet / execution results (Phase 2 tablet app posts these) ──
CREATE TABLE IF NOT EXISTS pu_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  container_id  UUID NOT NULL REFERENCES pu_containers(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { shipments:[{shipmentId, actualWeightKg, actualVolumeCbm, actualPackageCount, notes}], notes }
  submitted_by  UUID REFERENCES app_users(id),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by   UUID REFERENCES app_users(id),
  reviewed_at   TIMESTAMPTZ,
  review_notes  TEXT
);
CREATE INDEX IF NOT EXISTS idx_pu_results_container ON pu_results(container_id, submitted_at DESC);

-- ── Starter data for the default tenant (only if none exists yet) ──
INSERT INTO pu_locations (tenant_id, name, kind, capacity_per_day)
SELECT 'a0000000-0000-0000-0000-000000000001', v.name, v.kind, v.cap
  FROM (VALUES ('Warehouse A', 'warehouse', 6), ('Warehouse B', 'warehouse', 6), ('Yard 1', 'yard', 4)) AS v(name, kind, cap)
 WHERE NOT EXISTS (SELECT 1 FROM pu_locations WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001')
   AND EXISTS (SELECT 1 FROM tenants WHERE id = 'a0000000-0000-0000-0000-000000000001');

INSERT INTO pu_teams (tenant_id, name, direction)
SELECT 'a0000000-0000-0000-0000-000000000001', v.name, v.dir
  FROM (VALUES ('Unpacking Team 1', 'import'), ('Unpacking Team 2', 'import'), ('Packing Team 1', 'export')) AS v(name, dir)
 WHERE NOT EXISTS (SELECT 1 FROM pu_teams WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001')
   AND EXISTS (SELECT 1 FROM tenants WHERE id = 'a0000000-0000-0000-0000-000000000001');
