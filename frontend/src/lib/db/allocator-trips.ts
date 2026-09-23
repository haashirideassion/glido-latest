import { fetcher, patchFetcher } from '../fetcher'
import type { AllocatorTrip, AllocationStatus } from '@/data/types'

const BASE = '/api/trips'

function rowToAllocatorTrip(row: any): AllocatorTrip {
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
    tenantId:        row.tenant_id,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
    priority:        row.priority ?? 'medium',
    origin:          row.origin ?? undefined,
    destination:     row.destination ?? undefined,
    timeWindowStart: row.time_window_start ?? undefined,
    timeWindowEnd:   row.time_window_end ?? undefined,
    truckId:         row.truck_id ?? null,
    trailerId:       row.trailer_id ?? null,
    driverId:        row.driver_id ?? null,
    allocationStatus: (row.truck_id && row.driver_id) ? 'allocated' : 'pending',
    timeToReach:     row.time_to_reach ?? undefined,
    timeToComplete:  row.time_to_complete ?? undefined,
    isHazardous:     !!row.is_hazardous,
    weight:          row.weight ?? undefined,
    isOOG:           !!row.is_oog,
    oogLength:       row.oog_length ?? undefined,
    oogWidth:        row.oog_width ?? undefined,
    oogHeight:       row.oog_height ?? undefined,
    customFieldValue: row.custom_field_value ?? undefined,
  }
}

export interface AllocatorTripListParams {
  search?: string
  sort?: 'newest' | 'oldest' | 'trip_ref'
  allocationStatus?: AllocationStatus
  stage?: 'planned' | 'assigned' | 'in_progress' | 'completed'
  serviceType?: 'collection' | 'delivery' | 'dehire'
}

export async function getAllocatorTrips(params: AllocatorTripListParams = {}): Promise<AllocatorTrip[]> {
  const qs = new URLSearchParams()
  if (params.search)           qs.set('search', params.search)
  if (params.sort)              qs.set('sort', params.sort)
  if (params.allocationStatus)  qs.set('allocationStatus', params.allocationStatus)
  if (params.stage)              qs.set('stage', params.stage)
  if (params.serviceType)        qs.set('serviceType', params.serviceType)
  const query = qs.toString()
  const res = await fetcher(`${BASE}${query ? `?${query}` : ''}`)
  return (res?.data ?? []).map(rowToAllocatorTrip)
}

export async function getAllocatorTrip(idOrRef: string): Promise<AllocatorTrip | null> {
  const res = await fetcher(`${BASE}/${idOrRef}`)
  return res?.data ? rowToAllocatorTrip(res.data) : null
}

export interface AllocateResourcesPayload {
  truck_id?: string | null
  trailer_id?: string | null
  driver_id?: string | null
}

export async function allocateResources(id: string, payload: AllocateResourcesPayload): Promise<AllocatorTrip | null> {
  const res = await patchFetcher(`${BASE}/${id}/allocate`, payload)
  return res?.data ? rowToAllocatorTrip(res.data) : null
}

export interface TripDetailsPayload {
  time_to_reach?: string
  time_to_complete?: string
  is_hazardous?: boolean
  weight?: string
  is_oog?: boolean
  oog_length?: string
  oog_width?: string
  oog_height?: string
  custom_field_value?: string
}

export async function updateTripDetails(id: string, payload: TripDetailsPayload): Promise<AllocatorTrip | null> {
  const res = await patchFetcher(`${BASE}/${id}/details`, payload)
  return res?.data ? rowToAllocatorTrip(res.data) : null
}
