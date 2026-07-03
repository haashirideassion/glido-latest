import { Router, Request, Response } from 'express'
import multer from 'multer'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { requireAuth } from '../middleware/auth'
import { pool } from '../db'

const router = Router()

// ── S3 client ──────────────────────────────────────────────────
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.AWS_S3_BUCKET || 'glido-demo'

// All uploads go through memory — no filesystem dependency
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

// Upload buffer to S3, return the S3 key (not public URL — bucket is private)
async function uploadToS3(buffer: Buffer, originalName: string, mimetype: string): Promise<string> {
  const key = `uploads/${Date.now()}-${originalName.replace(/\s+/g, '_')}`
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: mimetype,
  }))
  return key
}

// Extract S3 key from a stored value — handles both raw keys and old full URLs
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
// Requires auth — generates a 15-min pre-signed GET URL for any S3 object
router.get('/signed-url', requireAuth, async (req: Request, res: Response) => {
  const { key } = req.query
  if (!key) return res.status(400).json({ success: false, error: { message: 'key is required' } })
  try {
    const s3Key = extractKey(key as string)
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key })
    const url = await getSignedUrl(s3, command, { expiresIn: 900 }) // 15 min
    return res.json({ success: true, data: { url } })
  } catch (e: any) {
    console.error('[uploads/signed-url] error:', e.message)
    return res.status(500).json({ success: false, error: { message: 'Could not generate URL' } })
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
      const key = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype)
      const { tenantId } = req.body
      if (tenantId) {
        // Store the S3 key in DB (not a public URL — signed URLs generated on demand)
        await pool.query('UPDATE tenants SET logo_url = $1, updated_at = NOW() WHERE id = $2', [key, tenantId])
      }
      return res.status(201).json({ success: true, data: { stored: true } })
    } catch (e: any) {
      console.error('[uploads/logo] S3 error:', e.message)
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
      const key = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype)
      // Return key as filename — stored in booking_documents.storage_path
      return res.status(201).json({ success: true, data: { url: key, filename: key } })
    } catch (e: any) {
      console.error('[uploads] S3 error:', e.message)
      return res.status(500).json({ success: false, error: { message: 'Upload failed' } })
    }
  })
})

export default router
