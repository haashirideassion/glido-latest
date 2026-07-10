import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { fmtTime } from '@/lib/time'
import { getActiveWalkIns } from '@/lib/db/walk-ins'
import { getBookings, getBookingById } from '@/lib/db/bookings'
import { useStaffPermissions } from '@/lib/useStaffPermissions'
import { useTenantInfo } from '@/lib/useTenantInfo'
import { generateBookingPdf } from '@/lib/bookingPdf'
import { BookingSlideOver } from '@/components/reception/BookingSlideOver'
import { AnimatedNumber, motion } from '@/lib/motion'
import { toast } from '@/lib/toast'
import { EmptyState } from '@/components/reception/EmptyState'
import type { Booking } from '@/data/types'

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'
import { todaySydney, TZ } from '@/lib/time'
import type { WalkIn, WalkInPurpose } from '@/data/types'


const PURPOSE_LABEL: Record<string, string> = {
  walk_in_pickup:  'Pick Up',
  walk_in_dropoff: 'Drop Off',
  visit_person:    'Visiting Person',
  visit_office:    'Visiting Office',
  visit_yard:      'Visiting Yard',
}

// ── Unified visitor entry shape ───────────────────────────────────────────────
interface VisitorEntry {
  id:                 string
  type:               'walkin' | 'booking'
  name:               string
  phone:              string | null
  companyName:        string | null
  purpose:            string
  arrivedAt:          string
  licenceCaptured:    boolean
  personBeingVisited: string | null
  bookingRef?:        string
  serviceType?:       string
  loadType?:          string
  status?:            string
  icsStatus?:         string
}

function walkInToEntry(w: WalkIn): VisitorEntry {
  return {
    id:                 w.id,
    type:               'walkin',
    name:               w.visitorName,
    phone:              w.contactNumber ?? null,
    companyName:        w.companyName ?? null,
    purpose:            PURPOSE_LABEL[w.purpose] ?? w.purpose,
    arrivedAt:          w.arrivedAt,
    licenceCaptured:    w.licenceCaptured,
    personBeingVisited: w.personBeingVisited ?? null,
  }
}



const ICS_BAR_COLOR: Record<string, string> = {
  cleared:     '#22C55E',
  held:        '#EF4444',
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

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: TZ })

type Preset = 'today' | '7d' | '30d' | 'all'

// Service × load-type combo filter (mirrors the Analytics / Bookings row). Walk-ins have no
// cargo booking, so they only match "All".
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

export default function WalkInsPage() {
  usePageTitle('Glido | Visitor Management')
  const perms = useStaffPermissions()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [visitors, setVisitors] = useState<VisitorEntry[]>([])
  const [loading,  setLoading]  = useState(true)

  // ── Split view ──
  const [selected, setSelected] = useState<VisitorEntry | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true))
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // Fetch the full booking record when a booking-type row is selected
  useEffect(() => {
    let cancelled = false
    if (selected?.type === 'booking') {
      setBookingLoading(true)
      setSelectedBooking(null)
      getBookingById(selected.id)
        .then(b => { if (!cancelled) setSelectedBooking(b ?? null) })
        .catch(() => { if (!cancelled) setSelectedBooking(null) })
        .finally(() => { if (!cancelled) setBookingLoading(false) })
    } else {
      setSelectedBooking(null)
    }
    return () => { cancelled = true }
  }, [selected])
  // Auto-select visitor from ?select= param (notification click)
  const selectParam = searchParams.get('select')
  useEffect(() => {
    if (!selectParam || visitors.length === 0) return
    const match = visitors.find(v => v.id === selectParam)
    if (match) {
      setSelected(match)
      setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('select'); return n }, { replace: true })
    }
  }, [visitors, selectParam]) // eslint-disable-line react-hooks/exhaustive-deps

  const openEntry = (v: VisitorEntry) => { if (isWide) setSelected(v); else navigate(`/reception/visitors/${v.id}`) }

  const tenant = useTenantInfo()
  const [printingId, setPrintingId] = useState('')
  const handlePrint = async (v: VisitorEntry, e: React.MouseEvent) => {
    e.stopPropagation()
    setPrintingId(v.id)
    try {
      const booking = await getBookingById(v.id)
      if (!booking) { toast('Booking not found', 'error'); return }
      await generateBookingPdf(booking, tenant ? { name: tenant.name, logoUrl: tenant.logoUrl } : undefined)
    } catch {
      toast('Could not generate PDF', 'error')
    } finally {
      setPrintingId('')
    }
  }

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [preset,      setPreset]      = useState<Preset>('today')
  const [dateFrom,    setDateFrom]    = useState(() => todaySydney())
  const [dateTo,      setDateTo]      = useState(() => todaySydney())
  const [typeFilter,  setTypeFilter]  = useState('')   // '' | 'walkin' | 'booking'
  const [combo,       setCombo]       = useState<string>('all')
  const [search,      setSearch]      = useState('')

  const applyPreset = (p: Preset) => {
    setPreset(p)
    const { from, to } = presetDates(p)
    setDateFrom(from)
    setDateTo(to)
  }

  const hasFilters = !!(typeFilter || combo !== 'all' || search || preset !== 'today')
  const clearAll = () => { setTypeFilter(''); setCombo('all'); setSearch(''); applyPreset('today') }
  const activeCombo = COMBOS.find(c => c.key === combo)

  // ── Data fetching ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [walkIns, checkedInBookings] = await Promise.all([
        getActiveWalkIns(DEFAULT_TENANT_ID),
        getBookings().then(all => all.filter(b => b.status === 'checked_in')),
      ])

      const walkInEntries  = walkIns.map(walkInToEntry)
      const bookingEntries = checkedInBookings.map(b => ({
        id:                 b.id,
        type:               'booking' as const,
        name:               b.driverName,
        phone:              b.driverPhone ?? null,
        companyName:        null,
        purpose:            b.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off',
        arrivedAt:          b.checkedInAt || b.createdAt || '',
        licenceCaptured:    true,
        personBeingVisited: null,
        bookingRef:         b.referenceNumber,
        serviceType:        b.serviceType,
        loadType:           b.loadType,
        status:             b.status,
        icsStatus:          b.icsStatus ?? undefined,
      }))
      const merged = [...walkInEntries, ...bookingEntries]
        .sort((a, b) => new Date(a.arrivedAt).getTime() - new Date(b.arrivedAt).getTime())

      setVisitors(merged)
    } catch (err) {
      console.error('[Visitors] ERROR:', err)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  // ── Filtering ─────────────────────────────────────────────────────────────────
  const filtered = visitors.filter(v => {
    if (typeFilter === 'walkin'  && v.type !== 'walkin')  return false
    if (typeFilter === 'booking' && v.type !== 'booking') return false

    if (activeCombo?.service && (v.serviceType !== activeCombo.service || v.loadType !== activeCombo.load)) return false

    if (dateFrom || dateTo) {
      const d = v.arrivedAt
        ? new Date(v.arrivedAt).toLocaleDateString('en-CA', { timeZone: TZ })
        : ''
      if (dateFrom && d < dateFrom) return false
      if (dateTo   && d > dateTo)   return false
    }

    if (search) {
      const s = search.toLowerCase()
      if (
        !v.name.toLowerCase().includes(s) &&
        !(v.phone ?? '').toLowerCase().includes(s) &&
        !(v.companyName ?? '').toLowerCase().includes(s) &&
        !(v.bookingRef ?? '').toLowerCase().includes(s)
      ) return false
    }

    return true
  })

  // ── KPI counts ────────────────────────────────────────────────────────────────
  const kpi = {
    checkedIn:  filtered.filter(v => v.type === 'booking').length,
    completed:  filtered.filter(v => v.type === 'booking' && (v as any).status === 'completed').length,
  }

  // ── CSV export ────────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const header = ['Type', 'Name', 'Phone', 'Company', 'Purpose', 'Arrived', 'Licence', 'Reference']
    const rows = filtered.map(v => [
      v.type === 'booking' ? 'Booking' : 'Walk-in',
      v.name,
      v.phone ?? '',
      v.companyName ?? '',
      v.purpose,
      fmtTime(v.arrivedAt),
      v.licenceCaptured ? 'Captured' : 'Not captured',
      v.bookingRef ?? '',
    ].map(val => `"${String(val).replace(/"/g, '""')}"`))
    const csv = [header, ...rows].map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `visitors-${todaySydney()}.csv`
    a.click()
  }

  // ── KPI tile style ────────────────────────────────────────────────────────────
  const KPI_DEF = [
    { key: 'checkedIn', label: 'Checked In', sub: 'Booking check-ins',  icon: ICONS.userCheck, iconBg: 'rgba(34,197,94,0.10)',  iconFg: '#22C55E', val: kpi.checkedIn },
    { key: 'completed', label: 'Completed',  sub: 'Processed bookings', icon: ICONS.bookings,  iconBg: 'rgba(107,114,128,0.10)', iconFg: '#6B7280', val: kpi.completed },
  ]


  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        @keyframes vp-pulse{0%,100%{opacity:1}50%{opacity:0.45}}
        .booking-ref-copy { cursor: pointer; transition: color 0.15s ease; }
        .booking-ref-copy:hover { color: var(--brand-color) !important; }
        .booking-ref-copy:hover svg { opacity: 0.8; }
      `}</style>

      {/* KPI tiles */}
      <div style={{ display: 'flex', alignItems: 'stretch', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 'var(--card-gap)', boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
        {KPI_DEF.map((t, i) => (
          <div key={t.key}
            style={{ flex: 1, minWidth: 0, padding: 'var(--kpi-pad-y) var(--kpi-pad-x)', borderLeft: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.07)', transition: 'background 0.18s ease' }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.015)')}
            onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 'var(--r-md)', background: t.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${t.iconFg}22` }}>
                <Icon name={t.icon} size={16} style={{ color: t.iconFg }} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</p>
            </div>
            {loading
              ? <div style={{ width: 48, height: 'var(--kpi-value)', borderRadius: 'var(--r-sm)', background: '#F3F3F2', animation: 'vp-pulse 1.5s ease-in-out infinite' }} />
              : <p style={{ fontSize: 'var(--kpi-value)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#1C1917', margin: '0 0 3px', fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={t.val} /></p>}
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Search + actions bar ── */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, ref…"
            size={32}
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
      </div>

      {/* Filter bar — spacing to the combo row below comes from the parent column's gap (16),
          so no marginBottom here (else it would double up and look too loose). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <CustomSelect placeholder="All Types" value={typeFilter} onChange={setTypeFilter} width={160}
          options={[{ value: 'walkin', label: 'Walk-in Only' }, { value: 'booking', label: 'Booking Only' }]} />

        {/* Quick presets */}
        {(['today', '7d', '30d', 'all'] as const).map(p => {
          const labels: Record<string, string> = { today: 'Today', '7d': '7 Days', '30d': '30 Days', all: 'All Time' }
          const active = preset === p
          return (
            <button key={p} type="button" onClick={() => applyPreset(p)}
              style={{ height: 40, padding: '0 16px', fontSize: 14, fontWeight: active ? 700 : 500, borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: active ? 'rgba(var(--brand-rgb),0.10)' : '#F7F6F5',
                border: `1px solid ${active ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.08)'}`,
                color: active ? 'var(--brand-color)' : 'var(--text-secondary)' }}>
              {labels[p]}
            </button>
          )
        })}

        {/* Date pickers */}
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset('today') }}
          style={{ height: 40, padding: '0 12px', fontSize: 14, color: dateFrom ? '#1C1917' : '#9CA3AF', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit' }} />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset('today') }}
          style={{ height: 40, padding: '0 12px', fontSize: 14, color: dateTo ? '#1C1917' : '#9CA3AF', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit' }} />

        {hasFilters && (
          <button onClick={clearAll}
            style={{ height: 40, padding: '0 14px', fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)', background: 'none', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear
          </button>
        )}
      </div>

      {/* ── Service × load-type combo filter (mirrors Analytics / Bookings) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {COMBOS.map(c => {
          const active = combo === c.key
          return (
            <button key={c.key} type="button" onClick={() => setCombo(c.key)}
              style={{ height: 40, padding: '0 16px', fontSize: 14, fontWeight: active ? 700 : 500, borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: active ? 'rgba(var(--brand-rgb),0.10)' : '#F7F6F5',
                border: `1px solid ${active ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.08)'}`,
                color: active ? 'var(--brand-color)' : 'var(--text-secondary)' }}>
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Split view: list (left) + docked detail pane (right) */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(0,0,0,0.01)' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>
            {loading ? 'Loading…' : `${filtered.length} visitor${filtered.length !== 1 ? 's' : ''}`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {ICS_LEGEND.map(l => (
              <span key={l.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#94A3B8', whiteSpace: 'nowrap' }}>
                <span style={{ width: 8, height: 8, borderRadius: 'var(--r-full)', background: ICS_BAR_COLOR[l.key], flexShrink: 0, display: 'inline-block' }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 15 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            variant={(typeFilter || search) ? 'search' : 'inbox'}
            title={(() => {
              if (!!(typeFilter || search)) return 'No visitors match your filters'
              if (preset === 'today') return 'No visitors for today yet'
              if (preset === '7d')    return 'No visitors in the last 7 days'
              if (preset === '30d')   return 'No visitors in the last 30 days'
              return 'No visitors in the selected range'
            })()}
            subtitle={(typeFilter || search) ? 'Try adjusting your search or filters.' : 'Check-ins and walk-ins will show up here.'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 10px' }}>
            {filtered.map(v => {
              const ics      = v.icsStatus ?? 'unavailable'
              const isWalkin = v.type === 'walkin'
              const isSel    = !!(selected && selected.id === v.id && selected.type === v.type)
              // Bar colour always maps to the ICS legend (Cleared/Held/Examination/Pending/N/A)
              // — walk-ins have no ICS status, so they fall through to "unavailable" (N/A),
              // same as the legend, instead of an unrelated purple that wasn't in it at all.
              const barColor = ICS_BAR_COLOR[ics] ?? ICS_BAR_COLOR.unavailable

              return (
                <div
                  key={`${v.type}-${v.id}`}
                  onClick={() => openEntry(v)}
                  style={{ display: 'flex', cursor: 'pointer', border: `1px solid ${isSel ? 'rgba(var(--brand-rgb),0.35)' : 'rgba(0,0,0,0.08)'}`, borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden', background: isSel ? 'rgba(var(--brand-rgb),0.05)' : '#fff', transition: 'box-shadow 0.15s, background 0.12s, border-color 0.12s' }}
                  onMouseOver={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)' }}
                  onMouseOut={e  => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
                >
                  {/* ICS / type colour bar */}
                  <div style={{ width: 5, flexShrink: 0, background: barColor }} />

                  <div style={{ flex: 1, minWidth: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      {/* Ref + name (booking) or name only (walk-in) */}
                      {v.type === 'booking' && v.bookingRef ? (
                        <span
                          className="booking-ref-copy"
                          style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, fontWeight: 700, color: '#1C1917', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                          title="Click to copy"
                          onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(v.bookingRef ?? '').then(() => toast('Reference copied', 'info')).catch(() => {}) }}
                        >
                          {v.bookingRef}
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                          <span style={{ fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#1C1917', marginLeft: 2 }}>{v.name}</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1C1917' }}>{v.name}</span>
                      )}

                      {/* Type badge */}
                      {isWalkin ? (
                        <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-full)', background: 'rgba(109,40,217,0.08)', color: '#6D28D9', border: '1px solid rgba(109,40,217,0.18)', whiteSpace: 'nowrap' }}>Walk-in</span>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-full)', background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', whiteSpace: 'nowrap' }}>Booking</span>
                      )}

                      {/* Purpose + load */}
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {v.purpose}{v.serviceType && v.loadType ? ` · ${v.loadType.toUpperCase()}` : ''}
                      </span>

                      {/* Arrived */}
                      <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                        {v.arrivedAt ? fmtTime(v.arrivedAt) : '—'}
                      </span>

                      <div style={{ flex: 1 }} />

                      {/* ID captured badge */}
                      {v.licenceCaptured ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 'var(--r-full)', padding: '3px 9px', whiteSpace: 'nowrap' }}>
                          <Icon name={ICONS.check} size={10} /> ID Captured
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-full)', padding: '3px 9px', whiteSpace: 'nowrap' }}>No ID</span>
                      )}
                    </div>

                    {/* Bottom row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      {v.companyName ? (
                        <span style={{ fontSize: 13, color: '#1C1917', fontWeight: 500 }}>{v.companyName}</span>
                      ) : v.phone ? (
                        <span style={{ fontSize: 13, color: '#1C1917', fontWeight: 500 }}>{v.phone}</span>
                      ) : (
                        <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{v.purpose === 'Visiting Office' || v.purpose === 'Visiting Yard' ? 'No company' : 'No phone'}</span>
                      )}
                      {v.personBeingVisited && (
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>→ {v.personBeingVisited}</span>
                      )}
                      {v.type === 'booking' && (
                        <>
                          <div style={{ flex: 1 }} />
                          <motion.button
                            onClick={e => handlePrint(v, e)}
                            disabled={printingId === v.id}
                            whileTap={printingId === v.id ? undefined : { scale: 0.94 }}
                            title="Print booking PDF"
                            style={{ height: 28, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: printingId === v.id ? 'wait' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                          >
                            <Icon name={ICONS.download} size={13} />
                            {printingId === v.id ? 'Preparing…' : 'Print'}
                          </motion.button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Docked detail pane — split view (wide screens) */}
      {selected && isWide && (
        <div style={{ width: 480, flexShrink: 0, position: 'sticky', top: 12, height: 'calc(100vh - var(--dash-header-h) - 24px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selected.type === 'booking' ? (
            (bookingLoading || !selectedBooking)
              ? <PaneShell onClose={() => setSelected(null)}><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>Loading booking…</div></PaneShell>
              : <BookingSlideOver key={selectedBooking.id} docked booking={selectedBooking} perms={perms} onClose={() => setSelected(null)} onUpdated={() => load()} hideCompleteAction />
          ) : (
            <WalkInPane entry={selected} onClose={() => setSelected(null)} onOpenFull={() => navigate(`/reception/visitors/${selected.id}`)} />
          )}
        </div>
      )}
      </div>{/* end split row */}
    </div>
    </>
  )
}

/* ── Lightweight docked pane shell (matches BookingSlideOver docked look) ── */
function PaneShell({ title, badge, onClose, children }: { title?: React.ReactNode; badge?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      style={{ position: 'relative', height: '100%', width: '100%', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 6px 24px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 10px 20px', borderBottom: '1px solid rgba(0,0,0,0.07)', flexShrink: 0, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>{title}{badge}</div>
        <button onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 'var(--r-full)', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-secondary)', transition: 'background 0.15s, color 0.15s' }}
          onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = '#1C1917' }}
          onMouseOut={e  => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', background: '#F5F4F3' }}>{children}</div>
    </motion.div>
  )
}

/* ── Walk-in detail pane (booking rows use BookingSlideOver instead) ── */
function WalkInPane({ entry, onClose, onOpenFull }: { entry: VisitorEntry; onClose: () => void; onOpenFull: () => void }) {
  const SL: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }
  const PANEL: React.CSSProperties = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-sm)', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }
  const RL: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-secondary)' }
  const RV: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#1C1917' }
  const isOfficeOrYard = entry.purpose === 'Visiting Office' || entry.purpose === 'Visiting Yard'
  const rows: { label: string; value: string; icon?: string }[] = [
    { label: 'Visitor',  value: entry.name,                 icon: ICONS.user },
    isOfficeOrYard
      ? { label: 'Company', value: entry.companyName || '—', icon: ICONS.building }
      : { label: 'Phone',   value: entry.phone       || '—', icon: ICONS.phone },
    { label: 'Purpose',  value: entry.purpose },
    { label: 'Arrived',  value: entry.arrivedAt ? fmtTime(entry.arrivedAt) : '—', icon: ICONS.clock },
  ]
  if (entry.personBeingVisited) rows.push({ label: 'Visiting', value: entry.personBeingVisited, icon: ICONS.users })
  return (
    <PaneShell
      onClose={onClose}
      title={<span style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', whiteSpace: 'nowrap' }}>{entry.name}</span>}
      badge={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)', background: 'rgba(109,40,217,0.08)', color: '#6D28D9', border: '1px solid rgba(109,40,217,0.18)', whiteSpace: 'nowrap' }}>Walk-in</span>}
    >
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <section>
          <p style={SL}>Visitor Details</p>
          <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={RL}>{r.icon && <Icon name={r.icon} size={13} style={{ color: 'var(--text-secondary)' }} />}{r.label}</span>
                <span style={RV}>{r.value}</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <p style={SL}>Identification</p>
          <div style={{ ...PANEL, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={RL}>ID Document</span>
            {entry.licenceCaptured ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 'var(--r-full)', padding: '3px 10px' }}>
                <Icon name={ICONS.check} size={11} /> Captured
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-full)', padding: '3px 10px' }}>Not captured</span>
            )}
          </div>
        </section>
      </div>
      <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(0,0,0,0.07)', background: '#FFFFFF' }}>
        <button onClick={onOpenFull}
          style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', fontSize: 15, fontWeight: 600, borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', background: '#fff', color: '#374151', border: '1.5px solid #e5e7eb' }}>
          Open full record <Icon name={ICONS.arrowRight} size={15} />
        </button>
      </div>
    </PaneShell>
  )
}
