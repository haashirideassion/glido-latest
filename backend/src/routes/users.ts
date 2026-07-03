import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import jwt from 'jsonwebtoken'

const router = Router()
router.use(requireAuth)

// ── Helpers ───────────────────────────────────────────────────────────────────

function splitName(fullName: string | null) {
  const parts = (fullName ?? '').trim().split(/\s+/)
  return { first_name: parts[0] ?? null, last_name: parts.slice(1).join(' ') || null }
}

function rowToUser(u: any) {
  return { ...u, ...splitName(u.name) }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/v2/users — list users; ?roles=reception_staff,reception_admin
router.get('/', async (req: Request, res: Response) => {
  try {
    const rolesParam = req.query.roles as string | undefined
    let query = `
      SELECT id, email, name, role, is_active, last_login_at, created_at, password_reset_required
      FROM app_users
    `
    const params: any[] = []
    if (rolesParam) {
      const roles = rolesParam.split(',').map(r => r.trim()).filter(Boolean)
      if (roles.length) { query += ` WHERE role = ANY($1)`; params.push(roles) }
    }
    query += ' ORDER BY created_at DESC'
    const { rows } = await pool.query(query, params)
    return res.json({ success: true, data: rows.map(rowToUser) })
  } catch (err) {
    console.error('[users GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/users/invite — create user + generate one-time setup token
router.post('/invite', async (req: Request, res: Response) => {
  const { email, role, firstName, lastName } = req.body
  if (!email?.trim()) {
    return res.status(400).json({ success: false, error: { message: 'Email is required' } })
  }
  const name = [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0]
  try {
    const { rows } = await pool.query(
      `INSERT INTO app_users (email, name, role, password_reset_required, is_active)
       VALUES ($1, $2, $3, TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE
         SET role = EXCLUDED.role, name = EXCLUDED.name, password_reset_required = TRUE, updated_at = NOW()
       RETURNING id, email, name, role, is_active, last_login_at, created_at, password_reset_required`,
      [email.toLowerCase().trim(), name, role || 'reception_staff']
    )
    const user = rows[0]

    // Generate a 24-hour setup token
    const setupToken = jwt.sign(
      { id: user.id, type: 'password_reset' },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    )
    await pool.query(
      `UPDATE app_users SET password_reset_token = $1, password_reset_expires = NOW() + INTERVAL '24 hours' WHERE id = $2`,
      [setupToken, user.id]
    )

    const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'
    const setupUrl = `${frontendOrigin}/setup-password?token=${setupToken}`

    // TODO: Send invite email with setupUrl when SMTP is configured
    console.log('[users/invite] Setup URL for', user.email, ':', setupUrl)

    return res.status(201).json({ success: true, data: { ...rowToUser(user), setupUrl } })
  } catch (err) {
    console.error('[users POST /invite]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/users/:id/resend-invite — regenerate setup link for a pending user
router.post('/:id/resend-invite', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email FROM app_users WHERE id = $1 AND password_reset_required = TRUE`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'User not found or already set up' } })

    const setupToken = jwt.sign(
      { id: rows[0].id, type: 'password_reset' },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    )
    await pool.query(
      `UPDATE app_users SET password_reset_token = $1, password_reset_expires = NOW() + INTERVAL '24 hours' WHERE id = $2`,
      [setupToken, rows[0].id]
    )

    const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'
    const setupUrl = `${frontendOrigin}/setup-password?token=${setupToken}`
    console.log('[users/resend-invite] Setup URL for', rows[0].email, ':', setupUrl)

    return res.json({ success: true, data: { setupUrl } })
  } catch (err) {
    console.error('[users POST /:id/resend-invite]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// DELETE /api/v2/users/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM app_users WHERE id = $1`, [req.params.id])
    if (!rowCount) return res.status(404).json({ success: false, error: { message: 'User not found' } })
    return res.json({ success: true })
  } catch (err) {
    console.error('[users DELETE /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/v2/users/:id — update role, is_active, name
router.patch('/:id', async (req: Request, res: Response) => {
  const { role, is_active, name, first_name, last_name } = req.body
  const setClauses: string[] = []
  const params: any[] = [req.params.id]
  let i = 2

  if (role      !== undefined) { setClauses.push(`role = $${i++}`);      params.push(role) }
  if (is_active !== undefined) { setClauses.push(`is_active = $${i++}`); params.push(is_active) }

  const fullName = name ?? (first_name || last_name
    ? [first_name, last_name].filter(Boolean).join(' ')
    : undefined)
  if (fullName !== undefined) { setClauses.push(`name = $${i++}`); params.push(fullName) }

  if (setClauses.length === 0) {
    return res.status(400).json({ success: false, error: { message: 'No fields to update' } })
  }
  setClauses.push('updated_at = NOW()')

  try {
    const { rows } = await pool.query(
      `UPDATE app_users SET ${setClauses.join(', ')} WHERE id = $1
       RETURNING id, email, name, role, is_active, last_login_at, created_at, password_reset_required`,
      params
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'User not found' } })
    return res.json({ success: true, data: rowToUser(rows[0]) })
  } catch (err) {
    console.error('[users PATCH /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
