-- Migration 024: Allocator Module — trucks, trailers, drivers (cross-linked resources),
-- extends trips with allocation fields, maintenance_records, allocator_settings,
-- allocator_activity (Phase 2, FRD §2.4.3)

CREATE TABLE IF NOT EXISTS trucks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_code     TEXT        UNIQUE NOT NULL,   -- e.g. SYD-TRK-001
  truck_type        TEXT,                           -- Semi-Trailer | Rigid | B-Double
  capacity          TEXT,                           -- e.g. 40T
  location          TEXT,
  status            TEXT        NOT NULL DEFAULT 'available',
  -- available | on_trip | maintenance
  last_service_date DATE,
  tenant_id         UUID        NOT NULL REFERENCES tenants(id),
  created_by        UUID        REFERENCES app_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trucks_tenant_id ON trucks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trucks_status    ON trucks(status);

CREATE TABLE IF NOT EXISTS trailers (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_code       TEXT        UNIQUE NOT NULL,
  trailer_type        TEXT,                          -- Flatbed | Container | Refrigerated | Side loader
  capacity            TEXT,                           -- e.g. 40FT
  attached_truck_id   UUID        REFERENCES trucks(id),
  status              TEXT        NOT NULL DEFAULT 'available',
  -- available | on_trip | maintenance
  last_service_date   DATE,
  tenant_id           UUID        NOT NULL REFERENCES tenants(id),
  created_by          UUID        REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trailers_tenant_id ON trailers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trailers_status    ON trailers(status);
CREATE INDEX IF NOT EXISTS idx_trailers_attached  ON trailers(attached_truck_id);

CREATE TABLE IF NOT EXISTS drivers (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_code     TEXT        UNIQUE NOT NULL,
  driver_name       TEXT        NOT NULL,
  license_class     TEXT,
  experience_years  INTEGER,
  assigned_truck_id UUID        REFERENCES trucks(id),
  status            TEXT        NOT NULL DEFAULT 'off_duty',
  -- on_duty | off_duty | on_leave
  tenant_id         UUID        NOT NULL REFERENCES tenants(id),
  created_by        UUID        REFERENCES app_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drivers_tenant_id ON drivers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_drivers_status    ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_assigned  ON drivers(assigned_truck_id);

-- Trip Allocation (FRD 2.4.3.2) operates on the SAME trips Planner already created — these
-- columns extend that table rather than duplicating trips into a second allocator-owned table.
-- allocation status is derived (truck_id + driver_id both set = allocated), not stored.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS priority          TEXT DEFAULT 'medium';  -- high | medium | low
ALTER TABLE trips ADD COLUMN IF NOT EXISTS origin            TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS destination       TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS time_window_start  TIME;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS time_window_end    TIME;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS truck_id          UUID REFERENCES trucks(id);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS trailer_id        UUID REFERENCES trailers(id);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_id         UUID REFERENCES drivers(id);
CREATE INDEX IF NOT EXISTS idx_trips_truck_id  ON trips(truck_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON trips(driver_id);

CREATE TABLE IF NOT EXISTS maintenance_records (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_code      TEXT        UNIQUE NOT NULL,   -- e.g. MT-000123
  resource_type         TEXT        NOT NULL,           -- truck | trailer
  resource_id           UUID        NOT NULL,            -- polymorphic FK — see resource_type
  activity_type         TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'scheduled',
  -- scheduled | in_progress | completed
  priority              TEXT        DEFAULT 'medium',    -- high | medium | low (scheduled only)
  due_date              DATE,
  estimated_duration    TEXT,
  start_date            DATE,
  estimated_completion  DATE,
  completed_date        DATE,
  progress_pct          INTEGER     NOT NULL DEFAULT 0,
  technician            TEXT,
  remarks               TEXT,
  tenant_id             UUID        NOT NULL REFERENCES tenants(id),
  created_by            UUID        REFERENCES app_users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_maintenance_tenant_id ON maintenance_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status    ON maintenance_records(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_resource  ON maintenance_records(resource_type, resource_id);

-- Per-user Allocator preferences (FRD 2.4.3.4) — one row per allocator user, never shared.
CREATE TABLE IF NOT EXISTS allocator_settings (
  user_id                   UUID        PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  default_view              TEXT        NOT NULL DEFAULT 'resources',
  automated_allocation      BOOLEAN     NOT NULL DEFAULT FALSE,
  operation_start_time      TIME        NOT NULL DEFAULT '06:00',
  operation_end_time        TIME        NOT NULL DEFAULT '18:00',
  new_trip_notifications     BOOLEAN     NOT NULL DEFAULT TRUE,
  resource_conflict_alerts  BOOLEAN     NOT NULL DEFAULT TRUE,
  maintenance_reminders     BOOLEAN     NOT NULL DEFAULT TRUE,
  email_notifications       BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allocator Dashboard Recent Activities (FRD 2.4.3 — icon category is
-- resource | maintenance | trip | driver).
CREATE TABLE IF NOT EXISTS allocator_activity (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT        NOT NULL,   -- resource | maintenance | trip | driver
  message     TEXT        NOT NULL,
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  created_by  UUID        REFERENCES app_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_allocator_activity_tenant_id ON allocator_activity(tenant_id);
CREATE INDEX IF NOT EXISTS idx_allocator_activity_created_at ON allocator_activity(created_at);
