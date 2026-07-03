import { fetcher, patchFetcher } from '../fetcher'

const BASE = '/api/tenants'

export interface WorkingHours {
  mon: { open: string; close: string; enabled: boolean }
  tue: { open: string; close: string; enabled: boolean }
  wed: { open: string; close: string; enabled: boolean }
  thu: { open: string; close: string; enabled: boolean }
  fri: { open: string; close: string; enabled: boolean }
  sat: { open: string; close: string; enabled: boolean }
  sun: { open: string; close: string; enabled: boolean }
}

// Keep broad types — schema is managed by the backend
export type TenantRow = Record<string, any>
export type TenantUpdate = Record<string, any>

export async function getTenant(id: string): Promise<TenantRow | undefined> {
  const res = await fetcher(`${BASE}/${id}`)
  return res?.data ?? undefined
}

export async function updateTenant(id: string, updates: TenantUpdate): Promise<TenantRow> {
  const res = await patchFetcher(`${BASE}/${id}`, updates)
  return res?.data
}

export function getWorkingHours(tenant: TenantRow): WorkingHours {
  return tenant?.working_hours as unknown as WorkingHours
}
