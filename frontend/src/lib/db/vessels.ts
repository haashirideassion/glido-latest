import { fetcher, postFetcher, patchFetcher } from '../fetcher'
import type { Vessel, VesselStatus } from '@/data/types'

const BASE = '/api/vessels'

function rowToVessel(row: any): Vessel {
  return {
    id:             row.id,
    vesselName:     row.vessel_name,
    vesselCode:     row.vessel_code,
    eta:            row.eta ?? undefined,
    port:           row.port ?? undefined,
    status:         row.status,
    containerCount: Number(row.container_count ?? 0),
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
  vessel_code?: string
  eta?: string
  port?: string
  status?: VesselStatus
  container_count?: number
}

export async function createVessel(payload: CreateVesselPayload): Promise<Vessel | null> {
  const res = await postFetcher(BASE, payload)
  return res?.data ? rowToVessel(res.data) : null
}

export async function setVesselStatus(id: string, status: VesselStatus): Promise<Vessel | null> {
  const res = await patchFetcher(`${BASE}/${id}/status`, { status })
  return res?.data ? rowToVessel(res.data) : null
}
