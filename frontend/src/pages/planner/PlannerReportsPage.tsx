import { useState, useEffect, useMemo } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { getPlannerReports, logReportExport } from '@/lib/db/planner-reports'
import { usePlannerPermissions } from '@/lib/usePlannerPermissions'
import type { PlannerReports, TripCategory } from '@/data/types'

const CARD: React.CSSProperties = {
  background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)',
  padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)',
}

type Tab = 'performance' | 'vessels' | 'trips' | 'custom'
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'performance', label: 'Performance' }, { key: 'vessels', label: 'Vessels' },
  { key: 'trips', label: 'Trips' }, { key: 'custom', label: 'Custom' },
]

function monthLabel(ym: string): string {
  const [, m] = ym.split('-')
  const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return months[parseInt(m, 10)] ?? ym
}

function pctDelta(curr: number, prev: number): string | null {
  if (prev === 0) return null
  const delta = ((curr - prev) / prev) * 100
  return (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%'
}

// Monthly Container Activity — grouped bar chart (imports vs exports)
function MonthlyBarChart({ data }: { data: PlannerReports['monthlyContainerActivity'] }) {
  if (data.length === 0) return (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>No data available</p>
    </div>
  )
  const max = Math.max(...data.flatMap(d => [d.imports, d.exports]), 1)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 160, padding: '0 4px', marginBottom: 12 }}>
        {data.map(d => (
          <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 130 }}>
              <div style={{ width: 12, height: `${(d.imports / max) * 130}px`, minHeight: d.imports > 0 ? 3 : 0, borderRadius: '3px 3px 0 0', background: 'var(--brand-color)' }} title={`Imports: ${d.imports}`} />
              <div style={{ width: 12, height: `${(d.exports / max) * 130}px`, minHeight: d.exports > 0 ? 3 : 0, borderRadius: '3px 3px 0 0', background: '#6366F1' }} title={`Exports: ${d.exports}`} />
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{monthLabel(d.month)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--brand-color)' }} />Imports
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#6366F1' }} />Exports
        </span>
      </div>
    </div>
  )
}

function MetricCard({ label, value, delta }: { label: string; value: string; delta: string | null }) {
  const deltaUp = delta?.startsWith('+')
  return (
    <div style={CARD}>
      <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>{label}</p>
      <p style={{ fontSize: 'var(--kpi-value)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#1C1917', margin: '0 0 6px', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {delta ? (
        <p style={{ fontSize: 14, fontWeight: 600, color: deltaUp ? '#16A34A' : '#DC2626', margin: 0 }}>{deltaUp ? '↑' : '↓'} {delta} from last month</p>
      ) : (
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>No data available</p>
      )}
    </div>
  )
}

export default function PlannerReportsPage() {
  usePageTitle('Glido | Planner Reports')
  const perms = usePlannerPermissions()
  const [tab, setTab] = useState<Tab>('performance')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [category, setCategory] = useState<'all' | TripCategory>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [current, setCurrent] = useState<PlannerReports | null>(null)
  const [previous, setPrevious] = useState<PlannerReports | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    // "Variance vs previous month" (FRD) is a fixed comparison — always this-month vs last-month,
    // independent of whatever range the Filter/Date Range controls select for the charts below.
    const thisMonthFrom = new Date(); thisMonthFrom.setDate(1)
    const lastMonthFrom = new Date(thisMonthFrom); lastMonthFrom.setMonth(lastMonthFrom.getMonth() - 1)
    const lastMonthTo = new Date(thisMonthFrom); lastMonthTo.setDate(0)
    const iso = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Australia/Sydney' })
    const categoryFilter = category === 'all' ? undefined : category

    Promise.all([
      getPlannerReports({ from: dateFrom || undefined, to: dateTo || undefined, category: categoryFilter }),
      getPlannerReports({ from: iso(lastMonthFrom), to: iso(lastMonthTo), category: categoryFilter }),
    ]).then(([curr, prev]) => {
      if (cancelled) return
      setCurrent(curr); setPrevious(prev); setIsLoading(false)
    }).catch(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [dateFrom, dateTo, category])

  const exportCsv = () => {
    if (!current) return
    logReportExport()
    const lines = [
      'Metric,Value',
      `Total Vessels,${current.totalVessels}`,
      `Active Trips,${current.activeTrips}`,
      `On-Time Delivery,${current.onTimeDeliveryPct != null ? current.onTimeDeliveryPct.toFixed(1) + '%' : 'N/A'}`,
      '', 'Month,Imports,Exports',
      ...current.monthlyContainerActivity.map(m => `${m.month},${m.imports},${m.exports}`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `planner-reports-${dateFrom || 'all'}-to-${dateTo || 'now'}.csv`
    a.click()
  }

  const metrics = useMemo(() => {
    if (!current) return null
    return [
      { label: 'Total Vessels', value: String(current.totalVessels), delta: previous ? pctDelta(current.totalVessels, previous.totalVessels) : null },
      { label: 'Active Trips',  value: String(current.activeTrips),  delta: previous ? pctDelta(current.activeTrips, previous.activeTrips) : null },
      { label: 'On-Time Delivery', value: current.onTimeDeliveryPct != null ? `${current.onTimeDeliveryPct.toFixed(0)}%` : '—',
        delta: previous?.onTimeDeliveryPct != null && current.onTimeDeliveryPct != null ? pctDelta(current.onTimeDeliveryPct, previous.onTimeDeliveryPct) : null },
    ]
  }, [current, previous])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

      {/* Tabs + filter + date range + export */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, background: '#F0F0EF', padding: 4, borderRadius: 'var(--r-full)', width: 'fit-content' }}>
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              style={{ padding: '8px 18px', borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', background: tab === t.key ? '#fff' : 'transparent', color: tab === t.key ? '#1C1917' : 'var(--text-secondary)', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.10)' : 'none' }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setFilterOpen(v => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'inherit', cursor: 'pointer', borderRadius: 'var(--r-sm)',
                background: category !== 'all' ? 'rgba(var(--brand-rgb),0.10)' : '#fff',
                border: `1px solid ${category !== 'all' ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.12)'}`,
                color: category !== 'all' ? 'var(--brand-color)' : '#374151' }}>
              <Icon name={ICONS.filter} size={14} />{category === 'all' ? 'Filter' : category === 'import' ? 'Import' : 'Export'}
            </button>
            {filterOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setFilterOpen(false)} />
                <div style={{ position: 'absolute', top: 44, left: 0, zIndex: 101, width: 160, background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                  {(['all', 'import', 'export'] as const).map(c => (
                    <button key={c} type="button" onClick={() => { setCategory(c); setFilterOpen(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 14, fontWeight: category === c ? 700 : 500, color: category === c ? 'var(--brand-color)' : '#374151', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                      {c === 'all' ? 'All Categories' : c}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '9px 12px', height: 38, fontSize: 14, border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', background: '#F7F6F5', color: '#1C1917', outline: 'none', fontFamily: 'inherit' }} />
          <span style={{ color: 'var(--text-tertiary)', fontSize: 16 }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: '9px 12px', height: 38, fontSize: 14, border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', background: '#F7F6F5', color: '#1C1917', outline: 'none', fontFamily: 'inherit' }} />
          {(dateFrom || dateTo || category !== 'all') && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); setCategory('all') }}
              style={{ height: 38, padding: '0 12px', fontSize: 14, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              Clear
            </button>
          )}
          {perms.can_export_reports && (
            <button onClick={exportCsv} disabled={!current}
              style={{ height: 38, padding: '0 16px', fontSize: 14, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: current ? 'pointer' : 'not-allowed', opacity: current ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'inherit' }}>
              <Icon name={ICONS.download} size={15} /> Export
            </button>
          )}
        </div>
      </div>

      {tab === 'performance' && (
        isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ height: 120, borderRadius: 'var(--r-lg)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {metrics?.map(m => <MetricCard key={m.label} {...m} />)}
            </div>

            <div style={CARD}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: '0 0 4px' }}>Monthly Container Activity</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>Import vs Export trends over time</p>
              <MonthlyBarChart data={current?.monthlyContainerActivity ?? []} />
            </div>

            <div style={CARD}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: '0 0 4px' }}>Performance Metrics</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>Key performance indicators for planning operations</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px 24px' }}>
                <PerfMetric label="Average Turnaround Time" value={current?.performanceMetrics.avgTurnaroundHours != null ? `${current.performanceMetrics.avgTurnaroundHours.toFixed(1)} hrs` : null} />
                <PerfMetric label="Resource Utilization" value={current?.performanceMetrics.resourceUtilizationPct != null ? `${current.performanceMetrics.resourceUtilizationPct.toFixed(0)}%` : null} />
                <PerfMetric label="Planning Accuracy" value={current?.performanceMetrics.planningAccuracyPct != null ? `${current.performanceMetrics.planningAccuracyPct.toFixed(0)}%` : null} />
                <PerfMetric label="Cost Per Trip" value={current?.performanceMetrics.costPerTrip != null ? `$${current.performanceMetrics.costPerTrip.toFixed(2)}` : null} />
              </div>
            </div>
          </>
        )
      )}

      {tab !== 'performance' && (
        <div style={{ ...CARD, textAlign: 'center', padding: '48px 24px' }}>
          <Icon name={ICONS.info} size={26} style={{ color: 'rgba(0,0,0,0.15)' }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: '12px 0 4px' }}>
            {tab === 'vessels' ? 'Vessel reports' : tab === 'trips' ? 'Trip reports' : 'Custom reports'}
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', maxWidth: 380, margin: '0 auto' }}>
            The FRD names this tab but doesn't specify its fields yet — flagged for follow-up once that's defined.
          </p>
        </div>
      )}
    </div>
  )
}

function PerfMetric({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 700, color: value ? '#1C1917' : 'var(--text-tertiary)' }}>{value ?? 'No data available'}</p>
    </div>
  )
}
