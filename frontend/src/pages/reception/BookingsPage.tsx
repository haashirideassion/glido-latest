import React, { useState, useEffect, useCallback, useRef } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { getBookings, getBookingsByDateRange, cancelBooking, checkInBooking, completeBooking } from '@/lib/db/bookings'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { todaySydney, TZ } from '@/lib/time'
import type { Booking } from '@/data/types'
import { useStaffPermissions } from '@/lib/useStaffPermissions'

// ─── Date helpers ────────────────────────────────────────────────────────────
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: TZ })

const fmtShortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d} ${months[m - 1]} ${y}`
}

// ─── Custom filter dropdown — matches original 1:1 ───────────────────────────
interface SelectOpt { value: string; label: string }

function FilterSelect({ placeholder, options, value, onChange, block }: {
  placeholder: string
  options: SelectOpt[]
  value: string
  onChange: (v: string) => void
  block?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const ref    = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const allOpts = [{ value: '', label: placeholder }, ...options]
  const label = allOpts.find(o => o.value === value)?.label ?? placeholder
  const active = value !== ''

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setDropPos({ top: r.bottom + 5, left: r.left, width: r.width })
    }
    setOpen(v => !v)
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, width: block ? '100%' : undefined }}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          height: block ? 38 : 36, fontSize: 15, padding: '0 13px', borderRadius: 'var(--r-full)',
          cursor: 'pointer', whiteSpace: 'nowrap', outline: 'none',
          transition: 'all 0.12s ease', boxSizing: 'border-box',
          width: block ? '100%' : undefined, justifyContent: block ? 'space-between' : undefined,
          background: active ? 'rgba(var(--brand-rgb),0.07)' : '#FFFFFF',
          border: `1px solid ${active ? 'rgba(var(--brand-rgb),0.30)' : 'rgba(0,0,0,0.12)'}`,
          color: active ? 'var(--brand-color)' : '#1C1917',
          fontFamily: 'inherit',
        }}
      >
        <span>{label}</span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{ flexShrink: 0, opacity: 0.55, transition: 'transform 0.15s ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && dropPos && (
        <div style={{
          position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 9999,
          minWidth: block ? dropPos.width : 160, background: '#FFFFFF',
          border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.06),0 2px 6px rgba(0,0,0,0.03)',
          padding: 5,
        }}>
          {allOpts.map(opt => {
            const selected = opt.value === value
            return (
              <button
                key={opt.value || '__all__'}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 10px', borderRadius: 'var(--r-full)',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  fontSize: 15, fontFamily: 'inherit',
                  background: selected ? 'rgba(var(--brand-rgb),0.08)' : 'transparent',
                  color: selected ? 'var(--brand-color)' : '#1C1917',
                  transition: 'background 0.12s ease',
                }}
                onMouseOver={e => { if (!selected) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
                onMouseOut={e  => { if (!selected) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L4.5 8.5 10 3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span>{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Source badge ────────────────────────────────────────────────────────────
function SourceBadge({ source }: { source?: string | null }) {
  if (!source) return null
  const labels: Record<string, string> = {
    self_booking:      'Self Booking',
    guest:             'Guest',
    reception_booking: 'Reception Booking',
  }
  const label = labels[source]
  if (!label) return null
  return (
    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>
      {label}
    </span>
  )
}

// ─── KPI helpers ──────────────────────────────────────────────────────────────
function calcKpi(bs: Booking[]) {
  const scheduled = bs.filter(b => b.status === 'scheduled').length
  return {
    total:        bs.length,
    scheduled,
    preProcessed: scheduled,
    visitors:     new Set(bs.map(b => b.driverName)).size,
    checkedIn:    bs.filter(b => b.status === 'checked_in').length,
    completed:    bs.filter(b => b.status === 'completed').length,
  }
}

// ─── Booking KPI tiles ────────────────────────────────────────────────────────
const KPI_TILES = [
  { key: 'total',        label: 'Total Bookings', sub: 'Matching filters',           icon: ICONS.bookings, iconBg: 'rgba(28,25,23,0.06)',   iconFg: '#1C1917' },
  { key: 'scheduled',    label: 'Scheduled',      sub: 'Awaiting check-in',          icon: ICONS.calendar, iconBg: 'rgba(59,130,246,0.10)', iconFg: '#3B82F6' },
  { key: 'preProcessed', label: 'Pre-processed',  sub: 'Scheduled, not checked in',  icon: ICONS.calendar, iconBg: 'rgba(251,191,36,0.10)', iconFg: '#FBBF24' },
] as const

type KpiKey = typeof KPI_TILES[number]['key']

function KpiSkeleton() {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
      {KPI_TILES.map((t, i) => (
        <div key={t.key} style={{ flex: 1, minWidth: 0, padding: '22px 26px', borderLeft: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', background: '#F3F3F2', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ width: 100, height: 14, borderRadius: 'var(--r-xs)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
          <div style={{ width: 56, height: 40, borderRadius: 'var(--r-sm)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />
        </div>
      ))}
    </div>
  )
}

function BookingKpiTiles({ bookings, prevBookings, hasPrev }: {
  bookings: Booking[]
  prevBookings: Booking[]
  hasPrev: boolean
}) {
  const curr = calcKpi(bookings)

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
      {KPI_TILES.map((t, i) => {
        return (
          <div key={t.key}
            style={{ flex: 1, minWidth: 0, padding: '22px 26px', borderLeft: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.07)', transition: 'background 0.18s ease' }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.015)')}
            onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', background: t.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${t.iconFg}22` }}>
                <Icon name={t.icon} size={17} style={{ color: t.iconFg }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</p>
            </div>
            <p style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#1C1917', margin: '0 0 6px', fontVariantNumeric: 'tabular-nums' }}>{curr[t.key as KpiKey]}</p>
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.sub}</p>
          </div>
        )
      })}
    </div>
  )
}

// ─── Table skeleton ───────────────────────────────────────────────────────────
function CardSkeleton() {
  const S = ({ w }: { w: number }) => (
    <div style={{ width: w, height: 13, borderRadius: 4, background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />
  )
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: '#F7F6F5', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
          {['', 'Reference', 'Driver', 'Slot', 'Service', 'HBL', 'Status', ''].map((h, i) => (
            <th key={i} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', whiteSpace: 'nowrap', ...(i === 0 ? { width: 10, padding: '0' } as React.CSSProperties : {}) }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 5 }).map((_, i) => (
          <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <td style={{ width: 10, padding: 0, paddingLeft: 4 }}><div style={{ width: 6, height: 40, borderRadius: 4, background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} /></td>
            <td style={{ padding: '14px 16px' }}><S w={130} /></td>
            <td style={{ padding: '14px 16px' }}><S w={100} /></td>
            <td style={{ padding: '14px 16px' }}><S w={80} /></td>
            <td style={{ padding: '14px 16px' }}><S w={90} /></td>
            <td style={{ padding: '14px 16px' }}><S w={90} /></td>
            <td style={{ padding: '14px 16px' }}><S w={80} /></td>
            <td style={{ padding: '14px 16px' }}><S w={16} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string; icon: string }> = {
  scheduled: {
    label: 'Scheduled',
    bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE',
    icon: 'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  },
  checked_in: {
    label: 'Checked In',
    bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0',
    icon: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  },
  completed: {
    label: 'Completed',
    bg: '#F9FAFB', color: '#374151', border: '#E5E7EB',
    icon: 'M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12',
  },
  cancelled: {
    label: 'Cancelled',
    bg: '#FEF2F2', color: '#DC2626', border: '#FECACA',
    icon: 'M9.75 9.75l4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  },
}
const ICS_LABEL: Record<string, string> = { cleared: 'Cleared', held: 'Held', examination: 'Examination', pending: 'Pending', unavailable: 'N/A' }
const ICS_BAR_COLOR: Record<string, string> = {
  cleared:     '#16A34A',
  held:        '#DC2626',
  examination: '#F59E0B',
  pending:     '#94A3B8',
  unavailable: '#E5E7EB',
}
const ICS_LEGEND = [
  { key: 'cleared',     label: 'Cleared'     },
  { key: 'held',        label: 'Held'        },
  { key: 'examination', label: 'Examination' },
  { key: 'pending',     label: 'Pending'     },
  { key: 'unavailable', label: 'N/A'         },
]


const FIELD = { width: '100%', padding: '0 14px', height: 36, fontSize: 15, color: '#1C1917', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box' as const, transition: 'border-color 0.15s ease, box-shadow 0.15s ease' }

// ─── Preset config ────────────────────────────────────────────────────────────
type Preset = 'today' | '7d' | '30d' | 'all'
const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d',   label: '7 Days' },
  { id: '30d',  label: '30 Days' },
  { id: 'all',  label: 'All Time' },
]

function presetDates(p: Preset): { from: string; to: string } {
  const today = todaySydney()
  if (p === 'today') return { from: today, to: today }
  if (p === '7d')   return { from: daysAgo(7),  to: today }
  if (p === '30d')  return { from: daysAgo(30), to: today }
  return { from: '', to: '' }
}

export default function BookingsPage() {
  usePageTitle('Glido | Bookings')
  const perms = useStaffPermissions()

  const [searchParams] = useSearchParams()
  const _initialPreset: Preset = searchParams.get('filter') === 'today' ? 'today' : '30d'
  const [bookings,     setBookings]     = useState<Booking[]>([])
  const [prevBookings, setPrevBookings] = useState<Booking[]>([])
  const [loading,      setLoading]      = useState(true)
  const [kpiLoading,   setKpiLoading]   = useState(true)
  const [preset,       setPreset]       = useState<Preset>(_initialPreset)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [serviceFilter,setServiceFilter]= useState('')
  const [dateFrom,     setDateFrom]     = useState(() => _initialPreset === 'today' ? todaySydney() : daysAgo(30))
  const [dateTo,       setDateTo]       = useState(() => todaySydney())
  const [liveColor,    setLiveColor]    = useState('#22C55E')
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null)
  const [cancelling,   setCancelling]   = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({}) // bookingId → 'checkin'|'complete'
  const location = useLocation()
  const PAGE_SIZE = 15
  const [page, setPage] = useState(1)
  const navigate = useNavigate()


  const confirmCancel = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await cancelBooking(cancelTarget.id)
      toast('Booking cancelled', 'success')
      setCancelTarget(null)
      load()
    } catch {
      toast('Failed to cancel. Please try again.', 'error')
    } finally {
      setCancelling(false)
    }
  }

  const handleCheckIn = async (b: Booking, e: React.MouseEvent) => {
    e.stopPropagation()
    setActionLoading(prev => ({ ...prev, [b.id]: 'checkin' }))
    try {
      await checkInBooking(b.id)
      toast('Marked as pre-processed', 'success')
      load()
    } catch { toast('Failed to update status', 'error') }
    finally { setActionLoading(prev => { const n = { ...prev }; delete n[b.id]; return n }) }
  }

  const handleComplete = async (b: Booking, e: React.MouseEvent) => {
    e.stopPropagation()
    setActionLoading(prev => ({ ...prev, [b.id]: 'complete' }))
    try {
      await completeBooking(b.id)
      toast('Booking completed', 'success')
      load()
    } catch { toast('Failed to update status', 'error') }
    finally { setActionLoading(prev => { const n = { ...prev }; delete n[b.id]; return n }) }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setKpiLoading(true)
    setLiveColor('#FBBF24')
    try {
      // ── Current period ──────────────────────────────────────────────────────
      const curr = dateFrom && dateTo
        ? await getBookingsByDateRange(dateFrom, dateTo)
        : await getBookings()
      setBookings(curr)

      // ── Previous period (same span, immediately before) ─────────────────────
      if (dateFrom && dateTo) {
        const f = new Date(dateFrom + 'T00:00:00')
        const t = new Date(dateTo   + 'T00:00:00')
        const span = Math.round((t.getTime() - f.getTime()) / 86400000) // inclusive days - 1
        const prevToDate   = new Date(f.getTime() - 86400000)
        const prevFromDate = new Date(f.getTime() - (span + 1) * 86400000)
        const pf = prevFromDate.toLocaleDateString('sv-SE', { timeZone: TZ })
        const pt = prevToDate.toLocaleDateString('sv-SE', { timeZone: TZ })
        const prev = await getBookingsByDateRange(pf, pt)
        setPrevBookings(prev)
      } else {
        setPrevBookings([])
      }

      setLiveColor('#22C55E')
    } catch {
      setLiveColor('#EF4444')
    } finally {
      setLoading(false)
      setKpiLoading(false)
    }
  }, [dateFrom, dateTo])

  // Reload on mount AND every time the user navigates back to this page
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load, location.key])
  useEffect(() => { setPage(1) }, [statusFilter, serviceFilter, search, dateFrom, dateTo])
  useEffect(() => {
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  const filtered = bookings.filter(b => {
    if (statusFilter && b.status !== statusFilter) return false
    if (serviceFilter && b.serviceType !== serviceFilter) return false
    if (search) {
      const s = search.toLowerCase()
      if (!b.referenceNumber.toLowerCase().includes(s) && !b.driverName.toLowerCase().includes(s) && !(b.houseBillNumber ?? '').toLowerCase().includes(s)) return false
    }
    return true
  })

  // 1 slot = 1 booking — no grouping, each row is independent
  const displayRows = filtered

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE))
  const pagedRows  = displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const exportCsv = () => {
    const header = ['Reference', 'Date', 'Time', 'Driver', 'Service', 'HBL', 'ICS', 'Status']
    const rows = filtered.map(b => [b.referenceNumber, b.slotDate, b.slotStartTime, b.driverName, `${b.serviceType} ${b.loadType}`, b.houseBillNumber ?? '', b.icsStatus ?? '', b.status].map(v => `"${String(v).replace(/"/g, '""')}"`))
    const csv = [header, ...rows].map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = 'glido-bookings.csv'
    a.click()
  }

  const applyPreset = (p: Preset) => {
    setPreset(p)
    const { from, to } = presetDates(p)
    setDateFrom(from)
    setDateTo(to)
  }

  const clearAll = () => {
    setStatusFilter('')
    setServiceFilter('')
    setSearch('')
    applyPreset('30d')
  }

  const hasFilters = !!(statusFilter || serviceFilter || search || preset !== '30d')


  return (
    <>
    {/* Pulse animation keyframes */}
    <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

    <div>
      {/* KPI tiles */}
      {kpiLoading ? (
        <KpiSkeleton />
      ) : (
        <BookingKpiTiles
          bookings={filtered}
          prevBookings={prevBookings}
          hasPrev={!!(dateFrom && dateTo)}
        />
      )}

      {/* ── Search + actions bar ── */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by reference, driver name or HBL…"
            size={46}
            style={{ height: 40, padding: '0 14px 0 38px', fontSize: 15, color: '#1C1917', background: '#fff', border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s', fontFamily: 'inherit' }}
            onFocus={e => { e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.10)' }}
            onBlur={e  => { e.target.style.borderColor = 'rgba(0,0,0,0.12)';            e.target.style.boxShadow = 'none' }}
          />
        </div>
        <div style={{ flex: 1 }} />
        {perms.can_export_csv && (
          <button onClick={exportCsv}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', fontSize: 15, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', transition: 'background 0.12s', flexShrink: 0, fontFamily: 'inherit' }}
            onMouseOver={e => { e.currentTarget.style.background = '#F7F6F5' }}
            onMouseOut={e  => { e.currentTarget.style.background = '#fff' }}
          >
            <Icon name={ICONS.download} size={15} /> Export CSV
          </button>
        )}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: 'var(--r-full)', background: liveColor, display: 'inline-block', transition: 'background 0.4s' }} />
          Live
        </span>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <FilterSelect placeholder="All Statuses" value={statusFilter} onChange={setStatusFilter}
          options={[{ value: 'scheduled', label: 'Scheduled' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }]} />
        <FilterSelect placeholder="All Services" value={serviceFilter} onChange={setServiceFilter}
          options={[{ value: 'pickup', label: 'Pick Up' }, { value: 'dropoff', label: 'Drop Off' }]} />
        {(['today', '7d', '30d', 'all'] as const).map(p => {
          const labels: Record<string, string> = { today: 'Today', '7d': '7 Days', '30d': '30 Days', all: 'All Time' }
          const active = preset === p
          return (
            <button key={p} type="button" onClick={() => applyPreset(p)}
              style={{ height: 40, padding: '0 14px', fontSize: 14, fontWeight: active ? 700 : 500, borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: active ? 'rgba(var(--brand-rgb),0.10)' : '#F7F6F5',
                border: `1px solid ${active ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.08)'}`,
                color: active ? 'var(--brand-color)' : 'var(--text-secondary)' }}>
              {labels[p]}
            </button>
          )
        })}
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset('all') }}
          style={{ height: 40, padding: '0 10px', fontSize: 14, color: '#1C1917', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit' }} />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset('all') }}
          style={{ height: 40, padding: '0 10px', fontSize: 14, color: '#1C1917', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit' }} />
        {hasFilters && (
          <button onClick={() => { setStatusFilter(''); setServiceFilter(''); setDateFrom(daysAgo(30)); setDateTo(todaySydney()); setPreset('30d') }}
            style={{ height: 40, padding: '0 14px', fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)', background: 'none', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear
          </button>
        )}
      </div>

      {/* Bookings card grid */}
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(0,0,0,0.01)', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>
            {loading ? 'Loading…' : `${displayRows.length} booking${displayRows.length !== 1 ? 's' : ''}${filtered.length !== displayRows.length ? ` (${filtered.length} slots)` : ''}`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {/* ICS legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {ICS_LEGEND.map(l => (
                <span key={l.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#94A3B8', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 'var(--r-full)', background: ICS_BAR_COLOR[l.key], flexShrink: 0, display: 'inline-block' }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <CardSkeleton />
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <Icon name={ICONS.bookings} size={36} style={{ opacity: 0.25 }} />
            </div>
            <p style={{ fontSize: 15 }}>
              {(() => {
                const hasOtherFilters = !!(statusFilter || serviceFilter || search)
                if (hasOtherFilters) return 'No bookings match your filters.'
                if (preset === 'today') return 'No bookings for today yet.'
                if (preset === '7d')    return 'No bookings in the last 7 days.'
                if (preset === '30d')   return 'No bookings in the last 30 days.'
                return 'No bookings in the selected range.'
              })()}
            </p>
          </div>
        ) : (
          <div>
            {/* Booking cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 10px' }}>
              {pagedRows.map((b, idx) => {
                const ics    = b.icsStatus ?? ''
                const cfg    = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.scheduled
                const isHeld = ics === 'held'
                const isBusy = !!actionLoading[b.id]
                const hbl    = b.houseBillNumber ?? b.containerNumber ?? null
                const source = b.bookingSource === 'self_booking' ? 'Self Booking' : b.bookingSource === 'guest' ? 'Guest User' : b.bookingSource === 'reception_booking' ? 'Reception' : null

                return (
                  <div
                    key={b.id}
                    onClick={() => navigate(`/reception/bookings/${b.id}`)}
                    style={{
                      display: 'flex', cursor: 'pointer',
                      border: `1px solid ${isHeld ? 'rgba(239,68,68,0.25)' : 'rgba(0,0,0,0.08)'}`,
                      borderRadius: 'var(--r-lg)',
                      background: isHeld ? 'rgba(239,68,68,0.025)' : '#FFFFFF',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      overflow: 'hidden',
                      transition: 'box-shadow 0.15s, background 0.12s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; e.currentTarget.style.background = isHeld ? 'rgba(239,68,68,0.05)' : '#FAFAF9' }}
                    onMouseOut={e  => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.background = isHeld ? 'rgba(239,68,68,0.025)' : '#FFFFFF' }}
                  >
                    {/* ICS colour bar */}
                    <div style={{ width: 5, flexShrink: 0, background: ICS_BAR_COLOR[ics] ?? ICS_BAR_COLOR.unavailable, borderRadius: '0' }} />

                    {/* Card body */}
                    <div style={{ flex: 1, minWidth: 0, padding: '14px 20px' }}>

                      {/* ── Top row ── */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                        {/* Reference */}
                        <span
                          style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: '#1C1917', display: 'inline-flex', alignItems: 'center', gap: 5, transition: 'color 0.15s', flexShrink: 0 }}
                          onMouseOver={e => { e.stopPropagation(); e.currentTarget.style.color = 'var(--brand-color)' }}
                          onMouseOut={e  => { e.currentTarget.style.color = '#1C1917' }}
                          title="Click to copy"
                          onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(b.referenceNumber).then(() => toast('Reference copied', 'info')).catch(() => {}) }}
                        >
                          {b.referenceNumber}
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, flexShrink: 0 }}>
                            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        </span>
                        {source && <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>— Created by {source}</span>}

                        <div style={{ flex: 1 }} />

                        {/* Service · Load */}
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                          {b.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'} — {(b.loadType ?? '').toUpperCase()}
                        </span>

                        {/* Slot time */}
                        <span style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          Slot : {b.slotStartTime ?? '—'}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                          {fmtShortDate(b.slotDate)}
                        </span>

                        {/* Status badge */}
                        <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, borderRadius: 'var(--r-xl)', padding: '4px 10px 4px 7px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={cfg.icon} /></svg>
                          {cfg.label}
                        </span>
                      </div>

                      {/* ── Bottom row ── */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                        {/* Driver */}
                        <span style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          Driver: <strong style={{ color: '#1C1917' }}>{b.driverName}</strong>
                        </span>

                        {/* Rego + company */}
                        {(b.vehicleRegistration || b.companyName) && (
                          <span style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            Rego: <strong style={{ color: '#1C1917' }}>{b.vehicleRegistration ?? '—'}</strong>
                            {b.companyName && <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>{b.companyName}</span>}
                          </span>
                        )}

                        {/* Container */}
                        {b.containerNumber && (
                          <span style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            Container number: <strong style={{ color: '#1C1917', fontFamily: 'ui-monospace,monospace' }}>{b.containerNumber}</strong>
                          </span>
                        )}

                        {/* HBL */}
                        {hbl && (
                          <span style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            House bill number: <strong style={{ color: '#1C1917', fontFamily: 'ui-monospace,monospace' }}>{hbl}</strong>
                          </span>
                        )}

                        <div style={{ flex: 1 }} />

                        {/* Action buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          {/* PDF / view */}
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/reception/bookings/${b.id}`) }}
                            style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626' }}
                            title="View booking"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                            </svg>
                          </button>

                          {/* Check In — only for scheduled */}
                          {b.status === 'scheduled' && perms.can_mark_complete && (
                            <button
                              onClick={e => handleCheckIn(b, e)}
                              disabled={isBusy}
                              style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, color: '#374151', background: '#F3F4F6', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: isBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: isBusy ? 0.6 : 1 }}
                            >
                              {actionLoading[b.id] === 'checkin' ? 'Updating…' : 'Mark as Checked In'}
                            </button>
                          )}

                          {/* Complete — for scheduled or checked_in */}
                          {(b.status === 'scheduled' || b.status === 'checked_in') && perms.can_mark_complete && (
                            <button
                              onClick={e => handleComplete(b, e)}
                              disabled={isBusy}
                              style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 700, color: '#fff', background: isBusy ? '#6B7280' : '#1C1917', border: 'none', borderRadius: 'var(--r-full)', cursor: isBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                            >
                              {actionLoading[b.id] === 'complete' ? 'Updating…' : 'Mark as Complete'}
                            </button>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                )
              })}
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, displayRows.length)} of {displayRows.length}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    style={{ height: 32, padding: '0 12px', fontSize: 14, fontWeight: 500, borderRadius: 'var(--r-full)', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', color: page === 1 ? '#C7C3BF' : '#1C1917', cursor: page === 1 ? 'default' : 'pointer' }}
                  >← Prev</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                    .reduce<(number | '…')[]>((acc, n, idx, arr) => {
                      if (idx > 0 && (n as number) - (arr[idx - 1] as number) > 1) acc.push('…')
                      acc.push(n)
                      return acc
                    }, [])
                    .map((n, i) => n === '…' ? (
                      <span key={`ellipsis-${i}`} style={{ height: 32, padding: '0 8px', display: 'inline-flex', alignItems: 'center', fontSize: 14, color: 'var(--text-tertiary)' }}>…</span>
                    ) : (
                      <button key={n} onClick={() => setPage(n as number)}
                        style={{ height: 32, minWidth: 32, padding: '0 10px', fontSize: 14, fontWeight: n === page ? 700 : 500, borderRadius: 'var(--r-full)', border: '1px solid rgba(0,0,0,0.12)', background: n === page ? 'var(--brand-color)' : '#fff', color: n === page ? 'var(--brand-text)' : '#1C1917', cursor: 'pointer' }}
                      >{n}</button>
                    ))
                  }
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    style={{ height: 32, padding: '0 12px', fontSize: 14, fontWeight: 500, borderRadius: 'var(--r-full)', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', color: page === totalPages ? '#C7C3BF' : '#1C1917', cursor: page === totalPages ? 'default' : 'pointer' }}
                  >Next →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* Cancel confirmation modal */}
    {cancelTarget && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}
        onClick={() => setCancelTarget(null)}
      >
        <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: '28px 28px 24px', maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.20)' }}
          onClick={e => e.stopPropagation()}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 10, letterSpacing: '-0.02em' }}>Cancel Booking</h2>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
            Are you sure you want to cancel booking <strong style={{ fontFamily: 'ui-monospace,monospace', color: '#1C1917' }}>{cancelTarget.referenceNumber}</strong>? This action cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setCancelTarget(null)}
              style={{ padding: '9px 18px', fontSize: 15, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Keep Booking
            </button>
            <button
              type="button"
              onClick={confirmCancel}
              disabled={cancelling}
              style={{ padding: '9px 18px', fontSize: 15, fontWeight: 600, color: '#fff', background: cancelling ? '#FCA5A5' : '#DC2626', border: 'none', borderRadius: 'var(--r-full)', cursor: cancelling ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.13s' }}
            >
              {cancelling ? 'Cancelling…' : 'Cancel Booking'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

