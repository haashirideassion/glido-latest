import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { fmtTime } from '@/lib/time'
import { getActiveWalkIns } from '@/lib/db/walk-ins'
import { getBookings } from '@/lib/db/bookings'
import { useStaffPermissions } from '@/lib/useStaffPermissions'

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
  const [visitors, setVisitors] = useState<VisitorEntry[]>([])
  const [loading,  setLoading]  = useState(true)

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [preset,      setPreset]      = useState<Preset>('today')
  const [dateFrom,    setDateFrom]    = useState(() => todaySydney())
  const [dateTo,      setDateTo]      = useState(() => todaySydney())
  const [typeFilter,  setTypeFilter]  = useState('')   // '' | 'walkin' | 'booking'
  const [search,      setSearch]      = useState('')

  const applyPreset = (p: Preset) => {
    setPreset(p)
    const { from, to } = presetDates(p)
    setDateFrom(from)
    setDateTo(to)
  }

  const hasFilters = !!(typeFilter || search || preset !== 'today')
  const clearAll = () => { setTypeFilter(''); setSearch(''); applyPreset('today') }

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
    const header = ['Type', 'Name', 'Phone', 'Purpose', 'Arrived', 'Licence', 'Reference']
    const rows = filtered.map(v => [
      v.type === 'booking' ? 'Booking' : 'Walk-in',
      v.name,
      v.phone ?? '',
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
      <style>{`@keyframes vp-pulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>

      {/* KPI tiles */}
      <div style={{ display: 'flex', alignItems: 'stretch', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
        {KPI_DEF.map((t, i) => (
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
            {loading
              ? <div style={{ width: 56, height: 40, borderRadius: 'var(--r-sm)', background: '#F3F3F2', animation: 'vp-pulse 1.5s ease-in-out infinite' }} />
              : <p style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#1C1917', margin: '0 0 6px', fontVariantNumeric: 'tabular-nums' }}>{t.val}</p>}
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.sub}</p>
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

      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
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

      {/* Cards container */}
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
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
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 15 }}>
            {(() => {
              if (!!(typeFilter || search)) return 'No visitors match your filters.'
              if (preset === 'today') return 'No visitors for today yet.'
              if (preset === '7d')    return 'No visitors in the last 7 days.'
              if (preset === '30d')   return 'No visitors in the last 30 days.'
              return 'No visitors in the selected range.'
            })()}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 10px' }}>
            {filtered.map(v => {
              const ics     = v.icsStatus ?? ''
              const isWalkin = v.type === 'walkin'

              return (
                <div
                  key={`${v.type}-${v.id}`}
                  onClick={() => navigate(`/reception/visitors/${v.id}`)}
                  style={{ display: 'flex', cursor: 'pointer', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden', transition: 'box-shadow 0.15s, background 0.12s' }}
                  onMouseOver={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; e.currentTarget.style.background = '#FAFAF9' }}
                  onMouseOut={e  => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.background = '#FFFFFF' }}
                >
                  {/* ICS colour bar */}
                  <div style={{ width: 5, flexShrink: 0, background: ICS_BAR_COLOR[ics] ?? ICS_BAR_COLOR.unavailable }} />

                  {/* Card body */}
                  <div style={{ flex: 1, minWidth: 0, padding: '14px 20px' }}>

                    {/* ── Top row ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>

                      {/* Reference (booking) or name (walk-in) */}
                      {v.type === 'booking' && v.bookingRef ? (
                        <span
                          style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: '#1C1917', display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, transition: 'color 0.15s' }}
                          onMouseOver={e => { e.stopPropagation(); e.currentTarget.style.color = 'var(--brand-color)' }}
                          onMouseOut={e  => { e.currentTarget.style.color = '#1C1917' }}
                          title="Click to copy"
                          onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(v.bookingRef ?? '') }}
                        >
                          {v.bookingRef}
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        </span>
                      ) : (
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', flexShrink: 0 }}>
                          {v.name}
                        </span>
                      )}

                      {/* Single type badge */}
                      {isWalkin ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)', background: 'rgba(109,40,217,0.08)', color: '#6D28D9', border: '1px solid rgba(109,40,217,0.18)', whiteSpace: 'nowrap' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
                          Walk-in
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)', background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', whiteSpace: 'nowrap' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                          Booking
                        </span>
                      )}

                      <div style={{ flex: 1 }} />

                      {/* Purpose */}
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{v.purpose}</span>

                      {/* Arrived time */}
                      <span style={{ fontSize: 13, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                        Arrived: {v.arrivedAt ? fmtTime(v.arrivedAt) : '—'}
                      </span>

                      {/* Licence badge */}
                      {v.licenceCaptured ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 'var(--r-full)', padding: '3px 9px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          <Icon name={ICONS.check} size={11} /> ID Captured
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-full)', padding: '3px 9px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          No ID
                        </span>
                      )}
                    </div>

                    {/* ── Bottom row ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                      {/* Name */}
                      <span style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {isWalkin ? 'Visitor' : 'Driver'}: <strong style={{ color: '#1C1917' }}>{v.name}</strong>
                      </span>

                      {/* Phone */}
                      {v.phone && (
                        <span style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          Phone: <strong style={{ color: '#1C1917' }}>{v.phone}</strong>
                        </span>
                      )}

                      {/* Person being visited */}
                      {v.personBeingVisited && (
                        <span style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          Visiting: <strong style={{ color: '#1C1917' }}>{v.personBeingVisited}</strong>
                        </span>
                      )}

                      {/* Service type for bookings */}
                      {v.serviceType && (
                        <span style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {v.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'}{v.loadType ? ` — ${v.loadType.toUpperCase()}` : ''}
                        </span>
                      )}

                      <div style={{ flex: 1 }} />

                      {/* View button */}
                      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/reception/visitors/${v.id}`) }}
                          style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}
                          title="View details"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
                          </svg>
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
    </>
  )
}
