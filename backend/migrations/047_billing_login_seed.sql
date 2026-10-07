-- Migration 047: seed the Billing module's own login account: billing@glido.com.
--
-- Billing signs in at /login?role=billing (a dedicated screen, only the 'billing' role is accepted there).
-- The hash below is bcrypt(cost 12) of the initial password — change it after first login
-- (Profile → change password), and never reuse it on another account.
--
-- The account gets the same back-office capability set migration 037 gives any 'billing' user (tariff
-- publishing and second-approver stay with an admin, for segregation of duties).

INSERT INTO app_users (email, name, role, password_hash, password_reset_required)
VALUES ('billing@glido.com', 'Billing', 'billing',
        '$2a$12$usmYtGBqjo5pB3Gk2HIXN.fADggh30.oQeskQ/IkxwwYOgDJhKW2m', FALSE)
ON CONFLICT (email) DO UPDATE
  SET role = 'billing',
      password_hash = EXCLUDED.password_hash,
      password_reset_required = FALSE,
      updated_at = NOW();

DO $$
DECLARE
  t_id UUID := 'a0000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = t_id) THEN
    RETURN;
  END IF;

  INSERT INTO billing_capabilities (
    tenant_id, user_id,
    can_manage_catalogue, can_add_manual_charge, can_adjust_charge, can_waive_charge,
    can_issue_invoice, can_run_billing, can_issue_credit_note,
    can_confirm_eft_payment, can_export
  )
  SELECT t_id, u.id, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
  FROM app_users u
  WHERE u.email = 'billing@glido.com'
  ON CONFLICT (tenant_id, user_id) DO NOTHING;
END $$;
