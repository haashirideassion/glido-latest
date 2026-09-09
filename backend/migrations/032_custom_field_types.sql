-- Migration 032: custom field type (text|number|date) for the three Allocator custom fields
-- (trucks, trips, maintenance), so the value input can render the right control.

ALTER TABLE truck_custom_field_settings       ADD COLUMN IF NOT EXISTS field_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE trip_custom_field_settings        ADD COLUMN IF NOT EXISTS field_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE maintenance_custom_field_settings ADD COLUMN IF NOT EXISTS field_type TEXT NOT NULL DEFAULT 'text';
