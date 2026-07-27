import { fetcher, postFetcher, patchFetcher, deleteFetcher } from '@/lib/fetcher'

const BASE = '/api/visit-reasons'

export type VisitReasonCategory = 'office' | 'yard'

export interface VisitReason {
  id: string
  category: VisitReasonCategory
  name: string
  active: boolean
}

export async function getVisitReasons(tenantId: string, category?: VisitReasonCategory, activeOnly = false): Promise<VisitReason[]> {
  const params = new URLSearchParams({ tenantId })
  if (category) params.set('category', category)
  if (activeOnly) params.set('activeOnly', 'true')
  const res = await fetcher(`${BASE}?${params.toString()}`)
  return res?.data ?? []
}

export async function addVisitReason(tenantId: string, category: VisitReasonCategory, name: string): Promise<VisitReason | undefined> {
  const res = await postFetcher(BASE, { tenant_id: tenantId, category, name })
  return res?.data
}

export async function updateVisitReason(id: string, changes: { name?: string; active?: boolean }): Promise<VisitReason | undefined> {
  const res = await patchFetcher(`${BASE}/${id}`, changes)
  return res?.data
}

export async function deleteVisitReason(id: string): Promise<void> {
  await deleteFetcher(`${BASE}/${id}`)
}
