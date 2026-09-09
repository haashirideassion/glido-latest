import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import { runDueCustomerReportSchedules } from '../lib/customerReportSchedules'

const router = Router()

const VALID_FREQUENCIES = ['daily', 'weekly', 'monthly']
const VALID_METRICS = ['service_type_distribution', 'request_status', 'monthly_requests', 'processing_time']

// GET /api/customer-report-schedules — list the customer's saved custom reports.
// Opportunistically sweeps any due schedules first, so a schedule fires the moment the customer
// next looks at their Reports screen rather than needing a real background job.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    await runDueCustomerReportSchedules(req.user!.id)
    const result = await pool.query(
      `SELECT s.*,
              (SELECT COUNT(*)::int FROM customer_report_runs r WHERE r.schedule_id = s.id) AS run_count
       FROM customer_report_schedules s
       WHERE s.customer_id = $1
       ORDER BY s.created_at DESC`,
      [req.user!.id]
    )
    return res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[customer-report-schedules GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/customer-report-schedules — create a new custom report + schedule.
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const b = req.body
  const name = (b.name ?? '').trim()
  const categoryFilter = b.category_filter && ['import', 'export'].includes(b.category_filter) ? b.category_filter : null
  const frequency = VALID_FREQUENCIES.includes(b.frequency) ? b.frequency : 'weekly'
  const metrics = Array.isArray(b.metrics) && b.metrics.length > 0
    ? b.metrics.filter((m: string) => VALID_METRICS.includes(m))
    : VALID_METRICS

  if (!name) return res.status(400).json({ success: false, error: { message: 'A report name is required' } })
  if (metrics.length === 0) return res.status(400).json({ success: false, error: { message: 'At least one metric must be selected' } })

  const tenantId = b.tenant_id ?? b.tenantId ?? 'a0000000-0000-0000-0000-000000000001'
  try {
    const result = await pool.query(
      `INSERT INTO customer_report_schedules (customer_id, tenant_id, name, category_filter, metrics, frequency)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user!.id, tenantId, name, categoryFilter, JSON.stringify(metrics), frequency]
    )
    return res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[customer-report-schedules POST /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/customer-report-schedules/:id — update name/filter/metrics/frequency/active.
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const b = req.body
  const sets: string[] = []
  const params: unknown[] = []
  let i = 1
  if (b.name !== undefined)            { sets.push(`name = $${i++}`);            params.push(String(b.name).trim()) }
  if (b.category_filter !== undefined) { sets.push(`category_filter = $${i++}`); params.push(['import', 'export'].includes(b.category_filter) ? b.category_filter : null) }
  if (b.frequency !== undefined)       { sets.push(`frequency = $${i++}`);       params.push(VALID_FREQUENCIES.includes(b.frequency) ? b.frequency : 'weekly') }
  if (Array.isArray(b.metrics))        { sets.push(`metrics = $${i++}`);         params.push(JSON.stringify(b.metrics.filter((m: string) => VALID_METRICS.includes(m)))) }
  if (b.active !== undefined)          { sets.push(`active = $${i++}`);          params.push(!!b.active) }
  if (!sets.length) return res.status(400).json({ success: false, error: { message: 'No fields to update' } })
  sets.push(`updated_at = NOW()`)
  params.push(req.params.id, req.user!.id)
  try {
    const result = await pool.query(
      `UPDATE customer_report_schedules SET ${sets.join(', ')} WHERE id = $${i++} AND customer_id = $${i} RETURNING *`,
      params
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[customer-report-schedules PATCH /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// DELETE /api/customer-report-schedules/:id
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM customer_report_schedules WHERE id = $1 AND customer_id = $2 RETURNING id`,
      [req.params.id, req.user!.id]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: { id: result.rows[0].id } })
  } catch (err) {
    console.error('[customer-report-schedules DELETE /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/customer-report-schedules/:id/runs — generated snapshots for one schedule.
router.get('/:id/runs', requireAuth, async (req: Request, res: Response) => {
  try {
    const owns = await pool.query(
      `SELECT id FROM customer_report_schedules WHERE id = $1 AND customer_id = $2`,
      [req.params.id, req.user!.id]
    )
    if (!owns.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    const result = await pool.query(
      `SELECT id, generated_at, snapshot FROM customer_report_runs WHERE schedule_id = $1 ORDER BY generated_at DESC LIMIT 50`,
      [req.params.id]
    )
    return res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[customer-report-schedules GET /:id/runs]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
