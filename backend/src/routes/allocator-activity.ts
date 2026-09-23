import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

/**
 * FRD 2.4.3: "The activities displayed must be restricted to the activities falling within the
 * access rights assigned to the logged-in user." This was requireAuth only, so any authenticated
 * account could read the depot's fleet and allocation history. Mirrors AllocatorGuard.
 */
const ALLOCATOR_READ_ROLES = ['allocator', 'super_admin']

// GET /api/allocator/activity — Recent Activities feed for the Resource Allocator Dashboard (FRD 2.4.3)
router.get('/activity', requireAuth, async (req: Request, res: Response) => {
  if (!req.user || !ALLOCATOR_READ_ROLES.includes(req.user.role)) {
    return res.status(403).json({ success: false, error: { message: 'Forbidden' } })
  }
  try {
    const result = await pool.query(
      `SELECT * FROM allocator_activity WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [DEFAULT_TENANT_ID]
    )
    return res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[allocator GET /activity]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
