import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'
const VALID_TYPES = ['text', 'number', 'date']

// GET is public — the customer portal's request detail screens need the configured label
// without requiring a reception session in every context.
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT service_key, field_label, field_type FROM service_field_settings WHERE tenant_id = $1`,
      [DEFAULT_TENANT_ID]
    )
    const data: Record<string, { fieldLabel: string | null; fieldType: string }> = {}
    for (const row of result.rows) {
      data[row.service_key] = { fieldLabel: row.field_label, fieldType: row.field_type }
    }
    return res.json({ success: true, data })
  } catch (err) {
    console.error('[service-field-settings GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

router.put('/:serviceKey', requireAuth, async (req: Request, res: Response) => {
  const { serviceKey } = req.params
  const { field_label, field_type } = req.body as { field_label?: string; field_type?: string }
  if (field_type && !VALID_TYPES.includes(field_type)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid field_type' } })
  }
  try {
    const result = await pool.query(
      `INSERT INTO service_field_settings (tenant_id, service_key, field_label, field_type, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tenant_id, service_key) DO UPDATE SET field_label = $3, field_type = $4, updated_at = NOW()
       RETURNING field_label, field_type`,
      [DEFAULT_TENANT_ID, serviceKey, field_label?.trim() || null, field_type ?? 'text']
    )
    return res.json({ success: true, data: { fieldLabel: result.rows[0].field_label, fieldType: result.rows[0].field_type } })
  } catch (err) {
    console.error('[service-field-settings PUT /:serviceKey]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
