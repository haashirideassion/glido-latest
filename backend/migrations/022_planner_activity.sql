-- Migration 022: Planner Dashboard Recent Activity log (FRD 2.4.2 — icon category is
-- vessel | trip | report). Replaces deriving activity synthetically from vessels/trips
-- updated_at, which could never produce a "report" category entry.
CREATE TABLE IF NOT EXISTS planner_activity (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT        NOT NULL,   -- vessel | trip | report
  message     TEXT        NOT NULL,
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  created_by  UUID        REFERENCES app_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planner_activity_tenant_id ON planner_activity(tenant_id);
CREATE INDEX IF NOT EXISTS idx_planner_activity_created_at ON planner_activity(created_at);
