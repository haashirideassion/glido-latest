import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'

const router = Router()

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

// ─── Helper ───────────────────────────────────────────────────────────────────
function generateToken(): string {
  return 'GLIDO-KIOSK-' + crypto.randomBytes(6).toString('hex').toUpperCase()
}

// ─── Public routes (no auth) ──────────────────────────────────────────────────

// GET /api/kiosk/devices/validate?token=...
router.get('/validate', async (req: Request, res: Response) => {
  const { token } = req.query
  if (!token || typeof token !== 'string') {
    return res.json({ valid: false })
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, label FROM kiosk_devices WHERE token = $1 AND is_active = true`,
      [token]
    )
    if (rows.length === 0) return res.json({ valid: false })
    const device = rows[0]
    // Issue a kiosk JWT so the device can call auth-gated API routes
    const kioskJwt = jwt.sign(
      { id: device.id, email: `kiosk-${device.id}@glido.internal`, name: device.label ?? 'Kiosk Device', role: 'kiosk' },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    )
    return res.json({ valid: true, token: kioskJwt })
  } catch (err) {
    console.error('[kiosk/validate]', err)
    return res.json({ valid: false })
  }
})

// POST /api/kiosk/devices/ping
router.post('/ping', async (req: Request, res: Response) => {
  const { token } = req.body
  if (!token) return res.json({ ok: true })
  try {
    await pool.query(
      `UPDATE kiosk_devices SET last_seen_at = now() WHERE token = $1`,
      [token]
    )
    return res.json({ ok: true })
  } catch (err) {
    console.error('[kiosk/ping]', err)
    return res.json({ ok: true })
  }
})

// ─── Staff-auth routes ────────────────────────────────────────────────────────

// GET /api/kiosk/devices — list all devices for tenant
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, token, label, is_active, last_seen_at, created_at
       FROM kiosk_devices
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [DEFAULT_TENANT_ID]
    )
    return res.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[kiosk/list]', err)
    return res.status(500).json({ success: false, error: { message: err.message } })
  }
})

// POST /api/kiosk/devices — create new device
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { label } = req.body
  const token = generateToken()
  try {
    const { rows } = await pool.query(
      `INSERT INTO kiosk_devices (tenant_id, token, label)
       VALUES ($1, $2, $3)
       RETURNING id, token, label, is_active, last_seen_at, created_at`,
      [DEFAULT_TENANT_ID, token, label ?? null]
    )
    return res.status(201).json({ success: true, data: rows[0] })
  } catch (err: any) {
    console.error('[kiosk/create]', err)
    return res.status(500).json({ success: false, error: { message: err.message } })
  }
})

// PATCH /api/kiosk/devices/:id — toggle active / rename
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params
  const { is_active, label } = req.body
  try {
    const sets: string[] = []
    const params: any[] = []
    let idx = 1
    if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(is_active) }
    if (label     !== undefined) { sets.push(`label = $${idx++}`);     params.push(label) }
    if (sets.length === 0) return res.json({ success: true })
    params.push(id)
    const { rows } = await pool.query(
      `UPDATE kiosk_devices SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    )
    return res.json({ success: true, data: rows[0] })
  } catch (err: any) {
    console.error('[kiosk/patch]', err)
    return res.status(500).json({ success: false, error: { message: err.message } })
  }
})

// DELETE /api/kiosk/devices/:id
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    await pool.query(`DELETE FROM kiosk_devices WHERE id = $1`, [id])
    return res.json({ success: true })
  } catch (err: any) {
    console.error('[kiosk/delete]', err)
    return res.status(500).json({ success: false, error: { message: err.message } })
  }
})

export default router
