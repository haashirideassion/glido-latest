import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import { computeServiceRequestReports } from '../lib/serviceRequestReports'

const router = Router()

// Request ID is prefixed by category per FRD comment: I = Import, E = Export.
function generateRequestId(category: 'import' | 'export'): string {
  const prefix = category === 'export' ? 'E' : 'I'
  const seq = String(Math.floor(Math.random() * 900000) + 100000)
  return `${prefix}${seq}`
}

// GET /api/service-requests — customers see only their own requests
// Query params: category (import|export), search, sort (newest|oldest), from/to (YYYY-MM-DD)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { category, search, sort, from, to } = req.query
    const conditions: string[] = ['customer_id = $1']
    const params: unknown[] = [req.user!.id]
    let i = 2

    if (category) { conditions.push(`service_category = $${i++}`); params.push(category) }
    if (search) {
      // Global search — request ID, container, vessel, and the services selected on the request
      // (service_key is stored as e.g. 'collection_terminal'; comparing with underscores replaced
      // by spaces lets "Collection Terminal" match without needing an exact key).
      conditions.push(`(
        request_id ILIKE $${i} OR container_number ILIKE $${i} OR vessel_line ILIKE $${i}
        OR EXISTS (
          SELECT 1 FROM service_request_services srs
          WHERE srs.service_request_id = service_requests.id
            AND (REPLACE(srs.service_key, '_', ' ') ILIKE $${i} OR COALESCE(srs.sub_type, '') ILIKE $${i})
        )
      )`)
      params.push(`%${search}%`)
      i++
    }
    if (from) { conditions.push(`created_at >= $${i++}::date`); params.push(from) }
    if (to)   { conditions.push(`created_at < ($${i++}::date + INTERVAL '1 day')`); params.push(to) }

    const orderBy = sort === 'oldest' ? 'created_at ASC' : 'created_at DESC'
    const result = await pool.query(
      `SELECT * FROM service_requests WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy}`,
      params
    )
    return res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[service-requests GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/service-requests/reports — aggregations scoped to the logged-in customer
router.get('/reports', requireAuth, async (req: Request, res: Response) => {
  try {
    const customerId = req.user!.id
    const { category, from, to } = req.query as { category?: string; from?: string; to?: string }
    const categoryFilter = category && ['import', 'export'].includes(category) ? category : null
    const dateFrom = from || null
    const dateTo   = to   || null

    const snapshot = await computeServiceRequestReports(customerId, categoryFilter, dateFrom, dateTo)
    return res.json({ success: true, data: snapshot })
  } catch (err) {
    console.error('[service-requests GET /reports]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/service-requests/:id — full detail incl. selected services + documents
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM service_requests WHERE (id::text = $1 OR request_id = $1) AND customer_id = $2 LIMIT 1`,
      [req.params.id, req.user!.id]
    )
    const sr = result.rows[0]
    if (!sr) return res.status(404).json({ success: false, error: { message: 'Not found' } })

    const [services, documents] = await Promise.all([
      pool.query(`SELECT * FROM service_request_services WHERE service_request_id = $1 ORDER BY created_at ASC`, [sr.id]),
      pool.query(`SELECT * FROM service_request_documents WHERE service_request_id = $1 ORDER BY created_at ASC`, [sr.id]),
    ])

    return res.json({ success: true, data: { ...sr, services: services.rows, documents: documents.rows } })
  } catch (err) {
    console.error('[service-requests GET /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/service-requests — New Service Request wizard submission
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const b = req.body
  const serviceCategory = b.service_category ?? b.serviceCategory
  const services = Array.isArray(b.services) ? b.services : []
  const documents = Array.isArray(b.documents) ? b.documents : []
  const termsAccepted = b.terms_accepted ?? b.termsAccepted ?? false

  if (!serviceCategory || !['import', 'export'].includes(serviceCategory)) {
    return res.status(400).json({ success: false, error: { message: 'A valid service_category (import/export) is required' } })
  }
  if (services.length === 0) {
    return res.status(400).json({ success: false, error: { message: 'At least one service must be selected' } })
  }
  if (!termsAccepted) {
    return res.status(400).json({ success: false, error: { message: 'Terms and conditions must be accepted' } })
  }

  const tenantId = b.tenant_id ?? b.tenantId ?? 'a0000000-0000-0000-0000-000000000001'
  // The Confirmation step shows the Request ID before the user submits (FRD FR 1.1.4.2), so the
  // wizard generates and displays one client-side first, then asks us to honor it here — falls
  // back to generating our own if the client didn't supply one (or sent a malformed value).
  const clientRequestId = b.request_id ?? b.requestId
  const expectedPrefix = serviceCategory === 'export' ? 'E' : 'I'
  const requestId = (typeof clientRequestId === 'string' && new RegExp(`^${expectedPrefix}\\d{6}$`).test(clientRequestId))
    ? clientRequestId
    : generateRequestId(serviceCategory)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let sr: any
    let idToUse = requestId
    // Extremely unlikely collision (client-generated or freshly generated) — retry once with a
    // fresh server-generated id rather than failing the whole submission.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const isOOG = b.is_oog ?? b.isOOG ?? false
        const srResult = await client.query(
          `INSERT INTO service_requests (
            request_id, customer_id, tenant_id, service_category, stage,
            container_number, container_type, container_size, vessel_line, voyage_number, collection_date,
            terms_accepted, is_oog, oog_length, oog_width, oog_height
          ) VALUES ($1,$2,$3,$4,'received',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          RETURNING *`,
          [
            idToUse, req.user!.id, tenantId, serviceCategory,
            b.container_number ?? null, b.container_type ?? null, b.container_size ?? null,
            b.vessel_line ?? null, b.voyage_number ?? null, b.collection_date ?? null,
            termsAccepted, isOOG,
            isOOG ? (b.oog_length ?? b.oogLength ?? null) : null,
            isOOG ? (b.oog_width ?? b.oogWidth ?? null) : null,
            isOOG ? (b.oog_height ?? b.oogHeight ?? null) : null,
          ]
        )
        sr = srResult.rows[0]
        break
      } catch (err: any) {
        if (err?.code === '23505' && attempt === 0) { idToUse = generateRequestId(serviceCategory); continue }
        throw err
      }
    }

    for (const svc of services) {
      await client.query(
        `INSERT INTO service_request_services (service_request_id, service_key, sub_type, status, duration_label, details)
         VALUES ($1,$2,$3,'pending',$4,$5)`,
        [sr.id, svc.service_key ?? svc.serviceKey, svc.sub_type ?? svc.subType ?? null, svc.duration_label ?? svc.durationLabel ?? null, JSON.stringify(svc.details ?? {})]
      )
    }

    for (const doc of documents) {
      await client.query(
        `INSERT INTO service_request_documents (service_request_id, document_type, filename, file_size_bytes, storage_path)
         VALUES ($1,$2,$3,$4,$5)`,
        [sr.id, doc.doc_type ?? doc.docType ?? 'general', doc.filename ?? null, doc.size ?? doc.fileSizeBytes ?? null, doc.storage_path ?? doc.storagePath]
      )
    }

    await client.query('COMMIT')
    return res.status(201).json({ success: true, data: sr })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[service-requests POST /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  } finally {
    client.release()
  }
})

// PATCH /api/service-requests/:id/stage — internal/staff progression of the 4-stage timeline.
// Not exposed in the Customer Portal UI (customers view progress read-only) — reserved for the
// Planner/Allocator/Logistics modules landing later in Phase 2 to advance a request's stage.
router.patch('/:id/stage', requireAuth, async (req: Request, res: Response) => {
  const { stage } = req.body as { stage?: string }
  const VALID = ['received', 'in_transit', 'arrived', 'completed']
  if (!stage || !VALID.includes(stage)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid stage' } })
  }
  try {
    const result = await pool.query(
      `UPDATE service_requests
       SET stage = $1, completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [stage, req.params.id]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[service-requests PATCH stage]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

export default router
