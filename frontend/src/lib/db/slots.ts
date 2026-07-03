import { fetcher } from '../fetcher'
import type { TimeSlot, SlotBusyness } from '../../data/types'

const BASE = '/api/slots'

function trimTime(t: string): string {
  return t.slice(0, 5)
}

function rowToSlot(row: any): TimeSlot {
  const capacity  = row.capacity  ?? 10
  const confirmed = row.confirmed ?? 0
  let busyness: SlotBusyness = 'available'
  if (confirmed >= capacity)            busyness = 'full'
  else if (confirmed / capacity >= 0.6) busyness = 'busy'
  return {
    id:        row.id,
    date:      row.date,
    startTime: trimTime(row.start_time),
    endTime:   trimTime(row.end_time),
    capacity,
    confirmed,
    held:      row.held ?? 0,
    busyness,
  }
}

export async function getSlotsByDate(date: string): Promise<TimeSlot[]> {
  const res = await fetcher(`${BASE}?date=${date}`)
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
