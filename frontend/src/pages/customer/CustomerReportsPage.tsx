import { useState, useEffect, useMemo } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { getServiceRequestReports } from '@/lib/db/service-requests'
import type { ServiceRequestReports } from '@/lib/db/service-requests'
import type { ServiceCategory } from '@/data/types'
import { CustomReportsSection } from '@/components/customer/CustomReportsSection'
import { CARD, SERVICE_LABEL, STATUS_LABEL } from '@/lib/customerReportLabels'

// Styling mirrors src/pages/reception/AnalyticsPage.tsx 1:1 (CARD, DonutChart, LineChart, BarRow,
// filter-pill row, Export CSV button) so the Customer Portal's Reports screen reads as the same
// system as Reception's Reports & Analytics, not a separate visual language.

const PIE_COLORS = ['var(--brand-color)', '#EC4899', '#F59E0B', '#64748B', '#10B981', '#6366F1']

function monthLabel(ym: string): string {
  const [, m] = ym.split('-')
  const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return months[parseInt(m, 10)] ?? ym
}

// ─── SVG Line Chart — ported from AnalyticsPage.tsx ──────────────────────────
function LineChart({ data, labels }: { data: number[]; labels: string[] }) {
  if (data.length < 2) return (
    <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>Not enough data</p>
    </div>
  )

  const W = 560; const H = 190
  const PAD = { top: 16, right: 16, bottom: 32, left: 38 }
  const maxVal = Math.max(...data, 1)
  const niceMax = Math.ceil(maxVal / 5) * 5 || 1
  const gridVals = [0, niceMax * 0.25, niceMax * 0.5, niceMax * 0.75, niceMax].map(Math.round)

  const toX = (i: number) => PAD.left + (i / (data.length - 1)) * (W - PAD.left - PAD.right)
  const toY = (v: number) => PAD.top + (1 - v / niceMax) * (H - PAD.top - PAD.bottom)

  const pts = data.map((v, i) => ({ x: toX(i), y: toY(v) }))

  let linePath = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1]; const c = pts[i]
    const cx = (p.x + c.x) / 2
    linePath += ` C ${cx} ${p.y} ${cx} ${c.y} ${c.x} ${c.y}`
  }
  const areaPath = linePath + ` L ${pts[pts.length - 1].x} ${toY(0)} L ${pts[0].x} ${toY(0)} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="crg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-color)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--brand-color)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {gridVals.map(v => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={toY(v)} y2={toY(v)}
            stroke="rgba(0,0,0,0.07)" strokeWidth="1" strokeDasharray="4 3" />
          <text x={PAD.left - 6} y={toY(v) + 4} textAnchor="end" fontSize="10" fill="#94A3B8">{v}</text>
        </g>
      ))}

      <path d={areaPath} fill="url(#crg)" />
      <path d={linePath} fill="none" stroke="var(--brand-color)" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" />

      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="var(--brand-color)" />
          <circle cx={p.x} cy={p.y} r="2" fill="#fff" />
        </g>
      ))}

      {labels.map((l, i) => {
        const x = PAD.left + (i / (labels.length - 1)) * (W - PAD.left - PAD.right)
        return <text key={i} x={x} y={H - 4} textAnchor="middle" fontSize="11" fill="#94A3B8">{l}</text>
      })}
    </svg>
  )
}

// ─── SVG Donut Chart — ported from AnalyticsPage.tsx ─────────────────────────
function DonutChart({ segments, centerLabel }: { segments: { label: string; value: number }[]; centerLabel: string }) {
  if (segments.length === 0) return (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>No data yet</p>
    </div>
  )

  const total = segments.reduce((s, x) => s + x.value, 0)
  const CX = 80; const CY = 80; const R = 64; const INNER = R * 0.55

  let angle = -Math.PI / 2
  const slices = segments.map((seg, i) => {
    const sweep = total > 0 ? (seg.value / total) * 2 * Math.PI : 0
    const start = angle
    angle += sweep
    return { ...seg, start, sweep, color: PIE_COLORS[i % PIE_COLORS.length] }
  })

  function arcPath(cx: number, cy: number, r: number, start: number, sweep: number) {
    const x1 = cx + r * Math.cos(start); const y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(start + sweep); const y2 = cy + r * Math.sin(start + sweep)
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', width: '100%' }}>
      <svg viewBox="0 0 160 160" style={{ width: 160, flexShrink: 0 }}>
        {slices.length === 1
          ? <circle cx={CX} cy={CY} r={R} fill={slices[0].color} />
          : slices.map((s, i) => (
              <path key={i} d={arcPath(CX, CY, R, s.start, s.sweep)} fill={s.color} stroke="#fff" strokeWidth="2" />
            ))
        }
        <circle cx={CX} cy={CY} r={INNER} fill="#fff" />
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1C1917">{total}</text>
        <text x={CX} y={CY + 12} textAnchor="middle" fontSize="9" fill="#94A3B8">{centerLabel}</text>
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 140 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1917', flexShrink: 0 }}>
              {s.value} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>({total > 0 ? Math.round(s.value / total * 100) : 0}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CustomerReportsPage() {
  usePageTitle('Glido | Reports')
  const [filter, setFilter] = useState<'all' | ServiceCategory>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [appliedFrom, setAppliedFrom] = useState('')
  const [appliedTo, setAppliedTo] = useState('')
  const [reports, setReports] = useState<ServiceRequestReports | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    getServiceRequestReports({
      category: filter === 'all' ? undefined : filter,
      from: appliedFrom || undefined,
      to: appliedTo || undefined,
    })
      .then(r => { if (!cancelled) { setReports(r); setIsLoading(false) } })
      .catch(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [filter, appliedFrom, appliedTo])

  const handleFilterDates = () => { setAppliedFrom(dateFrom); setAppliedTo(dateTo) }
  // FR 2.4.1.4 — "Clear" resets every applied filter (category + date range) back to the default
  // data set, not just the dates.
  const handleClearDates = () => { setFilter('all'); setDateFrom(''); setDateTo(''); setAppliedFrom(''); setAppliedTo('') }

  const serviceSegments = useMemo(() => (reports?.serviceTypeDistribution ?? []).map(r => ({ label: SERVICE_LABEL[r.service_key] ?? r.service_key, value: r.count })), [reports])
  const statusSegments  = useMemo(() => (reports?.requestStatus ?? []).map(r => ({ label: STATUS_LABEL[r.status] ?? r.status, value: r.count })), [reports])
  const monthlyData     = useMemo(() => (reports?.monthlyRequests ?? []).map(r => r.count), [reports])
  const monthlyLabels   = useMemo(() => (reports?.monthlyRequests ?? []).map(r => monthLabel(r.month)), [reports])

  const exportCsv = () => {
    if (!reports) return
    const lines = ['Service Type,Count', ...reports.serviceTypeDistribution.map(r => `${SERVICE_LABEL[r.service_key] ?? r.service_key},${r.count}`),
      '', 'Status,Count', ...reports.requestStatus.map(r => `${STATUS_LABEL[r.status] ?? r.status},${r.count}`),
      '', 'Month,Count', ...reports.monthlyRequests.map(r => `${r.month},${r.count}`)]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `service-request-reports-${filter}.csv`
    a.click()
  }

  const FILTERS: Array<{ key: 'all' | ServiceCategory; label: string }> = [
    { key: 'all', label: 'All' }, { key: 'import', label: 'Import' }, { key: 'export', label: 'Export' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header row — filter pills left, export right (matches AnalyticsPage) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {FILTERS.map(f => {
            const active = filter === f.key
            return (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{
                  padding: '7px 16px', fontSize: 13, fontWeight: active ? 700 : 500,
                  borderRadius: 'var(--r-full)', fontFamily: 'inherit', cursor: 'pointer',
                  border: active ? '1.5px solid var(--brand-color)' : '1.5px solid rgba(0,0,0,0.10)',
                  background: active ? 'var(--brand-color)' : '#fff',
                  color: active ? 'var(--brand-text)' : '#374151',
                  transition: 'all 0.15s ease',
                }}>
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Date range + actions — matches AnalyticsPage's date-filter row exactly */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '9px 12px', height: 38, fontSize: 14, border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', background: '#F7F6F5', color: '#1C1917', outline: 'none', fontFamily: 'inherit' }} />
          <span style={{ color: 'var(--text-tertiary)', fontSize: 16 }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: '9px 12px', height: 38, fontSize: 14, border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', background: '#F7F6F5', color: '#1C1917', outline: 'none', fontFamily: 'inherit' }} />
          <button onClick={handleFilterDates} disabled={!dateFrom || !dateTo}
            style={{ height: 38, padding: '0 18px', fontSize: 14, fontWeight: 600, background: '#1C1917', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', cursor: dateFrom && dateTo ? 'pointer' : 'not-allowed', opacity: dateFrom && dateTo ? 1 : 0.45, fontFamily: 'inherit' }}>
            Filter
          </button>
          {(appliedFrom || appliedTo || filter !== 'all') && (
            <button onClick={handleClearDates}
              style={{ height: 38, padding: '0 12px', fontSize: 14, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              Clear
            </button>
          )}
          <button onClick={exportCsv} disabled={!reports}
            style={{ height: 38, padding: '0 16px', fontSize: 14, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: reports ? 'pointer' : 'not-allowed', opacity: reports ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'inherit' }}>
            <Icon name={ICONS.download} size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* Report cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        <div style={CARD}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: '0 0 4px' }}>Service Type Distribution</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>Split of requests by service type</p>
          {isLoading
            ? <div style={{ height: 160, background: '#F8FAFC', borderRadius: 'var(--r-sm)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            : <DonutChart segments={serviceSegments} centerLabel="SERVICES" />
          }
        </div>

        <div style={CARD}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: '0 0 4px' }}>Request Status</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>Count by current stage</p>
          {isLoading
            ? <div style={{ height: 160, background: '#F8FAFC', borderRadius: 'var(--r-sm)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            : <DonutChart segments={statusSegments} centerLabel="REQUESTS" />
          }
        </div>

        <div style={CARD}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: '0 0 4px' }}>Monthly Service Requests</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>Requests raised per month — last 12 months</p>
          {isLoading
            ? <div style={{ height: 190, background: '#F8FAFC', borderRadius: 'var(--r-sm)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            : <LineChart data={monthlyData} labels={monthlyLabels} />
          }
        </div>

        <div style={CARD}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: '0 0 4px' }}>Processing Time Average</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>Average time to complete a request</p>
          {isLoading ? (
            <div style={{ height: 90, background: '#F8FAFC', borderRadius: 'var(--r-sm)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ) : reports?.avgProcessingDays != null ? (
            <p style={{ fontSize: 'var(--kpi-value)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#1C1917', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
              {reports.avgProcessingDays.toFixed(1)} <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-tertiary)' }}>days</span>
            </p>
          ) : (
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>No completed requests yet</p>
          )}
        </div>
      </div>

      <CustomReportsSection />

      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
    </div>
  )
}
