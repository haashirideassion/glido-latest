/**
 * Automated Allocation (Allocator Settings → General). There's no cron/scheduler in this app,
 * so this sweep runs opportunistically whenever trips are listed (GET /api/trips) — cheap no-op
 * when no allocator has the toggle enabled, and self-correcting as resources free up.
 */

import { pool } from '../db'
import { logAllocatorActivity } from './allocatorActivity'

export async function autoAllocatePendingTrips(tenantId: string): Promise<number> {
  try {
    // automated_allocation + operation hours are per-user settings — use whichever allocator user
    // has the toggle on as the "acting" identity (hours + activity-log attribution).
    const settingsResult = await pool.query(
      `SELECT s.* FROM allocator_settings s JOIN app_users u ON u.id = s.user_id
       WHERE u.role = 'allocator' AND s.automated_allocation = TRUE LIMIT 1`
    )
    const settings = settingsResult.rows[0]
    if (!settings) return 0

    const pendingTrips = await pool.query(
      `SELECT * FROM trips WHERE tenant_id = $1 AND (truck_id IS NULL OR driver_id IS NULL) ORDER BY trip_ref ASC`,
      [tenantId]
    )

    let allocatedCount = 0
    for (const trip of pendingTrips.rows) {
      // Operation hours (FRD): skip trips whose time window falls outside the configured hours —
      // they're left for manual allocation instead.
      if (trip.time_window_start && trip.time_window_end) {
        if (trip.time_window_start < settings.operation_start_time || trip.time_window_end > settings.operation_end_time) {
          continue
        }
      }

      const truckRes = await pool.query(`SELECT id, resource_code, vehicle_registration FROM trucks WHERE tenant_id = $1 AND status = 'available' ORDER BY resource_code LIMIT 1`, [tenantId])
      const driverRes = await pool.query(`SELECT id, driver_name FROM drivers WHERE tenant_id = $1 AND status = 'off_duty' ORDER BY driver_name LIMIT 1`, [tenantId])
      if (!truckRes.rows[0] || !driverRes.rows[0]) break // no more available resources — remaining trips stay pending

      const trailerRes = await pool.query(`SELECT id FROM trailers WHERE tenant_id = $1 AND status = 'available' LIMIT 1`, [tenantId])

      await pool.query(
        `UPDATE trips SET truck_id = $1, trailer_id = $2, driver_id = $3, vehicle = $4, driver = $5,
           vehicle_rego = $6,
           stage = CASE WHEN stage = 'planned' THEN 'assigned' ELSE stage END, updated_at = NOW()
         WHERE id = $7`,
        [truckRes.rows[0].id, trailerRes.rows[0]?.id ?? null, driverRes.rows[0].id, truckRes.rows[0].resource_code, driverRes.rows[0].driver_name, truckRes.rows[0].vehicle_registration ?? null, trip.id]
      )
      await pool.query(`UPDATE trucks SET status = 'on_trip', updated_at = NOW() WHERE id = $1`, [truckRes.rows[0].id])
      if (trailerRes.rows[0]) await pool.query(`UPDATE trailers SET status = 'on_trip', updated_at = NOW() WHERE id = $1`, [trailerRes.rows[0].id])
      await pool.query(`UPDATE drivers SET status = 'on_duty', updated_at = NOW() WHERE id = $1`, [driverRes.rows[0].id])

      logAllocatorActivity('trip', `Trip #${trip.trip_ref} auto-allocated (Automated Allocation)`, tenantId, settings.user_id)
      allocatedCount++
    }
    return allocatedCount
  } catch (err) {
    console.error('[autoAllocatePendingTrips]', err)
    return 0
  }
}
