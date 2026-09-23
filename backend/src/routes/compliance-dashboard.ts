import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import { requireCompliance, DEFAULT_TENANT_ID, handler, ok } from '../lib/complianceHttp'

const router = Router()

// GET /api/compliance/summary — Dashboard metric cards (FRD 2.4.4)
router.get('/summary', requireAuth, requireCompliance, handler('compliance GET /summary', async (_req: Request, res: Response) => {
  const [activeTasks, completedThisMonth, scheduledInspections, overdueItems] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS n FROM compliance_activities
       WHERE tenant_id = $1 AND status IN ('in_transit', 'received')`,
      [DEFAULT_TENANT_ID]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM compliance_activities
       WHERE tenant_id = $1 AND status = 'completed'
         AND date_trunc('month', completed_date) = date_trunc('month', NOW())`,
      [DEFAULT_TENANT_ID]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM compliance_inspections
       WHERE tenant_id = $1 AND status = 'scheduled' AND scheduled_at >= NOW()`,
      [DEFAULT_TENANT_ID]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM compliance_inspections
       WHERE tenant_id = $1 AND status = 'scheduled' AND scheduled_at < NOW()`,
      [DEFAULT_TENANT_ID]
    ),
  ])
  return ok(res, {
    active_tasks: activeTasks.rows[0].n,
    completed_this_month: completedThisMonth.rows[0].n,
    scheduled_inspections: scheduledInspections.rows[0].n,
    overdue_items: overdueItems.rows[0].n,
  })
}))

// GET /api/compliance/activity — Recent Activities feed for the Compliance Dashboard (FRD 2.4.4)
router.get('/activity', requireAuth, requireCompliance, handler('compliance GET /activity', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10) || 10, 50)
  const result = await pool.query(
    `SELECT * FROM compliance_activity_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [DEFAULT_TENANT_ID, limit]
  )
  return ok(res, result.rows)
}))

// GET /api/compliance/capabilities — the calling user's own capability set (FRD 2.4.4 gating)
router.get('/capabilities', requireAuth, requireCompliance, handler('compliance GET /capabilities', async (req: Request, res: Response) => {
  return ok(res, req.complianceCaps)
}))

export default router
