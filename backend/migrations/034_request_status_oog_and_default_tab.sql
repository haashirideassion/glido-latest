-- Migration 034: Customer Portal — My Requests FRD gaps (FR 2.2/2.3).
-- 1. Request-level Status badge, distinct from the progress `stage` (received/in_transit/...).
-- 2. OOG (Out of Gauge) cargo indicator, with dimensions captured only when OOG = true.
-- 3. Per-customer default landing tab (Import/Export) for My Requests.

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
-- pending | approved | in_progress | completed | rejected

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS is_oog     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS oog_length TEXT;  -- cm
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS oog_width  TEXT;  -- cm
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS oog_height TEXT;  -- cm

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS default_requests_tab TEXT NOT NULL DEFAULT 'import';
-- import | export — which tab My Requests lands on for this customer
