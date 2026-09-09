-- Migration 039: Compliance Module — compliance_activities (My Activities / Completed
-- Activities, FRD 2.4.4.1 / 2.4.4.2), compliance_inspections (Site Inspection, FRD 2.4.4.3),
-- compliance_activity_log (Dashboard Recent Activities, FRD 2.4.4).

-- An "activity" starts life on the 'My Activities' screen (in_transit | received) and, once
-- finished, the SAME row shows up on 'Completed Activities' (status = completed) — the FRD
-- describes these as one lifecycle, not two tables. 'cancelled' is not in the FRD's status
-- list for the card badge, but the FRD also requires a 'Cancel Activity' context-menu action,
-- so it must be a reachable status.
CREATE TABLE IF NOT EXISTS compliance_activities (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number        TEXT        UNIQUE NOT NULL,
  title               TEXT        NOT NULL,
  request_number      TEXT,
  container_number    TEXT,
  container_type      TEXT,                          -- e.g. 20GP, 40HC
  vessel_name         TEXT,
  voyage_number       TEXT,
  shipment_type       TEXT        NOT NULL DEFAULT 'fcl',
  -- fcl | lcl (FRD 2.4.4.1 tab control)
  status              TEXT        NOT NULL DEFAULT 'in_transit',
  -- in_transit | received | completed | cancelled
  collection_date     TIMESTAMPTZ,
  description         TEXT,
  category            TEXT,                           -- e.g. Safety Audit | Equipment Check | Environmental
  tags                TEXT[]      NOT NULL DEFAULT '{}',
  completed_date      TIMESTAMPTZ,
  completed_by        UUID        REFERENCES app_users(id),
  assigned_by         UUID        REFERENCES app_users(id),
  quality_rating      INTEGER,                        -- 0-5 stars (FRD 2.4.4.2)
  report_available    BOOLEAN     NOT NULL DEFAULT FALSE,
  tenant_id           UUID        NOT NULL REFERENCES tenants(id),
  created_by          UUID        REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compliance_activities_tenant_id  ON compliance_activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_compliance_activities_status     ON compliance_activities(status);
CREATE INDEX IF NOT EXISTS idx_compliance_activities_shipment   ON compliance_activities(shipment_type);
CREATE INDEX IF NOT EXISTS idx_compliance_activities_collection ON compliance_activities(collection_date);
CREATE INDEX IF NOT EXISTS idx_compliance_activities_completed  ON compliance_activities(completed_date);

-- Site Inspection (FRD 2.4.4.3). 'overdue' is not stored — it is derived at query time from
-- (status = 'scheduled' AND scheduled_at < now()), same reasoning as Allocator's derived
-- allocation status, so nothing needs a background job to keep it fresh.
CREATE TABLE IF NOT EXISTS compliance_inspections (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_code         TEXT        UNIQUE NOT NULL,
  title                   TEXT        NOT NULL,
  description             TEXT,
  inspection_type         TEXT,
  location                TEXT,
  inspector_name          TEXT,
  scheduled_at            TIMESTAMPTZ,
  status                  TEXT        NOT NULL DEFAULT 'scheduled',
  -- scheduled | in_progress | completed
  priority                TEXT        NOT NULL DEFAULT 'medium',
  -- high | medium | low
  checklist_items         TEXT[]      NOT NULL DEFAULT '{}',
  checklist_observations  JSONB       NOT NULL DEFAULT '{}',
  tenant_id               UUID        NOT NULL REFERENCES tenants(id),
  created_by              UUID        REFERENCES app_users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compliance_inspections_tenant_id ON compliance_inspections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_compliance_inspections_status    ON compliance_inspections(status);
CREATE INDEX IF NOT EXISTS idx_compliance_inspections_scheduled ON compliance_inspections(scheduled_at);

-- Compliance Dashboard Recent Activities (FRD 2.4.4 — icon category is activity | inspection).
CREATE TABLE IF NOT EXISTS compliance_activity_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT        NOT NULL,   -- activity | inspection
  message     TEXT        NOT NULL,
  status      TEXT,                    -- optional status tag to render on the dashboard feed
  priority    TEXT,                    -- optional priority tag to render on the dashboard feed
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  created_by  UUID        REFERENCES app_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compliance_activity_log_tenant_id  ON compliance_activity_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_compliance_activity_log_created_at ON compliance_activity_log(created_at);
