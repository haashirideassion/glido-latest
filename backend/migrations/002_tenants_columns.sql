-- Add missing columns to tenants table
-- Safe to run multiple times (uses IF NOT EXISTS equivalent via DO block)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='primary_color') THEN
    ALTER TABLE tenants ADD COLUMN primary_color TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='eft_bank_name') THEN
    ALTER TABLE tenants ADD COLUMN eft_bank_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='eft_account_name') THEN
    ALTER TABLE tenants ADD COLUMN eft_account_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='eft_bsb') THEN
    ALTER TABLE tenants ADD COLUMN eft_bsb TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='eft_account_number') THEN
    ALTER TABLE tenants ADD COLUMN eft_account_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='compay_client_number') THEN
    ALTER TABLE tenants ADD COLUMN compay_client_number TEXT;
  END IF;
END $$;
