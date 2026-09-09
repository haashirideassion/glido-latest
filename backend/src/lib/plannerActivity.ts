/**
 * Planner Recent Activity log — fire-and-forget, never throws.
 * Mirrors lib/notifications.ts's pattern.
 */

import { pool } from '../db'

export async function logPlannerActivity(
  category: 'vessel' | 'trip' | 'report',
  message: string,
  tenantId: string,
  createdBy?: string,
) {
  try {
    await pool.query(
      `INSERT INTO planner_activity (category, message, tenant_id, created_by) VALUES ($1,$2,$3,$4)`,
      [category, message, tenantId, createdBy ?? null]
    )
  } catch (err) {
    console.error('[logPlannerActivity]', err)
  }
}
