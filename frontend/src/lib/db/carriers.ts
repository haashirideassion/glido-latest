import { fetcher, patchFetcher } from '../fetcher'

// Carriers are derived from visitor accounts (every registered customer shows up here
// automatically) — there is no manual create/delete, only editing reception-only extras
// (ABN, address, notes, rating, active/inactive) plus the account's own contact fields.
export interface Carrier {
  id: string
  tenant_id: string
  name: string
  abn: string | null
  status: 'active' | 'inactive'
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  notes: string | null
  total_bookings: number
  last_visit: string | null   // ISO date string
  rating: number | null
  created_at: string
  updated_at: string
}

// contact_email is excluded — it's the account's login and isn't editable here
export type CarrierInput = Omit<Carrier, 'id' | 'tenant_id' | 'contact_email' | 'created_at' | 'updated_at'>

const BASE = '/api/carriers'

export async function getCarriers(params?: { search?: string; status?: string }): Promise<Carrier[]> {
  const qs = new URLSearchParams()
  if (params?.search) qs.set('search', params.search)
  if (params?.status && params.status !== 'all') qs.set('status', params.status)
  const url = qs.toString() ? `${BASE}?${qs}` : BASE
  const res = await fetcher(url)
  return res?.data ?? []
}

export async function updateCarrier(id: string, input: Partial<CarrierInput>): Promise<Carrier> {
  const res = await patchFetcher(`${BASE}/${id}`, input)
  return res?.data
}

// A driver this carrier has actually used — derived from their booking history, not a
// per-carrier roster (saved_drivers has no account link; blocking is tenant-wide).
export interface CarrierDriver {
  driver_name: string
  driver_phone: string | null
  vehicle_registration: string | null
  trips: number
  last_trip: string | null
  saved_driver_id: string | null   // null if this driver has never been saved/blocked before
  blocked: boolean
  block_reason: string | null
}

export async function getCarrierDrivers(carrierId: string): Promise<CarrierDriver[]> {
  const res = await fetcher(`${BASE}/${carrierId}/drivers`)
  return res?.data ?? []
}
