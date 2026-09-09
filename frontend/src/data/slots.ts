import type { TimeSlot, SlotBusyness } from './types'

function busyness(capacity: number, confirmed: number, closed = false): SlotBusyness {
  if (closed) return 'closed'
  if (confirmed >= capacity) return 'full'
  if (confirmed / capacity >= 0.6) return 'busy'
  return 'available'
}

function generateSlots(dateOffset: number): TimeSlot[] {
  const d = new Date('2026-05-12')
  d.setDate(d.getDate() + dateOffset)
  const date = d.toISOString().split('T')[0]

  const times = [
    { start: '06:00', end: '07:00' },
    { start: '07:00', end: '08:00' },
    { start: '08:00', end: '09:00' },
    { start: '09:00', end: '10:00' },
    { start: '10:00', end: '11:00' },
    { start: '11:00', end: '12:00' },
    { start: '12:00', end: '13:00' },
    { start: '13:00', end: '14:00' },
    { start: '14:00', end: '15:00' },
    { start: '15:00', end: '16:00' },
    { start: '16:00', end: '17:00' },
    { start: '17:00', end: '18:00' },
  ]

  const confirmedCounts = [8, 9, 6, 3, 2, 4, 1, 2, 1, 3, 2, 0]

  return times.map((t, i) => {
    const capacity = 10
    const confirmed = dateOffset === 0 ? confirmedCounts[i] : Math.floor(Math.random() * 8)
    const closed = date === '2026-05-16' || date === '2026-05-17' // weekend
    return {
      id: `slot-${date}-${t.start.replace(':', '')}`,
      date,
      startTime: t.start,
      endTime: t.end,
      capacity,
      confirmed: closed ? 0 : confirmed,
      held: 0,
      busyness: busyness(capacity, confirmed, closed),
    }
  })
}

export const mockSlots: TimeSlot[] = [
  ...generateSlots(0),
  ...generateSlots(1),
  ...generateSlots(2),
  ...generateSlots(3),
  ...generateSlots(4),
  ...generateSlots(5),
  ...generateSlots(6),
]

export function getSlotsByDate(date: string): TimeSlot[] {
  return mockSlots.filter((s) => s.date === date)
}

export function findSlot(id: string): TimeSlot | undefined {
  return mockSlots.find((s) => s.id === id)
}
