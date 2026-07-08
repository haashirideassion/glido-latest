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

/** Edit a saved driver's own info (name, phone, vehicle registration) — used from the
 *  visitor-facing "My Saved Drivers" page. */
export async function updateSavedDriver(
  driverId: string,
  fields: Partial<Pick<SavedDriver, 'name' | 'phone' | 'vehicle_registration'>>,
): Promise<SavedDriver> {
  const res = await patchFetcher(`/api/saved-drivers/${driverId}`, fields)
  return res?.data
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
    // Driver not in saved list — create a minimal record and block it immediately.
    // NOTE: blank vehicle_registration collides with any other blank-rego driver under the
    // table's UNIQUE(tenant_id, vehicle_registration) constraint (ON CONFLICT would silently
    // rename an unrelated driver's row). Prefer blockKnownDriver below when the real phone/rego
    // is already known (e.g. from booking history) — this path is a last resort.
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

/** Block a driver we already have real details for (e.g. derived from their booking
 *  history on the Carriers page) — creates their saved_drivers record with the actual
 *  phone/vehicle registration instead of a blank one, avoiding the unique-constraint
 *  collision blockDriverByName's fallback can hit. */
export async function blockKnownDriver(
  driver: { name: string; phone?: string | null; vehicle_registration?: string | null; saved_driver_id?: string | null },
  reason: string,
): Promise<void> {
  if (driver.saved_driver_id) {
    await blockDriver(driver.saved_driver_id, reason)
    return
  }
  const created = await postFetcher('/api/saved-drivers', {
    tenant_id: DEFAULT_TENANT_ID,
    name: driver.name,
    phone: driver.phone || '',
    vehicle_registration: driver.vehicle_registration || '',
  })
  const newId: string = created?.data?.id ?? created?.id
  if (newId) await blockDriver(newId, reason)
}
