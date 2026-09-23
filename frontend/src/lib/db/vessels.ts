import { fetcher, postFetcher, patchFetcher } from '../fetcher'
import type { Vessel, VesselStatus } from '@/data/types'

const BASE = '/api/vessels'

function rowToVessel(row: any): Vessel {
  return {
    id:             row.id,
    vesselName:     row.vessel_name,
    vesselCode:     row.vessel_code,
    eta:            row.eta ?? undefined,
    etd:            row.etd ?? undefined,
    port:           row.port ?? undefined,
    status:         row.status,
    containerCount: Number(row.container_count ?? 0),
    capacity:       row.capacity == null ? undefined : Number(row.capacity),
    voyageNumber:   row.voyage_number ?? undefined,
    lloydNumber:    row.lloyd_number ?? undefined,
    slottedAt:      row.slotted_at ?? undefined,
    dischargedAt:   row.discharged_at ?? undefined,
    tenantId:       row.tenant_id,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
  }
}

export interface VesselListParams {
  search?: string
  status?: VesselStatus
}

export async function getVessels(params: VesselListParams = {}): Promise<Vessel[]> {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  if (params.status) qs.set('status', params.status)
  const query = qs.toString()
  const res = await fetcher(`${BASE}${query ? `?${query}` : ''}`)
  return (res?.data ?? []).map(rowToVessel)
}

export async function getVessel(idOrCode: string): Promise<Vessel | null> {
  const res = await fetcher(`${BASE}/${idOrCode}`)
  return res?.data ? rowToVessel(res.data) : null
}

export interface CreateVesselPayload {
  vessel_name: string
  /** Optional — the server allocates a unique VSL-###### code when this is omitted. */
  vessel_code?: string
  eta?: string
  etd?: string
  port?: string
  status?: VesselStatus
  capacity?: number
  voyage_number?: string
  lloyd_number?: string
  slotted_at?: string
  discharged_at?: string
}

export async function createVessel(payload: CreateVesselPayload): Promise<Vessel | null> {
  const res = await postFetcher(BASE, payload)
  return res?.data ? rowToVessel(res.data) : null
}

export async function setVesselStatus(id: string, status: VesselStatus): Promise<Vessel | null> {
  const res = await patchFetcher(`${BASE}/${id}/status`, { status })
  return res?.data ? rowToVessel(res.data) : null
}
