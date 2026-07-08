import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()

// POST /api/v2/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ success: false, error: { message: 'Email and password are required' } })
  }
  try {
    const result = await pool.query(
      'SELECT id, email, name, role, password_hash FROM app_users WHERE email = $1',
      [email.toLowerCase().trim()]
    )
    const user = result.rows[0]
    if (!user) {
      return res.status(401).json({ success: false, error: { message: 'Invalid email or password' } })
    }
    if (!user.password_hash) {
      // Migrated from Supabase — no hash yet, force password reset
      return res.status(401).json({ success: false, error: { message: 'PASSWORD_RESET_REQUIRED' } })
    }
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ success: false, error: { message: 'Invalid email or password' } })
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRATION || '1h' } as jwt.SignOptions
    )
    // Fire-and-forget last_login_at update
    pool.query('UPDATE app_users SET last_login_at = NOW() WHERE id = $1', [user.id]).catch(() => {})
    return res.json({
      success: true,
      data: { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } },
    })
  } catch (err) {
    console.error('[auth/login]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/v2/auth/me — the JWT payload only carries id/email/name/role, so fetch the
// full row for fields set after login (phone, company_name)
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, name, role, phone, company_name FROM app_users WHERE id = $1',
      [req.user!.id]
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[auth/me GET]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/v2/auth/me — self-service profile update (name, phone, company)
router.patch('/me', requireAuth, async (req: Request, res: Response) => {
  const { name, phone, company_name } = req.body
  const sets: string[] = []
  const params: unknown[] = []
  let i = 1
  if (name !== undefined)         { sets.push(`name = $${i++}`);         params.push(name) }
  if (phone !== undefined)        { sets.push(`phone = $${i++}`);        params.push(phone) }
  if (company_name !== undefined) { sets.push(`company_name = $${i++}`); params.push(company_name) }
  if (!sets.length) return res.status(400).json({ success: false, error: { message: 'No fields to update' } })
  sets.push(`updated_at = NOW()`)
  params.push(req.user!.id)
  try {
    const { rows } = await pool.query(
      `UPDATE app_users SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, email, name, role, phone, company_name`,
      params
    )
    return res.json({ success: true, data: rows[0] })
  } catch (err) {
    console.error('[auth/me PATCH]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/auth/register — visitor self-registration
router.post('/register', async (req: Request, res: Response) => {
  const { firstName, lastName, email, password, companyName } = req.body
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ success: false, error: { message: 'First name, last name, email and password are required' } })
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, error: { message: 'Password must be at least 8 characters' } })
  }
  const emailLower = email.toLowerCase().trim()
  try {
    // Check for existing account
    const existing = await pool.query('SELECT id FROM app_users WHERE email = $1', [emailLower])
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: { message: 'An account with this email already exists' } })
    }
    const hash = await bcrypt.hash(password, 12)
    const name = `${firstName.trim()} ${lastName.trim()}`
    const result = await pool.query(
      `INSERT INTO app_users (email, name, role, password_hash, company_name)
       VALUES ($1, $2, 'visitor_registered', $3, $4)
       RETURNING id, email, name, role`,
      [emailLower, name, hash, companyName?.trim() || null]
    )
    const user = result.rows[0]
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRATION || '1h' } as jwt.SignOptions
    )
    return res.status(201).json({
      success: true,
      data: { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } },
    })
  } catch (err) {
    console.error('[auth/register]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/auth/logout — stateless JWT, no-op
router.post('/logout', requireAuth, (_req: Request, res: Response) => {
  return res.json({ success: true, data: null })
})

// POST /api/v2/auth/forgot-password
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body
  if (!email) {
    return res.status(400).json({ success: false, error: { message: 'Email is required' } })
  }
  try {
    const result = await pool.query(
      'SELECT id FROM app_users WHERE email = $1',
      [email.toLowerCase().trim()]
    )
    if (result.rows.length > 0) {
      const resetToken = jwt.sign(
        { id: result.rows[0].id, type: 'password_reset' },
        process.env.JWT_SECRET!,
        { expiresIn: '1h' }
      )
      await pool.query(
        `UPDATE app_users
         SET password_reset_token = $1,
             password_reset_expires = NOW() + INTERVAL '1 hour'
         WHERE id = $2`,
        [resetToken, result.rows[0].id]
      )
      // TODO: Send reset email with link: /reset-password?token=<resetToken>
      console.log('[auth/forgot-password] Reset token for', email, ':', resetToken)
    }
    // Always return success to prevent user enumeration
    return res.json({ success: true, data: { message: 'If that email exists, a reset link has been sent.' } })
  } catch (err) {
    console.error('[auth/forgot-password]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/v2/auth/reset-password
router.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body
  if (!token || !password) {
    return res.status(400).json({ success: false, error: { message: 'Token and password are required' } })
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; type: string }
    if (payload.type !== 'password_reset') {
      return res.status(400).json({ success: false, error: { message: 'Invalid reset token' } })
    }
    const hash = await bcrypt.hash(password, 12)
    await pool.query(
      `UPDATE app_users
       SET password_hash = $1,
           password_reset_token = NULL,
           password_reset_expires = NULL,
           password_reset_required = FALSE
       WHERE id = $2`,
      [hash, payload.id]
    )
    return res.json({ success: true, data: { message: 'Password updated successfully.' } })
  } catch (err) {
    console.error('[auth/reset-password]', err)
    return res.status(400).json({ success: false, error: { message: 'Invalid or expired reset token' } })
  }
})

export default router
