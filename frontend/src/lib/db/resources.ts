import { fetcher, postFetcher, patchFetcher } from '../fetcher'
import type { Truck, Trailer, Driver, ResourceStatus, DriverStatus } from '@/data/types'

const BASE = '/api/resources'

function rowToTruck(row: any): Truck {
  return {
    id: row.id, resourceCode: row.resource_code, truckType: row.truck_type ?? undefined,
    capacity: row.capacity ?? undefined, location: row.location ?? undefined, status: row.status,
    lastServiceDate: row.last_service_date ?? undefined, customFieldValue: row.custom_field_value ?? undefined,
    assignedTrailer: row.assignedTrailer ? rowToTrailer(row.assignedTrailer) : (row.assignedTrailer === null ? null : undefined),
    assignedDriver: row.assignedDriver ? rowToDriver(row.assignedDriver) : (row.assignedDriver === null ? null : undefined),
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}
function rowToTrailer(row: any): Trailer {
  return {
    id: row.id, resourceCode: row.resource_code, trailerType: row.trailer_type ?? undefined,
    capacity: row.capacity ?? undefined, attachedTruckId: row.attached_truck_id ?? null, status: row.status,
    lastServiceDate: row.last_service_date ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}
function rowToDriver(row: any): Driver {
  return {
    id: row.id, resourceCode: row.resource_code, driverName: row.driver_name,
    licenseClass: row.license_class ?? undefined, experienceYears: row.experience_years ?? undefined,
    assignedTruckId: row.assigned_truck_id ?? null, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export type CombinedResource =
  | ({ resourceType: 'truck' } & Truck)
  | ({ resourceType: 'trailer' } & Trailer)
  | ({ resourceType: 'driver' } & Driver)

export async function getAllResources(params: { search?: string; status?: string } = {}): Promise<CombinedResource[]> {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  if (params.status) qs.set('status', params.status)
  const query = qs.toString()
  const res = await fetcher(`${BASE}${query ? `?${query}` : ''}`)
  return (res?.data ?? []).map((row: any) => {
    if (row.resource_type === 'driver') return { resourceType: 'driver', ...rowToDriver(row) }
    if (row.resource_type === 'trailer') return { resourceType: 'trailer', ...rowToTrailer(row) }
    return { resourceType: 'truck', ...rowToTruck(row) }
  })
}

export async function getTrucks(params: { search?: string; status?: string } = {}): Promise<Truck[]> {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  if (params.status) qs.set('status', params.status)
  const query = qs.toString()
  const res = await fetcher(`${BASE}/trucks${query ? `?${query}` : ''}`)
  return (res?.data ?? []).map(rowToTruck)
}
export async function getTruck(idOrCode: string): Promise<Truck | null> {
  const res = await fetcher(`${BASE}/trucks/${idOrCode}`)
  return res?.data ? rowToTruck(res.data) : null
}
export interface CreateTruckPayload { resource_code?: string; truck_type?: string; capacity?: string; location?: string; last_service_date?: string; custom_field_value?: string }
export async function createTruck(payload: CreateTruckPayload): Promise<Truck | null> {
  const res = await postFetcher(`${BASE}/trucks`, payload)
  return res?.data ? rowToTruck(res.data) : null
}
export async function setTruckStatus(id: string, status: ResourceStatus): Promise<Truck | null> {
  const res = await patchFetcher(`${BASE}/trucks/${id}/status`, { status })
  return res?.data ? rowToTruck(res.data) : null
}
export interface UpdateTruckPayload { truck_type?: string; capacity?: string; location?: string; status?: ResourceStatus; last_service_date?: string; custom_field_value?: string }
export async function updateTruck(id: string, payload: UpdateTruckPayload): Promise<Truck | null> {
  const res = await patchFetcher(`${BASE}/trucks/${id}`, payload)
  return res?.data ? rowToTruck(res.data) : null
}
export async function assignTruckResources(id: string, payload: { trailerId?: string | null; driverId?: string | null }): Promise<Truck | null> {
  const res = await patchFetcher(`${BASE}/trucks/${id}/assign`, { trailer_id: payload.trailerId, driver_id: payload.driverId })
  return res?.data ? rowToTruck(res.data) : null
}

export async function getTrailers(params: { search?: string; status?: string } = {}): Promise<Trailer[]> {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  if (params.status) qs.set('status', params.status)
  const query = qs.toString()
  const res = await fetcher(`${BASE}/trailers${query ? `?${query}` : ''}`)
  return (res?.data ?? []).map(rowToTrailer)
}
export async function getTrailer(idOrCode: string): Promise<Trailer | null> {
  const res = await fetcher(`${BASE}/trailers/${idOrCode}`)
  return res?.data ? rowToTrailer(res.data) : null
}
export interface CreateTrailerPayload { resource_code?: string; trailer_type?: string; capacity?: string; attached_truck_id?: string; last_service_date?: string }
export async function createTrailer(payload: CreateTrailerPayload): Promise<Trailer | null> {
  const res = await postFetcher(`${BASE}/trailers`, payload)
  return res?.data ? rowToTrailer(res.data) : null
}
export async function setTrailerStatus(id: string, status: ResourceStatus): Promise<Trailer | null> {
  const res = await patchFetcher(`${BASE}/trailers/${id}/status`, { status })
  return res?.data ? rowToTrailer(res.data) : null
}
export interface UpdateTrailerPayload { trailer_type?: string; capacity?: string; attached_truck_id?: string; status?: ResourceStatus; last_service_date?: string }
export async function updateTrailer(id: string, payload: UpdateTrailerPayload): Promise<Trailer | null> {
  const res = await patchFetcher(`${BASE}/trailers/${id}`, payload)
  return res?.data ? rowToTrailer(res.data) : null
}

export async function getDrivers(params: { search?: string; status?: string } = {}): Promise<Driver[]> {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  if (params.status) qs.set('status', params.status)
  const query = qs.toString()
  const res = await fetcher(`${BASE}/drivers${query ? `?${query}` : ''}`)
  return (res?.data ?? []).map(rowToDriver)
}
export async function getDriver(idOrCode: string): Promise<Driver | null> {
  const res = await fetcher(`${BASE}/drivers/${idOrCode}`)
  return res?.data ? rowToDriver(res.data) : null
}
export interface CreateDriverPayload { resource_code?: string; driver_name: string; license_class?: string; experience_years?: number; assigned_truck_id?: string; status?: DriverStatus }
export async function createDriver(payload: CreateDriverPayload): Promise<Driver | null> {
  const res = await postFetcher(`${BASE}/drivers`, payload)
  return res?.data ? rowToDriver(res.data) : null
}
export async function setDriverStatus(id: string, status: DriverStatus): Promise<Driver | null> {
  const res = await patchFetcher(`${BASE}/drivers/${id}/status`, { status })
  return res?.data ? rowToDriver(res.data) : null
}
export interface UpdateDriverPayload { driver_name?: string; license_class?: string; experience_years?: number; assigned_truck_id?: string; status?: DriverStatus }
export async function updateDriver(id: string, payload: UpdateDriverPayload): Promise<Driver | null> {
  const res = await patchFetcher(`${BASE}/drivers/${id}`, payload)
  return res?.data ? rowToDriver(res.data) : null
}
