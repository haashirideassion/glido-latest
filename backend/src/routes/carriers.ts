import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS carriers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    name            TEXT NOT NULL,
    abn             TEXT,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    contact_name    TEXT,
    contact_email   TEXT,
    contact_phone   TEXT,
    address         TEXT,
    notes           TEXT,
    total_bookings  INTEGER NOT NULL DEFAULT 0,
    last_visit      DATE,
    rating          NUMERIC(3,1) CHECK (rating >= 0 AND rating <= 5),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS carriers_tenant_idx ON carriers (tenant_id);
`

// Ensure table exists on first request
let tableReady = false
async function ensureTable() {
  if (tableReady) return
  await pool.query(CREATE_TABLE)
  tableReady = true
}

// ── GET /api/carriers?tenantId= ─────────────────────────────────────────────
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const tenantId = DEFAULT_TENANT_ID
  const { search, status } = req.query
  try {
    await ensureTable()
    let sql = `SELECT * FROM carriers WHERE tenant_id = $1`
    const params: any[] = [tenantId]
    if (status && status !== 'all') { params.push(status); sql += ` AND status = $${params.length}` }
    if (search) { params.push(`%${search}%`); sql += ` AND (name ILIKE $${params.length} OR contact_name ILIKE $${params.length} OR abn ILIKE $${params.length})` }
    sql += ` ORDER BY created_at DESC`
    const { rows } = await pool.query(sql, params)
    return res.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[carriers GET]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// ── POST /api/carriers ───────────────────────────────────────────────────────
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const tenantId = DEFAULT_TENANT_ID
  const { name, abn, status, contact_name, contact_email, contact_phone, address, notes, total_bookings, last_visit, rating } = req.body
  if (!name?.trim()) return res.status(400).json({ success: false, error: { message: 'name is required' } })
  try {
    await ensureTable()
    const { rows } = await pool.query(
      `INSERT INTO carriers (tenant_id, name, abn, status, contact_name, contact_email, contact_phone, address, notes, total_bookings, last_visit, rating)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [tenantId, name.trim(), abn||null, status||'active', contact_name||null, contact_email||null, contact_phone||null, address||null, notes||null, total_bookings||0, last_visit||null, rating||null]
    )
    return res.status(201).json({ success: true, data: rows[0] })
  } catch (err: any) {
    console.error('[carriers POST]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// ── PATCH /api/carriers/:id ──────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const tenantId = DEFAULT_TENANT_ID
  const { id } = req.params
  const { name, abn, status, contact_name, contact_email, contact_phone, address, notes, total_bookings, last_visit, rating } = req.body
  try {
    await ensureTable()
    const { rows } = await pool.query(
      `UPDATE carriers SET
         name=$1, abn=$2, status=$3, contact_name=$4, contact_email=$5,
         contact_phone=$6, address=$7, notes=$8, total_bookings=$9,
         last_visit=$10, rating=$11, updated_at=NOW()
       WHERE id=$12 AND tenant_id=$13 RETURNING *`,
      [name, abn||null, status||'active', contact_name||null, contact_email||null, contact_phone||null, address||null, notes||null, total_bookings||0, last_visit||null, rating||null, id, tenantId]
    )
    if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err: any) {
    console.error('[carriers PATCH]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// ── DELETE /api/carriers/:id ─────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const tenantId = DEFAULT_TENANT_ID
  const { id } = req.params
  try {
    await ensureTable()
    await pool.query(`DELETE FROM carriers WHERE id=$1 AND tenant_id=$2`, [id, tenantId])
    return res.json({ success: true })
  } catch (err: any) {
    console.error('[carriers DELETE]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
