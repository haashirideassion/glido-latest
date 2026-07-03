import { fetcher, postFetcher, patchFetcher } from '@/lib/fetcher'

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

export interface SavedDriver {
  id: string
  name: string
  phone: string
  vehicle_registration: string
  blocked?: boolean
  block_reason?: string
}

export async function fetchSavedDrivers(): Promise<SavedDriver[]> {
  const res = await fetcher(`/api/saved-drivers?tenantId=${DEFAULT_TENANT_ID}`)
  return res?.data ?? []
}

export async function upsertSavedDriver(d: Omit<SavedDriver, 'id'>) {
  await postFetcher('/api/saved-drivers', { tenant_id: DEFAULT_TENANT_ID, ...d })
}

export async function blockDriver(driverId: string, reason: string): Promise<void> {
  await patchFetcher(`/api/saved-drivers/${driverId}/block`, { blocked: true, block_reason: reason })
}

export async function unblockDriver(driverId: string): Promise<void> {
  await patchFetcher(`/api/saved-drivers/${driverId}/block`, { blocked: false, block_reason: '' })
}

/** Find a driver by name (case-insensitive) and block them.
 *  Used from BookingDetailPage where we only have driverName, not an id. */
export async function blockDriverByName(driverName: string, reason: string): Promise<void> {
  const drivers = await fetchSavedDrivers()
  const match = drivers.find(d => d.name.toLowerCase() === driverName.toLowerCase())
  if (match) {
    await blockDriver(match.id, reason)
  } else {
    // Driver not in saved list — create a minimal record and block it immediately
    const created = await postFetcher('/api/saved-drivers', {
      tenant_id: DEFAULT_TENANT_ID,
      name: driverName,
      phone: '',
      vehicle_registration: '',
    })
    const newId: string = created?.data?.id ?? created?.id
    if (newId) await blockDriver(newId, reason)
  }
}
