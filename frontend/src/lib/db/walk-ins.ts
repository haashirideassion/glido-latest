import { fetcher, postFetcher, patchFetcher } from '../fetcher'
import type { WalkIn, WalkInPurpose } from '../../data/types'

const BASE = '/api/walk-ins'

function rowToWalkIn(row: any): WalkIn {
  return {
    id:                  row.id,
    tenantId:            row.tenant_id,
    purpose:             row.purpose              as WalkInPurpose,
    visitorName:         row.visitor_name,
    contactNumber:       row.contact_number       ?? undefined,
    personBeingVisited:  row.person_being_visited  ?? undefined,
    reason:              row.reason               ?? undefined,
    arrivedAt:           row.arrived_at,
    licenceCaptured:     row.licence_captured,
    dismissed:           row.dismissed,
    dismissedAt:         row.dismissed_at         ?? undefined,
  }
}

export async function getActiveWalkIns(tenantId: string): Promise<WalkIn[]> {
  const res = await fetcher(`${BASE}?tenantId=${encodeURIComponent(tenantId)}&active=true`)
  return (res?.data ?? []).map(rowToWalkIn)
}

export async function getAllWalkIns(tenantId: string): Promise<WalkIn[]> {
  const res = await fetcher(`${BASE}?tenantId=${encodeURIComponent(tenantId)}`)
  return (res?.data ?? []).map(rowToWalkIn)
}

export interface CreateWalkInInput {
  tenantId:            string
  purpose:             WalkInPurpose
  visitorName:         string
  contactNumber?:      string
  personBeingVisited?: string
  reason?:             string
  licenceCaptured?:    boolean
}

export async function createWalkIn(input: CreateWalkInInput): Promise<WalkIn> {
  const res = await postFetcher(BASE, {
    tenant_id:            input.tenantId,
    purpose:              input.purpose,
    visitor_name:         input.visitorName,
    contact_number:       input.contactNumber      ?? null,
    person_being_visited: input.personBeingVisited  ?? null,
    reason:               input.reason             ?? null,
    licence_captured:     input.licenceCaptured    ?? false,
  })
  return rowToWalkIn(res.data)
}

export async function dismissWalkIn(id: string): Promise<void> {
  await patchFetcher(`${BASE}/${id}`, {
    dismissed: true,
    dismissed_at: new Date().toISOString(),
  })
}

export async function getTodayWalkInCount(tenantId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const res = await fetcher(`/api/checkin-records?tenantId=${encodeURIComponent(tenantId)}`)
  return (res?.data ?? []).filter(
    (r: any) => r.is_walk_in && r.check_in_time?.startsWith(today),
  ).length
}

export async function getVisitorLogRecords(params: {
  tenantId: string
  from?: string
  to?: string
  status?: string
  search?: string
}) {
  const qp = new URLSearchParams({ tenantId: params.tenantId })
  if (params.from) qp.set('from', params.from)
  if (params.to)   qp.set('to',   params.to)
  const res = await fetcher(`/api/checkin-records?${qp.toString()}`)
  let records = (res?.data ?? []) as any[]

  if (params.search) {
    const s = params.search.toLowerCase()
    records = records.filter(
      (r) =>
        (r.licence_name         ?? '').toLowerCase().includes(s) ||
        (r.licence_number       ?? '').toLowerCase().includes(s) ||
        (r.visit_person_name    ?? '').toLowerCase().includes(s),
    )
  }

  return records
}
