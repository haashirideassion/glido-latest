import { fetcher, patchFetcher } from '../fetcher'

const BASE = '/api/shipments'

export type ShipmentRow = Record<string, any>

export interface ShipmentLookupResult {
  id:                 string
  hbl:                string
  containerNumber?:   string
  weightKg?:          number
  volumeCbm?:         number
  packageCount?:      number
  palletCount?:       number
  palletType?:        string
  storageStartDate?:  string
  readyForCollection: boolean
  description?:       string
  icsStatus?:         string
  icsLastCheckedAt?:  string
}

function rowToResult(row: any): ShipmentLookupResult {
  return {
    id:                 row.id,
    hbl:                row.house_bill_number,
    containerNumber:    row.container_number  ?? undefined,
    weightKg:           row.weight_kg         ?? undefined,
    volumeCbm:          row.volume_cbm        ?? undefined,
    packageCount:       row.package_count     ?? undefined,
    palletCount:        row.pallet_count      ?? undefined,
    palletType:         row.pallet_type       ?? undefined,
    storageStartDate:   row.storage_start_date ?? undefined,
    readyForCollection: row.ready_for_collection,
    description:        row.description       ?? undefined,
    icsStatus:          row.ics_status        ?? undefined,
    icsLastCheckedAt:   row.ics_last_checked_at ?? undefined,
  }
}

export async function lookupShipment(
  tenantId: string,
  hbl: string,
): Promise<ShipmentLookupResult | undefined> {
  const res = await fetcher(
    `${BASE}?tenantId=${encodeURIComponent(tenantId)}&billNumber=${encodeURIComponent(hbl.trim())}`,
  )
  const items: any[] = res?.data ?? []
  return items.length > 0 ? rowToResult(items[0]) : undefined
}

export async function lookupShipmentByContainer(
  tenantId: string,
  containerNumber: string,
): Promise<ShipmentLookupResult | undefined> {
  const res = await fetcher(
    `${BASE}?tenantId=${encodeURIComponent(tenantId)}&containerNumber=${encodeURIComponent(containerNumber.trim())}`,
  )
  const items: any[] = res?.data ?? []
  return items.length > 0 ? rowToResult(items[0]) : undefined
}

export async function updateShipmentIcsStatus(id: string, icsStatus: string): Promise<void> {
  await patchFetcher(`${BASE}/${id}`, {
    ics_status: icsStatus,
    ics_last_checked_at: new Date().toISOString(),
  })
}
