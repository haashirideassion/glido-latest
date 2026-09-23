-- Migration 037: add the 'billing' role (Billing, Rating & Revenue Module) and the
-- capability toggles the FRS requires to be individually grantable (S-11, RT-08,
-- PY-07, PY-08, RP-12, AR-03).
--
-- Capability gating must be *visible*: the UI hides or disables an action with a
-- reason rather than failing on submit (cross-cutting rule 4), so the frontend
-- needs to read these before rendering.

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('reception_admin', 'reception_staff', 'visitor_registered',
                  'super_admin', 'customer', 'planner', 'allocator', 'billing'));

-- Per-user billing capabilities. Absence of a row means "no billing capabilities".
CREATE TABLE IF NOT EXISTS billing_capabilities (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id                   UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,

  can_manage_catalogue      BOOLEAN NOT NULL DEFAULT FALSE,  -- SC-01
  can_manage_tariffs        BOOLEAN NOT NULL DEFAULT FALSE,  -- TF-01
  can_publish_tariffs       BOOLEAN NOT NULL DEFAULT FALSE,  -- TF-12
  can_add_manual_charge     BOOLEAN NOT NULL DEFAULT FALSE,  -- RT-08
  can_adjust_charge         BOOLEAN NOT NULL DEFAULT FALSE,  -- RT-09
  can_waive_charge          BOOLEAN NOT NULL DEFAULT FALSE,  -- RT-09
  can_issue_invoice         BOOLEAN NOT NULL DEFAULT FALSE,  -- IN-01
  can_run_billing           BOOLEAN NOT NULL DEFAULT FALSE,  -- IN-13
  can_issue_credit_note     BOOLEAN NOT NULL DEFAULT FALSE,  -- IN-06
  can_confirm_eft_payment   BOOLEAN NOT NULL DEFAULT FALSE,  -- PY-07
  can_refund                BOOLEAN NOT NULL DEFAULT FALSE,  -- PY-08
  can_write_off             BOOLEAN NOT NULL DEFAULT FALSE,  -- AR-10
  can_override_credit_limit BOOLEAN NOT NULL DEFAULT FALSE,  -- AR-03
  can_approve               BOOLEAN NOT NULL DEFAULT FALSE,  -- S-10 second approver
  can_export                BOOLEAN NOT NULL DEFAULT FALSE,  -- RP-12
  can_manage_integration    BOOLEAN NOT NULL DEFAULT FALSE,  -- IG-01

  updated_by                UUID REFERENCES app_users(id),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_capabilities_user_uniq UNIQUE (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_capabilities_user
  ON billing_capabilities (user_id);

-- app_users is tenant-agnostic in this schema (the app resolves a single default
-- tenant), so capability rows are seeded against that tenant. When app_users
-- gains a tenant_id, this seed becomes a join instead.
--
-- Existing admins get the full set so the module is usable the moment it ships;
-- reception_staff get the day-to-day operational subset only. A 'billing' role
-- user gets the back-office set but not tariff publishing or approvals — those
-- stay with an admin so segregation of duties has somewhere to stand (S-10).
DO $$
DECLARE
  t_id UUID := 'a0000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = t_id) THEN
    RETURN;
  END IF;

  INSERT INTO billing_capabilities (
    tenant_id, user_id,
    can_manage_catalogue, can_manage_tariffs, can_publish_tariffs,
    can_add_manual_charge, can_adjust_charge, can_waive_charge,
    can_issue_invoice, can_run_billing, can_issue_credit_note,
    can_confirm_eft_payment, can_refund, can_write_off,
    can_override_credit_limit, can_approve, can_export, can_manage_integration
  )
  SELECT t_id, u.id,
         TRUE, TRUE, TRUE,
         TRUE, TRUE, TRUE,
         TRUE, TRUE, TRUE,
         TRUE, TRUE, TRUE,
         TRUE, TRUE, TRUE, TRUE
  FROM app_users u
  WHERE u.role IN ('super_admin', 'reception_admin')
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  INSERT INTO billing_capabilities (
    tenant_id, user_id,
    can_manage_catalogue, can_add_manual_charge, can_adjust_charge, can_waive_charge,
    can_issue_invoice, can_run_billing, can_issue_credit_note,
    can_confirm_eft_payment, can_export
  )
  SELECT t_id, u.id, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
  FROM app_users u
  WHERE u.role = 'billing'
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  INSERT INTO billing_capabilities (
    tenant_id, user_id,
    can_add_manual_charge, can_adjust_charge, can_issue_invoice, can_export
  )
  SELECT t_id, u.id, TRUE, TRUE, TRUE, TRUE
  FROM app_users u
  WHERE u.role = 'reception_staff'
  ON CONFLICT (tenant_id, user_id) DO NOTHING;
END $$;
