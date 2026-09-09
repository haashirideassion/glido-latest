-- Migration 010: merge "Capacity by Booking Type" and "Per-hour Capacity" into a single
-- hour × combo capacity matrix, removing the ambiguity of two separate numbers both
-- claiming to cap the same hour. Old columns are left in place (unused going forward) so
-- existing configured values can still be read as a one-time fallback if a tenant hasn't
-- saved a matrix yet.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slot_capacity_matrix JSONB;
