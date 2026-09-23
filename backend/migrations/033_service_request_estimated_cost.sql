-- Migration 033: Estimated Cost field on service requests (Customer Portal Request Details).
-- No UI writes this yet (set by staff/pricing later) — shows '—' until populated.

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(12,2);
