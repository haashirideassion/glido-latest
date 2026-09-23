import { fetcher, postFetcher, patchFetcher } from '../fetcher'
import type { Trip, TripCategory, TripServiceType, TripStage } from '@/data/types'

const BASE = '/api/trips'

function rowToTrip(row: any): Trip {
  return {
    id:              row.id,
    tripRef:         row.trip_ref,
    serviceCategory: row.service_category,
    serviceType:     row.service_type,
    containerNumber: row.container_number ?? undefined,
    vesselId:        row.vessel_id ?? undefined,
    vesselName:      row.vessel_name ?? undefined,
    tripDate:        row.trip_date ?? undefined,
    vehicle:         row.vehicle ?? undefined,
    driver:          row.driver ?? undefined,
    stage:           row.stage,
    // Set by the Allocator, displayed on the Planner Trips card. These were missing from the
    // mapper, so Haz read "No" and Weight read "—" on every trip whatever the stored value.
    isHazardous:     !!row.is_hazardous,
    weight:          row.weight ?? undefined,
    vehicleRego:     row.vehicle_rego ?? undefined,
    isOOG:           !!row.is_oog,
    oogLength:       row.oog_length ?? undefined,
    oogWidth:        row.oog_width ?? undefined,
    oogHeight:       row.oog_height ?? undefined,
    tenantId:        row.tenant_id,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  }
}

/** Import secondary tabs — where the trip's vessel is, as opposed to what kind of job it is. */
export type TripMilestone = 'slotted' | 'discharged' | 'arriving'

export interface TripListParams {
  category?: TripCategory
  serviceType?: TripServiceType
  milestone?: TripMilestone
  search?: string
  sort?: 'newest' | 'oldest' | 'trip_ref'
  stage?: TripStage
  excludeCompleted?: boolean
  vesselId?: string
}

export async function getTrips(params: TripListParams = {}): Promise<Trip[]> {
  const qs = new URLSearchParams()
  if (params.category)    qs.set('category', params.category)
  if (params.serviceType) qs.set('serviceType', params.serviceType)
  if (params.milestone)   qs.set('milestone', params.milestone)
  if (params.search)      qs.set('search', params.search)
  if (params.sort)        qs.set('sort', params.sort)
  if (params.stage)       qs.set('stage', params.stage)
  if (params.excludeCompleted) qs.set('excludeCompleted', 'true')
  if (params.vesselId)    qs.set('vesselId', params.vesselId)
  const query = qs.toString()
  const res = await fetcher(`${BASE}${query ? `?${query}` : ''}`)
  return (res?.data ?? []).map(rowToTrip)
}

export async function getTrip(idOrRef: string): Promise<Trip | null> {
  const res = await fetcher(`${BASE}/${idOrRef}`)
  return res?.data ? rowToTrip(res.data) : null
}

export interface CreateTripPayload {
  service_category: TripCategory
  service_type: TripServiceType
  container_number?: string
  vessel_id?: string
  vessel_name?: string
  trip_date?: string
  // vehicle/driver are not set at creation — they mirror a real truck and driver, written when
  // the Allocator allocates the trip.
}

export async function createTrip(payload: CreateTripPayload): Promise<Trip | null> {
  const res = await postFetcher(BASE, payload)
  return res?.data ? rowToTrip(res.data) : null
}

// Core booking fields a planner may correct while the trip is not yet completed.
export interface UpdateTripPayload {
  container_number?: string | null
  vessel_id?: string | null
  vessel_name?: string | null
  trip_date?: string | null
  vehicle?: string | null
  driver?: string | null
  is_oog?: boolean
  oog_length?: string | null
  oog_width?: string | null
  oog_height?: string | null
}

export async function updateTrip(idOrRef: string, payload: UpdateTripPayload): Promise<Trip | null> {
  const res = await patchFetcher(`${BASE}/${idOrRef}`, payload)
  return res?.data ? rowToTrip(res.data) : null
}

export async function setTripStage(id: string, stage: TripStage): Promise<Trip | null> {
  const res = await patchFetcher(`${BASE}/${id}/stage`, { stage })
  return res?.data ? rowToTrip(res.data) : null
}

export async function assignTrip(id: string, vehicle?: string, driver?: string): Promise<Trip | null> {
  const res = await patchFetcher(`${BASE}/${id}/assign`, { vehicle, driver })
  return res?.data ? rowToTrip(res.data) : null
}
