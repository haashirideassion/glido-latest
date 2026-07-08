import { fetcher } from '../fetcher'
import type { TimeSlot, SlotBusyness } from '../../data/types'

const BASE = '/api/slots'

function trimTime(t: string): string {
  return t.slice(0, 5)
}

function rowToSlot(row: any): TimeSlot {
  // busyness now comes pre-computed from the server (the single source of truth for Operating
  // Hours / Slot Periods / Per-hour Capacity / Capacity-by-Booking-Type) — no need to
  // recompute it here, and doing so client-side was the source of a real bug where a
  // combo-specific cap got compared against the hour's total confirmed count.
  return {
    id:        row.id,
    date:      row.date,
    startTime: trimTime(row.start_time),
    endTime:   trimTime(row.end_time),
    capacity:  row.capacity  ?? 10,
    confirmed: row.confirmed ?? 0,
    held:      row.held ?? 0,
    busyness:  (row.busyness ?? 'available') as SlotBusyness,
    ...(row.comboCapacity !== undefined ? { comboCapacity: row.comboCapacity, comboConfirmed: row.comboConfirmed } : {}),
  }
}

export async function getSlotsByDate(date: string, opts?: { tenantId?: string; serviceType?: string; loadType?: string }): Promise<TimeSlot[]> {
  const qs = new URLSearchParams({ date })
  if (opts?.tenantId)    qs.set('tenantId', opts.tenantId)
  if (opts?.serviceType) qs.set('serviceType', opts.serviceType)
  if (opts?.loadType)    qs.set('loadType', opts.loadType)
  const res = await fetcher(`${BASE}?${qs.toString()}`)
  return (res?.data ?? []).map(rowToSlot)
}

export async function findSlot(id: string): Promise<TimeSlot | undefined> {
  const res = await fetcher(`${BASE}?date=${id.slice(0, 10)}`)
  const items: any[] = res?.data ?? []
  const found = items.find((s: any) => s.id === id)
  return found ? rowToSlot(found) : undefined
}

export async function getSlotsForDateRange(from: string, to: string): Promise<TimeSlot[]> {
  const res = await fetcher(`${BASE}?from=${from}&to=${to}`)
  return (res?.data ?? []).map(rowToSlot)
}

export async function incrementSlotConfirmed(_slotId: string): Promise<void> {
  // Slot increments are managed server-side when a booking is created
}
