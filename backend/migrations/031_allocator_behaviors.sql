-- Migration 031: wires up previously-inert Allocator Settings toggles —
-- dedupe tracking for recurring maintenance reminders.

ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS reminder_sent_at DATE;
