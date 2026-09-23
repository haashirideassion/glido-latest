import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import {
  requireCompliance, requireCapability, DEFAULT_TENANT_ID, handler, ok, created, badRequest, notFound,
} from '../lib/complianceHttp'
import { logComplianceActivity } from '../lib/complianceActivity'

const router = Router()
router.use(requireAuth, requireCompliance)

const STATUSES = ['scheduled', 'in_progress', 'completed']
const PRIORITIES = ['high', 'medium', 'low']

// System-derived checklists by inspection type (FRD 2.4.4.3 — "must be system-derived based
// on the inspection type and must not be editable from this screen").
const CHECKLISTS: Record<string, string[]> = {
  'Container Safety':  ['Structural integrity', 'Door seals', 'Locking mechanism', 'Placarding'],
  'Fire Safety':       ['Extinguishers in place', 'Alarm system test', 'Emergency exits clear'],
  'Environmental':     ['Spill containment', 'Waste segregation', 'Runoff controls'],
  'Equipment Check':   ['Lifting gear certification', 'Forklift service record', 'PPE availability'],
  'General Facility':  ['Signage', 'Lighting', 'Housekeeping', 'Access control'],
}

function generateInspectionCode(): string {
  const seq = String(Math.floor(Math.random() * 900000) + 100000)
  return `INS-${seq}`
}

// GET /api/compliance/inspections — Site Inspection list (FRD 2.4.4.3).
// 'overdue' is derived (scheduled + past due), not a stored status.
router.get('/', handler('compliance-inspections GET /', async (req: Request, res: Response) => {
  const { search, status, date } = req.query as { search?: string; status?: string; date?: string }
  if (status && status !== 'all' && !['scheduled', 'in_progress', 'completed', 'overdue'].includes(status)) {
    return badRequest(res, 'Invalid status')
  }
  const searchTerm = search ? `%${search}%` : null

  const result = await pool.query(
    `SELECT *,
       CASE WHEN status = 'scheduled' AND scheduled_at < NOW() THEN 'overdue' ELSE status END AS effective_status
     FROM compliance_inspections
     WHERE tenant_id = $1
       AND ($2::text IS NULL OR title ILIKE $2 OR location ILIKE $2 OR inspector_name ILIKE $2 OR inspection_type ILIKE $2)
       AND ($3::date IS NULL OR scheduled_at::date = $3::date)
       AND (
         $4::text IS NULL OR $4 = 'all'
         OR ($4 = 'overdue' AND status = 'scheduled' AND scheduled_at < NOW())
         OR ($4 != 'overdue' AND status = $4)
       )
     ORDER BY scheduled_at DESC NULLS LAST`,
    [DEFAULT_TENANT_ID, searchTerm, date || null, status || null]
  )
  return ok(res, result.rows)
}))

// GET /api/compliance/inspections/summary — 4 metric cards (FRD 2.4.4.3)
router.get('/summary', handler('compliance-inspections GET /summary', async (_req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE scheduled_at >= date_trunc('week', NOW()) AND scheduled_at < date_trunc('week', NOW()) + interval '7 days')::int AS this_week,
       COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
       COUNT(*) FILTER (WHERE status = 'scheduled' AND scheduled_at < NOW())::int AS overdue
     FROM compliance_inspections WHERE tenant_id = $1`,
    [DEFAULT_TENANT_ID]
  )
  return ok(res, result.rows[0])
}))

router.get('/checklists', handler('compliance-inspections GET /checklists', async (_req: Request, res: Response) => {
  return ok(res, CHECKLISTS)
}))

router.get('/:id', handler('compliance-inspections GET /:id', async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT *,
       CASE WHEN status = 'scheduled' AND scheduled_at < NOW() THEN 'overdue' ELSE status END AS effective_status
     FROM compliance_inspections WHERE (id::text = $1 OR inspection_code = $1) AND tenant_id = $2 LIMIT 1`,
    [req.params.id, DEFAULT_TENANT_ID]
  )
  if (!result.rows[0]) return notFound(res, 'Inspection')
  return ok(res, result.rows[0])
}))

// POST /api/compliance/inspections — 'Add Schedule Inspection' (FRD 2.4.4.3, scheduling-rights gated)
router.post('/', requireCapability('can_schedule_inspection'), handler('compliance-inspections POST /', async (req: Request, res: Response) => {
  const b = req.body
  if (!b.title?.trim()) return badRequest(res, 'Title is required')
  if (b.priority && !PRIORITIES.includes(b.priority)) return badRequest(res, 'Invalid priority')

  const checklist = b.inspection_type && CHECKLISTS[b.inspection_type] ? CHECKLISTS[b.inspection_type] : []
  const result = await pool.query(
    `INSERT INTO compliance_inspections
       (inspection_code, title, description, inspection_type, location, inspector_name,
        scheduled_at, priority, checklist_items, tenant_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      generateInspectionCode(), b.title.trim(), b.description ?? null, b.inspection_type ?? null,
      b.location ?? null, b.inspector_name ?? null, b.scheduled_at ?? null, b.priority ?? 'medium',
      checklist, DEFAULT_TENANT_ID, req.user!.id,
    ]
  )
  const row = result.rows[0]
  logComplianceActivity('inspection', `Inspection ${row.inspection_code} scheduled — ${row.title}`, req.user!.id, { status: 'Scheduled', priority: row.priority })
  return created(res, row)
}))

// PATCH /api/compliance/inspections/:id — 'Edit' (FRD 2.4.4.3 — only for scheduled/in_progress)
router.patch('/:id', requireCapability('can_edit_inspection'), handler('compliance-inspections PATCH /:id', async (req: Request, res: Response) => {
  const b = req.body
  if (b.priority && !PRIORITIES.includes(b.priority)) return badRequest(res, 'Invalid priority')

  const existing = await pool.query(`SELECT * FROM compliance_inspections WHERE id = $1 AND tenant_id = $2`, [req.params.id, DEFAULT_TENANT_ID])
  if (!existing.rows[0]) return notFound(res, 'Inspection')
  if (existing.rows[0].status === 'completed') return badRequest(res, 'A completed inspection cannot be edited')

  const newType = b.inspection_type ?? existing.rows[0].inspection_type
  const checklist = b.inspection_type && CHECKLISTS[b.inspection_type] ? CHECKLISTS[b.inspection_type] : existing.rows[0].checklist_items

  const result = await pool.query(
    `UPDATE compliance_inspections SET
       title            = COALESCE(NULLIF($1, ''), title),
       description      = COALESCE($2, description),
       inspection_type  = COALESCE($3, inspection_type),
       location         = COALESCE($4, location),
       inspector_name   = COALESCE($5, inspector_name),
       scheduled_at     = COALESCE($6, scheduled_at),
       priority         = COALESCE($7, priority),
       checklist_items  = $8,
       updated_at       = NOW()
     WHERE id = $9 AND tenant_id = $10 RETURNING *`,
    [b.title ?? null, b.description ?? null, newType, b.location ?? null, b.inspector_name ?? null,
     b.scheduled_at ?? null, b.priority ?? null, checklist, req.params.id, DEFAULT_TENANT_ID]
  )
  return ok(res, result.rows[0])
}))

// PATCH /api/compliance/inspections/:id/start — 'Start Inspection' (FRD 2.4.4.3, only from Scheduled)
router.patch('/:id/start', requireCapability('can_start_inspection'), handler('compliance-inspections PATCH /:id/start', async (req: Request, res: Response) => {
  const result = await pool.query(
    `UPDATE compliance_inspections SET status = 'in_progress', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status = 'scheduled' RETURNING *`,
    [req.params.id, DEFAULT_TENANT_ID]
  )
  if (!result.rows[0]) return notFound(res, 'Scheduled inspection')
  logComplianceActivity('inspection', `Inspection ${result.rows[0].inspection_code} started — ${result.rows[0].title}`, req.user!.id, { status: 'Progress' })
  return ok(res, result.rows[0])
}))

// PATCH /api/compliance/inspections/:id/observations — capture checklist observations during
// execution (FRD 2.4.4.3 "Inspection Execution screen to capture the checklist observations")
router.patch('/:id/observations', requireCapability('can_start_inspection'), handler('compliance-inspections PATCH /:id/observations', async (req: Request, res: Response) => {
  const { observations } = req.body as { observations?: Record<string, string> }
  const result = await pool.query(
    `UPDATE compliance_inspections SET checklist_observations = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3 AND status = 'in_progress' RETURNING *`,
    [JSON.stringify(observations ?? {}), req.params.id, DEFAULT_TENANT_ID]
  )
  if (!result.rows[0]) return notFound(res, 'In-progress inspection')
  return ok(res, result.rows[0])
}))

// PATCH /api/compliance/inspections/:id/complete — finish the execution flow
router.patch('/:id/complete', requireCapability('can_start_inspection'), handler('compliance-inspections PATCH /:id/complete', async (req: Request, res: Response) => {
  const result = await pool.query(
    `UPDATE compliance_inspections SET status = 'completed', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status = 'in_progress' RETURNING *`,
    [req.params.id, DEFAULT_TENANT_ID]
  )
  if (!result.rows[0]) return notFound(res, 'In-progress inspection')
  logComplianceActivity('inspection', `Inspection ${result.rows[0].inspection_code} completed — ${result.rows[0].title}`, req.user!.id, { status: 'Completed' })
  return ok(res, result.rows[0])
}))

export default router
