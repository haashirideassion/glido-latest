import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { requireAuth } from '../middleware/auth'
import { pool } from '../db'

const router = Router()
// POST / is public (guest booking doc uploads); POST /logo requires auth

// Store uploads in ./uploads/ relative to where the server runs (used for booking docs)
const UPLOADS_DIR = path.join(process.cwd(), 'uploads')
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

// Disk storage — for booking documents
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `${unique}${path.extname(file.originalname)}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

// Memory storage — for logo (stored as base64 data URL in DB, no filesystem needed)
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB for logos
})

// POST /api/uploads/logo — staff only
// Converts to base64 data URL and stores directly in tenants.logo_url
router.post('/logo', requireAuth, (req: Request, res: Response) => {
  memoryUpload.single('file')(req, res, async (err: any) => {
    if (err) {
      console.error('[uploads/logo] multer error:', err.message)
      return res.status(400).json({ success: false, error: { message: err.message ?? 'Upload error' } })
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: { message: 'No file uploaded' } })
    }
    // Store as data URL — persists in DB, no filesystem dependency
    const mime = req.file.mimetype || 'image/jpeg'
    const dataUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`
    const { tenantId } = req.body
    if (tenantId) {
      try {
        await pool.query('UPDATE tenants SET logo_url = $1, updated_at = NOW() WHERE id = $2', [dataUrl, tenantId])
      } catch (err) {
        console.error('[uploads/logo] tenant update failed', err)
      }
    }
    // Return minimal response — client re-fetches tenant to get the data URL
    // (avoids sending 2MB+ base64 blob back over the wire)
    return res.status(201).json({ success: true, data: { stored: true } })
  })
}) // end router.post('/logo')

// POST /api/v2/uploads — multipart/form-data, field name: "file"
router.post('/', (req: Request, res: Response) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      // Multer errors (file too large, wrong field name, etc.) — return 400 not 500
      console.error('[uploads] multer error:', err.message)
      return res.status(400).json({ success: false, error: { message: err.message ?? 'Upload error' } })
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: { message: 'No file uploaded' } })
    }
    const url = `/api/uploads/files/${req.file.filename}`
    return res.status(201).json({ success: true, data: { url, filename: req.file.filename } })
  })
})

// GET /api/v2/uploads/signed-url?key=
// Returns a direct URL — in production replace with a real signed URL from S3/GCS
router.get('/signed-url', (req: Request, res: Response) => {
  const { key } = req.query
  if (!key) return res.status(400).json({ success: false, error: { message: 'key is required' } })
  const url = `/api/uploads/files/${key}`
  return res.json({ success: true, data: { url } })
})

// Serve uploaded files (dev convenience — in production serve from CDN/S3)
router.use('/files', (req: Request, res: Response) => {
  const filePath = path.join(UPLOADS_DIR, path.basename(req.path))
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: { message: 'File not found' } })
  }
  res.sendFile(filePath)
})

export default router
