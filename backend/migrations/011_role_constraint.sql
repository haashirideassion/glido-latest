-- Migration 011: enforce a CHECK constraint on app_users.role so only the roles the
-- application actually understands can ever be written, including the newly-introduced
-- super_admin role (previously accepted by the type system but not by the database).
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('reception_admin', 'reception_staff', 'visitor_registered', 'super_admin'));
