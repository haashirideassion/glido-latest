-- Migration 030: Allocator-admin-configurable single custom field for Maintenance records,
-- mirroring 028 (trucks) and 029 (trips).

ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS custom_field_value TEXT;

CREATE TABLE IF NOT EXISTS maintenance_custom_field_settings (
  tenant_id   UUID        PRIMARY KEY REFERENCES tenants(id),
  field_label TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
