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

/** Planners own trip creation; planners and allocators both move a trip along its stages. */
const TRIP_CREATE_ROLES = ['planner', 'super_admin']
const TRIP_STAGE_ROLES  = ['planner', 'allocator', 'super_admin']

function denyUnlessRole(req: Request, res: Response, roles: string[]): boolean {
  if (!req.user || !roles.includes(req.user.role)) {
    res.status(403).json({ success: false, error: { message: 'Forbidden' } })
    return true
  }
  return false
}

/**
 * Mirrors usePlannerPermissions on the frontend — super_admin always holds the right, everyone
 * else takes tenants.working_hours.planner_permissions.can_create_trip, defaulting to true when
 * it has never been configured.
 *
 * FRD 2.4.2.2 requires Create Trip to be offered only to users holding this right. That was a
 * UI-only gate until now: POST /api/trips carried requireAuth alone, so any logged-in user of any
 * role could create a trip with a direct API call.
 */
async function canCreateTrip(role: string): Promise<boolean> {
  if (role === 'super_admin') return true
  const result = await pool.query(
    `SELECT working_hours->'planner_permissions'->>'can_create_trip' AS flag
     FROM tenants WHERE id = $1`,
    [DEFAULT_TENANT_ID]
  )
  return result.rows[0]?.flag !== 'false'
}

// GET /api/trips — category (import|export), serviceType (collection|delivery|dehire), search,
// sort, stage (planned|assigned|in_progress|completed — the FRD's "Filter" control on the Planner
// Trips page), allocationStatus (pending|allocated — derived, used by Allocator's Trip Allocation)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    await autoAllocatePendingTrips(DEFAULT_TENANT_ID)
    const { category, serviceType, milestone, search, sort, stage, excludeCompleted, allocationStatus, vesselId } = req.query
    const conditions: string[] = ['tenant_id = $1']
    const params: unknown[] = [DEFAULT_TENANT_ID]
    let i = 2

    if (category)    { conditions.push(`service_category = $${i++}`); params.push(category) }
    if (serviceType) { conditions.push(`service_type = $${i++}`); params.push(serviceType) }
    if (stage)       { conditions.push(`stage = $${i++}`); params.push(stage) }

    // Import secondary tabs (FRD 2.4.2.2) — slotted / discharged / arriving. These describe where
    // the trip's VESSEL is, not what kind of job the trip is, so they resolve through vessel_id.
    //
    // Derived from vessel status rather than the milestone timestamps alone: slotted_at and
    // discharged_at exist (migration 041) but nothing writes them yet, so a strict reading would
    // leave two tabs permanently empty. Status is real data today, and once the timestamps start
    // being written the discharged rule below already prefers them.
    //
    // EXISTS rather than a join: SELECT * would otherwise pull vessel columns into the row and
    // collide with the trip's own status/created_at.
    if (milestone) {
      const MILESTONE_SQL: Record<string, string> = {
        arriving:   `v.status IN ('scheduled','in_transit')`,
        slotted:    `v.status = 'arrived' AND v.discharged_at IS NULL`,
        discharged: `v.discharged_at IS NOT NULL`,
      }
      const clause = MILESTONE_SQL[String(milestone)]
      if (!clause) {
        return res.status(400).json({ success: false, error: { message: 'Invalid milestone' } })
      }
      // A trip with no vessel attached belongs to no milestone — it still shows under All Requests.
      conditions.push(`EXISTS (SELECT 1 FROM vessels v WHERE v.id = trips.vessel_id AND ${clause})`)
    }
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
  if (denyUnlessRole(req, res, TRIP_CREATE_ROLES)) return
  try {
    if (!(await canCreateTrip(req.user!.role))) {
      return res.status(403).json({ success: false, error: { message: 'You do not have permission to create a trip' } })
    }
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
  // Staff-only and tenant-scoped. This previously carried requireAuth alone with an unscoped
  // UPDATE, so any authenticated account — a customer, a compliance officer — could advance any
  // trip in any tenant to any stage knowing only its UUID.
  if (denyUnlessRole(req, res, TRIP_STAGE_ROLES)) return

  const { stage } = req.body as { stage?: string }
  const VALID = ['planned', 'assigned', 'in_progress', 'completed']
  if (!stage || !VALID.includes(stage)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid stage' } })
  }
  try {
    const result = await pool.query(
      `UPDATE trips SET stage = $1, updated_at = NOW()
       WHERE (id::text = $2 OR trip_ref = $2) AND tenant_id = $3 RETURNING *`,
      [stage, req.params.id, DEFAULT_TENANT_ID]
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

// PATCH /api/trips/:id — planner edits a trip's core booking fields (the ones shown on the Trips
// list card). Refused once the trip is `completed`: the record is then history and the allocator
// module's reports read it. Operational fields (time to reach, weight, hazardous, custom field)
// stay on /:id/details, which the Allocator owns; vehicle/driver also have /:id/assign, kept for
// the allocator's assign flow.
const TRIP_EDITABLE_COLUMNS = [
  'container_number', 'vessel_id', 'vessel_name', 'trip_date', 'vehicle', 'driver',
] as const

const tripSnakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase())

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>
  try {
    const existing = await pool.query(
      `SELECT id, stage FROM trips WHERE (id::text = $1 OR trip_ref = $1) AND tenant_id = $2 LIMIT 1`,
      [req.params.id, DEFAULT_TENANT_ID]
    )
    const trip = existing.rows[0]
    if (!trip) return res.status(404).json({ success: false, error: { message: 'Not found' } })
    if (trip.stage === 'completed') {
      return res.status(409).json({ success: false, error: { message: 'This trip is completed and can no longer be edited.' } })
    }

    const sets: string[] = []
    const params: unknown[] = []
    let i = 1

    for (const col of TRIP_EDITABLE_COLUMNS) {
      const camel = tripSnakeToCamel(col)
      if (!(col in b) && !(camel in b)) continue
      const raw = (b[col] ?? b[camel]) as unknown
      sets.push(`${col} = $${i++}`)
      params.push(raw === '' || raw === undefined ? null : raw)
    }

    // OOG is a flag plus three dimensions — clearing the flag clears the dimensions.
    if ('is_oog' in b || 'isOOG' in b) {
      const isOOG = !!(b.is_oog ?? b.isOOG)
      sets.push(`is_oog = $${i++}`); params.push(isOOG)
      for (const dim of ['oog_length', 'oog_width', 'oog_height'] as const) {
        const raw = (b[dim] ?? b[tripSnakeToCamel(dim)]) as unknown
        sets.push(`${dim} = $${i++}`)
        params.push(isOOG ? (raw || null) : null)
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, error: { message: 'No editable fields supplied' } })
    }

    params.push(trip.id, DEFAULT_TENANT_ID)
    const result = await pool.query(
      `UPDATE trips SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${i} AND tenant_id = $${i + 1} AND stage <> 'completed' RETURNING *`,
      params
    )
    // stage is re-checked in the UPDATE so a concurrent completion can't be overwritten between
    // the SELECT above and the write.
    if (!result.rows[0]) {
      return res.status(409).json({ success: false, error: { message: 'This trip was just completed and can no longer be edited.' } })
    }
    return res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[trips PATCH /:id]', err)
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
    let truckRego:  string | null = null

    // Resource Conflict Alerts (Allocator Settings → Notifications): a resource being (re)assigned
    // here that's already committed elsewhere is a scheduling conflict — block it and notify.
    if (nextTruckId && nextTruckId !== prevTruckId) {
      const t = await client.query(`SELECT resource_code, vehicle_registration, status FROM trucks WHERE id = $1`, [nextTruckId])
      if (!t.rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, error: { message: 'Truck not found' } }) }
      if (t.rows[0].status !== 'available') {
        await client.query('ROLLBACK')
        await notifyRoleIfEnabled('allocator', DEFAULT_TENANT_ID, 'resource_conflict',
          'Resource conflict', `Truck ${t.rows[0].resource_code} was already ${t.rows[0].status.replace('_', ' ')} when allocation to Trip #${trip.trip_ref} was attempted.`,
          userId => allocatorToggleEnabled(userId, 'resource_conflict_alerts'))
        return res.status(409).json({ success: false, error: { message: `Truck ${t.rows[0].resource_code} is already ${t.rows[0].status.replace('_', ' ')}` } })
      }
      truckCode = t.rows[0].resource_code
      truckRego = t.rows[0].vehicle_registration ?? null
    } else if (nextTruckId) {
      const t = await client.query(`SELECT resource_code, vehicle_registration FROM trucks WHERE id = $1`, [nextTruckId])
      truckCode = t.rows[0]?.resource_code ?? null
      truckRego = t.rows[0]?.vehicle_registration ?? null
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
         -- Cleared outright when the truck is unallocated, so a stale plate never outlives the
         -- allocation that put it there.
         vehicle_rego = CASE WHEN $1 IS NULL THEN NULL ELSE COALESCE($6, vehicle_rego) END,
         stage = CASE WHEN stage = 'planned' AND $1 IS NOT NULL AND $3 IS NOT NULL THEN 'assigned' ELSE stage END,
         updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [nextTruckId ?? null, nextTrailerId ?? null, nextDriverId ?? null, truckCode, driverName, truckRego, req.params.id]
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
