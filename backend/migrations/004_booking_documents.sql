-- Migration 004: booking_documents table
CREATE TABLE IF NOT EXISTS booking_documents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  tenant_id        UUID,
  document_type    TEXT        NOT NULL DEFAULT 'general',
  filename         TEXT,
  file_size_bytes  BIGINT,
  storage_path     TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_documents_booking_id ON booking_documents(booking_id);
