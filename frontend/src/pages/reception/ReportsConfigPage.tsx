import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { AnimatedNumber } from '@/lib/motion'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { fmtDate, fmtDateTime as _fmtDateTime, todaySydney, TZ } from '@/lib/time'
import { getVisitorLogRecords } from '@/lib/db/walk-ins'
import { getTenant, updateTenant } from '@/lib/db/tenants'
import { toast } from '@/lib/toast'
import { useStaffPermissions } from '@/lib/useStaffPermissions'

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
    completed_at?: string
  }
}

const ALL_COLUMNS: { key: string; label: string }[] = [
  { key: 'date',          label: 'Date' },
  { key: 'fullName',      label: 'Full Name' },
  { key: 'address',       label: 'Address' },
  { key: 'idType',        label: 'ID Type' },
  { key: 'idNumber',      label: 'ID Number' },
  { key: 'dob',           label: 'DOB' },
  { key: 'idSignedBy',    label: 'ID Signed By' },
  { key: 'reason',        label: 'Reason' },
  { key: 'personVisited', label: 'Person Visited' },
  { key: 'checkInTime',   label: 'Check-in Time' },
  { key: 'checkOutTime',  label: 'Check-out Time' },
  { key: 'notes',         label: 'Notes' },
]

const DEFAULT_VISIBLE_KEYS = ['date', 'fullName', 'address', 'idType', 'idNumber', 'dob', 'idSignedBy', 'reason', 'personVisited']

const fmtDateTime = (iso?: string) => iso ? _fmtDateTime(iso) : '—'
const today = () => todaySydney()
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: TZ })

export default function ReportsConfigPage() {
  usePageTitle('Glido | Configure Visitor Log')
  const perms = useStaffPermissions()

  const [records, setRecords]           = useState<VisitorRecord[]>([])
  const [loading, setLoading]           = useState(true)
  const [from, setFrom]                 = useState(daysAgo(7))
  const [to, setTo]                     = useState(today())
  const [status, setStatus]             = useState('')
  const [search, setSearch]             = useState('')
  const [saving, setSaving]             = useState(false)
  const [configOpen, setConfigOpen]     = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE_KEYS)
  const [exportConfig, setExportConfig] = useState({
    includeTenantName: true,
    includeDateRange:  true,
    includeTimestamp:  false,
  })

  const toggleColumn = (key: string) =>
    setVisibleColumns(v => v.includes(key) ? v.filter(k => k !== key) : [...v, key])

  const toggleExport = (key: string) =>
    setExportConfig(c => ({ ...c, [key]: !c[key as keyof typeof c] }))

  // Load saved config on mount
  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID)
      .then(data => {
        const rc = (data?.report_config as any)
        if (Array.isArray(rc?.visibleColumns)) {
          setVisibleColumns(rc.visibleColumns)
        } else if (rc?.visibleColumns && typeof rc.visibleColumns === 'object') {
          // migrate from old boolean-map format
          const keys = ALL_COLUMNS.filter(c => rc.visibleColumns[c.key] !== false).map(c => c.key)
          setVisibleColumns(keys)
        }
        if (rc?.exportConfig) setExportConfig(prev => ({ ...prev, ...rc.exportConfig }))
      })
      .catch(() => { /* use defaults */ })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let rows = await getVisitorLogRecords({
        tenantId: DEFAULT_TENANT_ID,
        from:     from || undefined,
        to:       to   || undefined,
        status:   status || undefined,
        search:   search || undefined,
      }) as any[]
      setRecords(rows)
    } catch { /* noop */ } finally { setLoading(false) }
  }, [from, to, status, search])

  useEffect(() => { load() }, [load])

  const stats = {
    total:     records.length,
    onSite:    records.filter(r => (r.bookings as any)?.status === 'checked_in').length,
    completed: records.filter(r => (r.bookings as any)?.status === 'completed').length,
  }

  // CSV: only export visible columns
  const exportCsv = () => {
    const cols = ALL_COLUMNS.filter(c => visibleColumns.includes(c.key))
    const header = cols.map(c => c.label)
    const rows = records.map(r => {
      const b = r.bookings as any
      const name   = r.licence_name || b?.driver_name || ''
      const reason = r.walk_in_reason || b?.service_type?.toUpperCase() || ''
      const cellMap: Record<string, string> = {
        date:          fmtDate(r.check_in_time),
        fullName:      name,
        address:       r.licence_address || '',
        idType:        r.licence_scan_method || 'Manual',
        idNumber:      r.licence_number || '',
        dob:           fmtDate(r.licence_dob),
        idSignedBy:    '',
        reason,
        personVisited: r.visit_person_name || '',
        checkInTime:   fmtDateTime(r.check_in_time),
        checkOutTime:  b?.completed_at ? fmtDateTime(b.completed_at) : '',
        notes:         '',
      }
      return cols.map(c => `"${String(cellMap[c.key] ?? '').replace(/"/g, '""')}"`)
    })

    const headerRows: string[] = []
    if (exportConfig.includeTenantName)  headerRows.push('"ABF Visitor Log"')
    if (exportConfig.includeDateRange)   headerRows.push(`"Date range: ${from} to ${to}"`)
    if (exportConfig.includeTimestamp)   headerRows.push(`"Generated: ${new Date().toLocaleString()}"`)

    const csvParts = [...headerRows.map(h => [h].join(',')), header.join(','), ...rows.map(r => r.join(','))]
    const csv = csvParts.join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `ABF_Visitor_Log_${today()}.csv`
    a.click()
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      await updateTenant(DEFAULT_TENANT_ID, { report_config: { visibleColumns, exportConfig } })
      toast('Report config saved ✓', 'success')
      setConfigOpen(false)
    } catch {
      toast('Failed to save config', 'error')
    } finally {
      setSaving(false)
    }
  }

  const vis = (key: string) => visibleColumns.includes(key)

  const QUICK = [{ label: 'Today', from: today(), to: today() }, { label: '7 Days', from: daysAgo(7), to: today() }, { label: '15 Days', from: daysAgo(15), to: today() }]

  const hasFilters = !!(status || search || from !== daysAgo(7) || to !== today())
  const clearAll = () => { setStatus(''); setSearch(''); setFrom(daysAgo(7)); setTo(today()) }

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
          { label: 'Total Visitors',    value: stats.total,     sub: 'Matching filters', icon: ICONS.walkIn,   iconBg: 'rgba(28,25,23,0.06)',         iconFg: '#1C1917'            },
          { label: 'Currently On-Site', value: stats.onSite,    sub: 'Active check-ins', icon: ICONS.check,    iconBg: 'rgba(var(--brand-rgb),0.10)', iconFg: 'var(--brand-color)' },
          { label: 'Completed Visits',  value: stats.completed, sub: 'Signed out',       icon: ICONS.bookings, iconBg: 'rgba(34,197,94,0.10)',        iconFg: '#22C55E'            },
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

      {/* Search + actions bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search visitor, ID, or person…" size={38}
            style={{ height: 40, padding: '0 14px 0 38px', fontSize: 15, color: '#1C1917', background: '#fff', border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </div>
        <div style={{ flex: 1 }} />
        {perms.can_export_csv && (
          <button onClick={exportCsv} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', fontSize: 15, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', transition: 'background 0.12s', flexShrink: 0, fontFamily: 'inherit' }}
            onMouseOver={e => (e.currentTarget.style.background = '#F7F6F5')}
            onMouseOut={e  => (e.currentTarget.style.background = '#fff')}
          >
            <Icon name={ICONS.download} size={15} /> Export CSV
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <CustomSelect placeholder="All Statuses" value={status} onChange={setStatus} width={160}
          options={[{ value: 'checked_in', label: 'Checked In' }, { value: 'completed', label: 'Completed' }, { value: 'scheduled', label: 'Scheduled' }]} />
        {QUICK.map(q => {
          const active = from === q.from && to === q.to
          return (
            <button key={q.label} type="button" onClick={() => { setFrom(q.from); setTo(q.to) }}
              style={{ height: 40, padding: '0 14px', fontSize: 14, fontWeight: active ? 700 : 500, borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: active ? 'rgba(var(--brand-rgb),0.10)' : '#F7F6F5',
                border: `1px solid ${active ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.08)'}`,
                color: active ? 'var(--brand-color)' : 'var(--text-secondary)' }}>
              {q.label}
            </button>
          )
        })}
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          style={{ height: 40, padding: '0 10px', fontSize: 14, color: '#1C1917', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit' }} />
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          style={{ height: 40, padding: '0 10px', fontSize: 14, color: '#1C1917', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit' }} />
        {hasFilters && (
          <button onClick={clearAll}
            style={{ height: 40, padding: '0 14px', fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)', background: 'none', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
        {/* Table header row */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid rgba(0,0,0,0.07)', background: 'rgba(0,0,0,0.01)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0 }}>
            ABF Visitor Log <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 6 }}>Showing {records.length} records</span>
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {loading && <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Loading…</span>}
            <button
              onClick={() => setConfigOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 'var(--r-full)', border: '1.5px solid rgba(0,0,0,0.08)', background: '#fff', fontSize: 15, fontWeight: 600, color: '#1C1917', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Icon name={ICONS.settings} size={15} />
              Configure Report
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', position: 'relative' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ background: '#F7F6F5', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
                {vis('date')          && <th style={{ textAlign: 'left', padding: '14px 20px', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 15 }}>Date</th>}
                {vis('fullName')      && <th style={{ textAlign: 'left', padding: '14px 20px', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 15, position: 'sticky', left: 0, zIndex: 2, background: '#F7F6F5' }}>Full Name</th>}
                {vis('address')       && <th style={{ textAlign: 'left', padding: '14px 20px', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 15 }}>Address</th>}
                {vis('idType')        && <th style={{ textAlign: 'left', padding: '14px 20px', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 15 }}>ID Type</th>}
                {vis('idNumber')      && <th style={{ textAlign: 'left', padding: '14px 20px', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 15, position: 'sticky', left: 160, zIndex: 2, background: '#F7F6F5' }}>ID Number</th>}
                {vis('dob')           && <th style={{ textAlign: 'left', padding: '14px 20px', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 15 }}>DOB</th>}
                {vis('idSignedBy')    && <th style={{ textAlign: 'left', padding: '14px 20px', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 15 }}>ID Signed By</th>}
                {vis('reason')        && <th style={{ textAlign: 'left', padding: '14px 20px', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 15 }}>Reason</th>}
                {vis('personVisited') && <th style={{ textAlign: 'left', padding: '14px 20px', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 15 }}>Person Visited</th>}
                {vis('checkInTime')   && <th style={{ textAlign: 'left', padding: '14px 20px', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 15 }}>Entry Time</th>}
                {vis('checkOutTime')  && <th style={{ textAlign: 'left', padding: '14px 20px', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 15 }}>Exit Time</th>}
                {vis('notes')         && <th style={{ textAlign: 'left', padding: '14px 20px', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 15 }}>Notes</th>}
              </tr>
            </thead>
            <tbody>
              {records.map(r => {
                const b = r.bookings as any
                const name   = r.licence_name || b?.driver_name || '—'
                const reason = r.walk_in_reason || b?.service_type?.toUpperCase() || '—'
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background 0.1s' }}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.015)')}
                    onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
                  >
                    {vis('date')          && <td style={{ padding: '14px 20px', color: '#1C1917', fontWeight: 500 }}>{fmtDate(r.check_in_time)}</td>}
                    {vis('fullName')      && <td style={{ padding: '14px 20px', fontWeight: 700, color: '#1C1917', position: 'sticky', left: 0, zIndex: 1, background: '#fff' }}>{name}</td>}
                    {vis('address')       && <td style={{ padding: '14px 20px', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.licence_address || '—'}</td>}
                    {vis('idType')        && <td style={{ padding: '14px 20px', color: 'var(--text-muted)' }}>{r.licence_scan_method || 'Manual'}</td>}
                    {vis('idNumber')      && <td style={{ padding: '14px 20px', fontFamily: 'ui-monospace,monospace', color: 'var(--brand-color)', fontWeight: 700, position: 'sticky', left: 160, zIndex: 1, background: '#fff' }}>{r.licence_number || '—'}</td>}
                    {vis('dob')           && <td style={{ padding: '14px 20px', color: 'var(--text-muted)' }}>{fmtDate(r.licence_dob)}</td>}
                    {vis('idSignedBy')    && <td style={{ padding: '14px 20px', color: 'var(--text-muted)' }}>—</td>}
                    {vis('reason')        && <td style={{ padding: '14px 20px' }}><span style={{ background: 'rgba(0,0,0,0.04)', padding: '4px 10px', borderRadius: 'var(--r-sm)', fontWeight: 600, color: '#374151' }}>{reason}</span></td>}
                    {vis('personVisited') && <td style={{ padding: '14px 20px', color: '#1C1917', fontWeight: 600 }}>{r.visit_person_name || '—'}</td>}
                    {vis('checkInTime')   && <td style={{ padding: '14px 20px', color: '#16A34A', fontWeight: 700 }}>{fmtDateTime(r.check_in_time)}</td>}
                    {vis('checkOutTime')  && <td style={{ padding: '14px 20px', color: 'var(--text-muted)' }}>{b?.completed_at ? fmtDateTime(b.completed_at) : '—'}</td>}
                    {vis('notes')         && <td style={{ padding: '14px 20px', color: 'var(--text-muted)' }}>—</td>}
                  </tr>
                )
              })}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length || 9} style={{ padding: '64px 20px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                      <Icon name={ICONS.reports} size={40} style={{ color: 'rgba(0,0,0,0.1)' }} />
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>No visitor records found</p>
                    <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Try adjusting your filters or date range.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Configure Report slide-over */}
      {configOpen && (
        <>
          <div onClick={() => setConfigOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 40 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, background: '#fff', zIndex: 50, padding: 28, overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#1C1917' }}>Configure Report</h3>
              <button onClick={() => setConfigOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9CA3AF', lineHeight: 1, padding: 4 }}>✕</button>
            </div>

            {/* Visible Columns */}
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 12, margin: '0 0 12px' }}>Visible Columns</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
              {ALL_COLUMNS.map(col => {
                const checked = visibleColumns.includes(col.key)
                return (
                  <label key={col.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 'var(--r-full)', border: `1.5px solid ${checked ? 'rgba(var(--brand-rgb),0.25)' : 'rgba(0,0,0,0.08)'}`, cursor: 'pointer', background: checked ? 'rgba(var(--brand-rgb),0.03)' : '#fff', transition: 'all 0.15s' }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: '#1C1917' }}>{col.label}</span>
                    <input type="checkbox" checked={checked} onChange={() => toggleColumn(col.key)}
                      style={{ width: 18, height: 18, accentColor: 'var(--brand-color, #FC6514)', cursor: 'pointer' }} />
                  </label>
                )
              })}
            </div>

            {/* Export Settings */}
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: '#9CA3AF', textTransform: 'uppercase', margin: '0 0 12px' }}>Export (CSV)</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
              {([
                { key: 'includeTenantName', label: 'Include tenant name in header' },
                { key: 'includeDateRange',  label: 'Include date range in header' },
                { key: 'includeTimestamp',  label: 'Include generated timestamp' },
              ] as const).map(opt => (
                <label key={opt.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 'var(--r-full)', border: '1.5px solid rgba(0,0,0,0.08)', cursor: 'pointer' }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: '#1C1917' }}>{opt.label}</span>
                  <input type="checkbox" checked={exportConfig[opt.key]} onChange={() => toggleExport(opt.key)}
                    style={{ width: 18, height: 18, accentColor: 'var(--brand-color, #FC6514)', cursor: 'pointer' }} />
                </label>
              ))}
            </div>

            {/* Save button */}
            <button
              onClick={saveConfig}
              disabled={saving}
              style={{ width: '100%', padding: '13px', borderRadius: 'var(--r-full)', border: 'none', background: saving ? '#D1D5DB' : 'var(--brand-color, #FC6514)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}
            >
              {saving ? 'Saving…' : 'Save as Default'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
