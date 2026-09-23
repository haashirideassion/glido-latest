-- Migration 042: vehicle registration on fleet trucks, and its mirror on trips.
--
-- A driver is shown with the rego of the vehicle they are driving across every module. The
-- Reception side already had this (bookings.vehicle_registration, saved_drivers.vehicle_registration)
-- but the Planner/Allocator side had nowhere to put it: trucks carried only resource_code, an
-- internal asset reference like TRK-004, which is not a plate.
--
-- trips.vehicle_rego is a denormalised mirror, set when a truck is allocated — exactly how
-- trips.vehicle already mirrors trucks.resource_code and trips.driver mirrors drivers.driver_name.
-- It keeps every existing `SELECT *` and `RETURNING *` working untouched.

ALTER TABLE trucks ADD COLUMN IF NOT EXISTS vehicle_registration TEXT;
ALTER TABLE trips  ADD COLUMN IF NOT EXISTS vehicle_rego         TEXT;

-- Regos are looked up and searched on; a plate is unique to one vehicle in a fleet, but existing
-- rows have none, so this is a plain index rather than a unique constraint.
CREATE INDEX IF NOT EXISTS idx_trucks_vehicle_registration ON trucks (vehicle_registration);

-- Backfill the mirror for trips already allocated to a truck that has a rego recorded. A no-op on
-- a fresh database, and safe to re-run.
UPDATE trips t
   SET vehicle_rego = k.vehicle_registration
  FROM trucks k
 WHERE k.id = t.truck_id
   AND k.vehicle_registration IS NOT NULL
   AND t.vehicle_rego IS DISTINCT FROM k.vehicle_registration;
