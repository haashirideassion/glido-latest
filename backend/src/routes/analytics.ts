import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

// Public — the booking wizard itself logs these events, no staff auth on the write side
const SETUP = `
  CREATE TABLE IF NOT EXISTS wizard_funnel_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    session_id  TEXT NOT NULL,
    step        INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS wfe_tenant_created ON wizard_funnel_events (tenant_id, created_at);
  CREATE INDEX IF NOT EXISTS wfe_session ON wizard_funnel_events (session_id);
`

let ready = false
async function ensureTable() {
  if (ready) return
  await pool.query(SETUP)
  ready = true
}

// POST /api/analytics/wizard-funnel — log "session X reached step N"
router.post('/wizard-funnel', async (req: Request, res: Response) => {
  try {
    await ensureTable()
    const { sessionId, step } = req.body
    if (!sessionId || typeof step !== 'number') {
      return res.status(400).json({ success: false, error: { message: 'sessionId and step are required' } })
    }
    await pool.query(
      `INSERT INTO wizard_funnel_events (tenant_id, session_id, step) VALUES ($1, $2, $3)`,
      [DEFAULT_TENANT_ID, String(sessionId).slice(0, 100), step],
    )
    return res.json({ success: true })
  } catch (err: any) {
    if (err.code === '42P01') return res.json({ success: true })
    console.error('[analytics/wizard-funnel POST]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/analytics/wizard-funnel?days=30 — distinct sessions that reached each step
router.get('/wizard-funnel', requireAuth, async (req: Request, res: Response) => {
  try {
    await ensureTable()
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30))
    const { rows } = await pool.query(
      `SELECT step, COUNT(DISTINCT session_id) AS sessions
       FROM wizard_funnel_events
       WHERE tenant_id = $1 AND created_at > NOW() - ($2 || ' days')::interval
       GROUP BY step ORDER BY step ASC`,
      [DEFAULT_TENANT_ID, days],
    )
    return res.json({ success: true, data: rows.map(r => ({ step: Number(r.step), sessions: Number(r.sessions) })) })
  } catch (err: any) {
    if (err.code === '42P01') return res.json({ success: true, data: [] })
    console.error('[analytics/wizard-funnel GET]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
