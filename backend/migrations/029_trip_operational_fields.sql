-- Migration 029: Trip Allocation card operational fields (Allocator FRD) —
-- time to reach/complete, hazardous, weight, OOG (+ dimensions), and an
-- allocator-admin-configurable single custom field, mirroring 028's truck custom field.

ALTER TABLE trips ADD COLUMN IF NOT EXISTS time_to_reach     TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS time_to_complete  TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS is_hazardous      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS weight            TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS is_oog            BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS oog_length        TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS oog_width         TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS oog_height        TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS custom_field_value TEXT;

CREATE TABLE IF NOT EXISTS trip_custom_field_settings (
  tenant_id   UUID        PRIMARY KEY REFERENCES tenants(id),
  field_label TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
