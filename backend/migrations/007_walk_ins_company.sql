-- Migration 007: company name on walk_ins (office/yard visits collect the visiting
-- company instead of a phone number)
ALTER TABLE walk_ins ADD COLUMN IF NOT EXISTS company_name TEXT;
