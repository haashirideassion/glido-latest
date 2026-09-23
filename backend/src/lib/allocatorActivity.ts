/**
 * Allocator Recent Activities log — fire-and-forget, never throws.
 * Mirrors lib/notifications.ts / lib/plannerActivity.ts's pattern.
 */

import { pool } from '../db'

export async function logAllocatorActivity(
  category: 'resource' | 'maintenance' | 'trip' | 'driver',
  message: string,
  tenantId: string,
  createdBy?: string,
) {
  try {
    await pool.query(
      `INSERT INTO allocator_activity (category, message, tenant_id, created_by) VALUES ($1,$2,$3,$4)`,
      [category, message, tenantId, createdBy ?? null]
    )
  } catch (err) {
    console.error('[logAllocatorActivity]', err)
  }
}
