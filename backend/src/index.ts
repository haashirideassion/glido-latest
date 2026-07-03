import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

import authRoutes from './routes/auth'
import bookingsRoutes from './routes/bookings'
import dashboardRoutes from './routes/dashboard'
import slotsRoutes from './routes/slots'
import walkInsRoutes from './routes/walk-ins'
import tenantsRoutes from './routes/tenants'
import checkinRecordsRoutes from './routes/checkin-records'
import shipmentsRoutes from './routes/shipments'
import uploadsRoutes from './routes/uploads'
import usersRoutes from './routes/users'
import bookingDocumentsRoutes from './routes/booking-documents'
import savedDriversRoutes from './routes/saved-drivers'
import carriersRoutes from './routes/carriers'
import broadcastRoutes from './routes/broadcast'
import notificationsRoutes from './routes/notifications'
import kioskDevicesRoutes from './routes/kiosk-devices'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// ── Middleware ──────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── Routes ──────────────────────────────────────────────────
app.use('/api/auth', authRoutes)
app.use('/api/bookings', bookingsRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/slots', slotsRoutes)
app.use('/api/walk-ins', walkInsRoutes)
app.use('/api/tenants', tenantsRoutes)
app.use('/api/checkin-records', checkinRecordsRoutes)
app.use('/api/shipments', shipmentsRoutes)
app.use('/api/uploads', uploadsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/booking-documents', bookingDocumentsRoutes)
app.use('/api/saved-drivers', savedDriversRoutes)
app.use('/api/carriers', carriersRoutes)
app.use('/api/broadcasts', broadcastRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/kiosk/devices', kioskDevicesRoutes)

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } })
})

// ── 404 ──────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { message: 'Route not found' } })
})

// ── Global error handler ──────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled error]', err)
  res.status(500).json({ success: false, error: { message: 'Internal server error' } })
})

app.listen(PORT, () => {
  console.log(`[glido-backend] Running on http://localhost:${PORT}`)
})
