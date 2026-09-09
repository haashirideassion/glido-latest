import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

const SETUP = `
  CREATE TABLE IF NOT EXISTS broadcast_templates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    name        TEXT NOT NULL,
    subject     TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS bct_tenant ON broadcast_templates (tenant_id);

  CREATE TABLE IF NOT EXISTS broadcasts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL,
    subject      TEXT NOT NULL,
    body         TEXT NOT NULL,
    recipients   JSONB NOT NULL DEFAULT '"all"',
    template_id  UUID REFERENCES broadcast_templates(id) ON DELETE SET NULL,
    sent_by      TEXT,
    status       TEXT NOT NULL DEFAULT 'sent',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS bc_tenant ON broadcasts (tenant_id);
`

let ready = false
async function ensureTables() {
  if (ready) return
  await pool.query(SETUP)
  ready = true
}

// ── Templates ─────────────────────────────────────────────────────────────────
router.get('/templates', requireAuth, async (_req, res) => {
  try {
    await ensureTables()
    const { rows } = await pool.query(
      `SELECT * FROM broadcast_templates WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [DEFAULT_TENANT_ID]
    )
    return res.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[broadcast/templates GET]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

router.post('/templates', requireAuth, async (req: Request, res: Response) => {
  const { name, subject, body } = req.body
  if (!name?.trim() || !subject?.trim() || !body?.trim()) {
    return res.status(400).json({ success: false, error: { message: 'name, subject and body are required' } })
  }
  try {
    await ensureTables()
    const { rows } = await pool.query(
      `INSERT INTO broadcast_templates (tenant_id, name, subject, body) VALUES ($1,$2,$3,$4) RETURNING *`,
      [DEFAULT_TENANT_ID, name.trim(), subject.trim(), body.trim()]
    )
    return res.status(201).json({ success: true, data: rows[0] })
  } catch (err: any) {
    console.error('[broadcast/templates POST]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

router.patch('/templates/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params
  const { name, subject, body } = req.body
  try {
    await ensureTables()
    const { rows } = await pool.query(
      `UPDATE broadcast_templates SET name=$1,subject=$2,body=$3,updated_at=NOW()
       WHERE id=$4 AND tenant_id=$5 RETURNING *`,
      [name, subject, body, id, DEFAULT_TENANT_ID]
    )
    if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err: any) {
    console.error('[broadcast/templates PATCH]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

router.delete('/templates/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    await ensureTables()
    await pool.query(`DELETE FROM broadcast_templates WHERE id=$1 AND tenant_id=$2`, [id, DEFAULT_TENANT_ID])
    return res.json({ success: true })
  } catch (err: any) {
    console.error('[broadcast/templates DELETE]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// ── Broadcasts (history + send) ───────────────────────────────────────────────
router.get('/', requireAuth, async (_req, res) => {
  try {
    await ensureTables()
    const { rows } = await pool.query(
      `SELECT b.*, t.name AS template_name
       FROM broadcasts b
       LEFT JOIN broadcast_templates t ON t.id = b.template_id
       WHERE b.tenant_id = $1
       ORDER BY b.created_at DESC LIMIT 200`,
      [DEFAULT_TENANT_ID]
    )
    return res.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[broadcast GET]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/broadcasts — "send" (stores the broadcast; no actual SMTP)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { subject, body, recipients, template_id } = req.body
  if (!subject?.trim() || !body?.trim()) {
    return res.status(400).json({ success: false, error: { message: 'subject and body are required' } })
  }
  const sentBy = (req as any).user?.email ?? null
  try {
    await ensureTables()
    const { rows } = await pool.query(
      `INSERT INTO broadcasts (tenant_id, subject, body, recipients, template_id, sent_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,'sent') RETURNING *`,
      [DEFAULT_TENANT_ID, subject.trim(), body.trim(), JSON.stringify(recipients ?? 'all'), template_id ?? null, sentBy]
    )
    return res.status(201).json({ success: true, data: rows[0] })
  } catch (err: any) {
    console.error('[broadcast POST]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
