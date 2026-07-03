import { useState, useEffect, useCallback } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { KpiTiles, RecentVisitors } from '@/components/reception/KpiTiles'
import { DayChart } from '@/components/reception/DayChart'
import { BookingTable } from '@/components/reception/BookingTable'
import { getDashboardStats, getBookingsByDate } from '@/lib/db/bookings'
import { getTenant } from '@/lib/db/tenants'
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'
import { todaySydney } from '@/lib/time'
import type { DashboardStats, Booking } from '@/data/types'

const EMPTY_STATS: DashboardStats = {
  todaysVisitors: 0,
  checkedIn:      0,
  pending:        0,
  held:           0,
  recentVisitors: [],
}

export default function DashboardPage() {
  usePageTitle('Glido | Dashboard')
  const today = todaySydney()

  const [stats,           setStats]           = useState<DashboardStats>(EMPTY_STATS)
  const [bookings,        setBookings]        = useState<Booking[]>([])
  const [slotCounts,      setSlotCounts]      = useState<Record<string, number>>({})
  const [groupSlots,      setGroupSlots]      = useState<Record<string, Booking[]>>({})
  const [isLoading,       setIsLoading]       = useState(true)
  const [capacityByHour,  setCapacityByHour]  = useState<Record<string, number>>({})
  const [defaultCapacity, setDefaultCapacity] = useState<number>(5)

  const refresh = useCallback(async () => {
    try {
      const [s, bs, tenant] = await Promise.all([
        getDashboardStats(),
        getBookingsByDate(today),
        getTenant(DEFAULT_TENANT_ID),
      ])
      setStats(s)
      // Exclude bookings where every slot in the group is already checked in
      // (group check not possible here without the full day's rows by group, so
      //  filter individual checked-in rows — single-slot bookings disappear immediately,
      //  multi-slot groups still show via their remaining scheduled rows)
      // Deduplicate: one row per group_reference (multi-slot bookings share one ref).
      // Keep the slot with the "worst" status so partial check-ins still surface.
      const STATUS_RANK: Record<string, number> = { checked_in: 0, scheduled: 1, completed: 2, cancelled: 3 }
      const groupMap    = new Map<string, Booking>()
      const slotsMap    = new Map<string, Booking[]>()
      const countMap    = new Map<string, number>()
      for (const b of bs) {
        const key = b.groupReference ?? b.id
        countMap.set(key, (countMap.get(key) ?? 0) + 1)
        if (!slotsMap.has(key)) slotsMap.set(key, [])
        slotsMap.get(key)!.push(b)
        if (b.status === 'checked_in') continue
        const existing = groupMap.get(key)
        if (!existing || (STATUS_RANK[b.status] ?? 9) > (STATUS_RANK[existing.status] ?? 9)) {
          groupMap.set(key, b)
        }
      }
      setBookings([...groupMap.values()])
      const counts: Record<string, number> = {}
      countMap.forEach((v, k) => { counts[k] = v })
      setSlotCounts(counts)
      const slots: Record<string, Booking[]> = {}
      slotsMap.forEach((v, k) => { slots[k] = v })
      setGroupSlots(slots)
      if (tenant) {
        setCapacityByHour((tenant as any).slot_capacity_by_hour ?? {})
        setDefaultCapacity(tenant.max_bookings_per_slot ?? 5)
      }
    } catch (err) {
      console.error('[dashboard] refresh error', err)
    } finally {
      setIsLoading(false)
    }
  }, [today])

  // Initial load + polling every 30s
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div>
      <KpiTiles stats={stats} loading={isLoading} />

      {stats.held > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)', borderRadius: 'var(--r-lg)', padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L14 13H2L8 2Z" stroke="#EF4444" strokeWidth="1.5" strokeLinejoin="round"/><path d="M8 6.5V9" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="11" r="0.75" fill="#EF4444"/></svg>
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#DC2626', margin: 0 }}>Attention Required</p>
            <p style={{ fontSize: 14, color: '#DC2626', margin: '2px 0 0', opacity: 0.8 }}>
              {stats.held} booking{stats.held > 1 ? 's' : ''} currently held — ICS clearance pending
            </p>
          </div>
        </div>
      )}

      <BookingTable bookings={bookings} slotCounts={slotCounts} groupSlots={groupSlots} currentDate={today} loading={isLoading} />
      <RecentVisitors stats={stats} loading={isLoading} />
      <DayChart bookings={bookings} loading={isLoading} capacityByHour={capacityByHour} defaultCapacity={defaultCapacity} />
    </div>
  )
}
