import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

// GET is public — trip cards/forms need the configured label without requiring an allocator session.
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT field_label, field_type FROM trip_custom_field_settings WHERE tenant_id = $1`, [DEFAULT_TENANT_ID])
    return res.json({ success: true, data: { fieldLabel: result.rows[0]?.field_label ?? null, fieldType: result.rows[0]?.field_type ?? 'text' } })
  } catch (err) {
    console.error('[trip-custom-field GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

router.put('/', requireAuth, async (req: Request, res: Response) => {
  const { field_label, field_type } = req.body as { field_label?: string; field_type?: string }
  if (field_type && !['text', 'number', 'date'].includes(field_type)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid field_type' } })
  }
  try {
    const result = await pool.query(
      `INSERT INTO trip_custom_field_settings (tenant_id, field_label, field_type, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET field_label = $2, field_type = $3, updated_at = NOW()
       RETURNING field_label, field_type`,
      [DEFAULT_TENANT_ID, field_label?.trim() || null, field_type ?? 'text']
    )
    return res.json({ success: true, data: { fieldLabel: result.rows[0].field_label, fieldType: result.rows[0].field_type } })
  } catch (err) {
    console.error('[trip-custom-field PUT /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
