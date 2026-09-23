/**
 * Per-user notifications for Planner/Allocator — fire-and-forget, never throws.
 * Unlike Reception's tenant-wide `notifications` table, these are scoped to a single user_id,
 * matching what the Planner/Allocator settings toggles imply (per-user preferences).
 */

import { pool } from '../db'

export type UserNotifCategory =
  | 'vessel_arrival' | 'trip_scheduled' | 'trip_completed'  // planner
  | 'new_trip' | 'maintenance_reminder' | 'resource_conflict' // allocator

export async function notifyUser(userId: string, tenantId: string, category: UserNotifCategory, title: string, body = '') {
  try {
    await pool.query(
      `INSERT INTO user_notifications (user_id, tenant_id, category, title, body) VALUES ($1,$2,$3,$4,$5)`,
      [userId, tenantId, category, title, body]
    )
  } catch (err) {
    console.error('[notifyUser]', err)
  }
}

/**
 * Notify every user of `role` in the tenant whose settings have this category's toggle enabled.
 * `settingsTable`/`toggleColumn` point at the per-user settings row (planner_settings.system_notifications
 * JSON key, or allocator_settings' flat boolean column) that gates this category.
 */
export async function notifyRoleIfEnabled(
  role: 'planner' | 'allocator',
  tenantId: string,
  category: UserNotifCategory,
  title: string,
  body: string,
  isEnabled: (userId: string) => Promise<boolean>,
) {
  try {
    // app_users has no tenant_id column (this app is currently single-tenant) — scope by role only.
    const users = await pool.query(`SELECT id FROM app_users WHERE role = $1`, [role])
    for (const u of users.rows) {
      if (await isEnabled(u.id)) {
        await notifyUser(u.id, tenantId, category, title, body)
      }
    }
  } catch (err) {
    console.error('[notifyRoleIfEnabled]', err)
  }
}

export async function plannerSystemNotifEnabled(userId: string, category: 'vessel_arrival' | 'trip_scheduled' | 'trip_completed'): Promise<boolean> {
  const result = await pool.query(`SELECT system_notifications FROM planner_settings WHERE user_id = $1`, [userId])
  const sn = result.rows[0]?.system_notifications
  if (!sn || typeof sn !== 'object') return true // default-on, matches PLANNER_SETTINGS defaults
  return sn[category] !== false
}

export async function allocatorToggleEnabled(userId: string, column: 'new_trip_notifications' | 'maintenance_reminders' | 'resource_conflict_alerts'): Promise<boolean> {
  const result = await pool.query(`SELECT ${column} FROM allocator_settings WHERE user_id = $1`, [userId])
  const val = result.rows[0]?.[column]
  return val !== false // default-on, matches allocator_settings column defaults
}
