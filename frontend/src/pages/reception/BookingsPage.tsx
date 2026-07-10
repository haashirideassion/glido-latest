import React, { useState, useEffect, useCallback, useRef } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { getBookings, getBookingsByDateRange, cancelBooking, checkInBooking, completeBooking } from '@/lib/db/bookings'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { todaySydney, TZ } from '@/lib/time'
import type { Booking } from '@/data/types'
import { useStaffPermissions } from '@/lib/useStaffPermissions'
import { useTenantInfo } from '@/lib/useTenantInfo'
import { generateBookingPdf } from '@/lib/bookingPdf'
import { BookingSlideOver } from '@/components/reception/BookingSlideOver'
import { AnimatedNumber, motion } from '@/lib/motion'
import { EmptyState } from '@/components/reception/EmptyState'

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
        <div key={t.key} style={{ flex: 1, minWidth: 0, padding: 'var(--kpi-pad-y) var(--kpi-pad-x)', borderLeft: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.07)' }}>
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
    <div style={{ display: 'flex', alignItems: 'stretch', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', overflowX: 'auto', overflowY: 'hidden', marginBottom: 'var(--card-gap)', boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
      {KPI_TILES.map((t, i) => {
        return (
          <div key={t.key}
            style={{ flex: 1, minWidth: 150, padding: 'var(--kpi-pad-y) var(--kpi-pad-x)', borderLeft: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.07)', transition: 'background 0.18s ease' }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.015)')}
            onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 'var(--r-md)', background: t.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${t.iconFg}22` }}>
                <Icon name={t.icon} size={16} style={{ color: t.iconFg }} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</p>
            </div>
            <p style={{ fontSize: 'var(--kpi-value)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#1C1917', margin: '0 0 3px', fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={curr[t.key as KpiKey]} /></p>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.sub}</p>
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

// Service × load-type combo filter (mirrors the Analytics page row)
const COMBOS = [
  { key: 'all',          label: 'All',            service: null,      load: null  },
  { key: 'fcl-pickup',   label: 'FCL — Pick Up',  service: 'pickup',  load: 'fcl' },
  { key: 'fcl-dropoff',  label: 'FCL — Drop Off', service: 'dropoff', load: 'fcl' },
  { key: 'lcl-pickup',   label: 'LCL — Pick Up',  service: 'pickup',  load: 'lcl' },
  { key: 'lcl-dropoff',  label: 'LCL — Drop Off', service: 'dropoff', load: 'lcl' },
] as const

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
  const tenant = useTenantInfo()
  const [printingId, setPrintingId] = useState('')

  const handlePrint = async (b: Booking, e: React.MouseEvent) => {
    e.stopPropagation()
    setPrintingId(b.id)
    try {
      await generateBookingPdf(b, tenant ? { name: tenant.name, logoUrl: tenant.logoUrl } : undefined)
    } catch {
      toast('Could not generate PDF', 'error')
    } finally {
      setPrintingId('')
    }
  }

  const [searchParams, setSearchParams] = useSearchParams()
  const _initialPreset: Preset = searchParams.get('filter') === 'today' ? 'today' : '30d'
  const [bookings,     setBookings]     = useState<Booking[]>([])
  const [prevBookings, setPrevBookings] = useState<Booking[]>([])
  const [loading,      setLoading]      = useState(true)
  const [kpiLoading,   setKpiLoading]   = useState(true)
  const [preset,       setPreset]       = useState<Preset>(_initialPreset)
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [serviceFilter,setServiceFilter]= useState('')
  const [comboFilter,  setComboFilter]  = useState<string>('all')
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

  // ── Split view (Apple-Mail style) ──
  const [selected, setSelected] = useState<Booking | null>(null)
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true))
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Auto-select booking from ?select= query param (e.g. notification click)
  const selectParam = searchParams.get('select')
  useEffect(() => {
    if (!selectParam || bookings.length === 0) return
    const match = bookings.find(b => b.id === selectParam || b.referenceNumber === selectParam)
    if (match) {
      setSelected(match)
      // Clear the param so background refreshes don't re-select after user closes
      setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('select'); return n }, { replace: true })
    }
  }, [bookings, selectParam]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reflect an in-pane update back into the list without a full reload
  const onBookingUpdated = useCallback((updated: Booking) => {
    setBookings(prev => prev.map(x => (x.id === updated.id ? updated : x)))
    setSelected(sel => (sel && sel.id === updated.id ? updated : sel))
  }, [])


  const confirmCancel = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await cancelBooking(cancelTarget.id)
      toast('Booking cancelled', 'success')
      setCancelTarget(null)
      load({ silent: true })
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
      load({ silent: true })
    } catch { toast('Failed to update status', 'error') }
    finally { setActionLoading(prev => { const n = { ...prev }; delete n[b.id]; return n }) }
  }

  const handleComplete = async (b: Booking, e: React.MouseEvent) => {
    e.stopPropagation()
    setActionLoading(prev => ({ ...prev, [b.id]: 'complete' }))
    try {
      await completeBooking(b.id)
      toast('Booking completed', 'success')
      load({ silent: true })
    } catch { toast('Failed to update status', 'error') }
    finally { setActionLoading(prev => { const n = { ...prev }; delete n[b.id]; return n }) }
  }

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false
    if (!silent) { setLoading(true); setKpiLoading(true) }
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
      if (!silent) { setLoading(false); setKpiLoading(false) }
    }
  }, [dateFrom, dateTo])

  // Reload on mount AND every time the user navigates back to this page
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load, location.key])
  useEffect(() => { setPage(1) }, [statusFilter, serviceFilter, comboFilter, search, dateFrom, dateTo])
  // Background refresh — silent so it doesn't flash the whole table/KPIs back to
  // skeletons every 15s (staff perceived that as the page randomly "reloading")
  useEffect(() => {
    const id = setInterval(() => load({ silent: true }), 15000)
    return () => clearInterval(id)
  }, [load])

  const activeCombo = COMBOS.find(c => c.key === comboFilter)
  const filtered = bookings.filter(b => {
    if (statusFilter && b.status !== statusFilter) return false
    if (serviceFilter && b.serviceType !== serviceFilter) return false
    if (activeCombo?.service && (b.serviceType !== activeCombo.service || b.loadType !== activeCombo.load)) return false
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

  const exportCsv = (rowsIn: Booking[] = filtered) => {
    const header = ['Reference', 'Date', 'Time', 'Driver', 'Service', 'HBL', 'ICS', 'Status']
    const rows = rowsIn.map(b => [b.referenceNumber, b.slotDate, b.slotStartTime, b.driverName, `${b.serviceType} ${b.loadType}`, b.houseBillNumber ?? '', b.icsStatus ?? '', b.status].map(v => `"${String(v).replace(/"/g, '""')}"`))
    const csv = [header, ...rows].map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = 'glido-bookings.csv'
    a.click()
  }

  // ── Bulk selection ──────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const clearSelection = () => setSelectedIds(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const bulkCheckIn = async () => {
    const targets = bookings.filter(b => selectedIds.has(b.id) && b.status === 'scheduled')
    if (targets.length === 0) { toast('No scheduled bookings in the selection', 'info'); return }
    setBulkBusy(true)
    try {
      await Promise.all(targets.map(b => checkInBooking(b.id)))
      toast(`${targets.length} booking${targets.length !== 1 ? 's' : ''} marked pre-processed`, 'success')
      clearSelection()
      load({ silent: true })
    } catch {
      toast('Some bookings could not be updated', 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkExport = () => {
    exportCsv(bookings.filter(b => selectedIds.has(b.id)))
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

  const hasFilters = !!(statusFilter || serviceFilter || comboFilter !== 'all' || search || preset !== '30d')


  return (
    <>
    {/* Pulse animation keyframes */}
    <style>{`
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
      .booking-ref-copy { cursor: pointer; transition: color 0.15s ease; }
      .booking-ref-copy:hover { color: var(--brand-color) !important; }
      .booking-ref-copy:hover svg { opacity: 0.8; }
    `}</style>

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
          <button onClick={() => exportCsv()}
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
          <button onClick={() => { setStatusFilter(''); setServiceFilter(''); setComboFilter('all'); setDateFrom(daysAgo(30)); setDateTo(todaySydney()); setPreset('30d') }}
            style={{ height: 40, padding: '0 14px', fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)', background: 'none', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear
          </button>
        )}
      </div>

      {/* ── Service × load-type combo filter (mirrors Analytics) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {COMBOS.map(c => {
          const active = comboFilter === c.key
          return (
            <button key={c.key} type="button" onClick={() => setComboFilter(c.key)}
              style={{ height: 40, padding: '0 14px', fontSize: 14, fontWeight: active ? 700 : 500, borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: active ? 'rgba(var(--brand-rgb),0.10)' : '#F7F6F5',
                border: `1px solid ${active ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.08)'}`,
                color: active ? 'var(--brand-color)' : 'var(--text-secondary)' }}>
              {c.label}
            </button>
          )
        })}
      </div>

      {/* ── Floating bulk action bar — fixed bottom centre ── */}
      {selectedIds.size > 0 && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 200, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 6px 6px 14px', background: '#1C1917', borderRadius: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.18)', whiteSpace: 'nowrap', animation: 'slideUp 0.18s ease' }}>
          <style>{`@keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>

          {/* Count badge */}
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 24, height: 24, padding: '0 8px', background: 'rgba(255,255,255,0.15)', borderRadius: 9999, fontSize: 13, fontWeight: 700, color: '#fff', marginRight: 4 }}>
            {selectedIds.size}
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.65)', marginRight: 8 }}>
            selected
          </span>

          {/* Divider */}
          <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)', margin: '0 4px', flexShrink: 0 }} />

          {perms.can_mark_complete && (
            <button onClick={bulkCheckIn} disabled={bulkBusy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, color: '#1C1917', background: bulkBusy ? 'rgba(255,255,255,0.5)' : '#fff', border: 'none', borderRadius: 9999, cursor: bulkBusy ? 'wait' : 'pointer', fontFamily: 'inherit', transition: 'background 0.12s' }}
              onMouseOver={e => { if (!bulkBusy) e.currentTarget.style.background = '#F3F4F6' }}
              onMouseOut={e  => { if (!bulkBusy) e.currentTarget.style.background = '#fff' }}
            >
              <Icon name={ICONS.check} size={14} /> {bulkBusy ? 'Working…' : 'Mark pre-processed'}
            </button>
          )}
          {perms.can_export_csv && (
            <button onClick={bulkExport}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 9999, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.12s' }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)' }}
              onMouseOut={e  => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)' }}
            >
              <Icon name={ICONS.download} size={14} /> Export
            </button>
          )}

          {/* Divider */}
          <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)', margin: '0 4px', flexShrink: 0 }} />

          {/* Dismiss × */}
          <button onClick={clearSelection}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 9999, cursor: 'pointer', color: 'rgba(255,255,255,0.6)', transition: 'background 0.12s, color 0.12s', flexShrink: 0 }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = '#fff' }}
            onMouseOut={e  => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
            title="Clear selection"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      )}

      {/* Split view: list (left) + docked detail pane (right) */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
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
          <EmptyState
            variant={(statusFilter || serviceFilter || search) ? 'search' : 'box'}
            title={(() => {
              const hasOtherFilters = !!(statusFilter || serviceFilter || search)
              if (hasOtherFilters) return 'No bookings match your filters'
              if (preset === 'today') return 'No bookings for today yet'
              if (preset === '7d')    return 'No bookings in the last 7 days'
              if (preset === '30d')   return 'No bookings in the last 30 days'
              return 'No bookings in the selected range'
            })()}
            subtitle={(statusFilter || serviceFilter || search) ? 'Try adjusting your search or filters.' : 'New bookings will appear here as they come in.'}
          />
        ) : (
          <div>
            {/* Select-all row */}
            {pagedRows.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px 4px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <input
                  type="checkbox"
                  aria-label="Select all visible bookings"
                  checked={pagedRows.every(b => selectedIds.has(b.id))}
                  onChange={() => {
                    const allSelected = pagedRows.every(b => selectedIds.has(b.id))
                    setSelectedIds(prev => {
                      const next = new Set(prev)
                      for (const b of pagedRows) { if (allSelected) next.delete(b.id); else next.add(b.id) }
                      return next
                    })
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Select all on this page</span>
              </div>
            )}

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 10px' }}>
              {pagedRows.map(b => {
                const ics        = b.icsStatus ?? 'unavailable'
                const cfg        = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.scheduled
                const isBusy     = !!actionLoading[b.id]
                // Show every identifying detail this booking actually has, each clearly labelled —
                // collapsing HBL/container into one unlabelled field made FCL and LCL bookings
                // look identical and hid whichever value lost the fallback.
                const details: { label: string; value: string; icon: string }[] = []
                if (b.vehicleRegistration) details.push({ label: 'Rego',        value: b.vehicleRegistration, icon: ICONS.truck })
                if (b.containerNumber)     details.push({ label: 'Container',   value: b.containerNumber,     icon: ICONS.container })
                if (b.houseBillNumber)     details.push({ label: 'HBL',         value: b.houseBillNumber,     icon: ICONS.document })
                if (b.bookingReference)    details.push({ label: 'Booking Ref', value: b.bookingReference,    icon: ICONS.bookings })
                if (b.entryNumber)         details.push({ label: 'Entry #',     value: b.entryNumber,         icon: ICONS.qrCode })
                const isSel      = selected?.id === b.id
                const displayRef = b.groupReference ?? b.referenceNumber

                return (
                  <div
                    key={b.id}
                    onClick={() => setSelected(b)}
                    style={{ display: 'flex', cursor: 'pointer', border: `1px solid ${isSel ? 'rgba(var(--brand-rgb),0.35)' : 'rgba(0,0,0,0.08)'}`, borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden', background: isSel ? 'rgba(var(--brand-rgb),0.05)' : '#fff', transition: 'box-shadow 0.15s, background 0.12s, border-color 0.12s' }}
                    onMouseOver={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)' }}
                    onMouseOut={e  => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
                  >
                    {/* ICS colour bar */}
                    <div style={{ width: 5, flexShrink: 0, background: ICS_BAR_COLOR[ics] ?? ICS_BAR_COLOR.unavailable }} />

                    <div style={{ flex: 1, minWidth: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Top row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {/* Bulk checkbox */}
                        <input
                          type="checkbox"
                          aria-label={`Select booking ${b.referenceNumber}`}
                          checked={selectedIds.has(b.id)}
                          onChange={() => toggleSelect(b.id)}
                          onClick={e => e.stopPropagation()}
                          style={{ cursor: 'pointer' }}
                        />

                        {/* Reference (copyable) */}
                        <span
                          className="booking-ref-copy"
                          style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, fontWeight: 700, color: '#1C1917', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                          title="Click to copy"
                          onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(displayRef).then(() => toast('Reference copied', 'info')).catch(() => {}) }}
                        >
                          {displayRef}
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        </span>

                        {/* Service · Load */}
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {b.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'} · {(b.loadType ?? '').toUpperCase()}
                        </span>

                        {/* Slot time + date */}
                        <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                          {b.slotStartTime}{b.slotEndTime ? ` – ${b.slotEndTime}` : ''}{b.slotDate ? ` · ${fmtShortDate(b.slotDate)}` : ''}
                        </span>

                        <div style={{ flex: 1 }} />

                        {/* Status badge */}
                        {(b.status === 'scheduled' || b.status === 'checked_in') ? (
                          <span style={{ fontSize: 12, fontWeight: 600, color: cfg.color, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <path d={cfg.icon} />
                            </svg>
                            {cfg.label}
                          </span>
                        ) : (
                          <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, borderRadius: 'var(--r-xl)', padding: '3px 9px 3px 7px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <path d={cfg.icon} />
                            </svg>
                            {cfg.label}
                          </span>
                        )}
                      </div>

                      {/* Bottom row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1C1917' }}>{b.driverName}</span>
                        {details.map(d => (
                          <span key={d.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.04)', padding: '2px 8px 2px 7px', borderRadius: 'var(--r-sm)' }}>
                            <Icon name={d.icon} size={18} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d.label}</span>
                            <span style={{ fontSize: 12, color: '#374151' }}>{d.value}</span>
                          </span>
                        ))}
                        <div style={{ flex: 1 }} />
                        {/* Print booking PDF */}
                        <motion.button
                          onClick={e => handlePrint(b, e)}
                          disabled={printingId === b.id}
                          whileTap={printingId === b.id ? undefined : { scale: 0.94 }}
                          title="Print booking PDF"
                          style={{ height: 28, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: printingId === b.id ? 'wait' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                        >
                          <Icon name={ICONS.download} size={13} />
                          {printingId === b.id ? 'Preparing…' : 'Print'}
                        </motion.button>
                        {/* Quick action */}
                        {b.status === 'scheduled' && perms.can_mark_complete ? (
                          <motion.button
                            onClick={e => handleCheckIn(b, e)}
                            disabled={isBusy}
                            whileTap={isBusy ? undefined : { scale: 0.94 }}
                            style={{ height: 28, padding: '0 12px', fontSize: 12.5, fontWeight: 600, color: '#374151', background: '#F3F4F6', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: isBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: isBusy ? 0.6 : 1 }}
                          >
                            {actionLoading[b.id] === 'checkin' ? 'Updating…' : 'Mark as Checked In'}
                          </motion.button>
                        ) : b.status === 'checked_in' && perms.can_mark_complete ? (
                          <motion.button
                            onClick={e => handleComplete(b, e)}
                            disabled={isBusy}
                            whileTap={isBusy ? undefined : { scale: 0.94 }}
                            style={{ height: 28, padding: '0 12px', fontSize: 12.5, fontWeight: 700, color: '#fff', background: isBusy ? '#6B7280' : '#1C1917', border: 'none', borderRadius: 'var(--r-full)', cursor: isBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                          >
                            {actionLoading[b.id] === 'complete' ? 'Updating…' : 'Mark as Complete'}
                          </motion.button>
                        ) : null}
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

      {/* Docked detail pane — Apple-Mail split view (wide screens) */}
      {selected && isWide && (
        <div style={{ width: 480, flexShrink: 0, position: 'sticky', top: 12, height: 'calc(100vh - var(--dash-header-h) - 24px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <BookingSlideOver key={selected.id} docked booking={selected} perms={perms} onClose={() => setSelected(null)} onUpdated={onBookingUpdated} />
        </div>
      )}
      </div>{/* end split row */}
    </div>

    {/* Detail overlay — narrow screens */}
    {selected && !isWide && (
      <BookingSlideOver key={selected.id} booking={selected} perms={perms} onClose={() => setSelected(null)} onUpdated={onBookingUpdated} />
    )}

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

