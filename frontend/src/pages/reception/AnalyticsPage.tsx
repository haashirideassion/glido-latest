import { useState, useEffect, useMemo } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { getBookingsByDateRange } from '@/lib/db/bookings'
import { getFunnelSummary, type FunnelStepCount } from '@/lib/db/wizard-funnel'
import type { Booking } from '@/data/types'
import { todaySydney, TZ } from '@/lib/time'
import { Icon, ICONS } from '@/lib/Icon'

const FUNNEL_STEP_LABELS: Record<number, string> = {
  1: 'Slots', 2: 'Service Type', 3: 'Load Type', 4: 'Time Slot',
  5: 'Details', 6: 'Document', 7: 'Payment',
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid rgba(0,0,0,0.07)',
  borderRadius: 'var(--r-lg)',
  padding: 24,
  boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000)
    .toLocaleDateString('sv-SE', { timeZone: TZ })
}

function dayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${parseInt(d)} ${months[parseInt(m)]}`
}

function pctDelta(curr: number, prev: number): string | null {
  if (prev === 0) return null
  const delta = ((curr - prev) / prev) * 100
  return (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%'
}

// ─── SVG Line Chart ───────────────────────────────────────────────────────────

function LineChart({ data, labels }: { data: number[]; labels: string[] }) {
  if (data.length < 2) return (
    <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>Not enough data</p>
    </div>
  )

  const W = 560; const H = 190
  const PAD = { top: 16, right: 16, bottom: 32, left: 38 }
  const maxVal = Math.max(...data, 1)
  const niceMax = Math.ceil(maxVal / 5) * 5
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
  const areaPath = linePath + ` L ${pts[pts.length-1].x} ${toY(0)} L ${pts[0].x} ${toY(0)} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
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

      <path d={areaPath} fill="url(#ag)" />
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

// ─── SVG Donut Chart ──────────────────────────────────────────────────────────

const PIE_COLORS = ['var(--brand-color)', '#EC4899', '#F59E0B', '#64748B', '#10B981']

function DonutChart({ segments }: { segments: { label: string; value: number }[] }) {
  if (segments.length === 0) return (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>No carrier data</p>
    </div>
  )

  const total = segments.reduce((s, x) => s + x.value, 0)
  const CX = 80; const CY = 80; const R = 64; const INNER = R * 0.55

  let angle = -Math.PI / 2
  const slices = segments.map((seg, i) => {
    const sweep = (seg.value / total) * 2 * Math.PI
    const start = angle
    angle += sweep
    const mid = start + sweep / 2
    return { ...seg, start, sweep, mid, color: PIE_COLORS[i % PIE_COLORS.length] }
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
              <path key={i} d={arcPath(CX, CY, R, s.start, s.sweep)}
                fill={s.color} stroke="#fff" strokeWidth="2" />
            ))
        }
        <circle cx={CX} cy={CY} r={INNER} fill="#fff" />
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1C1917">{total}</text>
        <text x={CX} y={CY + 12} textAnchor="middle" fontSize="9" fill="#94A3B8">BOOKINGS</text>
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 120 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1917', flexShrink: 0 }}>
              {Math.round(s.value / total * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── KPI Tiles (BookingsPage-style strip) ────────────────────────────────────
const ANALYTICS_TILES = [
  { key: 'total',   label: 'Total Bookings',      icon: ICONS.bookings, iconBg: 'rgba(37,99,235,0.10)',  iconFg: '#2563EB' },
  { key: 'avg',     label: 'Avg. Daily Visitors',  icon: ICONS.users,    iconBg: 'rgba(124,58,237,0.10)', iconFg: '#7C3AED' },
  { key: 'peak',    label: 'Peak Time',            icon: ICONS.clock,    iconBg: 'rgba(234,88,12,0.10)',  iconFg: '#EA580C' },
  { key: 'noshow',  label: 'No-shows',             icon: ICONS.noShow,   iconBg: 'rgba(22,163,74,0.10)',  iconFg: '#16A34A' },
] as const

// ─── Bar row ──────────────────────────────────────────────────────────────────

function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total * 100) : 0
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1917' }}>
          {value} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div style={{ height: 7, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

// ─── Period selector ──────────────────────────────────────────────────────────

type Period = '7d' | '30d' | '90d'
const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: '7d',  label: 'Last 7 Days',  days: 7  },
  { key: '30d', label: 'Last 30 Days', days: 30 },
  { key: '90d', label: 'Last 90 Days', days: 90 },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  usePageTitle('Glido | Analytics')

  const [period,  setPeriod]  = useState<Period>('7d')
  const [current, setCurrent] = useState<Booking[]>([])
  const [prev,    setPrev]    = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [ddOpen,  setDdOpen]  = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [customActive, setCustomActive] = useState(false)
  const [funnel, setFunnel] = useState<FunnelStepCount[]>([])
  const [funnelLoading, setFunnelLoading] = useState(true)

  const days = PERIODS.find(p => p.key === period)!.days

  useEffect(() => {
    setFunnelLoading(true)
    getFunnelSummary(days)
      .then(setFunnel)
      .catch(() => setFunnel([]))
      .finally(() => setFunnelLoading(false))
  }, [days])

  const loadPeriod = (d: number) => {
    setLoading(true)
    const today = todaySydney()
    const curFrom  = isoAgo(d - 1)
    const prevFrom = isoAgo(d * 2 - 1)
    const prevTo   = isoAgo(d)
    Promise.all([
      getBookingsByDateRange(curFrom, today),
      getBookingsByDateRange(prevFrom, prevTo),
    ])
      .then(([cur, prv]) => { setCurrent(cur); setPrev(prv) })
      .catch(() => { setCurrent([]); setPrev([]) })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!customActive) loadPeriod(days)
  }, [period, days, customActive]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilter = () => {
    if (!dateFrom || !dateTo) return
    setLoading(true)
    setCustomActive(true)
    getBookingsByDateRange(dateFrom, dateTo)
      .then(data => { setCurrent(data); setPrev([]) })
      .catch(() => { setCurrent([]); setPrev([]) })
      .finally(() => setLoading(false))
  }

  const handleClear = () => {
    setDateFrom(''); setDateTo(''); setCustomActive(false)
    loadPeriod(days)
  }

  const exportCsv = () => {
    const header = ['Reference', 'Date', 'Time', 'Driver', 'Company', 'Service', 'Load', 'Status']
    const rows = current.map(b => [
      b.referenceNumber, b.slotDate, b.slotStartTime ?? '',
      b.driverName ?? '', b.companyName ?? '',
      b.serviceType ?? '', b.loadType ?? '', b.status,
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `glido-analytics-${dateFrom || isoAgo(days - 1)}-to-${dateTo || todaySydney()}.csv`
    a.click()
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total     = current.length
    const prevTotal = prev.length
    const avgDaily  = Math.round(total / days)
    const prevAvg   = Math.round(prevTotal / days)

    // daily counts for chart
    const dateRange: string[] = []
    for (let i = days - 1; i >= 0; i--) dateRange.push(isoAgo(i))
    const countByDate: Record<string, number> = {}
    dateRange.forEach(d => { countByDate[d] = 0 })
    current.forEach(b => { if (countByDate[b.slotDate] !== undefined) countByDate[b.slotDate]++ })
    const dailyCounts = dateRange.map(d => countByDate[d])

    // chart x labels — show every N-th date to avoid crowding
    const step = Math.ceil(days / 8)
    const chartData:   number[] = []
    const chartLabels: string[] = []
    dateRange.forEach((d, i) => {
      if (i % step === 0 || i === dateRange.length - 1) {
        chartData.push(countByDate[d])
        chartLabels.push(days <= 7 ? dayLabel(d) : shortDate(d))
      }
    })

    // peak hour
    const hourMap: Record<number, number> = {}
    current.forEach(b => {
      const h = parseInt(b.slotStartTime?.split(':')[0] ?? '0', 10)
      hourMap[h] = (hourMap[h] ?? 0) + 1
    })
    const peakEntry = Object.entries(hourMap).sort((a, b) => +b[1] - +a[1])[0]
    const peakLabel = peakEntry
      ? (() => {
          const h = parseInt(peakEntry[0], 10)
          return h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`
        })()
      : '—'

    // no-shows: scheduled bookings where date has passed
    const today = todaySydney()
    const noShows    = current.filter(b => b.status === 'scheduled' && b.slotDate < today).length
    const noShowsPrev= prev.filter(b => b.status === 'scheduled' && b.slotDate < today).length
    const noShowPct  = total > 0 ? (noShows / total * 100).toFixed(1) + '%' : '0.0%'

    // carrier breakdown by companyName
    const carrierMap: Record<string, number> = {}
    current.forEach(b => {
      const key = b.companyName?.trim() || 'Individual'
      carrierMap[key] = (carrierMap[key] ?? 0) + 1
    })
    const carrierSegments = Object.entries(carrierMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }))

    // status counts
    const completed  = current.filter(b => b.status === 'completed').length
    const checkedIn  = current.filter(b => b.status === 'checked_in').length
    const scheduled  = current.filter(b => b.status === 'scheduled').length
    const cancelled  = current.filter(b => b.status === 'cancelled').length

    // service split
    const pickups  = current.filter(b => b.serviceType === 'pickup').length
    const dropoffs = current.filter(b => b.serviceType === 'dropoff').length

    // load split
    const fcl = current.filter(b => b.loadType === 'fcl').length
    const lcl = current.filter(b => b.loadType === 'lcl').length

    return {
      total, prevTotal, avgDaily, prevAvg,
      peakLabel, noShowPct, noShowsPrev,
      chartData, chartLabels, dailyCounts,
      carrierSegments,
      completed, checkedIn, scheduled, cancelled,
      pickups, dropoffs, fcl, lcl,
    }
  }, [current, prev, days])

  const periodLabel = PERIODS.find(p => p.key === period)!.label

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        {/* Date range + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '9px 12px', height: 38, fontSize: 14, border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', background: '#F7F6F5', color: '#1C1917', outline: 'none', fontFamily: 'inherit' }} />
          <span style={{ color: 'var(--text-tertiary)', fontSize: 16 }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: '9px 12px', height: 38, fontSize: 14, border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', background: '#F7F6F5', color: '#1C1917', outline: 'none', fontFamily: 'inherit' }} />
          <button onClick={handleFilter} disabled={!dateFrom || !dateTo}
            style={{ height: 38, padding: '0 18px', fontSize: 14, fontWeight: 600, background: '#1C1917', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', cursor: dateFrom && dateTo ? 'pointer' : 'not-allowed', opacity: dateFrom && dateTo ? 1 : 0.45, fontFamily: 'inherit' }}>
            Filter
          </button>
          {customActive && (
            <button onClick={handleClear}
              style={{ height: 38, padding: '0 12px', fontSize: 14, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              Clear
            </button>
          )}
          <button onClick={exportCsv}
            style={{ height: 38, padding: '0 16px', fontSize: 14, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'inherit' }}>
            <Icon name={ICONS.download} size={15} /> Export CSV
          </button>
        </div>
      </div>


      {/* KPI tiles */}
      {(() => {
        const vals = [
          { value: loading ? '—' : String(stats.total),    sub: null,   delta: loading ? null : pctDelta(stats.total, stats.prevTotal),   deltaUp: (stats.total ?? 0) >= (stats.prevTotal ?? 0) },
          { value: loading ? '—' : String(stats.avgDaily), sub: null,   delta: loading ? null : pctDelta(stats.avgDaily, stats.prevAvg),   deltaUp: (stats.avgDaily ?? 0) >= (stats.prevAvg ?? 0) },
          { value: loading ? '—' : stats.peakLabel,        sub: 'Most busy hour in period',             delta: null, deltaUp: false },
          { value: loading ? '—' : stats.noShowPct,        sub: 'Scheduled but never checked in',       delta: null, deltaUp: false },
        ]
        return (
          <div style={{ display: 'flex', alignItems: 'stretch', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
            {ANALYTICS_TILES.map((t, i) => {
              const v = vals[i]
              return (
                <div key={t.key}
                  style={{ flex: 1, minWidth: 0, padding: 'var(--kpi-pad-y) var(--kpi-pad-x)', borderLeft: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.07)', transition: 'background 0.18s ease' }}
                  onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.015)')}
                  onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', background: t.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${t.iconFg}22` }}>
                      <Icon name={t.icon} size={17} style={{ color: t.iconFg }} />
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</p>
                  </div>
                  <p style={{ fontSize: 'var(--kpi-value)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#1C1917', margin: '0 0 6px', fontVariantNumeric: 'tabular-nums' }}>{v.value}</p>
                  {v.delta != null
                    ? <p style={{ fontSize: 14, fontWeight: 600, color: v.deltaUp ? '#16A34A' : '#DC2626', margin: 0 }}>{v.deltaUp ? '↑' : '↓'} {v.delta} vs prev period</p>
                    : <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.sub}</p>
                  }
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        <div style={CARD}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: '0 0 4px' }}>Daily Bookings Trend</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
            Bookings per day — {periodLabel.toLowerCase()}
          </p>
          {loading
            ? <div style={{ height: 190, background: '#F8FAFC', borderRadius: 'var(--r-sm)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            : <LineChart data={stats.chartData} labels={stats.chartLabels} />
          }
        </div>

        <div style={CARD}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: '0 0 4px' }}>Top Carriers by Bookings</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
            Distribution by company name
          </p>
          {loading
            ? <div style={{ height: 190, background: '#F8FAFC', borderRadius: 'var(--r-sm)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            : <DonutChart segments={stats.carrierSegments} />
          }
        </div>
      </div>

      {/* Second row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Status breakdown */}
        <div style={CARD}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: '0 0 4px' }}>Booking Status Breakdown</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>Count by current status</p>
          {loading
            ? <div style={{ height: 140, background: '#F8FAFC', borderRadius: 'var(--r-sm)' }} />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <BarRow label="Completed"  value={stats.completed} total={stats.total} color="#22C55E" />
                <BarRow label="Checked In" value={stats.checkedIn} total={stats.total} color="var(--brand-color)" />
                <BarRow label="Scheduled"  value={stats.scheduled} total={stats.total} color="#94A3B8" />
                <BarRow label="Cancelled"  value={stats.cancelled} total={stats.total} color="#EF4444" />
              </div>
            )
          }
        </div>

        {/* Service + Load split */}
        <div style={CARD}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: '0 0 4px' }}>Service & Load Split</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>Pickup vs Drop-off, FCL vs LCL</p>
          {loading
            ? <div style={{ height: 140, background: '#F8FAFC', borderRadius: 'var(--r-sm)' }} />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <BarRow label="Pick Up"  value={stats.pickups}  total={stats.total} color="var(--brand-color)" />
                <BarRow label="Drop Off" value={stats.dropoffs} total={stats.total} color="#F59E0B" />
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 14 }}>
                  <BarRow label="LCL (Loose Cargo)"        value={stats.lcl} total={stats.total} color="#7C3AED" />
                </div>
                <BarRow label="FCL (Full Container)" value={stats.fcl} total={stats.total} color="#10B981" />
              </div>
            )
          }
        </div>
      </div>

      {/* Booking wizard funnel — where guests actually drop off */}
      <div style={CARD}>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: '0 0 4px' }}>Booking Funnel</p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
          Sessions that reached each wizard step — {periodLabel.toLowerCase()}
        </p>
        {funnelLoading ? (
          <div style={{ height: 140, background: '#F8FAFC', borderRadius: 'var(--r-sm)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        ) : funnel.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>No wizard activity in this period yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(() => {
              const entrySessions = funnel.find(f => f.step === 1)?.sessions ?? Math.max(...funnel.map(f => f.sessions), 1)
              return [1, 2, 3, 4, 5, 6, 7].map(step => {
                const sessions = funnel.find(f => f.step === step)?.sessions ?? 0
                return (
                  <BarRow key={step} label={`${step}. ${FUNNEL_STEP_LABELS[step]}`} value={sessions} total={entrySessions} color="var(--brand-color)" />
                )
              })
            })()}
          </div>
        )}
      </div>

    </div>
  )
}
