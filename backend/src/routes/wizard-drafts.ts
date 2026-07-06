import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { pool } from '../db'

const router = Router()

// Public — guests without an account need to save/resume an in-progress booking
const SETUP = `
  CREATE TABLE IF NOT EXISTS wizard_drafts (
    token       TEXT PRIMARY KEY,
    state       JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS wd_expires ON wizard_drafts (expires_at);
`

let ready = false
async function ensureTable() {
  if (ready) return
  await pool.query(SETUP)
  ready = true
}

// POST /api/wizard-drafts — save the current wizard state, returns a resume token (valid 24h)
router.post('/', async (req: Request, res: Response) => {
  try {
    await ensureTable()
    const { state } = req.body
    if (!state || typeof state !== 'object') {
      return res.status(400).json({ success: false, error: { message: 'state is required' } })
    }
    const token = crypto.randomBytes(9).toString('base64url')
    await pool.query(
      `INSERT INTO wizard_drafts (token, state, expires_at) VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [token, JSON.stringify(state)],
    )
    return res.json({ success: true, token })
  } catch (err) {
    console.error('[wizard-drafts POST]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/wizard-drafts/:token — restore a saved wizard state (if not expired)
router.get('/:token', async (req: Request, res: Response) => {
  try {
    await ensureTable()
    const { rows } = await pool.query(
      `SELECT state FROM wizard_drafts WHERE token = $1 AND expires_at > NOW()`,
      [req.params.token],
    )
    if (!rows[0]) {
      return res.status(404).json({ success: false, error: { message: 'This resume link has expired or was already used.' } })
    }
    return res.json({ success: true, data: rows[0].state })
  } catch (err) {
    console.error('[wizard-drafts GET]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
