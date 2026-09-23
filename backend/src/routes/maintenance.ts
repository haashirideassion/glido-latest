import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import { logAllocatorActivity } from '../lib/allocatorActivity'
import { notifyRoleIfEnabled, allocatorToggleEnabled } from '../lib/userNotifications'
import { sendMaintenanceReminders } from '../lib/maintenanceReminders'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

function generateMaintenanceCode(): string {
  const seq = String(Math.floor(Math.random() * 900000) + 100000)
  return `MT-${seq}`
}

async function resourceTable(resourceType: string) {
  return resourceType === 'trailer' ? 'trailers' : 'trucks'
}

async function getResourceCode(resourceType: string, resourceId: string) {
  const table = await resourceTable(resourceType)
  const result = await pool.query(`SELECT resource_code FROM ${table} WHERE id = $1`, [resourceId])
  return result.rows[0]?.resource_code ?? null
}

// GET /api/maintenance — tab (current|scheduled|history — FRD 2.4.3.3), search, priority
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    await sendMaintenanceReminders(DEFAULT_TENANT_ID)
    const { tab, search, priority } = req.query as { tab?: string; search?: string; priority?: string }
    const conditions: string[] = ['tenant_id = $1']
    const params: unknown[] = [DEFAULT_TENANT_ID]
    let i = 2

    if (tab === 'scheduled')      conditions.push(`status = 'scheduled'`)
    else if (tab === 'history')   conditions.push(`status = 'completed'`)
    else                          conditions.push(`status IN ('scheduled', 'in_progress')`)  // 'current' (default)

    if (priority && ['high', 'medium', 'low'].includes(priority)) {
      conditions.push(`priority = $${i++}`); params.push(priority)
    }
    if (search) {
      // "resource ID" in the FRD means the human-readable resource code (e.g. SYD-TRK-001) shown
      // on screen, not the internal UUID — so match against trucks/trailers.resource_code too.
      conditions.push(`(
        maintenance_code ILIKE $${i}
        OR EXISTS (SELECT 1 FROM trucks tr WHERE tr.id = maintenance_records.resource_id AND tr.resource_code ILIKE $${i})
        OR EXISTS (SELECT 1 FROM trailers tl WHERE tl.id = maintenance_records.resource_id AND tl.resource_code ILIKE $${i})
      )`)
      params.push(`%${search}%`)
      i++
    }

    const orderBy = tab === 'scheduled' ? 'due_date ASC' : tab === 'history' ? 'completed_date DESC' : 'created_at DESC'
    const result = await pool.query(
      `SELECT * FROM maintenance_records WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy}`,
      params
    )
    // Attach the resource's code for card display (Resource — the resource against which maintenance is due).
    const withCodes = await Promise.all(result.rows.map(async (r) => ({
      ...r,
      resource_code: await getResourceCode(r.resource_type, r.resource_id),
    })))
    return res.json({ success: true, data: withCodes })
  } catch (err) {
    console.error('[maintenance GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/maintenance/:id — View Details
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM maintenance_records WHERE (id::text = $1 OR maintenance_code = $1) AND tenant_id = $2 LIMIT 1`,
      [req.params.id, DEFAULT_TENANT_ID]
    )
    const record = result.rows[0]
    if (!record) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    const resource_code = await getResourceCode(record.resource_type, record.resource_id)
    return res.json({ success: true, data: { ...record, resource_code } })
  } catch (err) {
    console.error('[maintenance GET /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/maintenance — '+ Schedule Maintenance' form
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const b = req.body
  if (!b.resource_type || !['truck', 'trailer'].includes(b.resource_type)) {
    return res.status(400).json({ success: false, error: { message: 'A valid resource_type (truck/trailer) is required' } })
  }
  if (!b.resource_id) {
    return res.status(400).json({ success: false, error: { message: 'resource_id is required' } })
  }
  if (!b.activity_type?.trim()) {
    return res.status(400).json({ success: false, error: { message: 'Activity type is required' } })
  }
  try {
    const result = await pool.query(
      `INSERT INTO maintenance_records (
        maintenance_code, resource_type, resource_id, activity_type, status,
        priority, due_date, estimated_duration, remarks, contractor, custom_field_value, tenant_id, created_by
      ) VALUES ($1,$2,$3,$4,'scheduled',$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        generateMaintenanceCode(), b.resource_type, b.resource_id, b.activity_type.trim(),
        b.priority ?? 'medium', b.due_date ?? null, b.estimated_duration ?? null, b.remarks ?? null,
        b.contractor?.trim() || null, b.custom_field_value?.trim() || null, DEFAULT_TENANT_ID, req.user!.id,
      ]
    )
    const record = result.rows[0]
    const resourceCode = await getResourceCode(record.resource_type, record.resource_id)
    logAllocatorActivity('maintenance', `Maintenance scheduled for ${resourceCode ?? record.resource_id}`, DEFAULT_TENANT_ID, req.user!.id)
    notifyRoleIfEnabled('allocator', DEFAULT_TENANT_ID, 'maintenance_reminder',
      'Maintenance scheduled', `${record.activity_type} scheduled for ${resourceCode ?? record.resource_id}${record.due_date ? ` (due ${record.due_date})` : ''}.`,
      userId => allocatorToggleEnabled(userId, 'maintenance_reminders'))
    return res.status(201).json({ success: true, data: { ...record, resource_code: resourceCode } })
  } catch (err) {
    console.error('[maintenance POST /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/maintenance/:id/reschedule — amend the due date of a scheduled activity
router.patch('/:id/reschedule', requireAuth, async (req: Request, res: Response) => {
  const { due_date } = req.body as { due_date?: string }
  if (!due_date) return res.status(400).json({ success: false, error: { message: 'due_date is required' } })
  try {
    const result = await pool.query(
      `UPDATE maintenance_records SET due_date = $1, updated_at = NOW() WHERE id = $2 AND status = 'scheduled' RETURNING *`,
      [due_date, req.params.id]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[maintenance PATCH reschedule]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/maintenance/:id/start — commence a scheduled activity (FRD 2.4.3.3)
router.patch('/:id/start', requireAuth, async (req: Request, res: Response) => {
  const { technician, estimated_completion } = req.body as { technician?: string; estimated_completion?: string }
  try {
    const result = await pool.query(
      `UPDATE maintenance_records SET
         status = 'in_progress', start_date = CURRENT_DATE, progress_pct = 0,
         technician = COALESCE($1, technician), estimated_completion = COALESCE($2, estimated_completion),
         updated_at = NOW()
       WHERE id = $3 AND status = 'scheduled' RETURNING *`,
      [technician ?? null, estimated_completion ?? null, req.params.id]
    )
    const record = result.rows[0]
    if (!record) return res.status(404).json({ success: false, error: { message: 'Not found or not schedulable' } })

    // The resource becomes unavailable for allocation while under maintenance.
    const table = await resourceTable(record.resource_type)
    await pool.query(`UPDATE ${table} SET status = 'maintenance', updated_at = NOW() WHERE id = $1`, [record.resource_id])

    const resourceCode = await getResourceCode(record.resource_type, record.resource_id)
    logAllocatorActivity('maintenance', `Maintenance commenced for ${resourceCode ?? record.resource_id}`, DEFAULT_TENANT_ID, req.user!.id)
    return res.json({ success: true, data: { ...record, resource_code: resourceCode } })
  } catch (err) {
    console.error('[maintenance PATCH start]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/maintenance/:id/progress — update progress % / remarks while in progress
router.patch('/:id/progress', requireAuth, async (req: Request, res: Response) => {
  const { progress_pct, remarks } = req.body as { progress_pct?: number; remarks?: string }
  try {
    const result = await pool.query(
      `UPDATE maintenance_records SET
         progress_pct = COALESCE($1, progress_pct), remarks = COALESCE($2, remarks), updated_at = NOW()
       WHERE id = $3 AND status = 'in_progress' RETURNING *`,
      [progress_pct ?? null, remarks ?? null, req.params.id]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[maintenance PATCH progress]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/maintenance/:id/complete — mark a maintenance activity as completed (FRD 2.4.3.3)
router.patch('/:id/complete', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE maintenance_records SET
         status = 'completed', completed_date = CURRENT_DATE, progress_pct = 100, updated_at = NOW()
       WHERE id = $1 AND status = 'in_progress' RETURNING *`,
      [req.params.id]
    )
    const record = result.rows[0]
    if (!record) return res.status(404).json({ success: false, error: { message: 'Not found or not in progress' } })

    const table = await resourceTable(record.resource_type)
    await pool.query(
      `UPDATE ${table} SET status = 'available', last_service_date = CURRENT_DATE, updated_at = NOW() WHERE id = $1`,
      [record.resource_id]
    )

    const resourceCode = await getResourceCode(record.resource_type, record.resource_id)
    logAllocatorActivity('maintenance', `Maintenance completed for ${resourceCode ?? record.resource_id}`, DEFAULT_TENANT_ID, req.user!.id)
    return res.json({ success: true, data: { ...record, resource_code: resourceCode } })
  } catch (err) {
    console.error('[maintenance PATCH complete]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
