import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

// "Carriers" are derived from visitor accounts (app_users, role=visitor_registered) —
// every registered customer shows up here automatically, no manual roster. Reception-only
// extras (ABN, address, notes, rating, active/inactive) live in carrier_profiles, keyed by
// the account id. Booking stats are computed live from bookings.user_id — never stored.
//
// The response shape intentionally mirrors the old standalone `carriers` table (id, name,
// abn, status, contact_name, contact_email, contact_phone, address, notes, total_bookings,
// last_visit, rating) so the frontend's existing Carrier type/UI didn't need to change —
// `id` is now the app_users.id, and `name` is the account's company name.
const SELECT_CARRIERS = `
  SELECT
    u.id                                    AS id,
    COALESCE(u.company_name, u.name)        AS name,
    cp.abn                                  AS abn,
    COALESCE(cp.status, 'active')           AS status,
    u.name                                  AS contact_name,
    u.email                                 AS contact_email,
    u.phone                                 AS contact_phone,
    cp.address                              AS address,
    cp.notes                                AS notes,
    COALESCE(b.total_bookings, 0)::int      AS total_bookings,
    b.last_visit                            AS last_visit,
    cp.rating                               AS rating,
    u.created_at                            AS created_at,
    COALESCE(cp.updated_at, u.updated_at)   AS updated_at
  FROM app_users u
  LEFT JOIN carrier_profiles cp ON cp.user_id = u.id
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS total_bookings, MAX(slot_date) AS last_visit
    FROM bookings
    WHERE user_id IS NOT NULL
    GROUP BY user_id
  ) b ON b.user_id = u.id
  WHERE u.role = 'visitor_registered'
`

// ── GET /api/carriers?search=&status= ───────────────────────────────────────
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { search, status } = req.query
  try {
    let sql = SELECT_CARRIERS
    const params: any[] = []
    // status filters against the COALESCE'd value, so wrap the whole query
    let where = ''
    if (status && status !== 'all') { params.push(status); where += ` AND COALESCE(cp.status, 'active') = $${params.length}` }
    if (search) { params.push(`%${search}%`); where += ` AND (u.company_name ILIKE $${params.length} OR u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR cp.abn ILIKE $${params.length})` }
    sql += where + ` ORDER BY u.created_at DESC`
    const { rows } = await pool.query(sql, params)
    return res.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[carriers GET]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// ── GET /api/carriers/:id/drivers — drivers this carrier has actually used ──
// saved_drivers has no link to a specific account (it's one tenant-wide roster), so a
// carrier's "own" drivers are derived from who has actually driven for their bookings —
// one row per distinct driver name, with the most recent phone/vehicle rego on file and a
// trip count. LEFT JOINed against saved_drivers (matched by name) to pick up an existing
// blocked/block_reason status, since blocking is tenant-wide (a banned driver stays banned
// regardless of which company's booking they show up on next).
router.get('/:id/drivers', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { rows } = await pool.query(
      `SELECT
         bd.driver_name, bd.driver_phone, bd.vehicle_registration, bd.trips, bd.last_trip,
         sd.id AS saved_driver_id,
         COALESCE(sd.blocked, false) AS blocked,
         sd.block_reason AS block_reason
       FROM (
         SELECT DISTINCT ON (lower(driver_name))
           driver_name, driver_phone, vehicle_registration,
           COUNT(*) OVER (PARTITION BY lower(driver_name)) AS trips,
           MAX(slot_date) OVER (PARTITION BY lower(driver_name)) AS last_trip
         FROM bookings
         WHERE user_id = $1 AND driver_name IS NOT NULL AND driver_name != ''
         ORDER BY lower(driver_name), created_at DESC
       ) bd
       LEFT JOIN saved_drivers sd ON lower(sd.name) = lower(bd.driver_name) AND sd.tenant_id = $2
       ORDER BY bd.last_trip DESC NULLS LAST`,
      [id, DEFAULT_TENANT_ID]
    )
    return res.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[carriers GET /:id/drivers]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// ── PATCH /api/carriers/:id — id is the visitor account's user_id ───────────
// Updates the account's own contact fields (company name, contact name, phone — NOT
// email, which is the account's login) plus reception-only extras via an upsert into
// carrier_profiles. No POST/DELETE — carriers can't be created or removed manually,
// they exist for as long as the underlying visitor account does.
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params
  const { name, contact_name, contact_phone, abn, status, address, notes, rating } = req.body
  try {
    const userSets: string[] = []
    const userParams: unknown[] = []
    let i = 1
    if (name !== undefined)          { userSets.push(`company_name = $${i++}`); userParams.push(name || null) }
    if (contact_name !== undefined)  { userSets.push(`name = $${i++}`);         userParams.push(contact_name) }
    if (contact_phone !== undefined) { userSets.push(`phone = $${i++}`);        userParams.push(contact_phone || null) }
    if (userSets.length) {
      userSets.push(`updated_at = NOW()`)
      userParams.push(id)
      const { rowCount } = await pool.query(
        `UPDATE app_users SET ${userSets.join(', ')} WHERE id = $${i} AND role = 'visitor_registered'`,
        userParams
      )
      if (!rowCount) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    }

    // Always overwrite (not COALESCE) — the edit form sends the full record on save, so a
    // cleared field should persist as cleared, matching the old carriers table's behaviour.
    await pool.query(
      `INSERT INTO carrier_profiles (user_id, abn, status, address, notes, rating, updated_at)
       VALUES ($1, $2, COALESCE($3, 'active'), $4, $5, $6, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         abn = $2, status = COALESCE($3, 'active'), address = $4, notes = $5, rating = $6, updated_at = NOW()`,
      [id, abn ?? null, status ?? null, address ?? null, notes ?? null, rating ?? null]
    )

    const { rows } = await pool.query(`${SELECT_CARRIERS} AND u.id = $1`, [id])
    if (!rows.length) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err: any) {
    console.error('[carriers PATCH]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
