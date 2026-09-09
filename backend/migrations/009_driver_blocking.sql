-- Migration 009: driver blocking. The block-driver UI (SavedDriversPage, BookingDetailPage)
-- already existed and called a PATCH /:id/block endpoint that never existed, and
-- saved_drivers had no blocked/block_reason columns — blocking silently no-op'd server-side
-- and only faked success client-side. This makes it real.
ALTER TABLE saved_drivers ADD COLUMN IF NOT EXISTS blocked      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE saved_drivers ADD COLUMN IF NOT EXISTS block_reason TEXT;
