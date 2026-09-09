-- Migration 035: Customer Portal — custom report builder + scheduling (FRD §2.4.1.4).
-- No cron/scheduler exists in this app (see maintenanceReminders.ts / allocatorAutoAllocate.ts),
-- so scheduled reports run opportunistically whenever the customer's Reports page is loaded —
-- same pattern as maintenance reminders. Delivery is in-app (a "runs" list with CSV export),
-- not email, since no SMTP provider is configured anywhere in this app either.

CREATE TABLE IF NOT EXISTS customer_report_schedules (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      UUID        NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),
  name             TEXT        NOT NULL,
  category_filter  TEXT,       -- import | export | NULL (both)
  metrics          JSONB       NOT NULL DEFAULT '["service_type_distribution","request_status","monthly_requests","processing_time"]'::jsonb,
  frequency        TEXT        NOT NULL DEFAULT 'weekly',  -- daily | weekly | monthly
  active           BOOLEAN     NOT NULL DEFAULT TRUE,
  last_run_at      TIMESTAMPTZ,
  next_run_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crs_customer  ON customer_report_schedules(customer_id);
CREATE INDEX IF NOT EXISTS idx_crs_due       ON customer_report_schedules(active, next_run_at);

CREATE TABLE IF NOT EXISTS customer_report_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id   UUID        NOT NULL REFERENCES customer_report_schedules(id) ON DELETE CASCADE,
  customer_id   UUID        NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot      JSONB       NOT NULL   -- computed report data at generation time
);
CREATE INDEX IF NOT EXISTS idx_crr_schedule ON customer_report_runs(schedule_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crr_customer ON customer_report_runs(customer_id);
