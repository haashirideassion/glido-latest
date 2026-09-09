-- Migration 040: per-user Compliance capabilities — gates which action buttons/tiles a
-- Compliance user sees (FRD 2.4.4: "New Activity" needs create rights, "Export Report" needs
-- export rights, "Add Schedule Inspection" needs scheduling rights). Absence of a row means
-- no compliance capabilities, same convention as billing_capabilities.

CREATE TABLE IF NOT EXISTS compliance_capabilities (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id                   UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,

  can_create_activity       BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit_activity         BOOLEAN NOT NULL DEFAULT FALSE,
  can_cancel_activity       BOOLEAN NOT NULL DEFAULT FALSE,
  can_export_report         BOOLEAN NOT NULL DEFAULT FALSE,
  can_schedule_inspection   BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit_inspection       BOOLEAN NOT NULL DEFAULT FALSE,
  can_start_inspection      BOOLEAN NOT NULL DEFAULT FALSE,

  updated_by                UUID REFERENCES app_users(id),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT compliance_capabilities_user_uniq UNIQUE (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_compliance_capabilities_user ON compliance_capabilities(user_id);

-- app_users is tenant-agnostic here (single default tenant resolved app-wide), so capability
-- rows are seeded against that tenant, same as billing_capabilities (migration 037).
DO $$
DECLARE
  t_id UUID := 'a0000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = t_id) THEN
    RETURN;
  END IF;

  -- super_admin / reception_admin get the full set so the module is usable the moment it ships.
  INSERT INTO compliance_capabilities (
    tenant_id, user_id,
    can_create_activity, can_edit_activity, can_cancel_activity,
    can_export_report, can_schedule_inspection, can_edit_inspection, can_start_inspection
  )
  SELECT t_id, u.id, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
  FROM app_users u
  WHERE u.role IN ('super_admin', 'reception_admin')
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  -- compliance_admin: full operational set, same as above.
  INSERT INTO compliance_capabilities (
    tenant_id, user_id,
    can_create_activity, can_edit_activity, can_cancel_activity,
    can_export_report, can_schedule_inspection, can_edit_inspection, can_start_inspection
  )
  SELECT t_id, u.id, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
  FROM app_users u
  WHERE u.role = 'compliance_admin'
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  -- compliance_officer: the day-to-day operational set (create/edit/schedule/start) but not
  -- cancelling an activity or exporting reports — those stay with an admin.
  INSERT INTO compliance_capabilities (
    tenant_id, user_id,
    can_create_activity, can_edit_activity,
    can_schedule_inspection, can_edit_inspection, can_start_inspection
  )
  SELECT t_id, u.id, TRUE, TRUE, TRUE, TRUE, TRUE
  FROM app_users u
  WHERE u.role = 'compliance_officer'
  ON CONFLICT (tenant_id, user_id) DO NOTHING;
END $$;
