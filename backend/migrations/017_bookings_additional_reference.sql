-- Migration 017: optional "Reference" field on a booking — same pattern as staff_notes
-- (016), a free-form field for reception's own reference/PO/job number, editable from the
-- booking detail slide-over. Internal — never shown to the guest/visitor-facing portal.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS additional_reference TEXT;
