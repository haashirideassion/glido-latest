-- Migration 006: saved_drivers table
CREATE TABLE IF NOT EXISTS saved_drivers (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL,
  name                 TEXT        NOT NULL,
  phone                TEXT,
  vehicle_registration TEXT        NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, vehicle_registration)
);

CREATE INDEX IF NOT EXISTS idx_saved_drivers_tenant_id ON saved_drivers(tenant_id);
