import { Router, Request, Response } from 'express'
import multer from 'multer'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { requireAuth } from '../middleware/auth'
import { pool } from '../db'

const router = Router()

// ── S3 client ─────────────────────────────────────────────────
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.AWS_S3_BUCKET || 'glido-demo'
const S3_BASE = `https://${BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com`

// All uploads go through memory — S3 handles persistence
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

// Upload a buffer to S3, return public URL
async function uploadToS3(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
  const key = `uploads/${Date.now()}-${filename}`
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: mimetype,
  }))
  return `${S3_BASE}/${key}`
}

// ── POST /api/uploads/logo — staff only ───────────────────────
router.post('/logo', requireAuth, (req: Request, res: Response) => {
  memoryUpload.single('file')(req, res, async (err: any) => {
    if (err) {
      console.error('[uploads/logo] multer error:', err.message)
      return res.status(400).json({ success: false, error: { message: err.message ?? 'Upload error' } })
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: { message: 'No file uploaded' } })
    }
    try {
      const url = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype)
      const { tenantId } = req.body
      if (tenantId) {
        await pool.query('UPDATE tenants SET logo_url = $1, updated_at = NOW() WHERE id = $2', [url, tenantId])
      }
      return res.status(201).json({ success: true, data: { stored: true } })
    } catch (e: any) {
      console.error('[uploads/logo] S3 error:', e.message)
      return res.status(500).json({ success: false, error: { message: 'Upload failed' } })
    }
  })
})

// ── POST /api/uploads — booking documents ────────────────────
router.post('/', (req: Request, res: Response) => {
  memoryUpload.single('file')(req, res, async (err: any) => {
    if (err) {
      console.error('[uploads] multer error:', err.message)
      return res.status(400).json({ success: false, error: { message: err.message ?? 'Upload error' } })
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: { message: 'No file uploaded' } })
    }
    try {
      const url = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype)
      const filename = url.split('/').pop()!
      return res.status(201).json({ success: true, data: { url, filename } })
    } catch (e: any) {
      console.error('[uploads] S3 error:', e.message)
      return res.status(500).json({ success: false, error: { message: 'Upload failed' } })
    }
  })
})

// ── GET /api/uploads/signed-url?key= ─────────────────────────
router.get('/signed-url', (req: Request, res: Response) => {
  const { key } = req.query
  if (!key) return res.status(400).json({ success: false, error: { message: 'key is required' } })
  const url = `${S3_BASE}/uploads/${key}`
  return res.json({ success: true, data: { url } })
})

export default router
