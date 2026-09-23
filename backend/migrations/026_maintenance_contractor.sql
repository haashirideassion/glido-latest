-- Migration 026: Contractor field on maintenance_records — captured at scheduling time (FRD
-- comment), distinct from `technician` which is set when the activity actually commences.
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS contractor TEXT;
