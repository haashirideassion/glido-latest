-- Migration 021: Planner Module — vessels, trips, planner_settings (Phase 2, FRD §2.4.2)

CREATE TABLE IF NOT EXISTS vessels (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_name      TEXT        NOT NULL,
  vessel_code      TEXT        UNIQUE NOT NULL,   -- customer-facing "ID"
  eta              TIMESTAMPTZ,
  port             TEXT,
  status           TEXT        NOT NULL DEFAULT 'scheduled',
  -- scheduled | in_transit | arrived
  container_count  INTEGER     NOT NULL DEFAULT 0,
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),
  created_by       UUID        REFERENCES app_users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vessels_tenant_id ON vessels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vessels_status    ON vessels(status);

-- Trips only ever represent transport-based services (collection/delivery/dehire) — Store,
-- Unpack and Inspection & Compliance never get a trip (FRD note, 2.4.2.2).
CREATE TABLE IF NOT EXISTS trips (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_ref          TEXT        UNIQUE NOT NULL,
  service_category  TEXT        NOT NULL,          -- import | export
  service_type      TEXT        NOT NULL,           -- collection | delivery | dehire
  container_number  TEXT,
  vessel_id         UUID        REFERENCES vessels(id),
  vessel_name       TEXT,                            -- denormalized for display/search even if vessel_id is null
  trip_date         DATE,
  vehicle           TEXT,
  driver            TEXT,
  stage             TEXT        NOT NULL DEFAULT 'planned',
  -- planned | assigned | in_progress | completed
  tenant_id         UUID        NOT NULL REFERENCES tenants(id),
  created_by        UUID        REFERENCES app_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_tenant_id    ON trips(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trips_category     ON trips(service_category);
CREATE INDEX IF NOT EXISTS idx_trips_service_type  ON trips(service_type);
CREATE INDEX IF NOT EXISTS idx_trips_stage         ON trips(stage);

-- Per-user Planner preferences (FRD 2.4.2.3) — one row per planner user, never shared.
CREATE TABLE IF NOT EXISTS planner_settings (
  user_id                 UUID        PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  default_landing_page    TEXT        NOT NULL DEFAULT 'vessels',
  items_per_page          INTEGER     NOT NULL DEFAULT 10,
  show_completed_default  BOOLEAN     NOT NULL DEFAULT FALSE,
  email_notifications     JSONB       NOT NULL DEFAULT '{"vessel_arrival":true,"trip_scheduled":true,"trip_completed":true}'::jsonb,
  system_notifications    JSONB       NOT NULL DEFAULT '{"vessel_arrival":true,"trip_scheduled":true,"trip_completed":true}'::jsonb,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
