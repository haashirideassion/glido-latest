/**
 * Maintenance Reminders (Allocator Settings → Notifications). No cron/scheduler exists in this
 * app, so this sweep runs opportunistically whenever maintenance records are listed
 * (GET /api/maintenance) — dedupes via reminder_sent_at so a record is only reminded once per day.
 */

import { pool } from '../db'
import { notifyRoleIfEnabled, allocatorToggleEnabled } from './userNotifications'

export async function sendMaintenanceReminders(tenantId: string): Promise<void> {
  try {
    const due = await pool.query(
      `SELECT * FROM maintenance_records
       WHERE tenant_id = $1 AND status = 'scheduled' AND due_date IS NOT NULL
         AND due_date <= CURRENT_DATE + INTERVAL '2 days'
         AND (reminder_sent_at IS NULL OR reminder_sent_at != CURRENT_DATE)`,
      [tenantId]
    )
    for (const rec of due.rows) {
      const overdue = new Date(rec.due_date) < new Date(new Date().toISOString().slice(0, 10))
      await notifyRoleIfEnabled(
        'allocator', tenantId, 'maintenance_reminder',
        overdue ? 'Maintenance overdue' : 'Maintenance due soon',
        `${rec.maintenance_code} (${rec.activity_type}) is ${overdue ? 'overdue' : 'due within 2 days'}.`,
        userId => allocatorToggleEnabled(userId, 'maintenance_reminders'),
      )
      await pool.query(`UPDATE maintenance_records SET reminder_sent_at = CURRENT_DATE WHERE id = $1`, [rec.id])
    }
  } catch (err) {
    console.error('[sendMaintenanceReminders]', err)
  }
}
