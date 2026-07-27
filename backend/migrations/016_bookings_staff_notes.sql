-- Migration 016: staff-only internal comment on a booking (feasibility/handling notes),
-- shown in Reception's booking detail slide-over. Never exposed to the guest/visitor-facing
-- portal — only read/written from the Reception module's authenticated routes.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS staff_notes TEXT;
