-- Migration 014: tenant-configurable list of "who you're visiting" names for the kiosk
-- walk-in flow. Replaces the free-text "Person you're visiting" input with a mandatory
-- dropdown sourced from this table, managed by Reception in Settings. No login/account
-- requirement — covers depot staff who don't have a system user record.
CREATE TABLE IF NOT EXISTS visitable_persons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitable_persons_tenant_id ON visitable_persons(tenant_id);
