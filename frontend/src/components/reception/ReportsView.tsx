import { STATUS_LABEL, SERVICE_LABEL, LOAD_LABEL } from '../../lib/constants'
import { Icon, ICONS } from '../../lib/Icon'
import type { Booking, BookingStatus } from '../../data/types'

const PAGE_SIZE = 50

interface Props {
  bookings: Booking[]
  page?: number
  from?: string
  to?: string
}

// Last 7 calendar days
function last7Days(): string[] {
  const days: string[] = []
  const d = new Date(); d.setHours(0,0,0,0)
  for (let i = 6; i >= 0; i--) {
    const t = new Date(d.getTime() - i * 86400000)
    days.push(t.toISOString().split('T')[0])
  }
  return days
}

const STATUS_COLORS: Record<string, string> = {
  completed:   '#22C55E',
  confirmed:   'var(--brand-color)',
  checked_in:  '#FC8A3C',
  cancelled:   '#DC2626',
  pending:     '#D97706',
  pending_eft: '#2563EB',
  no_show:     '#433F3D',
  scheduled:   '#64748B',
}

const STATUS_STYLE: Record<string, string> = {
  confirmed:    'background:rgba(34,197,94,0.12); color:#22C55E; border:1px solid rgba(34,197,94,0.22);',
  checked_in:   'background:rgba(var(--brand-rgb),0.12); color:var(--brand-color); border:1px solid rgba(var(--brand-rgb),0.25);',
  completed:    'background:rgba(148,163,184,0.10); color:#78716C; border:1px solid rgba(148,163,184,0.20);',
  cancelled:    'background:rgba(239,68,68,0.10); color:#EF4444; border:1px solid rgba(239,68,68,0.22);',
  pending:      'background:rgba(251,191,36,0.10); color:#FBBF24; border:1px solid rgba(251,191,36,0.22);',
  pending_eft:  'background:rgba(56,189,248,0.10); color:#38BDF8; border:1px solid rgba(56,189,248,0.22);',
  no_show:      'background:rgba(148,163,184,0.08); color:#78716C; border:1px solid rgba(148,163,184,0.15);',
  scheduled:    'background:rgba(148,163,184,0.08); color:#78716C; border:1px solid rgba(148,163,184,0.15);',
}

// Shared ECharts theme tokens
const EC_THEME = `
  var FONT = "'Inter', ui-sans-serif, system-ui, sans-serif";
  var DARK = '#1C1917';
  var DARK2 = 'rgba(28,25,23,0.65)';
  var ORANGE = 'var(--brand-color)';
  var GRID_LINE = 'rgba(0,0,0,0.06)';
  var AXIS_LABEL = '#78716C';
  var TOOLTIP_BG = 'rgba(28,25,23,0.92)';
  var TOOLTIP_BORDER = 'rgba(0,0,0,0.15)';
  var TOOLTIP_TEXT = '#FCFBF8';
`

export const ReportsView = ({ bookings, page = 1, from, to }: Props) => {
  const totalPages  = Math.max(1, Math.ceil(bookings.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageBookings = bookings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const rangeQuery  = from && to ? `&from=${from}&to=${to}` : ''
  const DAYS_7 = last7Days()
  const countByDay = DAYS_7.map(d => bookings.filter(b => b.slotDate === d).length)
  const dayLabels  = DAYS_7.map(d => {
    const t = new Date(d + 'T00:00:00')
    return t.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' })
  })

  // Status distribution
  const statusCounts = Object.entries(
    bookings.reduce<Record<string, number>>((acc, b) => {
      acc[b.status] = (acc[b.status] || 0) + 1
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1])

  // Hourly distribution
  const hourlyCounts = Array.from({ length: 12 }, (_, i) => {
    const h = `${String(i + 6).padStart(2, '0')}:00`
    return bookings.filter(b => b.slotStartTime === h).length
  })
  const hourLabels = Array.from({ length: 12 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`)

  // Service mix
  const pickupCount  = bookings.filter(b => b.serviceType === 'pickup').length
  const dropoffCount = bookings.filter(b => b.serviceType === 'dropoff').length
  const fclCount     = bookings.filter(b => b.loadType === 'fcl').length
  const lclCount     = bookings.filter(b => b.loadType === 'lcl').length
  const total        = bookings.length || 1

  // JSON for inline scripts
  const jsDayLabels    = JSON.stringify(dayLabels)
  const jsCountByDay   = JSON.stringify(countByDay)
  const jsHourLabels   = JSON.stringify(hourLabels)
  const jsHourlyCounts = JSON.stringify(hourlyCounts)
  const jsStatusNames  = JSON.stringify(statusCounts.map(([s]) => STATUS_LABEL[s as BookingStatus] || s))
  const jsStatusVals   = JSON.stringify(statusCounts.map(([, n]) => n))
  const jsStatusColors = JSON.stringify(statusCounts.map(([s]) => STATUS_COLORS[s] || '#A8A29E'))

  return (
    <div style="display:flex; flex-direction:column; gap:20px;">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div style="display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:12px;">
        <div>
          <p style="font-size:12.5px; color:#78716C;">
            {from && to
              ? `${bookings.length} bookings from ${from} to ${to}`
              : `Activity analytics · ${bookings.length} total bookings`}
          </p>
        </div>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          {/* Date range filter */}
          <form method="get" action="/reception/reports" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <input
              type="date"
              name="from"
              value={from || ''}
              placeholder="From"
              style="font-size:16px; padding:10px 16px; height:48px; border:1px solid rgba(0,0,0,0.10); border-radius:8px; background:#F7F6F5; color:#1C1917; outline:none; cursor:pointer;"
              onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'"
            />
            <span style="font-size:14px; color:#4B5563;">→</span>
            <input
              type="date"
              name="to"
              value={to || ''}
              placeholder="To"
              style="font-size:16px; padding:10px 16px; height:48px; border:1px solid rgba(0,0,0,0.10); border-radius:8px; background:#F7F6F5; color:#1C1917; outline:none; cursor:pointer;"
              onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'"
            />
            <button type="submit" style="padding:0 24px; height:48px; font-size:15px; font-weight:600; background:#1C1917; color:#fff; border:none; border-radius:8px; cursor:pointer; transition:opacity 0.15s ease;"
              onmouseover="this.style.opacity='0.80'" onmouseout="this.style.opacity='1'"
            >Filter</button>
            {(from || to) && (
              <a href="/reception/reports" style="font-size:15px; color:#4B5563; text-decoration:none; font-weight:500; padding:12px 16px; border-radius:8px; transition:all 0.15s ease;"
                onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='transparent'"
              >Clear</a>
            )}
          </form>
          <button
            type="button"
            class="btn-ghost"
            style="padding:0 20px; height:48px; border:1px solid rgba(0,0,0,0.1); border-radius:8px; font-size:15px; font-weight:600; color:#374151; cursor:pointer; display:inline-flex; align-items:center; gap:8px;"
            onclick="window._gExportCsv && window._gExportCsv()"
          >
            <Icon name={ICONS.download} size={15} />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── KPI summary strip ──────────────────────────────────────────────── */}
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px;">
        {[
          { label: 'Total Bookings', value: bookings.length,                                      color: '#1C1917' },
          { label: 'Completed',      value: bookings.filter(b => b.status === 'completed').length, color: '#22C55E' },
          { label: 'Cancelled',      value: bookings.filter(b => b.status === 'cancelled').length, color: '#EF4444' },
          { label: 'Scheduled',      value: bookings.filter(b => b.status === 'scheduled').length, color: 'var(--text-secondary)' },
        ].map(s => (
          <div
            key={s.label}
            style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:12px; padding:18px 24px; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.07);"
          >
            <p style={`font-size:38px; font-weight:800; letter-spacing:-0.04em; color:${s.color}; line-height:1; margin-bottom:6px;`}>{s.value}</p>
            <p style="font-size:14px; font-weight:600; color:#4B5563;">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Row 1: Weekly bar + status donut ────────────────────────────────── */}
      <div style="display:grid; grid-template-columns:1.6fr 1fr; gap:12px;">
        <div style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.07);">
          <p style="font-size:16px; font-weight:700; color:#1C1917; margin-bottom:4px;">Bookings last 7 days</p>
          <p style="font-size:14px; color:#4B5563; margin-bottom:16px;">Daily booking volume</p>
          <div id="chart-weekly" style="width:100%; height:220px;"></div>
        </div>
        <div style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.07);">
          <p style="font-size:16px; font-weight:700; color:#1C1917; margin-bottom:4px;">Status breakdown</p>
          <p style="font-size:14px; color:#4B5563; margin-bottom:16px;">All-time distribution</p>
          <div id="chart-status" style="width:100%; height:220px;"></div>
        </div>
      </div>

      {/* ── Row 2: Hourly + service mix ──────────────────────────────────────── */}
      <div style="display:grid; grid-template-columns:1.8fr 1fr; gap:12px;">
        <div style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.07);">
          <p style="font-size:16px; font-weight:700; color:#1C1917; margin-bottom:4px;">Hourly traffic pattern</p>
          <p style="font-size:14px; color:#4B5563; margin-bottom:16px;">Average bookings by time window</p>
          <div id="chart-hourly" style="width:100%; height:200px;"></div>
        </div>
        <div style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.07);">
          <p style="font-size:16px; font-weight:700; color:#1C1917; margin-bottom:4px;">Service mix</p>
          <p style="font-size:14px; color:#4B5563; margin-bottom:20px;">Pick Up vs Drop Off · FCL vs LCL</p>
          <div id="chart-mix" style="width:100%; height:200px;"></div>
        </div>
      </div>

      {/* ── Booking table ──────────────────────────────────────────────────── */}
      <div id="reports-table" style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.07);">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:18px 24px; border-bottom:1px solid rgba(0,0,0,0.07); flex-wrap:wrap; gap:8px;">
          <p style="font-size:16px; font-weight:700; color:#1C1917;">
            All Bookings
            {totalPages > 1 && <span style="font-size:13px; font-weight:400; color:#4B5563; margin-left:8px;">Page {currentPage} of {totalPages}</span>}
          </p>
          <span style="font-size:14px; color:#4B5563;">{bookings.length} records · showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, bookings.length)}</span>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="background:rgba(0,0,0,0.02); border-bottom:1px solid rgba(0,0,0,0.07);">
                {['Reference', 'Date', 'Time', 'Driver', 'Service', 'HBL', 'Amount', 'Status'].map(h => (
                  <th
                    key={h}
                    style="padding:12px 16px; text-align:left; font-size:14px; font-weight:500; letter-spacing:0; text-transform:none; color:var(--text-secondary); white-space:nowrap;"
                  >{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageBookings.map((b, i) => (
                <tr
                  key={b.id}
                  style={`border-bottom:1px solid rgba(0,0,0,0.08); ${i % 2 !== 0 ? 'background:rgba(0,0,0,0.01);' : ''} cursor:pointer; transition:background 0.1s ease;`}
                  onmouseover="this.style.background='rgba(var(--brand-rgb),0.03)'"
                  onmouseout={`this.style.background='${i % 2 !== 0 ? 'rgba(0,0,0,0.01)' : 'transparent'}'`}
                  onclick={`window.location.href='/reception/bookings/${b.id}'`}
                >
                  <td style="padding:18px 16px; font-family:ui-monospace,monospace; font-size:16px; font-weight:700; color:#1C1917; white-space:nowrap;">{b.referenceNumber}</td>
                  <td style="padding:18px 16px; font-size:15px; color:#4B5563; white-space:nowrap;">{b.slotDate}</td>
                  <td style="padding:18px 16px; font-size:15px; color:#4B5563; white-space:nowrap;">{b.slotStartTime} – {b.slotEndTime}</td>
                  <td style="padding:18px 16px; font-size:16px; font-weight:600; color:#1C1917; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{b.driverName}</td>
                  <td style="padding:18px 16px; font-size:15px; color:#4B5563; white-space:nowrap;">
                    {SERVICE_LABEL[b.serviceType]} · {LOAD_LABEL[b.loadType]}
                  </td>
                  <td style="padding:18px 16px; font-family:ui-monospace,monospace; font-size:14px; color:#4B5563; white-space:nowrap;">
                    {b.houseBillNumber || b.containerNumber || '—'}
                  </td>
                  <td style="padding:18px 16px; font-size:16px; font-weight:600; color:#1C1917; white-space:nowrap;">
                    {b.totalAmount ? `$${b.totalAmount.toFixed(2)}` : '—'}
                  </td>
                  <td style="padding:18px 16px;">
                    <span style={`display:inline-block; padding:4px 12px; border-radius:9999px; font-size:13px; font-weight:600; ${STATUS_STYLE[b.status] || STATUS_STYLE.scheduled}`}>
                      {STATUS_LABEL[b.status] || b.status}
                    </span>
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && (
                <tr>
                  <td colspan={8} style="padding:48px 20px; text-align:center;">
                    <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
                      <div style="width:44px; height:44px; border-radius:12px; background:#F7F6F5; border:1px solid rgba(0,0,0,0.07); display:flex; align-items:center; justify-content:center;">
                        <Icon name={ICONS.reports} size={20} style="color:#433F3D;" />
                      </div>
                      <p style="font-size:13px; font-weight:500; color:#78716C; margin:0;">No bookings in this range</p>
                      <p style="font-size:12px;c3F3D; margin:0;">Try adjusting the date filter or <a href="/reception/reports" style="color:var(--brand-color); text-decoration:none;">clear filters</a></p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style="display:flex; align-items:center; justify-content:space-between; padding:18px 24px; border-top:1px solid rgba(0,0,0,0.07); background:rgba(0,0,0,0.01);">
            <span style="font-size:14px; color:#4B5563;">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, bookings.length)} of {bookings.length}
            </span>
            <div style="display:flex; align-items:center; gap:6px;">
              {currentPage > 1 && (
                <a
                  href={`/reception/reports?page=${currentPage - 1}${rangeQuery}`}
                  style="padding:0 16px; height:38px; display:inline-flex; align-items:center; font-size:14px; font-weight:600; color:#1C1917; background:#fff; border:1px solid rgba(0,0,0,0.10); border-radius:8px; text-decoration:none; transition:all 0.15s ease;"
                  onmouseover="this.style.background='#F7F6F5'" onmouseout="this.style.background='#fff'"
                >
                  ← Prev
                </a>
                
              )}
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const pg = totalPages <= 7
                  ? i + 1
                  : currentPage <= 4
                    ? i + 1
                    : currentPage >= totalPages - 3
                      ? totalPages - 6 + i
                      : currentPage - 3 + i
                return (
                  <a
                    key={pg}
                    href={`/reception/reports?page=${pg}${rangeQuery}`}
                    style={`padding:6px 11px; font-size:12px; font-weight:${pg === currentPage ? '700' : '500'}; border-radius:8px; text-decoration:none; transition:all 0.15s ease; ${pg === currentPage ? 'background:#1C1917; color:#fff; border:1px solid #1C1917;' : 'color:#78716C; background:#fff; border:1px solid rgba(0,0,0,0.10);'}`}
                    onmouseover={pg !== currentPage ? "this.style.background='#F7F6F5'" : ''}
                    onmouseout={pg !== currentPage ? "this.style.background='#fff'" : ''}
                  >
                    {pg}
                  </a>
                )
              })}
              {currentPage < totalPages && (
                <a
                  href={`/reception/reports?page=${currentPage + 1}${rangeQuery}`}
                  style="padding:6px 14px; font-size:12px; font-weight:500; color:#1C1917; background:#fff; border:1px solid rgba(0,0,0,0.10); border-radius:8px; text-decoration:none; transition:all 0.15s ease;"
                  onmouseover="this.style.background='#F7F6F5'" onmouseout="this.style.background='#fff'"
                >
                  Next →
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── ECharts init ────────────────────────────────────────────────────── */}
      <script dangerouslySetInnerHTML={{ __html: `
/* CSV export */
window._gExportCsv = function() {
  var header = ['Reference','Date','Time','Driver','Service','Status'];
  var rows = [header];
  var trs = document.querySelectorAll('#reports-table tbody tr');
  for (var i = 0; i < trs.length; i++) {
    var tds = trs[i].querySelectorAll('td');
    var row = [];
    for (var j = 0; j < tds.length; j++) {
      var v = tds[j].innerText.trim().replace(/"/g, '""');
      row.push('"' + v + '"');
    }
    rows.push(row);
  }
  var csv = rows.map(function(r){ return r.join(','); }).join('\\n');
  var a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'glido-report.csv';
  a.click();
};

(function() {
  ${EC_THEME}

  var dayLabels    = ${jsDayLabels};
  var countByDay   = ${jsCountByDay};
  var hourLabels   = ${jsHourLabels};
  var hourlyCounts = ${jsHourlyCounts};
  var statusNames  = ${jsStatusNames};
  var statusVals   = ${jsStatusVals};
  var statusColors = ${jsStatusColors};
  var total        = ${total};

  function initCharts() {
    if (typeof echarts === 'undefined') { setTimeout(initCharts, 80); return; }

    /* Weekly bar */
    var weekly = echarts.init(document.getElementById('chart-weekly'), null, { renderer: 'svg' });
    weekly.setOption({
      grid: { top:8, right:8, bottom:28, left:36, containLabel:false },
      tooltip: { trigger:'axis', backgroundColor:TOOLTIP_BG, borderColor:TOOLTIP_BORDER, borderWidth:1, padding:[8,12], textStyle:{color:TOOLTIP_TEXT,fontFamily:FONT,fontSize:12}, formatter:function(p){return p[0].name+'<br/><b>'+p[0].value+' bookings</b>';} },
      xAxis: { type:'category', data:dayLabels, axisLine:{show:false}, axisTick:{show:false}, axisLabel:{color:AXIS_LABEL,fontFamily:FONT,fontSize:11}, splitLine:{show:false} },
      yAxis: { type:'value', minInterval:1, axisLine:{show:false}, axisTick:{show:false}, axisLabel:{color:AXIS_LABEL,fontFamily:FONT,fontSize:11}, splitLine:{lineStyle:{color:GRID_LINE,type:'dashed'}} },
      series:[{ type:'bar', data:countByDay, barMaxWidth:32, itemStyle:{ borderRadius:[6,6,0,0], color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:DARK},{offset:1,color:DARK2}]) }, emphasis:{itemStyle:{color:DARK}} }]
    });

    /* Status donut */
    var donut = echarts.init(document.getElementById('chart-status'), null, { renderer:'svg' });
    donut.setOption({
      tooltip: { trigger:'item', backgroundColor:TOOLTIP_BG, borderColor:TOOLTIP_BORDER, borderWidth:1, padding:[8,12], textStyle:{color:TOOLTIP_TEXT,fontFamily:FONT,fontSize:12}, formatter:'{b}: <b>{c}</b> ({d}%)' },
      legend: { orient:'vertical', right:0, top:'center', itemWidth:8, itemHeight:8, borderRadius: 'var(--r-xs)', textStyle:{color:'var(--text-secondary)',fontFamily:FONT,fontSize:11} },
      series:[{ type:'pie', radius:['52%','78%'], center:['38%','50%'], avoidLabelOverlap:false, label:{show:false}, labelLine:{show:false}, emphasis:{scale:true,scaleSize:4,itemStyle:{shadowBlur:12,shadowColor:'rgba(var(--brand-rgb),0.25)'}}, data:statusNames.map(function(name,i){return{value:statusVals[i],name:name,itemStyle:{color:statusColors[i],borderRadius: 'var(--r-xs)'}};}) }]
    });

    /* Hourly area */
    var hourly = echarts.init(document.getElementById('chart-hourly'), null, { renderer:'svg' });
    hourly.setOption({
      grid: { top:8, right:8, bottom:28, left:36, containLabel:false },
      tooltip: { trigger:'axis', backgroundColor:TOOLTIP_BG, borderColor:TOOLTIP_BORDER, borderWidth:1, padding:[8,12], textStyle:{color:TOOLTIP_TEXT,fontFamily:FONT,fontSize:12}, formatter:function(p){return p[0].name+'<br/><b>'+p[0].value+' bookings</b>';} },
      xAxis: { type:'category', data:hourLabels, boundaryGap:false, axisLine:{show:false}, axisTick:{show:false}, axisLabel:{color:AXIS_LABEL,fontFamily:FONT,fontSize:10,interval:1}, splitLine:{show:false} },
      yAxis: { type:'value', minInterval:1, axisLine:{show:false}, axisTick:{show:false}, axisLabel:{color:AXIS_LABEL,fontFamily:FONT,fontSize:11}, splitLine:{lineStyle:{color:GRID_LINE,type:'dashed'}} },
      series:[{ type:'line', data:hourlyCounts, smooth:0.4, symbol:'circle', symbolSize:6, lineStyle:{color:DARK,width:2.5}, itemStyle:{color:DARK,borderColor:'#fff',borderWidth:2}, areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(28,25,23,0.10)'},{offset:1,color:'rgba(28,25,23,0.01)'}])} }]
    });

    /* Service mix */
    var mix = echarts.init(document.getElementById('chart-mix'), null, { renderer:'svg' });
    mix.setOption({
      grid: { top:8, right:12, bottom:8, left:8, containLabel:true },
      tooltip: { trigger:'axis', backgroundColor:TOOLTIP_BG, borderColor:TOOLTIP_BORDER, borderWidth:1, padding:[8,12], textStyle:{color:TOOLTIP_TEXT,fontFamily:FONT,fontSize:12}, axisPointer:{type:'none'} },
      yAxis: { type:'category', data:['Pick Up','Drop Off','FCL','LCL'], axisLine:{show:false}, axisTick:{show:false}, axisLabel:{color:'#57534E',fontFamily:FONT,fontSize:12} },
      xAxis: { type:'value', max:total, axisLine:{show:false}, axisTick:{show:false}, axisLabel:{show:false}, splitLine:{show:false} },
      series:[
        { type:'bar', data:[${pickupCount},${dropoffCount},${fclCount},${lclCount}], barMaxWidth:24, itemStyle:{ borderRadius:[0,6,6,0], color:function(p){var c=[DARK,'rgba(28,25,23,0.70)','rgba(28,25,23,0.50)','rgba(28,25,23,0.30)'];return c[p.dataIndex]||DARK;} }, label:{ show:true, position:'right', formatter:function(p){return p.value+' ('+Math.round(p.value/total*100)+'%)';}, color:'var(--text-secondary)', fontFamily:FONT, fontSize:11 } },
        { type:'bar', data:[total-${pickupCount},total-${dropoffCount},total-${fclCount},total-${lclCount}], barMaxWidth:24, itemStyle:{color:'rgba(0,0,0,0.06)',borderRadius:[0,6,6,0]}, label:{show:false}, emphasis:{disabled:true}, stack:'nope' }
      ]
    });

    window.addEventListener('resize', function() { weekly.resize(); donut.resize(); hourly.resize(); mix.resize(); });
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initCharts); } else { initCharts(); }
})();
      `}} />

    </div>
  )
}
