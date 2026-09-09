-- Migration 027: CFS-admin-configurable Store sub-types (FRD comment on Step 2 Service
-- Selection's "Store" option — the 3-option pop-up must be customisable from Settings rather
-- than hardcoded).
CREATE TABLE IF NOT EXISTS store_types (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id),
  name       TEXT        NOT NULL,
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_types_tenant_id ON store_types(tenant_id);

-- Seed the 3 options that were previously hardcoded, so existing tenants see no visible change
-- until an admin edits them.
INSERT INTO store_types (tenant_id, name)
SELECT id, unnest(ARRAY['Underbond', 'Reefer', 'General']) FROM tenants
ON CONFLICT DO NOTHING;
