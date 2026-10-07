-- Migration 046: independent login for the Packing & Unpacking module.
--
-- The module used to accept the reception roles (reception_staff / reception_admin / super_admin), which meant
-- Reception credentials opened it. It now has its own 'packing' role and nothing else gets in.
-- (Customers still use the customer / visitor accounts they already have, for /requests only.)
--
-- Also seeds the module's account: packing@glido.com. The password below is bcrypt(cost 12) of the initial
-- password — change it after first login (Profile → change password), and never reuse it on another account.

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('reception_admin', 'reception_staff', 'visitor_registered', 'super_admin',
                  'customer', 'planner', 'allocator', 'billing',
                  'compliance_officer', 'compliance_admin', 'packing'));

INSERT INTO app_users (email, name, role, password_hash, password_reset_required)
VALUES ('packing@glido.com', 'Packing & Unpacking', 'packing',
        '$2a$12$792IH2cYIwCNGpmlOiSGvO.zCtM9rMwX/RRicYpBBFKl73kl.oclS', FALSE)
ON CONFLICT (email) DO UPDATE
  SET role = 'packing',
      password_hash = EXCLUDED.password_hash,
      password_reset_required = FALSE,
      updated_at = NOW();
