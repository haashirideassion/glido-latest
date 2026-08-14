import { Router, Request, Response } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth'
import { pool } from '../db'
import { uploadBuffer, getSignedReadUrl, getReadStream, getMetadata } from '../lib/gcs'

const router = Router()

// All uploads go through memory — no filesystem dependency
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

// Upload buffer to GCS, return the object key (not public URL — bucket is private)
async function uploadToGCS(buffer: Buffer, originalName: string, mimetype: string): Promise<string> {
  const key = `uploads/${Date.now()}-${originalName.replace(/\s+/g, '_')}`
  await uploadBuffer(key, buffer, mimetype)
  return key
}

// Extract the object key from a stored value — handles both raw keys and old full URLs
function extractKey(value: string): string {
  if (value.startsWith('http')) {
    try {
      return new URL(value).pathname.slice(1) // strip leading /
    } catch {
      return value
    }
  }
  return value
}

// ── GET /api/uploads/signed-url?key= ─────────────────────────
// Requires auth — generates a 15-min pre-signed GET URL for any GCS object
router.get('/signed-url', requireAuth, async (req: Request, res: Response) => {
  const { key } = req.query
  if (!key) return res.status(400).json({ success: false, error: { message: 'key is required' } })
  try {
    const gcsKey = extractKey(key as string)
    const url = await getSignedReadUrl(gcsKey)
    return res.json({ success: true, data: { url } })
  } catch (e: any) {
    console.error('[uploads/signed-url] error:', e.message)
    return res.status(500).json({ success: false, error: { message: 'Could not generate URL' } })
  }
})

// ── GET /api/uploads/proxy?key= ────────────────────────────────
// Streams a GCS object's bytes through our own backend instead of handing the browser a
// presigned URL to fetch directly — a direct browser fetch() to GCS is subject to the
// bucket's CORS policy and can silently fail ("Failed to fetch") if that policy doesn't
// allow the current origin, even though the presigned URL itself is valid (as proven by
// <img src=presignedUrl> still rendering fine — images aren't CORS-gated for display).
// Needed for anything that must read the raw bytes client-side (e.g. embedding the tenant
// logo into a jsPDF-generated PDF), where <img> alone isn't enough.
router.get('/proxy', requireAuth, async (req: Request, res: Response) => {
  const { key } = req.query
  if (!key) return res.status(400).json({ success: false, error: { message: 'key is required' } })
  try {
    const gcsKey = extractKey(key as string)
    const metadata = await getMetadata(gcsKey)
    res.setHeader('Content-Type', metadata.contentType ?? 'application/octet-stream')
    getReadStream(gcsKey)
      .on('error', (e: any) => {
        console.error('[uploads/proxy] stream error:', e.message)
        if (!res.headersSent) res.status(404).json({ success: false, error: { message: 'Not found' } })
      })
      .pipe(res)
  } catch (e: any) {
    console.error('[uploads/proxy] error:', e.message)
    return res.status(500).json({ success: false, error: { message: 'Could not fetch object' } })
  }
})

// ── GET /api/uploads/logo-proxy?tenantId= ──────────────────────
// Public, unauthenticated variant of /proxy scoped ONLY to a tenant's own logo — needed so
// guest-facing pages (e.g. the public /book confirmation PDF) can embed the tenant logo
// without an auth token. Unlike /proxy this never accepts an arbitrary GCS key: it looks up
// the key itself from the tenants table, so it can't be used to read other private objects
// (booking documents, licence scans, etc). The tenant logo is already public data — it's
// rendered as a plain <img> on the public booking page and returned by the public tenant
// GET /:id endpoint (see PUBLIC_TENANT_SELECT in tenants.ts).
router.get('/logo-proxy', async (req: Request, res: Response) => {
  const { tenantId } = req.query
  if (!tenantId) return res.status(400).json({ success: false, error: { message: 'tenantId is required' } })
  try {
    const { rows } = await pool.query('SELECT logo_url FROM tenants WHERE id = $1', [tenantId])
    const logoUrl = rows[0]?.logo_url
    if (!logoUrl) return res.status(404).json({ success: false, error: { message: 'No logo set' } })
    const gcsKey = extractKey(logoUrl)
    const metadata = await getMetadata(gcsKey)
    res.setHeader('Content-Type', metadata.contentType ?? 'application/octet-stream')
    getReadStream(gcsKey)
      .on('error', (e: any) => {
        console.error('[uploads/logo-proxy] stream error:', e.message)
        if (!res.headersSent) res.status(404).json({ success: false, error: { message: 'Not found' } })
      })
      .pipe(res)
  } catch (e: any) {
    console.error('[uploads/logo-proxy] error:', e.message)
    return res.status(500).json({ success: false, error: { message: 'Could not fetch logo' } })
  }
})

// ── POST /api/uploads/logo — staff only ───────────────────────
router.post('/logo', requireAuth, (req: Request, res: Response) => {
  memoryUpload.single('file')(req, res, async (err: any) => {
    if (err) {
      return res.status(400).json({ success: false, error: { message: err.message ?? 'Upload error' } })
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: { message: 'No file uploaded' } })
    }
    try {
      const key = await uploadToGCS(req.file.buffer, req.file.originalname, req.file.mimetype)
      const { tenantId } = req.body
      if (tenantId) {
        // Store the GCS key in DB (not a public URL — signed URLs generated on demand)
        await pool.query('UPDATE tenants SET logo_url = $1, updated_at = NOW() WHERE id = $2', [key, tenantId])
      }
      return res.status(201).json({ success: true, data: { stored: true } })
    } catch (e: any) {
      console.error('[uploads/logo] GCS error:', e.message)
      return res.status(500).json({ success: false, error: { message: 'Upload failed' } })
    }
  })
})

// ── POST /api/uploads — booking documents ─────────────────────
router.post('/', (req: Request, res: Response) => {
  memoryUpload.single('file')(req, res, async (err: any) => {
    if (err) {
      return res.status(400).json({ success: false, error: { message: err.message ?? 'Upload error' } })
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: { message: 'No file uploaded' } })
    }
    try {
      const key = await uploadToGCS(req.file.buffer, req.file.originalname, req.file.mimetype)
      // Return key as filename — stored in booking_documents.storage_path
      return res.status(201).json({ success: true, data: { url: key, filename: key } })
    } catch (e: any) {
      console.error('[uploads] GCS error:', e.message)
      return res.status(500).json({ success: false, error: { message: 'Upload failed' } })
    }
  })
})

export default router
