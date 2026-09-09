-- Migration 020: add the Phase 2 'planner' role (Planner Module) to app_users.
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('reception_admin', 'reception_staff', 'visitor_registered', 'super_admin', 'customer', 'planner'));
