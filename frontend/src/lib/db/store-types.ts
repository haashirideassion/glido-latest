import { fetcher, postFetcher, patchFetcher, deleteFetcher } from '@/lib/fetcher'

const BASE = '/api/store-types'

export interface StoreType {
  id: string
  name: string
  active: boolean
}

export async function getStoreTypes(tenantId: string, activeOnly = false): Promise<StoreType[]> {
  const params = new URLSearchParams({ tenantId })
  if (activeOnly) params.set('activeOnly', 'true')
  const res = await fetcher(`${BASE}?${params.toString()}`)
  return res?.data ?? []
}

export async function addStoreType(tenantId: string, name: string): Promise<StoreType | undefined> {
  const res = await postFetcher(BASE, { tenant_id: tenantId, name })
  return res?.data
}

export async function updateStoreType(id: string, changes: { name?: string; active?: boolean }): Promise<StoreType | undefined> {
  const res = await patchFetcher(`${BASE}/${id}`, changes)
  return res?.data
}

export async function deleteStoreType(id: string): Promise<void> {
  await deleteFetcher(`${BASE}/${id}`)
}
