import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { optionalAuth } from '../middleware/auth'

const router = Router()
router.use(optionalAuth)

// GET /api/v2/shipments — supports ?billNumber= and ?containerNumber=
router.get('/', async (req: Request, res: Response) => {
  const { billNumber, containerNumber, tenantId } = req.query
  try {
    const conditions: string[] = []
    const params: unknown[] = []
    let i = 1

    if (tenantId)        { conditions.push(`tenant_id = $${i++}`);                         params.push(tenantId) }
    if (billNumber)      { conditions.push(`LOWER(house_bill_number) = LOWER($${i++})`);   params.push(billNumber) }
    if (containerNumber) { conditions.push(`LOWER(container_number) = LOWER($${i++})`);   params.push(containerNumber) }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const { rows } = await pool.query(
      `SELECT * FROM cfs_shipments ${where} ORDER BY created_at DESC`,
      params
    )
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('[shipments GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
