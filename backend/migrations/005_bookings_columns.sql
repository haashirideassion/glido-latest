-- Migration 005: Add missing columns to bookings table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='booking_group_id') THEN
    ALTER TABLE bookings ADD COLUMN booking_group_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='slot_index') THEN
    ALTER TABLE bookings ADD COLUMN slot_index INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='group_reference') THEN
    ALTER TABLE bookings ADD COLUMN group_reference TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='container_size') THEN
    ALTER TABLE bookings ADD COLUMN container_size TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='entry_number') THEN
    ALTER TABLE bookings ADD COLUMN entry_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='purpose') THEN
    ALTER TABLE bookings ADD COLUMN purpose TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='consolidator') THEN
    ALTER TABLE bookings ADD COLUMN consolidator TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='booking_reference') THEN
    ALTER TABLE bookings ADD COLUMN booking_reference TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='vehicle_registration') THEN
    ALTER TABLE bookings ADD COLUMN vehicle_registration TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='booking_source') THEN
    ALTER TABLE bookings ADD COLUMN booking_source TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='checked_in_at') THEN
    ALTER TABLE bookings ADD COLUMN checked_in_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='completed_at') THEN
    ALTER TABLE bookings ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='completion_notes') THEN
    ALTER TABLE bookings ADD COLUMN completion_notes TEXT;
  END IF;
END $$;
