import { fetcher, postFetcher, patchFetcher, deleteFetcher } from '@/lib/fetcher'

const BASE = '/api/visitable-persons'

export interface VisitablePerson {
  id: string
  name: string
  active: boolean
}

export async function getVisitablePersons(tenantId: string, activeOnly = false): Promise<VisitablePerson[]> {
  const res = await fetcher(`${BASE}?tenantId=${encodeURIComponent(tenantId)}${activeOnly ? '&activeOnly=true' : ''}`)
  return res?.data ?? []
}

export async function addVisitablePerson(tenantId: string, name: string): Promise<VisitablePerson | undefined> {
  const res = await postFetcher(BASE, { tenant_id: tenantId, name })
  return res?.data
}

export async function updateVisitablePerson(id: string, changes: { name?: string; active?: boolean }): Promise<VisitablePerson | undefined> {
  const res = await patchFetcher(`${BASE}/${id}`, changes)
  return res?.data
}

export async function deleteVisitablePerson(id: string): Promise<void> {
  await deleteFetcher(`${BASE}/${id}`)
}
