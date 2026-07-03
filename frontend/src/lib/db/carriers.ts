import { fetcher, postFetcher, patchFetcher, deleteFetcher } from '../fetcher'

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

export type CarrierInput = Omit<Carrier, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>

const BASE = '/api/carriers'

export async function getCarriers(params?: { search?: string; status?: string }): Promise<Carrier[]> {
  const qs = new URLSearchParams()
  if (params?.search) qs.set('search', params.search)
  if (params?.status && params.status !== 'all') qs.set('status', params.status)
  const url = qs.toString() ? `${BASE}?${qs}` : BASE
  const res = await fetcher(url)
  return res?.data ?? []
}

export async function createCarrier(input: CarrierInput): Promise<Carrier> {
  const res = await postFetcher(BASE, input)
  return res?.data
}

export async function updateCarrier(id: string, input: Partial<CarrierInput>): Promise<Carrier> {
  const res = await patchFetcher(`${BASE}/${id}`, input)
  return res?.data
}

export async function deleteCarrier(id: string): Promise<void> {
  await deleteFetcher(`${BASE}/${id}`)
}
