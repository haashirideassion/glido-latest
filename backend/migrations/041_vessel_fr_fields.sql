-- Migration 041: Planner Vessels FR gaps (FRD 2.4.2.1).
--
--   capacity       — "Vessel capacity", listed on the vessel card and the Add Vessel form.
--   voyage_number  — the search is specified to match "vessel name and the vessel ID
--   lloyd_number     voyage & Lloyd"; neither identifier existed on the table.
--   etd / slotted_at / discharged_at
--                  — the list sort sequence is "slotted, discharged, etd, eta": the first
--                    milestone a vessel has reached wins, falling back to ETA. Only ETA
--                    existed, so the fallback chain could not be expressed.
--
-- All nullable — existing rows keep sorting by ETA exactly as before.

ALTER TABLE vessels ADD COLUMN IF NOT EXISTS capacity      INTEGER;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS voyage_number TEXT;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS lloyd_number  TEXT;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS etd           TIMESTAMPTZ;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS slotted_at    TIMESTAMPTZ;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS discharged_at TIMESTAMPTZ;

-- The vessel search fires on every keystroke and now spans four columns.
CREATE INDEX IF NOT EXISTS idx_vessels_voyage_number ON vessels (voyage_number);
CREATE INDEX IF NOT EXISTS idx_vessels_lloyd_number  ON vessels (lloyd_number);

-- The list is ordered by the milestone fallback chain rather than by ETA alone.
CREATE INDEX IF NOT EXISTS idx_vessels_sort_key
  ON vessels (tenant_id, COALESCE(slotted_at, discharged_at, etd, eta));
