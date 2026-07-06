import { useState, useEffect, useCallback, useRef } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { KpiTiles, RecentVisitors } from '@/components/reception/KpiTiles'
import { DayChart } from '@/components/reception/DayChart'
import { BookingTable } from '@/components/reception/BookingTable'
import { BookingSlideOver } from '@/components/reception/BookingSlideOver'
import { getDashboardStats, getBookingsByDate } from '@/lib/db/bookings'
import { getTenant } from '@/lib/db/tenants'
import { toast } from '@/lib/toast'
import { useStaffPermissions } from '@/lib/useStaffPermissions'
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
  const perms = useStaffPermissions()

  const [stats,           setStats]           = useState<DashboardStats>(EMPTY_STATS)
  const [bookings,        setBookings]        = useState<Booking[]>([])
  const [slotCounts,      setSlotCounts]      = useState<Record<string, number>>({})
  const [groupSlots,      setGroupSlots]      = useState<Record<string, Booking[]>>({})
  const [isLoading,       setIsLoading]       = useState(true)
  const [capacityByHour,  setCapacityByHour]  = useState<Record<string, number>>({})
  const [defaultCapacity, setDefaultCapacity] = useState<number>(5)

  // ── Live-arrival detection — toast when a genuinely new booking shows up on a poll ──
  const seenIdsRef = useRef<Set<string> | null>(null)

  // ── Split view ──
  const [selected, setSelected] = useState<Booking | null>(null)
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true))
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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

      // Toast any booking that showed up since the last poll — skip the very first load
      const currentIds = new Set(bs.map(b => b.id))
      if (seenIdsRef.current) {
        const newOnes = bs.filter(b => !seenIdsRef.current!.has(b.id))
        for (const b of newOnes.slice(0, 3)) {
          toast(`New booking: ${b.referenceNumber} — ${b.driverName}`, 'info')
        }
      }
      seenIdsRef.current = currentIds

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
    const id = setInterval(refresh, 15000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
      <KpiTiles stats={stats} loading={isLoading} />

      {stats.held > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)', borderRadius: 'var(--r-lg)', padding: '14px 20px', marginBottom: 'var(--card-gap)', display: 'flex', alignItems: 'center', gap: 12 }}>
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

      <BookingTable bookings={bookings} slotCounts={slotCounts} groupSlots={groupSlots} currentDate={today} loading={isLoading} onSelect={setSelected} selectedId={selected?.id} />
      <RecentVisitors stats={stats} loading={isLoading} onSelect={setSelected} selectedId={selected?.id} />
      <DayChart bookings={bookings} loading={isLoading} capacityByHour={capacityByHour} defaultCapacity={defaultCapacity} />
      </div>

      {/* Docked detail pane — split view (wide screens) */}
      {selected && isWide && (
        <div style={{ width: 480, flexShrink: 0, position: 'sticky', top: 12, height: 'calc(100vh - var(--dash-header-h) - 24px)' }}>
          <BookingSlideOver key={selected.id} docked booking={selected} perms={perms} onClose={() => setSelected(null)} onUpdated={() => refresh()} />
        </div>
      )}
      {/* Detail overlay — narrow screens */}
      {selected && !isWide && (
        <BookingSlideOver key={selected.id} booking={selected} perms={perms} onClose={() => setSelected(null)} onUpdated={() => refresh()} />
      )}
    </div>
  )
}
