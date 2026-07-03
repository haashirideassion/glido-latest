import { useState, useEffect, useRef } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { fmtDateShort, TZ, todaySydney } from '@/lib/time'
import { getBookings, getBookingsByDateRange } from '@/lib/db/bookings'
import type { Booking } from '@/data/types'
import { useStaffPermissions } from '@/lib/useStaffPermissions'

declare const echarts: any

const STATUS_LABEL: Record<string, string> = { scheduled: 'Scheduled', checked_in: 'Checked In', completed: 'Completed', cancelled: 'Cancelled' }
const STATUS_COLORS: Record<string, string> = { completed: '#22C55E', checked_in: 'var(--brand-color)', scheduled: '#64748B', cancelled: '#DC2626' }
const STATUS_STYLE: Record<string, string> = {
  scheduled:  'background:rgba(148,163,184,0.08);color:#78716C;border:1px solid rgba(148,163,184,0.15);',
  checked_in: 'background:rgba(var(--brand-rgb),0.12);color:var(--brand-color);border:1px solid rgba(var(--brand-rgb),0.25);',
  completed:  'background:rgba(148,163,184,0.10);color:#78716C;border:1px solid rgba(148,163,184,0.20);',
  cancelled:  'background:rgba(239,68,68,0.10);color:#EF4444;border:1px solid rgba(239,68,68,0.22);',
}

function last7Days() {
  const days: string[] = []
  const todayMs = new Date(new Date().toLocaleString('en-US', { timeZone: TZ })).setHours(0, 0, 0, 0)
  for (let i = 6; i >= 0; i--) {
    days.push(new Date(todayMs - i * 86400000).toLocaleDateString('sv-SE', { timeZone: TZ }))
  }
  return days
}

function Chart({ id, init }: { id: string; init: (el: HTMLDivElement) => any }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    let chart: any
    const attempt = () => {
      if (typeof echarts === 'undefined') { setTimeout(attempt, 100); return }
      if (!ref.current) return
      chart = init(ref.current)
      const onResize = () => chart?.resize()
      window.addEventListener('resize', onResize)
    }
    attempt()
    return () => { chart?.dispose() }
  }, [init])
  return <div ref={ref} id={id} style={{ width: '100%', height: '100%' }} />
}

const PAGE = 50
const CARD: React.CSSProperties = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }

export default function ReportsPage() {
  usePageTitle('Glido | Reports')
  const perms = useStaffPermissions()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading]   = useState(true)
  const [from, setFrom]         = useState('')
  const [to, setTo]             = useState('')
  const [page, setPage]         = useState(1)

  const load = async () => {
    setLoading(true)
    try {
      const data = from && to ? await getBookingsByDateRange(from, to) : await getBookings()
      setBookings(data)
      setPage(1)
    } catch { /* noop */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const DAYS = last7Days()
  const countByDay  = DAYS.map(d => bookings.filter(b => b.slotDate === d).length)
  const dayLabels   = DAYS.map(d => new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', timeZone: TZ }))
  const hourlyCounts = Array.from({ length: 12 }, (_, i) => bookings.filter(b => b.slotStartTime?.startsWith(String(i + 6).padStart(2, '0') + ':')).length)
  const hourLabels  = Array.from({ length: 12 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`)

  const statusCounts = Object.entries(
    bookings.reduce<Record<string, number>>((acc, b) => { acc[b.status] = (acc[b.status] ?? 0) + 1; return acc }, {})
  ).sort((a, b) => b[1] - a[1])

  const total      = bookings.length || 1
  const pickupN    = bookings.filter(b => b.serviceType === 'pickup').length
  const dropoffN   = bookings.filter(b => b.serviceType === 'dropoff').length
  const fclN       = bookings.filter(b => b.loadType === 'fcl').length
  const lclN       = bookings.filter(b => b.loadType === 'lcl').length
  const totalPages = Math.max(1, Math.ceil(bookings.length / PAGE))
  const pageRows   = bookings.slice((page - 1) * PAGE, page * PAGE)

  const FONT = "'Inter', ui-sans-serif, sans-serif"
  const DARK = '#1C1917'

  const exportCsv = () => {
    const header = ['Reference', 'Date', 'Time', 'Driver', 'Service', 'HBL', 'Amount', 'Status']
    const rows = bookings.map(b => [b.referenceNumber, b.slotDate, b.slotStartTime, b.driverName, `${b.serviceType} ${b.loadType}`, b.houseBillNumber ?? '', b.totalAmount ? `$${b.totalAmount.toFixed(2)}` : '', b.status])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = 'glido-report.csv'; a.click()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{bookings.length} bookings · {from && to ? `${from} → ${to}` : 'all time'}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '10px 14px', height: 44, fontSize: 15, border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', background: '#F7F6F5', color: '#1C1917', outline: 'none' }} />
          <span style={{ color: 'var(--text-tertiary)' }}>→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: '10px 14px', height: 44, fontSize: 15, border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', background: '#F7F6F5', color: '#1C1917', outline: 'none' }} />
          <button onClick={load} style={{ height: 44, padding: '0 20px', fontSize: 15, fontWeight: 600, background: '#1C1917', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}>Filter</button>
          {(from || to) && <button onClick={() => { setFrom(''); setTo(''); load() }} style={{ height: 44, padding: '0 14px', fontSize: 15, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>}
          {perms.can_export_csv && (
            <button onClick={exportCsv} style={{ height: 44, padding: '0 16px', fontSize: 15, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name={ICONS.download} size={15} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'flex', alignItems: 'stretch', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
        {[
          { label: 'Total',     value: bookings.length,                                      color: '#1C1917' },
          { label: 'Completed', value: bookings.filter(b => b.status === 'completed').length, color: '#22C55E' },
          { label: 'Cancelled', value: bookings.filter(b => b.status === 'cancelled').length, color: '#EF4444' },
          { label: 'Scheduled', value: bookings.filter(b => b.status === 'scheduled').length, color: 'var(--text-secondary)' },
        ].map((s, i) => (
          <div key={s.label}
            style={{ flex: 1, minWidth: 0, padding: '22px 26px', borderLeft: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.07)', transition: 'background 0.18s ease' }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.015)')}
            onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
          >
            <p style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', color: s.color, lineHeight: 1, margin: '0 0 6px', fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)', margin: 0 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12 }}>
        <div style={CARD}>
          <p style={{ fontSize: 16, fontWeight: 700, color: DARK, marginBottom: 4 }}>Bookings last 7 days</p>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 16 }}>Daily booking volume</p>
          <div style={{ height: 220 }}>
            <Chart id="r-weekly" init={el => {
              const ch = echarts.init(el, null, { renderer: 'svg' })
              ch.setOption({ grid: { top: 8, right: 8, bottom: 28, left: 36, containLabel: false }, tooltip: { trigger: 'axis', backgroundColor: 'rgba(28,25,23,0.88)', borderColor: 'transparent', padding: [8, 12], textStyle: { color: '#FCFBF8', fontFamily: FONT, fontSize: 14 }, formatter: (p: any) => `${p[0].name}<br/><b>${p[0].value} bookings</b>` }, xAxis: { type: 'category', data: dayLabels, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: 'var(--text-secondary)', fontFamily: FONT, fontSize: 13 }, splitLine: { show: false } }, yAxis: { type: 'value', minInterval: 1, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: 'var(--text-secondary)', fontFamily: FONT, fontSize: 13 }, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)', type: 'dashed' } } }, series: [{ type: 'bar', data: countByDay, barMaxWidth: 32, itemStyle: { borderRadius: [6, 6, 0, 0], color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: DARK }, { offset: 1, color: 'rgba(28,25,23,0.65)' }]) } }] })
              return ch
            }} />
          </div>
        </div>
        <div style={CARD}>
          <p style={{ fontSize: 16, fontWeight: 700, color: DARK, marginBottom: 4 }}>Status breakdown</p>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 16 }}>All-time distribution</p>
          <div style={{ height: 220 }}>
            <Chart id="r-status" init={el => {
              const ch = echarts.init(el, null, { renderer: 'svg' })
              ch.setOption({ tooltip: { trigger: 'item', backgroundColor: 'rgba(28,25,23,0.88)', borderColor: 'transparent', padding: [8, 12], textStyle: { color: '#FCFBF8', fontFamily: FONT, fontSize: 14 }, formatter: '{b}: <b>{c}</b> ({d}%)' }, legend: { orient: 'vertical', right: 0, top: 'center', itemWidth: 8, itemHeight: 8, textStyle: { color: 'var(--text-secondary)', fontFamily: FONT, fontSize: 13 } }, series: [{ type: 'pie', radius: ['52%', '78%'], center: ['38%', '50%'], avoidLabelOverlap: false, label: { show: false }, data: statusCounts.map(([s, n]) => ({ value: n, name: STATUS_LABEL[s] ?? s, itemStyle: { color: STATUS_COLORS[s] ?? '#A8A29E', borderRadius: 'var(--r-xs)' } })) }] })
              return ch
            }} />
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: 12 }}>
        <div style={CARD}>
          <p style={{ fontSize: 16, fontWeight: 700, color: DARK, marginBottom: 4 }}>Hourly traffic pattern</p>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 16 }}>Average bookings by time window</p>
          <div style={{ height: 200 }}>
            <Chart id="r-hourly" init={el => {
              const ch = echarts.init(el, null, { renderer: 'svg' })
              ch.setOption({ grid: { top: 8, right: 8, bottom: 28, left: 36, containLabel: false }, tooltip: { trigger: 'axis', backgroundColor: 'rgba(28,25,23,0.88)', borderColor: 'transparent', padding: [8, 12], textStyle: { color: '#FCFBF8', fontFamily: FONT, fontSize: 14 }, formatter: (p: any) => `${p[0].name}<br/><b>${p[0].value} bookings</b>` }, xAxis: { type: 'category', data: hourLabels, boundaryGap: false, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: 'var(--text-secondary)', fontFamily: FONT, fontSize: 10, interval: 1 }, splitLine: { show: false } }, yAxis: { type: 'value', minInterval: 1, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: 'var(--text-secondary)', fontFamily: FONT, fontSize: 13 }, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)', type: 'dashed' } } }, series: [{ type: 'line', data: hourlyCounts, smooth: 0.4, symbol: 'circle', symbolSize: 6, lineStyle: { color: DARK, width: 2.5 }, itemStyle: { color: DARK, borderColor: '#fff', borderWidth: 2 }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(28,25,23,0.10)' }, { offset: 1, color: 'rgba(28,25,23,0.01)' }]) } }] })
              return ch
            }} />
          </div>
        </div>
        <div style={CARD}>
          <p style={{ fontSize: 16, fontWeight: 700, color: DARK, marginBottom: 4 }}>Service mix</p>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 20 }}>Pick Up vs Drop Off · FCL vs LCL</p>
          <div style={{ height: 200 }}>
            <Chart id="r-mix" init={el => {
              const ch = echarts.init(el, null, { renderer: 'svg' })
              ch.setOption({ grid: { top: 8, right: 12, bottom: 8, left: 8, containLabel: true }, tooltip: { trigger: 'axis', backgroundColor: 'rgba(28,25,23,0.88)', borderColor: 'transparent', padding: [8, 12], textStyle: { color: '#FCFBF8', fontFamily: FONT, fontSize: 14 }, axisPointer: { type: 'none' } }, yAxis: { type: 'category', data: ['Pick Up', 'Drop Off', 'FCL', 'LCL'], axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#57534E', fontFamily: FONT, fontSize: 14 } }, xAxis: { type: 'value', max: total, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } }, series: [{ type: 'bar', data: [pickupN, dropoffN, fclN, lclN], barMaxWidth: 24, itemStyle: { borderRadius: [0, 6, 6, 0], color: (p: any) => ['rgba(28,25,23,1)', 'rgba(28,25,23,0.70)', 'rgba(28,25,23,0.50)', 'rgba(28,25,23,0.30)'][p.dataIndex] }, label: { show: true, position: 'right', formatter: (p: any) => `${p.value} (${Math.round(p.value / total * 100)}%)`, color: 'var(--text-secondary)', fontFamily: FONT, fontSize: 13 } }] })
              return ch
            }} />
          </div>
        </div>
      </div>

      {/* Booking table */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid rgba(0,0,0,0.07)', flexWrap: 'wrap', gap: 8 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: DARK }}>All Bookings</p>
          <span style={{ fontSize: 15, color: 'var(--text-muted)' }}>{bookings.length} records</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
                {['Reference', 'Date', 'Time', 'Driver', 'Service', 'HBL', 'Amount', 'Status'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 15, fontWeight: 500, letterSpacing: 0, textTransform: 'none', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 15 }}>Loading…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 15 }}>No bookings in this range</td></tr>
              ) : pageRows.map((b, i) => {
                const rowBg = i % 2 !== 0 ? 'rgba(0,0,0,0.01)' : 'transparent'
                const sStyle = STATUS_STYLE[b.status] ?? STATUS_STYLE.scheduled
                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.08)', background: rowBg, cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(var(--brand-rgb),0.03)')}
                    onMouseOut={e  => (e.currentTarget.style.background = rowBg)}
                  >
                    <td style={{ padding: '18px 16px', fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: '#1C1917', whiteSpace: 'nowrap' }}>{b.referenceNumber}</td>
                    <td style={{ padding: '18px 16px', fontSize: 15, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{b.slotDate}</td>
                    <td style={{ padding: '18px 16px', fontSize: 15, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{b.slotStartTime} – {b.slotEndTime}</td>
                    <td style={{ padding: '18px 16px', fontSize: 15, fontWeight: 600, color: DARK, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.driverName}</td>
                    <td style={{ padding: '18px 16px', fontSize: 15, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{b.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'} · {(b.loadType ?? '').toUpperCase()}</td>
                    <td style={{ padding: '18px 16px', fontFamily: 'ui-monospace,monospace', fontSize: 15, color: 'var(--text-muted)' }}>{b.houseBillNumber ?? b.containerNumber ?? '—'}</td>
                    <td style={{ padding: '18px 16px', fontSize: 15, fontWeight: 600, color: DARK }}>{b.totalAmount ? `$${b.totalAmount.toFixed(2)}` : '—'}</td>
                    <td style={{ padding: '18px 16px' }}>
                      <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 'var(--r-full)', fontSize: 15, fontWeight: 600, ...(Object.fromEntries(sStyle.split(';').filter(Boolean).map(s => { const [k, ...v] = s.split(':'); return [k.trim().replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase()), v.join(':').trim()] }))) } as any}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderTop: '1px solid rgba(0,0,0,0.07)', background: 'rgba(0,0,0,0.01)' }}>
            <span style={{ fontSize: 15, color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {page > 1 && <PageBtn label="← Prev" onClick={() => setPage(p => p - 1)} />}
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                <PageBtn key={p} label={String(p)} onClick={() => setPage(p)} active={p === page} />
              ))}
              {page < totalPages && <PageBtn label="Next →" onClick={() => setPage(p => p + 1)} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PageBtn({ label, onClick, active }: { label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} style={{ padding: '6px 12px', fontSize: 15, fontWeight: active ? 700 : 500, borderRadius: 'var(--r-sm)', cursor: 'pointer', border: `1px solid ${active ? '#1C1917' : 'rgba(0,0,0,0.10)'}`, background: active ? '#1C1917' : '#fff', color: active ? '#fff' : '#78716C', transition: 'all 0.12s' }}>
      {label}
    </button>
  )
}
