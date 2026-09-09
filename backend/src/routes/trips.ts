import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import { logPlannerActivity } from '../lib/plannerActivity'
import { logAllocatorActivity } from '../lib/allocatorActivity'
import { notifyRoleIfEnabled, plannerSystemNotifEnabled, allocatorToggleEnabled } from '../lib/userNotifications'
import { autoAllocatePendingTrips } from '../lib/allocatorAutoAllocate'

const router = Router()
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

function generateTripRef(): string {
  const seq = String(Math.floor(Math.random() * 900000) + 100000)
  return `TR-${seq}`
}

// GET /api/trips — category (import|export), serviceType (collection|delivery|dehire), search,
// sort, stage (planned|assigned|in_progress|completed — the FRD's "Filter" control on the Planner
// Trips page), allocationStatus (pending|allocated — derived, used by Allocator's Trip Allocation)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    await autoAllocatePendingTrips(DEFAULT_TENANT_ID)
    const { category, serviceType, search, sort, stage, excludeCompleted, allocationStatus, vesselId } = req.query
    const conditions: string[] = ['tenant_id = $1']
    const params: unknown[] = [DEFAULT_TENANT_ID]
    let i = 2

    if (category)    { conditions.push(`service_category = $${i++}`); params.push(category) }
    if (serviceType) { conditions.push(`service_type = $${i++}`); params.push(serviceType) }
    if (stage)       { conditions.push(`stage = $${i++}`); params.push(stage) }
    // Planner Vessels — "clicking a vessel opens its list of containers (business request cards)".
    if (vesselId)    { conditions.push(`vessel_id = $${i++}`); params.push(vesselId) }
    // Planner Settings → "Show completed items by default" (FRD 2.4.2.3) — applied only when the
    // user hasn't explicitly filtered to a specific stage (an explicit "Completed" filter always wins).
    else if (excludeCompleted === 'true') { conditions.push(`stage != 'completed'`) }
    // Allocated = both a truck and a driver have been assigned (FRD 2.4.3.2 — trailer is optional).
    if (allocationStatus === 'pending')   conditions.push(`(truck_id IS NULL OR driver_id IS NULL)`)
    if (allocationStatus === 'allocated') conditions.push(`(truck_id IS NOT NULL AND driver_id IS NOT NULL)`)
    if (search) {
      conditions.push(`(container_number ILIKE $${i} OR vessel_name ILIKE $${i} OR trip_ref ILIKE $${i})`)
      params.push(`%${search}%`)
      i++
    }

    const orderBy = sort === 'oldest' ? 'created_at ASC' : sort === 'trip_ref' ? 'trip_ref ASC' : 'created_at DESC'
    const result = await pool.query(
      `SELECT * FROM trips WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy}`,
      params
    )
    return res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[trips GET /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// GET /api/trips/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM trips WHERE (id::text = $1 OR trip_ref = $1) AND tenant_id = $2 LIMIT 1`,
      [req.params.id, DEFAULT_TENANT_ID]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[trips GET /:id]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// POST /api/trips — Create Trip
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const b = req.body
  const serviceCategory = b.service_category ?? b.serviceCategory
  const serviceType = b.service_type ?? b.serviceType
  if (!serviceCategory || !['import', 'export'].includes(serviceCategory)) {
    return res.status(400).json({ success: false, error: { message: 'A valid service_category (import/export) is required' } })
  }
  if (!serviceType || !['collection', 'delivery', 'dehire'].includes(serviceType)) {
    return res.status(400).json({ success: false, error: { message: 'A valid service_type (collection/delivery/dehire) is required' } })
  }
  try {
    const result = await pool.query(
      `INSERT INTO trips (
        trip_ref, service_category, service_type, container_number, vessel_id, vessel_name,
        trip_date, vehicle, driver, stage, tenant_id, created_by,
        priority, origin, destination, time_window_start, time_window_end
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'planned',$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [
        generateTripRef(), serviceCategory, serviceType,
        b.container_number ?? null, b.vessel_id ?? null, b.vessel_name ?? null,
        b.trip_date ?? null, b.vehicle ?? null, b.driver ?? null,
        DEFAULT_TENANT_ID, req.user!.id,
        b.priority ?? 'medium', b.origin ?? null, b.destination ?? null,
        b.time_window_start ?? null, b.time_window_end ?? null,
      ]
    )
    const trip = result.rows[0]
    logPlannerActivity('trip', `New ${trip.service_category} trip ${trip.trip_ref} planned (${trip.service_type})`, DEFAULT_TENANT_ID, req.user!.id)
    notifyRoleIfEnabled('planner', DEFAULT_TENANT_ID, 'trip_scheduled',
      'Trip scheduled', `Trip ${trip.trip_ref} (${trip.service_category}/${trip.service_type}) was scheduled.`,
      userId => plannerSystemNotifEnabled(userId, 'trip_scheduled'))
    notifyRoleIfEnabled('allocator', DEFAULT_TENANT_ID, 'new_trip',
      'New trip received', `Trip ${trip.trip_ref} was received from the planning department.`,
      userId => allocatorToggleEnabled(userId, 'new_trip_notifications'))
    return res.status(201).json({ success: true, data: trip })
  } catch (err) {
    console.error('[trips POST /]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/trips/:id/stage — advance the Planned → Assigned → In Progress → Completed timeline
router.patch('/:id/stage', requireAuth, async (req: Request, res: Response) => {
  const { stage } = req.body as { stage?: string }
  const VALID = ['planned', 'assigned', 'in_progress', 'completed']
  if (!stage || !VALID.includes(stage)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid stage' } })
  }
  try {
    const result = await pool.query(
      `UPDATE trips SET stage = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [stage, req.params.id]
    )
    const trip = result.rows[0]
    if (!trip) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    logPlannerActivity('trip', `Trip ${trip.trip_ref} is now ${stage.replace('_', ' ')}`, DEFAULT_TENANT_ID, req.user!.id)
    if (stage === 'completed') {
      notifyRoleIfEnabled('planner', DEFAULT_TENANT_ID, 'trip_completed',
        'Trip completed', `Trip ${trip.trip_ref} has been completed.`,
        userId => plannerSystemNotifEnabled(userId, 'trip_completed'))
    }
    return res.json({ success: true, data: trip })
  } catch (err) {
    console.error('[trips PATCH stage]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/trips/:id/details — operational details shown on the Allocator Trip Allocation card
// (FRD): time to reach/complete, hazardous, weight, OOG (+ dimensions), and the tenant's custom field.
router.patch('/:id/details', requireAuth, async (req: Request, res: Response) => {
  const b = req.body
  try {
    const result = await pool.query(
      `UPDATE trips SET
         time_to_reach      = CASE WHEN $1::text IS NULL THEN time_to_reach WHEN $1 = '' THEN NULL ELSE $1 END,
         time_to_complete   = CASE WHEN $2::text IS NULL THEN time_to_complete WHEN $2 = '' THEN NULL ELSE $2 END,
         is_hazardous       = COALESCE($3, is_hazardous),
         weight             = CASE WHEN $4::text IS NULL THEN weight WHEN $4 = '' THEN NULL ELSE $4 END,
         is_oog             = COALESCE($5, is_oog),
         oog_length         = CASE WHEN $6::text IS NULL THEN oog_length WHEN $6 = '' THEN NULL ELSE $6 END,
         oog_width          = CASE WHEN $7::text IS NULL THEN oog_width  WHEN $7 = '' THEN NULL ELSE $7 END,
         oog_height         = CASE WHEN $8::text IS NULL THEN oog_height WHEN $8 = '' THEN NULL ELSE $8 END,
         custom_field_value = CASE WHEN $9::text IS NULL THEN custom_field_value WHEN $9 = '' THEN NULL ELSE $9 END,
         updated_at = NOW()
       WHERE id = $10 AND tenant_id = $11 RETURNING *`,
      [
        b.time_to_reach ?? null, b.time_to_complete ?? null, b.is_hazardous ?? null, b.weight ?? null, b.is_oog ?? null,
        b.oog_length ?? null, b.oog_width ?? null, b.oog_height ?? null, b.custom_field_value ?? null,
        req.params.id, DEFAULT_TENANT_ID,
      ]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[trips PATCH /:id/details]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/trips/:id/assign — assign vehicle/driver
router.patch('/:id/assign', requireAuth, async (req: Request, res: Response) => {
  const { vehicle, driver } = req.body as { vehicle?: string; driver?: string }
  try {
    const result = await pool.query(
      `UPDATE trips SET vehicle = COALESCE($1, vehicle), driver = COALESCE($2, driver),
         stage = CASE WHEN stage = 'planned' THEN 'assigned' ELSE stage END, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [vehicle ?? null, driver ?? null, req.params.id]
    )
    if (!result.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[trips PATCH assign]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  }
})

// PATCH /api/trips/:id/allocate — Allocator's "select truck/trailer/driver" flow (FRD 2.4.3.2).
// Supports amending: previously-allocated resources are reverted to 'available' before the new
// ones are set to 'on_trip', so reallocating a trip never leaves an orphaned 'on_trip' resource.
router.patch('/:id/allocate', requireAuth, async (req: Request, res: Response) => {
  const { truck_id, trailer_id, driver_id } = req.body as {
    truck_id?: string | null; trailer_id?: string | null; driver_id?: string | null
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const tripResult = await client.query(
      `SELECT * FROM trips WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [req.params.id, DEFAULT_TENANT_ID]
    )
    const trip = tripResult.rows[0]
    if (!trip) {
      await client.query('ROLLBACK')
      return res.status(404).json({ success: false, error: { message: 'Not found' } })
    }

    const prevTruckId = trip.truck_id
    const prevTrailerId = trip.trailer_id
    const prevDriverId = trip.driver_id

    const nextTruckId = truck_id === undefined ? prevTruckId : truck_id
    const nextTrailerId = trailer_id === undefined ? prevTrailerId : trailer_id
    const nextDriverId = driver_id === undefined ? prevDriverId : driver_id

    // Operation Hours (Allocator Settings → General): a trip whose time window falls outside the
    // acting allocator's configured hours cannot be allocated.
    if ((nextTruckId || nextDriverId) && trip.time_window_start && trip.time_window_end) {
      const hoursResult = await client.query(
        `SELECT operation_start_time, operation_end_time FROM allocator_settings WHERE user_id = $1`,
        [req.user!.id]
      )
      const hours = hoursResult.rows[0]
      if (hours && (trip.time_window_start < hours.operation_start_time || trip.time_window_end > hours.operation_end_time)) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          success: false,
          error: { message: `Trip time window (${trip.time_window_start}–${trip.time_window_end}) falls outside your configured operation hours (${hours.operation_start_time}–${hours.operation_end_time})` },
        })
      }
    }

    let truckCode: string | null = null
    let driverName: string | null = null

    // Resource Conflict Alerts (Allocator Settings → Notifications): a resource being (re)assigned
    // here that's already committed elsewhere is a scheduling conflict — block it and notify.
    if (nextTruckId && nextTruckId !== prevTruckId) {
      const t = await client.query(`SELECT resource_code, status FROM trucks WHERE id = $1`, [nextTruckId])
      if (!t.rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, error: { message: 'Truck not found' } }) }
      if (t.rows[0].status !== 'available') {
        await client.query('ROLLBACK')
        await notifyRoleIfEnabled('allocator', DEFAULT_TENANT_ID, 'resource_conflict',
          'Resource conflict', `Truck ${t.rows[0].resource_code} was already ${t.rows[0].status.replace('_', ' ')} when allocation to Trip #${trip.trip_ref} was attempted.`,
          userId => allocatorToggleEnabled(userId, 'resource_conflict_alerts'))
        return res.status(409).json({ success: false, error: { message: `Truck ${t.rows[0].resource_code} is already ${t.rows[0].status.replace('_', ' ')}` } })
      }
      truckCode = t.rows[0].resource_code
    } else if (nextTruckId) {
      const t = await client.query(`SELECT resource_code FROM trucks WHERE id = $1`, [nextTruckId])
      truckCode = t.rows[0]?.resource_code ?? null
    }
    if (nextTrailerId && nextTrailerId !== prevTrailerId) {
      const t = await client.query(`SELECT resource_code, status FROM trailers WHERE id = $1`, [nextTrailerId])
      if (!t.rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, error: { message: 'Trailer not found' } }) }
      if (t.rows[0].status !== 'available') {
        await client.query('ROLLBACK')
        await notifyRoleIfEnabled('allocator', DEFAULT_TENANT_ID, 'resource_conflict',
          'Resource conflict', `Trailer ${t.rows[0].resource_code} was already ${t.rows[0].status.replace('_', ' ')} when allocation to Trip #${trip.trip_ref} was attempted.`,
          userId => allocatorToggleEnabled(userId, 'resource_conflict_alerts'))
        return res.status(409).json({ success: false, error: { message: `Trailer ${t.rows[0].resource_code} is already ${t.rows[0].status.replace('_', ' ')}` } })
      }
    }
    if (nextDriverId && nextDriverId !== prevDriverId) {
      const d = await client.query(`SELECT driver_name, status FROM drivers WHERE id = $1`, [nextDriverId])
      if (!d.rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, error: { message: 'Driver not found' } }) }
      if (d.rows[0].status !== 'off_duty') {
        await client.query('ROLLBACK')
        await notifyRoleIfEnabled('allocator', DEFAULT_TENANT_ID, 'resource_conflict',
          'Resource conflict', `Driver ${d.rows[0].driver_name} was already ${d.rows[0].status.replace('_', ' ')} when allocation to Trip #${trip.trip_ref} was attempted.`,
          userId => allocatorToggleEnabled(userId, 'resource_conflict_alerts'))
        return res.status(409).json({ success: false, error: { message: `Driver ${d.rows[0].driver_name} is already ${d.rows[0].status.replace('_', ' ')}` } })
      }
      driverName = d.rows[0].driver_name
    } else if (nextDriverId) {
      const d = await client.query(`SELECT driver_name FROM drivers WHERE id = $1`, [nextDriverId])
      driverName = d.rows[0]?.driver_name ?? null
    }

    // Revert previously-allocated resources that are being replaced/cleared.
    if (prevTruckId && prevTruckId !== nextTruckId) {
      await client.query(`UPDATE trucks SET status = 'available', updated_at = NOW() WHERE id = $1`, [prevTruckId])
    }
    if (prevTrailerId && prevTrailerId !== nextTrailerId) {
      await client.query(`UPDATE trailers SET status = 'available', updated_at = NOW() WHERE id = $1`, [prevTrailerId])
    }
    if (prevDriverId && prevDriverId !== nextDriverId) {
      await client.query(`UPDATE drivers SET status = 'off_duty', updated_at = NOW() WHERE id = $1`, [prevDriverId])
    }

    if (nextTruckId && nextTruckId !== prevTruckId) {
      await client.query(`UPDATE trucks SET status = 'on_trip', updated_at = NOW() WHERE id = $1`, [nextTruckId])
    }
    if (nextTrailerId && nextTrailerId !== prevTrailerId) {
      await client.query(`UPDATE trailers SET status = 'on_trip', updated_at = NOW() WHERE id = $1`, [nextTrailerId])
    }
    if (nextDriverId && nextDriverId !== prevDriverId) {
      await client.query(`UPDATE drivers SET status = 'on_duty', updated_at = NOW() WHERE id = $1`, [nextDriverId])
    }

    const updateResult = await client.query(
      `UPDATE trips SET
         truck_id = $1, trailer_id = $2, driver_id = $3,
         vehicle = COALESCE($4, vehicle), driver = COALESCE($5, driver),
         stage = CASE WHEN stage = 'planned' AND $1 IS NOT NULL AND $3 IS NOT NULL THEN 'assigned' ELSE stage END,
         updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [nextTruckId ?? null, nextTrailerId ?? null, nextDriverId ?? null, truckCode, driverName, req.params.id]
    )

    await client.query('COMMIT')

    const updatedTrip = updateResult.rows[0]
    const isAmend = !!(prevTruckId || prevDriverId || prevTrailerId)
    logAllocatorActivity(
      'trip',
      `${isAmend ? 'Resources amended for' : 'Resources allocated to'} Trip #${updatedTrip.trip_ref}`,
      DEFAULT_TENANT_ID, req.user!.id,
    )
    if (truckCode && nextTruckId !== prevTruckId) {
      logAllocatorActivity('resource', `Resource ${truckCode} assigned to Trip #${updatedTrip.trip_ref}`, DEFAULT_TENANT_ID, req.user!.id)
    }
    return res.json({ success: true, data: updatedTrip })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[trips PATCH allocate]', err)
    return res.status(500).json({ success: false, error: { message: 'Server error' } })
  } finally {
    client.release()
  }
})

export default router
