/**
 * Notification helper — fire-and-forget, never throws.
 * Email integration is stubbed; wire up SMTP here when ready.
 */

import { pool } from '../db'

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

const SETUP = `
  CREATE TABLE IF NOT EXISTS notifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL,
    type         TEXT NOT NULL,
    title        TEXT NOT NULL,
    body         TEXT NOT NULL DEFAULT '',
    reference_id UUID,
    read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_id UUID;
  CREATE INDEX IF NOT EXISTS notif_tenant_read ON notifications (tenant_id, read, created_at DESC);
`

let ready = false
async function ensureTable() {
  if (ready) return
  await pool.query(SETUP)
  ready = true
}

export type NotifType =
  | 'checkin'
  | 'walkin'
  | 'booking_cancelled'
  | 'new_booking'

export async function createNotification(
  type: NotifType,
  title: string,
  body = '',
  referenceId?: string,
): Promise<void> {
  try {
    await ensureTable()
    await pool.query(
      `INSERT INTO notifications (tenant_id, type, title, body, reference_id) VALUES ($1, $2, $3, $4, $5)`,
      [DEFAULT_TENANT_ID, type, title, body, referenceId ?? null],
    )

    // ── Email stub ────────────────────────────────────────────────────────────
    // TODO: wire up SMTP when credentials are available
    // await sendEmailNotification({ type, title, body })
    // ─────────────────────────────────────────────────────────────────────────
  } catch (err) {
    // Notifications are fire-and-forget — never crash the caller
    console.error('[notifications create]', err)
  }
}

// ── SMTP placeholder ──────────────────────────────────────────────────────────
// import nodemailer from 'nodemailer'
//
// async function sendEmailNotification(n: { type: string; title: string; body: string }) {
//   if (!process.env.SMTP_HOST) return  // skip if not configured
//   const transporter = nodemailer.createTransporter({
//     host:   process.env.SMTP_HOST,
//     port:   Number(process.env.SMTP_PORT ?? 587),
//     secure: process.env.SMTP_SECURE === 'true',
//     auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
//   })
//   await transporter.sendMail({
//     from:    process.env.SMTP_FROM    ?? 'noreply@glido.com',
//     to:      process.env.NOTIFY_EMAIL ?? '',
//     subject: `[Glido] ${n.title}`,
//     text:    n.body || n.title,
//   })
// }
