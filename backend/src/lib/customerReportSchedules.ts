/**
 * Customer Portal — Custom Reports & Scheduling (FRD §2.4.1.4). No cron/scheduler exists in this
 * app (see maintenanceReminders.ts / allocatorAutoAllocate.ts for the same constraint), so
 * schedules run opportunistically whenever the customer's Reports/Settings screen fetches their
 * schedule list — dedupes via next_run_at so a schedule only fires once it's actually due.
 * Delivery is in-app (a "runs" list the customer can browse and export as CSV), not email —
 * no SMTP provider is configured anywhere in this app either (see notifications.ts).
 */

import { pool } from '../db'
import { computeServiceRequestReports } from './serviceRequestReports'

const FREQUENCY_INTERVAL: Record<string, string> = {
  daily: '1 day',
  weekly: '7 days',
  monthly: '1 month',
}

export async function runDueCustomerReportSchedules(customerId: string): Promise<void> {
  try {
    const due = await pool.query(
      `SELECT * FROM customer_report_schedules
       WHERE customer_id = $1 AND active = TRUE AND next_run_at <= NOW()`,
      [customerId]
    )
    for (const sched of due.rows) {
      const snapshot = await computeServiceRequestReports(customerId, sched.category_filter ?? null, null, null)
      await pool.query(
        `INSERT INTO customer_report_runs (schedule_id, customer_id, snapshot) VALUES ($1, $2, $3)`,
        [sched.id, customerId, JSON.stringify(snapshot)]
      )
      const interval = FREQUENCY_INTERVAL[sched.frequency] ?? FREQUENCY_INTERVAL.weekly
      await pool.query(
        `UPDATE customer_report_schedules
         SET last_run_at = NOW(), next_run_at = NOW() + $2::interval, updated_at = NOW()
         WHERE id = $1`,
        [sched.id, interval]
      )
    }
  } catch (err) {
    // Never block the caller's own request over a scheduling sweep failure.
    console.error('[runDueCustomerReportSchedules]', err)
  }
}
