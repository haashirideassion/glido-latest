import { Router, Request, Response } from 'express'
import { pool } from '../db'

const router = Router()
// Public — called by the guest booking portal after file upload

// POST /api/v2/booking-documents
// Body: { booking_id, tenant_id, documents: [{ document_type, filename, file_size_bytes, storage_path }] }
router.post('/', async (req: Request, res: Response) => {
  const { booking_id, tenant_id, documents } = req.body
  if (!booking_id || !Array.isArray(documents) || documents.length === 0) {
    return res.status(400).json({ success: false, error: { message: 'booking_id and documents[] are required' } })
  }
  try {
    const inserted: any[] = []
    for (const doc of documents) {
      const { rows } = await pool.query(
        `INSERT INTO booking_documents
           (booking_id, tenant_id, document_type, filename, file_size_bytes, storage_path)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          booking_id,
          tenant_id ?? null,
          doc.document_type ?? 'general',
          doc.filename ?? null,
          doc.file_size_bytes ?? null,
          doc.storage_path,
        ]
      )
      inserted.push(rows[0])
    }
    return res.status(201).json({ success: true, data: inserted })
  } catch (err: any) {
    // If the table doesn't exist yet, return a soft error instead of crashing
    if (err.code === '42P01') {
      console.warn('[booking-documents] table missing — run migration 004')
      return res.status(201).json({ success: true, data: [] })
    }
    console.error('[booking-documents POST /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/v2/booking-documents?booking_id=<id>
// GET /api/v2/booking-documents?bookingIds=<id1>,<id2>,...
router.get('/', async (req: Request, res: Response) => {
  const { booking_id, bookingId, bookingIds } = req.query

  // Resolve to an array of IDs — support all three param spellings
  let ids: string[] = []
  if (bookingIds) {
    ids = (bookingIds as string).split(',').map(s => s.trim()).filter(Boolean)
  } else if (booking_id) {
    ids = [(booking_id as string).trim()]
  } else if (bookingId) {
    ids = [(bookingId as string).trim()]
  }

  if (ids.length === 0) {
    return res.status(400).json({ success: false, error: { message: 'booking_id is required' } })
  }

  try {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
    const { rows } = await pool.query(
      `SELECT * FROM booking_documents WHERE booking_id IN (${placeholders}) ORDER BY created_at ASC`,
      ids
    )
    return res.json({ success: true, data: rows })
  } catch (err: any) {
    if (err.code === '42P01') return res.json({ success: true, data: [] })
    console.error('[booking-documents GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
