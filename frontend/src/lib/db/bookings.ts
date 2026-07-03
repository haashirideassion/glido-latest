import { fetcher, postFetcher, patchFetcher } from '../fetcher'
import { todaySydney } from '../time'
import type {
  Booking, BookingStatus, ServiceType, LoadType,
  PalletType, IcsStatus, DashboardStats,
} from '../../data/types'

const BASE = '/api/bookings'

// Postgres returns time as HH:MM:SS — normalise to HH:MM
function trimTime(t: string): string {
  return t.slice(0, 5)
}

function rowToBooking(row: any): Booking {
  return {
    id:                  row.id,
    referenceNumber:     row.reference_number,
    sessionId:           row.session_id           ?? undefined,
    status:              row.status               as BookingStatus,
    serviceType:         row.service_type         as ServiceType,
    loadType:            row.load_type            as LoadType,
    slotDate:            row.slot_date,
    slotStartTime:       trimTime(row.slot_start_time),
    slotEndTime:         trimTime(row.slot_end_time),
    guestName:           row.guest_name           ?? undefined,
    guestEmail:          row.guest_email          ?? undefined,
    guestPhone:          row.guest_phone          ?? undefined,
    companyName:         row.company_name         ?? undefined,
    driverName:          row.driver_name,
    driverPhone:         row.driver_phone         ?? undefined,
    houseBillNumber:     row.house_bill_number    ?? undefined,
    containerNumber:     row.container_number     ?? undefined,
    weightKg:            row.weight_kg     != null ? Number(row.weight_kg)     : undefined,
    volumeCbm:           row.volume_cbm    != null ? Number(row.volume_cbm)    : undefined,
    packageCount:        row.package_count != null ? Number(row.package_count) : undefined,
    palletCount:         row.pallet_count  != null ? Number(row.pallet_count)  : undefined,
    palletType:          (row.pallet_type         ?? undefined) as PalletType | undefined,
    storageStartDate:    row.storage_start_date   ?? undefined,
    storageDays:         row.storage_days      != null ? Number(row.storage_days)      : undefined,
    storageCharge:       row.storage_charge    != null ? Number(row.storage_charge)    : undefined,
    shrinkWrapCharge:    row.shrink_wrap_charge != null ? Number(row.shrink_wrap_charge) : undefined,
    slotFee:             row.slot_fee          != null ? Number(row.slot_fee)          : undefined,
    subtotal:            row.subtotal          != null ? Number(row.subtotal)          : undefined,
    gstAmount:           row.gst_amount        != null ? Number(row.gst_amount)        : undefined,
    totalAmount:         row.total_amount      != null ? Number(row.total_amount)      : undefined,
    paymentMethod:       (row.payment_method      ?? undefined) as 'card' | 'eft' | undefined,
    paymentStatus:       (row.payment_status      ?? undefined) as Booking['paymentStatus'],
    icsStatus:           (row.ics_status          ?? undefined) as IcsStatus | undefined,
    icsLastCheckedAt:    row.ics_last_checked_at  ?? undefined,
    checkedInAt:         row.checked_in_at        ?? undefined,
    completedAt:         row.completed_at         ?? undefined,
    completionNotes:     row.completion_notes     ?? undefined,
    containerSize:       row.container_size       ?? undefined,
    entryNumber:         row.entry_number         ?? undefined,
    purpose:             row.purpose              ?? undefined,
    consolidator:        row.consolidator         ?? undefined,
    bookingReference:    row.booking_reference    ?? undefined,
    vehicleRegistration: row.vehicle_registration ?? undefined,
    bookingGroupId:      row.booking_group_id     ?? undefined,
    slotIndex:           row.slot_index           ?? undefined,
    groupReference:      row.group_reference      ?? undefined,
    bookingSource:       row.booking_source       ?? undefined,
    tenantId:            row.tenant_id,
    createdAt:           row.created_at,
    updatedAt:           row.updated_at,
  }
}

export async function getBookings(): Promise<Booking[]> {
  const res = await fetcher(BASE)
  return (res?.data ?? []).map(rowToBooking)
}

export async function getBookingsByDateRange(from: string, to: string): Promise<Booking[]> {
  const res = await fetcher(`${BASE}?from=${from}&to=${to}`)
  return (res?.data ?? []).map(rowToBooking)
}

export async function getBookingById(id: string): Promise<Booking | undefined> {
  const res = await fetcher(`${BASE}/${id}`)
  return res?.data ? rowToBooking(res.data) : undefined
}

export async function getBookingByRef(ref: string): Promise<Booking | undefined> {
  const res = await fetcher(`${BASE}?ref=${encodeURIComponent(ref)}`)
  const items: any[] = res?.data ?? []
  return items.length > 0 ? rowToBooking(items[0]) : undefined
}

export async function getBookingByRego(rego: string): Promise<Booking | undefined> {
  const res = await fetcher(`${BASE}?rego=${encodeURIComponent(rego.toUpperCase())}`)
  const items: any[] = res?.data ?? []
  return items.length > 0 ? rowToBooking(items[0]) : undefined
}

export async function findBooking(idOrRef: string): Promise<Booking | undefined> {
  const res = await fetcher(`${BASE}/find?q=${encodeURIComponent(idOrRef)}`)
  return res?.data ? rowToBooking(res.data) : undefined
}

export async function getTodayBookings(): Promise<Booking[]> {
  const today = todaySydney()
  return getBookingsByDate(today)
}

export async function getBookingsByDate(date: string): Promise<Booking[]> {
  const res = await fetcher(`${BASE}?date=${date}`)
  return (res?.data ?? []).map(rowToBooking)
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await fetcher('/api/dashboard')
  const d = res?.data ?? {}
  return {
    todaysVisitors:  d.todaysVisitors  ?? 0,
    checkedIn:       d.checkedIn       ?? 0,
    pending:         d.pending         ?? 0,
    icsHeld:         d.icsHeld         ?? 0,
    recentVisitors:  (d.recentVisitors ?? []).map(rowToBooking),
  }
}

export async function checkInBooking(id: string): Promise<Booking | undefined> {
  const res = await patchFetcher(`${BASE}/${id}/checkin`, {})
  return res?.data ? rowToBooking(res.data) : undefined
}

export async function completeBooking(id: string, notes?: string): Promise<Booking | undefined> {
  const res = await patchFetcher(`${BASE}/${id}/complete`, notes ? { notes } : {})
  return res?.data ? rowToBooking(res.data) : undefined
}

export async function getBookingsByUserId(userId: string): Promise<Booking[]> {
  const res = await fetcher(`${BASE}?userId=${encodeURIComponent(userId)}`)
  return (res?.data ?? []).map(rowToBooking)
}

export async function rescheduleBooking(
  id: string,
  newDate: string,
  newStart: string,
  newEnd: string,
): Promise<Booking | undefined> {
  const res = await patchFetcher(`${BASE}/${id}/reschedule`, {
    slotDate:      newDate,
    slotStartTime: newStart,
    slotEndTime:   newEnd,
  })
  return res?.data ? rowToBooking(res.data) : undefined
}

export async function refreshIcsStatus(id: string): Promise<Booking | undefined> {
  // Re-fetch from backend — no dedicated refresh endpoint
  return getBookingById(id)
}

export async function cancelBooking(id: string): Promise<void> {
  await patchFetcher(`${BASE}/${id}/cancel`, {})
}

export async function overrideBookingStatus(
  id: string,
  status: string,
  note: string,
): Promise<Booking | undefined> {
  const res = await patchFetcher(`${BASE}/${id}/override-status`, { status, note })
  return res?.data
}

export async function confirmEftPayment(id: string): Promise<Booking | undefined> {
  const res = await patchFetcher(`${BASE}/${id}/confirm-eft`, {})
  return res?.data
}

export interface CreateBookingInput {
  serviceType:       ServiceType
  loadType:          LoadType
  slotDate:          string
  slotStartTime:     string
  slotEndTime:       string
  driverName:        string
  guestName?:        string
  guestEmail?:       string
  guestPhone?:       string
  companyName?:      string
  userId?:           string
  houseBillNumber?:  string
  containerNumber?:  string
  weightKg?:         number
  volumeCbm?:        number
  packageCount?:     number
  palletCount?:      number
  palletType?:       PalletType
  storageStartDate?: string
  storageDays?:      number
  storageCharge?:    number
  shrinkWrapCharge?: number
  slotFee?:          number
  subtotal?:         number
  gstAmount?:        number
  totalAmount?:      number
  paymentMethod?:    'card' | 'eft'
  paymentStatus?:    Booking['paymentStatus']
  icsStatus?:        IcsStatus
  tenantId:          string
  container_size?:       string
  entry_number?:         string
  purpose?:              string
  consolidator?:         string
  booking_reference?:    string
  vehicle_registration?: string
  reference_number?:     string
}

export async function getBookingsByGroupRef(groupRef: string): Promise<Booking[]> {
  const res = await fetcher(`${BASE}?groupRef=${encodeURIComponent(groupRef)}`)
  return (res?.data ?? []).map(rowToBooking)
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const year = new Date().getFullYear()
  const seq  = String(Math.floor(Math.random() * 90000) + 10000)
  const ref  = input.reference_number ?? `GLD-${year}-${seq}`

  const res = await postFetcher(BASE, {
    reference_number:     ref,
    service_type:         input.serviceType,
    load_type:            input.loadType,
    slot_date:            input.slotDate,
    slot_start_time:      input.slotStartTime,
    slot_end_time:        input.slotEndTime,
    driver_name:          input.driverName,
    guest_name:           input.guestName           ?? null,
    guest_email:          input.guestEmail          ?? null,
    guest_phone:          input.guestPhone          ?? null,
    company_name:         input.companyName         ?? null,
    house_bill_number:    input.houseBillNumber      ?? null,
    container_number:     input.containerNumber     ?? null,
    weight_kg:            input.weightKg            ?? null,
    volume_cbm:           input.volumeCbm           ?? null,
    package_count:        input.packageCount        ?? null,
    pallet_count:         input.palletCount         ?? null,
    pallet_type:          input.palletType          ?? null,
    storage_start_date:   input.storageStartDate    ?? null,
    storage_days:         input.storageDays         ?? null,
    storage_charge:       input.storageCharge       ?? null,
    shrink_wrap_charge:   input.shrinkWrapCharge    ?? null,
    slot_fee:             input.slotFee             ?? null,
    subtotal:             input.subtotal            ?? null,
    gst_amount:           input.gstAmount           ?? null,
    total_amount:         input.totalAmount         ?? null,
    payment_method:       input.paymentMethod       ?? null,
    payment_status:       input.paymentStatus       ?? 'pending',
    ics_status:           input.icsStatus           ?? null,
    tenant_id:            input.tenantId,
    user_id:              input.userId              ?? null,
    container_size:       input.container_size      ?? null,
    entry_number:         input.entry_number        ?? null,
    purpose:              input.purpose             ?? null,
    consolidator:         input.consolidator        ?? null,
    booking_reference:    input.booking_reference   ?? null,
    vehicle_registration: input.vehicle_registration ?? null,
  })

  if (!res?.data) {
    return { id: '', referenceNumber: ref, status: 'scheduled' } as any
  }
  return rowToBooking(res.data)
}
