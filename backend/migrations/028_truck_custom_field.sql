-- Migration 028: Allocator-admin-configurable single custom field for Trucks
-- (Resources Management → Trucks tab, label set from Allocator Settings).

CREATE TABLE IF NOT EXISTS truck_custom_field_settings (
  tenant_id   UUID        PRIMARY KEY REFERENCES tenants(id),
  field_label TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE trucks ADD COLUMN IF NOT EXISTS custom_field_value TEXT;
