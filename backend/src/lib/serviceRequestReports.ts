/**
 * Shared report-aggregation logic for the Customer Portal Reports screen (FRD §2.4.1.4).
 * Used both by the live GET /api/service-requests/reports endpoint and by the scheduled
 * "Custom Reports" sweep (customerReportSchedules.ts), so a scheduled run's snapshot is computed
 * identically to what the customer would see live with the same filters.
 */

import { pool } from '../db'

export interface ServiceRequestReportsSnapshot {
  serviceTypeDistribution: Array<{ service_key: string; count: number }>
  requestStatus: Array<{ status: string; count: number }>
  monthlyRequests: Array<{ month: string; count: number }>
  avgProcessingDays: number | null
}

export async function computeServiceRequestReports(
  customerId: string,
  categoryFilter: string | null,
  dateFrom: string | null,
  dateTo: string | null,
): Promise<ServiceRequestReportsSnapshot> {
  const serviceTypeDistribution = await pool.query(
    `SELECT srs.service_key, COUNT(*)::int AS count
     FROM service_request_services srs
     JOIN service_requests sr ON sr.id = srs.service_request_id
     WHERE sr.customer_id = $1 AND ($2::text IS NULL OR sr.service_category = $2)
       AND ($3::date IS NULL OR sr.created_at >= $3::date)
       AND ($4::date IS NULL OR sr.created_at < ($4::date + INTERVAL '1 day'))
     GROUP BY srs.service_key
     ORDER BY count DESC`,
    [customerId, categoryFilter, dateFrom, dateTo]
  )

  const requestStatus = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM service_requests
     WHERE customer_id = $1 AND ($2::text IS NULL OR service_category = $2)
       AND ($3::date IS NULL OR created_at >= $3::date)
       AND ($4::date IS NULL OR created_at < ($4::date + INTERVAL '1 day'))
     GROUP BY status`,
    [customerId, categoryFilter, dateFrom, dateTo]
  )

  // An explicit date range replaces the default "last 12 months" window rather than stacking
  // with it — if the caller picked a range, honor exactly that range, however wide or narrow.
  const monthlyRequests = await pool.query(
    `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS count
     FROM service_requests
     WHERE customer_id = $1 AND ($2::text IS NULL OR service_category = $2)
       AND created_at >= COALESCE($3::date, CASE WHEN $4::date IS NULL THEN NOW() - INTERVAL '12 months' END)
       AND ($4::date IS NULL OR created_at < ($4::date + INTERVAL '1 day'))
     GROUP BY 1
     ORDER BY 1`,
    [customerId, categoryFilter, dateFrom, dateTo]
  )

  const avgProcessing = await pool.query(
    `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400)::float AS avg_days
     FROM service_requests
     WHERE customer_id = $1 AND completed_at IS NOT NULL
       AND ($2::text IS NULL OR service_category = $2)
       AND ($3::date IS NULL OR created_at >= $3::date)
       AND ($4::date IS NULL OR created_at < ($4::date + INTERVAL '1 day'))`,
    [customerId, categoryFilter, dateFrom, dateTo]
  )

  return {
    serviceTypeDistribution: serviceTypeDistribution.rows,
    requestStatus: requestStatus.rows,
    monthlyRequests: monthlyRequests.rows,
    avgProcessingDays: avgProcessing.rows[0]?.avg_days ?? null,
  }
}
