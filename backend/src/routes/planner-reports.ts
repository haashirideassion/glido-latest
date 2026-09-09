import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import { logPlannerActivity } from '../lib/plannerActivity'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

// GET /api/planner/reports — Performance tab metrics (FRD 2.4.2.4)
// Query params: from, to (YYYY-MM-DD), category (import|export — the FRD's "Filter" control).
// category only affects trip-derived metrics — vessels aren't categorized import/export, so
// Total Vessels is intentionally unaffected by it.
router.get('/reports', requireAuth, async (req: Request, res: Response) => {
  try {
    const { from, to, category } = req.query as { from?: string; to?: string; category?: string }
    const dateFrom = from || null
    const dateTo = to || null
    const categoryFilter = category && ['import', 'export'].includes(category) ? category : null

    const totalVessels = await pool.query(
      `SELECT COUNT(*)::int AS count FROM vessels
       WHERE tenant_id = $1 AND ($2::date IS NULL OR eta >= $2::date) AND ($3::date IS NULL OR eta < ($3::date + INTERVAL '1 day'))`,
      [DEFAULT_TENANT_ID, dateFrom, dateTo]
    )

    const activeTrips = await pool.query(
      `SELECT COUNT(*)::int AS count FROM trips
       WHERE tenant_id = $1 AND stage != 'completed' AND ($4::text IS NULL OR service_category = $4)
         AND ($2::date IS NULL OR trip_date >= $2::date) AND ($3::date IS NULL OR trip_date < ($3::date + INTERVAL '1 day'))`,
      [DEFAULT_TENANT_ID, dateFrom, dateTo, categoryFilter]
    )

    // "On time" = completed on or before its planned trip_date.
    const onTime = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE updated_at::date <= trip_date)::int AS on_time
       FROM trips
       WHERE tenant_id = $1 AND stage = 'completed' AND trip_date IS NOT NULL AND ($4::text IS NULL OR service_category = $4)
         AND ($2::date IS NULL OR trip_date >= $2::date) AND ($3::date IS NULL OR trip_date < ($3::date + INTERVAL '1 day'))`,
      [DEFAULT_TENANT_ID, dateFrom, dateTo, categoryFilter]
    )
    const onTimeTotal = onTime.rows[0]?.total ?? 0
    const onTimeDeliveryPct = onTimeTotal > 0 ? (onTime.rows[0].on_time / onTimeTotal) * 100 : null

    // Monthly Container Activity — one trip == one container (no per-trip container quantity field).
    const monthly = await pool.query(
      `SELECT to_char(date_trunc('month', trip_date), 'YYYY-MM') AS month,
              COUNT(*) FILTER (WHERE service_category = 'import')::int AS imports,
              COUNT(*) FILTER (WHERE service_category = 'export')::int AS exports
       FROM trips
       WHERE tenant_id = $1 AND trip_date IS NOT NULL AND ($4::text IS NULL OR service_category = $4)
         AND ($2::date IS NULL OR trip_date >= $2::date) AND ($3::date IS NULL OR trip_date < ($3::date + INTERVAL '1 day'))
       GROUP BY 1 ORDER BY 1`,
      [DEFAULT_TENANT_ID, dateFrom, dateTo, categoryFilter]
    )

    const turnaround = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600)::float AS avg_hours
       FROM trips
       WHERE tenant_id = $1 AND stage = 'completed' AND ($4::text IS NULL OR service_category = $4)
         AND ($2::date IS NULL OR trip_date >= $2::date) AND ($3::date IS NULL OR trip_date < ($3::date + INTERVAL '1 day'))`,
      [DEFAULT_TENANT_ID, dateFrom, dateTo, categoryFilter]
    )

    const utilization = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE vehicle IS NOT NULL AND driver IS NOT NULL)::int AS assigned
       FROM trips
       WHERE tenant_id = $1 AND ($4::text IS NULL OR service_category = $4)
         AND ($2::date IS NULL OR trip_date >= $2::date) AND ($3::date IS NULL OR trip_date < ($3::date + INTERVAL '1 day'))`,
      [DEFAULT_TENANT_ID, dateFrom, dateTo, categoryFilter]
    )
    const utilTotal = utilization.rows[0]?.total ?? 0
    const resourceUtilizationPct = utilTotal > 0 ? (utilization.rows[0].assigned / utilTotal) * 100 : null

    return res.json({
      success: true,
      data: {
        totalVessels: totalVessels.rows[0]?.count ?? 0,
        activeTrips: activeTrips.rows[0]?.count ?? 0,
        onTimeDeliveryPct,
        monthlyContainerActivity: monthly.rows,
        performanceMetrics: {
          avgTurnaroundHours: turnaround.rows[0]?.avg_hours ?? null,
          resourceUtilizationPct,
          // No underlying data source for these two — surfaced as null so the UI shows
          // "no data available" per FRD rather than a fabricated number.
          planningAccuracyPct: null,
          costPerTrip: null,
        },
      },
    })
  } catch (err) {
    console.error('[planner GET /reports]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/planner/activity — Recent Activity feed for the Planner Dashboard (FRD 2.4.2)
router.get('/activity', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM planner_activity WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [DEFAULT_TENANT_ID]
    )
    return res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[planner GET /activity]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/planner/reports/export-log — records a "report generated" activity entry.
// Fired by the frontend when the Export button on Reports is clicked.
router.post('/reports/export-log', requireAuth, async (req: Request, res: Response) => {
  logPlannerActivity('report', 'Report exported', DEFAULT_TENANT_ID, req.user!.id)
  return res.json({ success: true })
})

export default router
