import { useState, useEffect, useCallback } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { fmtDate, fmtDateTime as _fmtDateTime, todaySydney, TZ } from '@/lib/time'
import { getVisitorLogRecords } from '@/lib/db/walk-ins'
import { useStaffPermissions } from '@/lib/useStaffPermissions'
import { AnimatedNumber, motion } from '@/lib/motion'
import { EmptyState } from '@/components/reception/EmptyState'

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

interface VisitorRecord {
  id: string
  check_in_time: string
  licence_name?: string
  licence_address?: string
  licence_number?: string
  licence_dob?: string
  licence_scan_method?: string
  visit_person_name?: string
  walk_in_reason?: string
  bookings?: {
    driver_name?: string
    service_type?: string
    load_type?: string
    status?: string
    completed_at?: string
  }
}

// Service × load-type combo filter (mirrors the Analytics / Bookings row). Walk-ins have no
// linked booking, so they only match "All".
const COMBOS = [
  { key: 'all',          label: 'All',            service: null,      load: null  },
  { key: 'fcl-pickup',   label: 'FCL — Pick Up',  service: 'pickup',  load: 'fcl' },
  { key: 'fcl-dropoff',  label: 'FCL — Drop Off', service: 'dropoff', load: 'fcl' },
  { key: 'lcl-pickup',   label: 'LCL — Pick Up',  service: 'pickup',  load: 'lcl' },
  { key: 'lcl-dropoff',  label: 'LCL — Drop Off', service: 'dropoff', load: 'lcl' },
] as const

const fmtDateTime = (iso?: string) => iso ? _fmtDateTime(iso) : '—'
const today = () => todaySydney()
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: TZ })


function RecordPane({ record, docked, onClose }: { record: any; docked?: boolean; onClose: () => void }) {
  const b = record.bookings as any
  const fields: [string, string][] = [
    ['Date',           fmtDate(record.check_in_time)],
    ['Full Name',      record.licence_name || b?.driver_name || '—'],
    ['Address',        record.licence_address || '—'],
    ['ID Type',        record.licence_scan_method || 'Manual'],
    ['ID Number',      record.licence_number || '—'],
    ['Date of Birth',  fmtDate(record.licence_dob)],
    ['Reason',         record.walk_in_reason || b?.service_type?.toUpperCase() || '—'],
    ['Person Visited', record.visit_person_name || '—'],
    ['Check-in Time',  fmtDateTime(record.check_in_time)],
    ['Check-out Time', b?.completed_at ? fmtDateTime(b.completed_at) : '—'],
  ]
  const panelStyle: React.CSSProperties = docked
    ? { position: 'relative', height: '100%', width: '100%', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 6px 24px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { position: 'fixed', right: 0, top: 0, height: '100%', width: 'min(480px, 100vw)', zIndex: 50, background: '#FFFFFF', borderLeft: '1px solid rgba(0,0,0,0.08)', boxShadow: '-8px 0 40px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column' }
  return (
    <>
      {!docked && <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(28,25,23,0.35)', backdropFilter: 'blur(4px)' }} />}
      <motion.div
        style={panelStyle}
        initial={docked ? { opacity: 0, x: 16 } : { x: '100%' }}
        animate={docked ? { opacity: 1, x: 0 } : { x: 0 }}
        transition={docked ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] } : { type: 'spring', stiffness: 400, damping: 40 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 12px 20px', borderBottom: '1px solid rgba(0,0,0,0.07)', flexShrink: 0 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: 0 }}>Visitor Record</h2>
          <button onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 'var(--r-full)', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-secondary)', transition: 'background 0.15s, color 0.15s' }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = '#1C1917' }}
            onMouseOut={e  => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 20px' }}>
          {fields.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <span style={{ fontSize: 14, color: '#94A3B8', fontWeight: 500, flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: 14, color: '#1C1917', fontWeight: 600, textAlign: 'right', maxWidth: 280, overflowWrap: 'anywhere' }}>{value}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </>
  )
}

export default function VisitorLogPage() {
  usePageTitle('Glido | ABF Visitor Log')
  const perms = useStaffPermissions()
  const [records, setRecords] = useState<VisitorRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRecord, setSelectedRecord] = useState<typeof records[0] | null>(null)
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true))
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const [from, setFrom]       = useState(daysAgo(7))
  const [to, setTo]           = useState(today())
  const [status,    setStatus]    = useState('')
  const [visitType, setVisitType] = useState('')
  const [combo,     setCombo]     = useState<string>('all')
  const [search,    setSearch]    = useState('')

  const activeCombo = COMBOS.find(c => c.key === combo)
  const matchesCombo = (b: any) => !activeCombo?.service || (b?.service_type === activeCombo.service && b?.load_type === activeCombo.load)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getVisitorLogRecords({
        tenantId: DEFAULT_TENANT_ID,
        from:     from || undefined,
        to:       to   || undefined,
        status:   status || undefined,
        search:   search || undefined,
      })
      setRecords(rows as any[])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [from, to, status, search])

  useEffect(() => { load() }, [load])

  const stats = {
    total:     records.length,
    onSite:    records.filter(r => (r.bookings as any)?.status === 'checked_in').length,
    completed: records.filter(r => (r.bookings as any)?.status === 'completed').length,
  }

  const exportCsv = () => {
    const header = ['Date', 'Full Name', 'Address', 'ID Type', 'ID Number', 'DOB', 'Reason', 'Person Visited', 'Entry Time', 'Exit Time']
    const rows = records.map(r => {
      const b = r.bookings as any
      return [
        fmtDate(r.check_in_time),
        r.licence_name || b?.driver_name || '',
        r.licence_address || '',
        r.licence_scan_method || 'Manual',
        r.licence_number || '',
        fmtDate(r.licence_dob ?? ''),
        r.walk_in_reason || b?.service_type?.toUpperCase() || '',
        r.visit_person_name || '',
        fmtDateTime(r.check_in_time),
        b?.completed_at ? fmtDateTime(b.completed_at) : '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`)
    })
    const csv = [header, ...rows].map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `ABF_Visitor_Log_${today()}.csv`
    a.click()
  }

  const QUICK = [
    { label: 'Today',    from: today(),     to: today()   },
    { label: 'Tomorrow', from: daysAgo(-1), to: daysAgo(-1) },
    { label: '7 Days',   from: daysAgo(7),  to: today()   },
    { label: '30 Days',  from: daysAgo(30), to: today()   },
    { label: 'All Time', from: '',          to: ''        },
  ]

  const hasFilters = !!(status || visitType || combo !== 'all' || search || from !== daysAgo(7) || to !== today())
  const clearAll = () => { setStatus(''); setVisitType(''); setCombo('all'); setSearch(''); setFrom(daysAgo(7)); setTo(today()) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ABF compliance header */}
      <div style={{ background: '#1C1917', borderRadius: 'var(--r-md)', padding: '16px 24px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', background: 'rgba(var(--brand-rgb),0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name={ICONS.reports} size={20} style={{ color: 'var(--brand-color)' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', margin: 0, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            S.77Q Customs Depot Licensed Area — Section 77Q, Customs Act 1901
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', margin: '2px 0 0', fontWeight: 500 }}>
            Mandatory Visitor Record Log · ABF Regulatory Compliance Requirement
          </p>
        </div>
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'flex', alignItems: 'stretch', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
        {[
          { label: 'Total Visitors',    value: stats.total,     sub: 'Matching filters',  icon: ICONS.walkIn,   iconBg: 'rgba(28,25,23,0.06)',           iconFg: '#1C1917'              },
          { label: 'Currently On-Site', value: stats.onSite,    sub: 'Active check-ins',  icon: ICONS.check,    iconBg: 'rgba(var(--brand-rgb),0.10)',   iconFg: 'var(--brand-color)'   },
          { label: 'Completed Visits',  value: stats.completed, sub: 'Signed out',        icon: ICONS.bookings, iconBg: 'rgba(34,197,94,0.10)',          iconFg: '#22C55E'              },
        ].map((k, i) => (
          <div key={k.label}
            style={{ flex: 1, minWidth: 0, padding: 'var(--kpi-pad-y) var(--kpi-pad-x)', borderLeft: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.07)', transition: 'background 0.18s ease' }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.015)')}
            onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', background: k.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${k.iconFg}22` }}>
                <Icon name={k.icon} size={17} style={{ color: k.iconFg }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label}</p>
            </div>
            <p style={{ fontSize: 'var(--kpi-value)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#1C1917', margin: '0 0 6px', fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={k.value} /></p>
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Filter + search bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search visitor, ID, or person…" size={32}
            style={{ height: 40, padding: '0 14px 0 38px', fontSize: 14, color: '#1C1917', background: '#fff', border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </div>

        {/* Status */}
        <CustomSelect placeholder="All Statuses" value={status} onChange={setStatus} width={150}
          options={[{ value: 'checked_in', label: 'Checked In' }, { value: 'completed', label: 'Completed' }, { value: 'scheduled', label: 'Scheduled' }]} />

        {/* Visit type */}
        <CustomSelect placeholder="All Types" value={visitType} onChange={setVisitType} width={150}
          options={[{ value: 'walk_in', label: 'Walk-in' }, { value: 'booking', label: 'Booking Check-in' }]} />

        {/* Quick presets */}
        {QUICK.map(q => {
          const active = from === q.from && to === q.to
          return (
            <button key={q.label} type="button" onClick={() => { setFrom(q.from); setTo(q.to) }}
              style={{ height: 40, padding: '0 16px', fontSize: 14, fontWeight: active ? 700 : 500, borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: active ? 'rgba(var(--brand-rgb),0.10)' : '#F7F6F5',
                border: `1px solid ${active ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.08)'}`,
                color: active ? 'var(--brand-color)' : 'var(--text-secondary)' }}>
              {q.label}
            </button>
          )
        })}

        {/* Date pickers */}
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          style={{ height: 40, padding: '0 12px', fontSize: 14, color: from ? '#1C1917' : '#9CA3AF', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit' }} />
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          style={{ height: 40, padding: '0 12px', fontSize: 14, color: to ? '#1C1917' : '#9CA3AF', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit' }} />

        {/* Service × load-type combo filter (mirrors Analytics / Bookings) — merged into the
            same wrapping row as the rest of the filters instead of a separate row, so the
            whole bar packs into fewer lines. */}
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

        <div style={{ flex: 1 }} />

        {hasFilters && (
          <button onClick={clearAll}
            style={{ height: 40, padding: '0 14px', fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)', background: 'none', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear
          </button>
        )}
        {perms.can_export_csv && (
          <button onClick={exportCsv} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', fontSize: 14, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', transition: 'background 0.12s', flexShrink: 0, fontFamily: 'inherit' }}
            onMouseOver={e => (e.currentTarget.style.background = '#F7F6F5')}
            onMouseOut={e  => (e.currentTarget.style.background = '#fff')}
          >
            <Icon name={ICONS.download} size={15} /> Export CSV
          </button>
        )}
      </div>

      {/* Cards + docked detail pane */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(0,0,0,0.07)', background: 'rgba(0,0,0,0.01)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0 }}>
            ABF Visitor Log <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 6 }}>{loading ? 'Loading…' : `${(() => {
              const b_filter = records.filter(r => {
                const b = r.bookings as any
                if (visitType === 'walk_in' && !(r as any).is_walk_in) return false
                if (visitType === 'booking' && (r as any).is_walk_in)  return false
                if (status && b?.status !== status) return false
                if (!matchesCombo(b)) return false
                return true
              })
              return b_filter.length
            })()} records`}</span>
          </p>
        </div>

        {/* Table — same structure as the Reports → Configure ABF Visitor Log preview */}
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 15 }}>Loading…</div>
        ) : (() => {
          const filtered = records.filter(r => {
            const b = r.bookings as any
            if (visitType === 'walk_in' && !(r as any).is_walk_in) return false
            if (visitType === 'booking' && (r as any).is_walk_in)  return false
            if (status && b?.status !== status) return false
            if (!matchesCombo(b)) return false
            return true
          })
          if (filtered.length === 0) return (
            <EmptyState compact variant="search" title="No visitor records found" subtitle="Try adjusting your filters or date range." />
          )

          const TH: React.CSSProperties = { textAlign: 'left', padding: '14px 20px', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 15 }
          const TD: React.CSSProperties = { padding: '14px 20px' }

          return (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ background: '#F7F6F5', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
                    <th style={TH}>Date</th>
                    <th style={{ ...TH, position: 'sticky', left: 0, zIndex: 2, background: '#F7F6F5' }}>Full Name</th>
                    <th style={TH}>Address</th>
                    <th style={TH}>ID Type</th>
                    <th style={{ ...TH, position: 'sticky', left: 160, zIndex: 2, background: '#F7F6F5' }}>ID Number</th>
                    <th style={TH}>DOB</th>
                    <th style={TH}>Reason</th>
                    <th style={TH}>Person Visited</th>
                    <th style={TH}>Entry Time</th>
                    <th style={TH}>Exit Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const b = r.bookings as any
                    const name   = r.licence_name || b?.driver_name || '—'
                    const reason = r.walk_in_reason || (b?.service_type ? (b.service_type === 'pickup' ? 'Pick Up' : 'Drop Off') : null) || '—'
                    const isSel  = selectedRecord?.id === r.id
                    const rowBg  = isSel ? 'rgba(var(--brand-rgb),0.05)' : '#fff'

                    return (
                      <tr key={r.id} onClick={() => setSelectedRecord(r)}
                        style={{ cursor: 'pointer', background: rowBg, borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background 0.1s' }}
                        onMouseOver={e => { if (!isSel) e.currentTarget.style.background = '#FAFAF9' }}
                        onMouseOut={e  => { if (!isSel) e.currentTarget.style.background = rowBg }}
                      >
                        <td style={{ ...TD, color: '#1C1917', fontWeight: 500 }}>{fmtDate(r.check_in_time)}</td>
                        <td style={{ ...TD, fontWeight: 700, color: '#1C1917', position: 'sticky', left: 0, zIndex: 1, background: rowBg }}>{name}</td>
                        <td style={{ ...TD, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.licence_address || '—'}</td>
                        <td style={{ ...TD, color: 'var(--text-muted)' }}>{r.licence_scan_method || 'Manual'}</td>
                        <td style={{ ...TD, fontFamily: 'ui-monospace,monospace', color: 'var(--brand-color)', fontWeight: 700, position: 'sticky', left: 160, zIndex: 1, background: rowBg }}>{r.licence_number || '—'}</td>
                        <td style={{ ...TD, color: 'var(--text-muted)' }}>{fmtDate(r.licence_dob ?? '')}</td>
                        <td style={TD}><span style={{ background: 'rgba(0,0,0,0.04)', padding: '4px 10px', borderRadius: 'var(--r-sm)', fontWeight: 600, color: '#374151' }}>{reason}</span></td>
                        <td style={{ ...TD, color: '#1C1917', fontWeight: 600 }}>{r.visit_person_name || '—'}</td>
                        <td style={{ ...TD, color: '#16A34A', fontWeight: 700 }}>{fmtDateTime(r.check_in_time)}</td>
                        <td style={{ ...TD, color: 'var(--text-muted)' }}>{fmtDateTime(b?.completed_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })()}
      </div>

      {selectedRecord && isWide && (
        <div style={{ width: 480, flexShrink: 0, position: 'sticky', top: 12, height: 'calc(100vh - var(--dash-header-h) - 24px)' }}>
          <RecordPane record={selectedRecord} docked onClose={() => setSelectedRecord(null)} />
        </div>
      )}
      </div>{/* end table row */}

      {/* Visitor Record slide-over — narrow screens */}
      <style>{`@keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
      {selectedRecord && !isWide && (
        <RecordPane record={selectedRecord} onClose={() => setSelectedRecord(null)} />
      )}
    </div>
  )
}
