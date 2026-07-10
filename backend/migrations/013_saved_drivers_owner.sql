-- Migration 013: give saved_drivers an owner so a visitor's saved drivers are private to them.
-- Before this, drivers were scoped only by tenant_id, so the public GET returned every driver
-- in the tenant to anyone (including unauthenticated guests) — a data leak. app_user_id records
-- the visitor account that saved the driver; reception-created rows keep it NULL (tenant-wide,
-- reception manages everyone). The existing UNIQUE(tenant_id, vehicle_registration) is kept.
ALTER TABLE saved_drivers ADD COLUMN IF NOT EXISTS app_user_id UUID;
CREATE INDEX IF NOT EXISTS idx_saved_drivers_app_user_id ON saved_drivers(app_user_id);
