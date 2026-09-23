-- Migration 025: per-user notifications for Planner/Allocator (Phase 2 buffer week) — Reception's
-- `notifications` table is tenant-wide; Planner/Allocator settings toggles imply per-user scoping,
-- so this is a separate table keyed by user_id rather than reusing the tenant-wide one.
CREATE TABLE IF NOT EXISTS user_notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  category    TEXT        NOT NULL,   -- vessel_arrival | trip_scheduled | trip_completed | new_trip | maintenance_reminder
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL DEFAULT '',
  read        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_read ON user_notifications(user_id, read, created_at DESC);
