import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import {
  requireCompliance, requireCapability, DEFAULT_TENANT_ID, handler, ok, created, badRequest, notFound,
} from '../lib/complianceHttp'
import { logComplianceActivity } from '../lib/complianceActivity'

const router = Router()
router.use(requireAuth, requireCompliance)

const SHIPMENT_TYPES = ['fcl', 'lcl']
const STATUSES = ['in_transit', 'received', 'completed', 'cancelled']

function generateEntryNumber(): string {
  const seq = String(Math.floor(Math.random() * 900000) + 100000)
  return `ENT-${seq}`
}

// GET /api/compliance/activities — 'My Activities' list (FRD 2.4.4.1).
// Excludes completed/cancelled records by default (those live on 'Completed Activities')
// unless an explicit ?status= is passed.
router.get('/', handler('compliance-activities GET /', async (req: Request, res: Response) => {
  const { search, status, shipment_type } = req.query as { search?: string; status?: string; shipment_type?: string }
  if (shipment_type && !SHIPMENT_TYPES.includes(shipment_type)) return badRequest(res, 'Invalid shipment type')
  const searchTerm = search ? `%${search}%` : null

  const result = await pool.query(
    `SELECT * FROM compliance_activities
     WHERE tenant_id = $1
       AND ($2::text IS NULL OR shipment_type = $2)
       AND (
         ($3::text IS NULL AND status NOT IN ('completed', 'cancelled'))
         OR ($3::text IS NOT NULL AND status = $3)
       )
       AND ($4::text IS NULL OR entry_number ILIKE $4 OR container_number ILIKE $4
                            OR vessel_name ILIKE $4 OR request_number ILIKE $4 OR title ILIKE $4)
     ORDER BY collection_date DESC NULLS LAST, created_at DESC`,
    [DEFAULT_TENANT_ID, shipment_type || null, status || null, searchTerm]
  )
  return ok(res, result.rows)
}))

// GET /api/compliance/activities/completed — 'Completed Activities' list (FRD 2.4.4.2)
router.get('/completed', handler('compliance-activities GET /completed', async (req: Request, res: Response) => {
  const { search, period } = req.query as { search?: string; period?: string }
  const searchTerm = search ? `%${search}%` : null
  let interval: string | null = null
  if (period === 'week') interval = '7 days'
  else if (period === 'month') interval = '30 days'
  else if (period === 'quarter') interval = '90 days'

  const result = await pool.query(
    `SELECT a.*, cb.name AS completed_by_name, ab.name AS assigned_by_name
     FROM compliance_activities a
     LEFT JOIN app_users cb ON cb.id = a.completed_by
     LEFT JOIN app_users ab ON ab.id = a.assigned_by
     WHERE a.tenant_id = $1 AND a.status = 'completed'
       AND ($2::interval IS NULL OR a.completed_date >= NOW() - $2::interval)
       AND ($3::text IS NULL OR a.title ILIKE $3 OR a.category ILIKE $3
                             OR cb.name ILIKE $3 OR ab.name ILIKE $3
                             OR EXISTS (SELECT 1 FROM unnest(a.tags) t WHERE t ILIKE $3))
     ORDER BY a.completed_date DESC NULLS LAST`,
    [DEFAULT_TENANT_ID, interval, searchTerm]
  )
  return ok(res, result.rows)
}))

// GET /api/compliance/activities/completed/summary — 4 metric cards (FRD 2.4.4.2).
// Unaffected by the time-period filter, per the FRD.
router.get('/completed/summary', handler('compliance-activities GET /completed/summary', async (_req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT
       COUNT(*)::int AS total_completed,
       COUNT(*) FILTER (WHERE date_trunc('month', completed_date) = date_trunc('month', NOW()))::int AS this_month,
       ROUND(AVG(quality_rating)::numeric, 1) AS avg_rating,
       ROUND(100.0 * COUNT(*) FILTER (WHERE collection_date IS NULL OR completed_date <= collection_date)
             / GREATEST(COUNT(*), 1))::int AS on_time_pct
     FROM compliance_activities
     WHERE tenant_id = $1 AND status = 'completed'`,
    [DEFAULT_TENANT_ID]
  )
  const row = result.rows[0]
  return ok(res, {
    total_completed: row.total_completed,
    this_month: row.this_month,
    avg_rating: row.avg_rating ? Number(row.avg_rating) : 0,
    on_time_pct: row.total_completed > 0 ? row.on_time_pct : 0,
  })
}))

router.get('/:id', handler('compliance-activities GET /:id', async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT a.*, cb.name AS completed_by_name, ab.name AS assigned_by_name
     FROM compliance_activities a
     LEFT JOIN app_users cb ON cb.id = a.completed_by
     LEFT JOIN app_users ab ON ab.id = a.assigned_by
     WHERE (a.id::text = $1 OR a.entry_number = $1) AND a.tenant_id = $2 LIMIT 1`,
    [req.params.id, DEFAULT_TENANT_ID]
  )
  if (!result.rows[0]) return notFound(res, 'Activity')
  return ok(res, result.rows[0])
}))

// POST /api/compliance/activities — 'New Activity' (FRD 2.4.4.1, create-rights gated)
router.post('/', requireCapability('can_create_activity'), handler('compliance-activities POST /', async (req: Request, res: Response) => {
  const b = req.body
  if (!b.title?.trim()) return badRequest(res, 'Title is required')
  if (b.shipment_type && !SHIPMENT_TYPES.includes(b.shipment_type)) return badRequest(res, 'Invalid shipment type')

  const result = await pool.query(
    `INSERT INTO compliance_activities
       (entry_number, title, request_number, container_number, container_type, vessel_name,
        voyage_number, shipment_type, collection_date, description, assigned_by, tenant_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      b.entry_number?.trim() || generateEntryNumber(), b.title.trim(), b.request_number ?? null,
      b.container_number ?? null, b.container_type ?? null, b.vessel_name ?? null, b.voyage_number ?? null,
      b.shipment_type ?? 'fcl', b.collection_date ?? null, b.description ?? null,
      b.assigned_by ?? req.user!.id, DEFAULT_TENANT_ID, req.user!.id,
    ]
  )
  const row = result.rows[0]
  logComplianceActivity('activity', `Compliance activity ${row.entry_number} created — ${row.title}`, req.user!.id, { status: 'scheduled' })
  return created(res, row)
}))

// PATCH /api/compliance/activities/:id — Edit Activity (FRD 2.4.4.1, includes status transitions
// such as marking Completed, which is how a row moves onto 'Completed Activities').
router.patch('/:id', requireCapability('can_edit_activity'), handler('compliance-activities PATCH /:id', async (req: Request, res: Response) => {
  const b = req.body
  if (b.status && !STATUSES.includes(b.status)) return badRequest(res, 'Invalid status')
  if (b.shipment_type && !SHIPMENT_TYPES.includes(b.shipment_type)) return badRequest(res, 'Invalid shipment type')
  if (b.quality_rating !== undefined && b.quality_rating !== null && (b.quality_rating < 0 || b.quality_rating > 5)) {
    return badRequest(res, 'Quality rating must be between 0 and 5')
  }

  const becomingCompleted = b.status === 'completed'
  const result = await pool.query(
    `UPDATE compliance_activities SET
       title             = COALESCE(NULLIF($1, ''), title),
       request_number    = COALESCE($2, request_number),
       container_number  = COALESCE($3, container_number),
       container_type    = COALESCE($4, container_type),
       vessel_name       = COALESCE($5, vessel_name),
       voyage_number     = COALESCE($6, voyage_number),
       shipment_type     = COALESCE($7, shipment_type),
       collection_date   = COALESCE($8, collection_date),
       description       = COALESCE($9, description),
       category          = COALESCE($10, category),
       tags              = COALESCE($11, tags),
       quality_rating    = COALESCE($12, quality_rating),
       status            = COALESCE($13, status),
       completed_date    = CASE WHEN $14 THEN NOW() ELSE completed_date END,
       completed_by      = CASE WHEN $14 THEN $15 ELSE completed_by END,
       report_available  = CASE WHEN $14 THEN TRUE ELSE report_available END,
       updated_at        = NOW()
     WHERE id = $16 AND tenant_id = $17 RETURNING *`,
    [
      b.title ?? null, b.request_number ?? null, b.container_number ?? null, b.container_type ?? null,
      b.vessel_name ?? null, b.voyage_number ?? null, b.shipment_type ?? null, b.collection_date ?? null,
      b.description ?? null, b.category ?? null, b.tags ?? null, b.quality_rating ?? null, b.status ?? null,
      becomingCompleted, req.user!.id, req.params.id, DEFAULT_TENANT_ID,
    ]
  )
  const row = result.rows[0]
  if (!row) return notFound(res, 'Activity')
  if (becomingCompleted) logComplianceActivity('activity', `Compliance activity ${row.entry_number} marked completed — ${row.title}`, req.user!.id, { status: 'Progress' })
  return ok(res, row)
}))

// PATCH /api/compliance/activities/:id/cancel — 'Cancel Activity' context-menu action (FRD 2.4.4.1)
router.patch('/:id/cancel', requireCapability('can_cancel_activity'), handler('compliance-activities PATCH /:id/cancel', async (req: Request, res: Response) => {
  const result = await pool.query(
    `UPDATE compliance_activities SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status NOT IN ('completed', 'cancelled') RETURNING *`,
    [req.params.id, DEFAULT_TENANT_ID]
  )
  if (!result.rows[0]) return notFound(res, 'Activity')
  logComplianceActivity('activity', `Compliance activity ${result.rows[0].entry_number} cancelled`, req.user!.id)
  return ok(res, result.rows[0])
}))

// GET /api/compliance/activities/:id/report — download an individual completed activity's
// report (FRD 2.4.4.2). Disabled client-side when report_available is false.
router.get('/:id/report', handler('compliance-activities GET /:id/report', async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT * FROM compliance_activities WHERE id = $1 AND tenant_id = $2 AND report_available = TRUE`,
    [req.params.id, DEFAULT_TENANT_ID]
  )
  const row = result.rows[0]
  if (!row) return notFound(res, 'Report')
  const lines = [
    `Compliance Activity Report`,
    `Entry Number: ${row.entry_number}`,
    `Title: ${row.title}`,
    `Category: ${row.category ?? '-'}`,
    `Request: ${row.request_number ?? '-'}`,
    `Container: ${row.container_number ?? '-'} (${row.container_type ?? '-'})`,
    `Vessel: ${row.vessel_name ?? '-'} / Voyage ${row.voyage_number ?? '-'}`,
    `Collection Date: ${row.collection_date ?? '-'}`,
    `Completed Date: ${row.completed_date ?? '-'}`,
    `Quality Rating: ${row.quality_rating ?? '-'} / 5`,
    `Tags: ${(row.tags ?? []).join(', ') || '-'}`,
    `Description: ${row.description ?? '-'}`,
  ]
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('Content-Disposition', `attachment; filename="${row.entry_number}-report.txt"`)
  return res.send(lines.join('\n'))
}))

// GET /api/compliance/activities/export — bulk CSV export of Completed Activities as currently
// filtered (FRD 2.4.4.2 'Export Report' toolbar button, export-rights gated).
router.get('/export/csv', requireCapability('can_export_report'), handler('compliance-activities GET /export/csv', async (req: Request, res: Response) => {
  const { search, period } = req.query as { search?: string; period?: string }
  const searchTerm = search ? `%${search}%` : null
  let interval: string | null = null
  if (period === 'week') interval = '7 days'
  else if (period === 'month') interval = '30 days'
  else if (period === 'quarter') interval = '90 days'

  const result = await pool.query(
    `SELECT a.entry_number, a.title, a.category, cb.name AS completed_by_name, ab.name AS assigned_by_name,
            a.completed_date, a.quality_rating, a.tags
     FROM compliance_activities a
     LEFT JOIN app_users cb ON cb.id = a.completed_by
     LEFT JOIN app_users ab ON ab.id = a.assigned_by
     WHERE a.tenant_id = $1 AND a.status = 'completed'
       AND ($2::interval IS NULL OR a.completed_date >= NOW() - $2::interval)
       AND ($3::text IS NULL OR a.title ILIKE $3 OR a.category ILIKE $3 OR cb.name ILIKE $3 OR ab.name ILIKE $3)
     ORDER BY a.completed_date DESC NULLS LAST`,
    [DEFAULT_TENANT_ID, interval, searchTerm]
  )
  const header = 'Entry Number,Title,Category,Completed By,Assigned By,Completed Date,Quality Rating,Tags'
  const csvEscape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = result.rows.map(r => [
    r.entry_number, r.title, r.category, r.completed_by_name, r.assigned_by_name,
    r.completed_date, r.quality_rating, (r.tags ?? []).join('; '),
  ].map(csvEscape).join(','))
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="completed-activities.csv"`)
  return res.send([header, ...rows].join('\n'))
}))

export default router
