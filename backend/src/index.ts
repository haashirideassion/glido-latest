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
import visitablePersonsRoutes from './routes/visitable-persons'
import visitReasonsRoutes from './routes/visit-reasons'
import storeTypesRoutes from './routes/store-types'
import truckCustomFieldRoutes from './routes/truck-custom-field'
import tripCustomFieldRoutes from './routes/trip-custom-field'
import maintenanceCustomFieldRoutes from './routes/maintenance-custom-field'
import carriersRoutes from './routes/carriers'
import broadcastRoutes from './routes/broadcast'
import notificationsRoutes from './routes/notifications'
import kioskDevicesRoutes from './routes/kiosk-devices'
import wizardDraftsRoutes from './routes/wizard-drafts'
import analyticsRoutes from './routes/analytics'
import serviceRequestsRoutes from './routes/service-requests'
import customerReportSchedulesRoutes from './routes/customer-report-schedules'
import vesselsRoutes from './routes/vessels'
import tripsRoutes from './routes/trips'
import plannerSettingsRoutes from './routes/planner-settings'
import plannerReportsRoutes from './routes/planner-reports'
import resourcesRoutes from './routes/resources'
import userNotificationsRoutes from './routes/user-notifications'
import maintenanceRoutes from './routes/maintenance'
import allocatorSettingsRoutes from './routes/allocator-settings'
import allocatorActivityRoutes from './routes/allocator-activity'
import billingCatalogueRoutes from './routes/billing-catalogue'
import billingTariffsRoutes from './routes/billing-tariffs'
import billingChargesRoutes from './routes/billing-charges'
import billingInvoicesRoutes from './routes/billing-invoices'
import billingAccountsRoutes from './routes/billing-accounts'
import billingPaymentsRoutes from './routes/billing-payments'
import billingReportsRoutes from './routes/billing-reports'
import billingSettingsRoutes from './routes/billing-settings'
import complianceDashboardRoutes from './routes/compliance-dashboard'
import complianceActivitiesRoutes from './routes/compliance-activities'
import complianceInspectionsRoutes from './routes/compliance-inspections'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// ── Middleware ──────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())

const corsOptions = {
  origin: true,   // reflect request origin — safe for credentialed private app
  credentials: true,
}

// Handle preflight requests explicitly
app.options('*', cors(corsOptions))
app.use(cors(corsOptions))
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
app.use('/api/visitable-persons', visitablePersonsRoutes)
app.use('/api/visit-reasons', visitReasonsRoutes)
app.use('/api/store-types', storeTypesRoutes)
app.use('/api/truck-custom-field', truckCustomFieldRoutes)
app.use('/api/trip-custom-field', tripCustomFieldRoutes)
app.use('/api/maintenance-custom-field', maintenanceCustomFieldRoutes)
app.use('/api/carriers', carriersRoutes)
app.use('/api/broadcasts', broadcastRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/kiosk/devices', kioskDevicesRoutes)
app.use('/api/wizard-drafts', wizardDraftsRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/service-requests', serviceRequestsRoutes)
app.use('/api/customer-report-schedules', customerReportSchedulesRoutes)
app.use('/api/vessels', vesselsRoutes)
app.use('/api/trips', tripsRoutes)
app.use('/api/planner-settings', plannerSettingsRoutes)
app.use('/api/planner', plannerReportsRoutes)
app.use('/api/resources', resourcesRoutes)
app.use('/api/user-notifications', userNotificationsRoutes)
app.use('/api/maintenance', maintenanceRoutes)
app.use('/api/allocator-settings', allocatorSettingsRoutes)
app.use('/api/allocator', allocatorActivityRoutes)

// ── Billing, Rating & Revenue Module (FRS v0.2) ──────────────────────────────
// The §5.1 information chain: catalogue → tariff → rating event → charge line
// → invoice → payment → ledger sync → report.
app.use('/api/billing/catalogue', billingCatalogueRoutes)
app.use('/api/billing/tariffs',   billingTariffsRoutes)
app.use('/api/billing/charges',   billingChargesRoutes)
app.use('/api/billing/invoices',  billingInvoicesRoutes)
app.use('/api/billing/accounts',  billingAccountsRoutes)
app.use('/api/billing/payments',  billingPaymentsRoutes)
app.use('/api/billing/reports',   billingReportsRoutes)
app.use('/api/billing/settings',  billingSettingsRoutes)

// ── Compliance Module (FRD 2.4.4) ────────────────────────────────────────────
app.use('/api/compliance',             complianceDashboardRoutes)
app.use('/api/compliance/activities',  complianceActivitiesRoutes)
app.use('/api/compliance/inspections', complianceInspectionsRoutes)

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

// Local dev — only listen when run directly (not on Vercel)
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`[glido-backend] Running on http://localhost:${PORT}`)
  })
}

export default app
