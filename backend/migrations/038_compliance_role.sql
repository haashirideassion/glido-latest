-- Migration 038: add the Phase 2 'compliance_officer' and 'compliance_admin' roles
-- (Compliance Module, FRD §2.4.4) to app_users.

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('reception_admin', 'reception_staff', 'visitor_registered', 'super_admin',
                  'customer', 'planner', 'allocator', 'billing',
                  'compliance_officer', 'compliance_admin'));
