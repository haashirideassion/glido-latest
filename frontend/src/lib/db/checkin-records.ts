import { fetcher, postFetcher, patchFetcher } from '../fetcher'

const BASE = '/api/checkin-records'

export interface CheckinRecord {
  id: string
  bookingId?: string
  tenantId: string
  isWalkIn: boolean
  walkInPurpose?: string
  visitPersonName?: string
  walkInReason?: string
  licenceScanMethod?: string
  licenceName?: string
  licenceNumber?: string
  licenceDob?: string
  licenceExpiry?: string
  licenceAddress?: string
  nameMatchResult?: string
  nameMatchScore?: number
  expiryValid?: boolean
  checkInTime: string
  dismissedAt?: string
  dismissedBy?: string
}

export interface CreateCheckinInput {
  bookingId?: string
  walkInId?: string
  tenantId: string
  isWalkIn?: boolean
  walkInPurpose?: string
  visitPersonName?: string
  walkInReason?: string
  licenceScanMethod?: string
  licenceName?: string
  licenceNumber?: string
  licenceDob?: string
  licenceExpiry?: string
  licenceAddress?: string
  nameMatchResult?: string
  nameMatchScore?: number
  expiryValid?: boolean
}

function rowToRecord(row: any): CheckinRecord {
  return {
    id:                row.id,
    bookingId:         row.booking_id         ?? undefined,
    tenantId:          row.tenant_id,
    isWalkIn:          row.is_walk_in,
    walkInPurpose:     row.walk_in_purpose    ?? undefined,
    visitPersonName:   row.visit_person_name  ?? undefined,
    walkInReason:      row.walk_in_reason     ?? undefined,
    licenceScanMethod: row.licence_scan_method ?? undefined,
    licenceName:       row.licence_name       ?? undefined,
    licenceNumber:     row.licence_number     ?? undefined,
    licenceDob:        row.licence_dob        ?? undefined,
    licenceExpiry:     row.licence_expiry     ?? undefined,
    licenceAddress:    row.licence_address    ?? undefined,
    nameMatchResult:   row.name_match_result  ?? undefined,
    nameMatchScore:    row.name_match_score   ?? undefined,
    expiryValid:       row.expiry_valid       ?? undefined,
    checkInTime:       row.check_in_time,
    dismissedAt:       row.dismissed_at       ?? undefined,
    dismissedBy:       row.dismissed_by       ?? undefined,
  }
}

export async function createCheckinRecord(input: CreateCheckinInput): Promise<CheckinRecord> {
  const res = await postFetcher(BASE, {
    booking_id:          input.bookingId         ?? null,
    walk_in_id:          input.walkInId          ?? null,
    tenant_id:           input.tenantId,
    is_walk_in:          input.isWalkIn          ?? false,
    walk_in_purpose:     input.walkInPurpose     ?? null,
    visit_person_name:   input.visitPersonName   ?? null,
    walk_in_reason:      input.walkInReason      ?? null,
    licence_scan_method: input.licenceScanMethod ?? null,
    licence_name:        input.licenceName       ?? null,
    licence_number:      input.licenceNumber     ?? null,
    licence_dob:         input.licenceDob        ?? null,
    licence_expiry:      input.licenceExpiry     ?? null,
    licence_address:     input.licenceAddress    ?? null,
    name_match_result:   input.nameMatchResult   ?? 'not_checked',
    name_match_score:    input.nameMatchScore    ?? null,
    expiry_valid:        input.expiryValid       ?? null,
  })
  return rowToRecord(res.data)
}

export async function getActiveWalkInRecords(tenantId: string): Promise<CheckinRecord[]> {
  const res = await fetcher(`${BASE}?tenantId=${encodeURIComponent(tenantId)}`)
  return (res?.data ?? [])
    .filter((r: any) => r.is_walk_in && !r.dismissed_at)
    .map(rowToRecord)
}

export async function dismissCheckinRecord(id: string): Promise<void> {
  await patchFetcher(`${BASE}/${id}`, { dismissed_at: new Date().toISOString() })
}

export async function getCheckinByBooking(bookingId: string): Promise<CheckinRecord | undefined> {
  const res = await fetcher(`${BASE}?bookingId=${encodeURIComponent(bookingId)}`)
  const items: any[] = res?.data ?? []
  return items.length > 0 ? rowToRecord(items[0]) : undefined
}
