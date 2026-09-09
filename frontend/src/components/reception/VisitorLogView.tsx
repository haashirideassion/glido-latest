import { Icon, ICONS } from '../../lib/Icon'

interface Props {
  records: any[]
  stats: {
    totalVisitors: number
    currentlyOnSite: number
    completedVisits: number
  }
  filters: {
    from?: string
    to?: string
    status?: string
    search?: string
  }
}

export const VisitorLogView = ({ records, stats, filters }: Props) => {
  const formatDate = (iso?: string) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const formatDateTime = (iso?: string) => {
    if (!iso) return '—'
    const d = new Date(iso)
    const date = d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit' })
    const time = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
    return `${date} ${time}`
  }

  return (
    <div style="display:flex; flex-direction:column; gap:20px;">
      {/* ── Compliance Header ─────────────────────────────────────────────── */}
      <div style="background:#1C1917; border-radius:12px; padding:16px 24px; border:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; gap:16px;">
        <div style="width:40px; height:40px; border-radius:10px; background:rgba(var(--brand-rgb),0.15); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <Icon name={ICONS.reports} size={20} style="color:var(--brand-color);" />
        </div>
        <div>
          <h1 style="font-size:22px; font-weight:700; color:#FFFFFF; margin:0; letter-spacing:0.02em; text-transform:uppercase;">
            S.77Q Customs Depot Licensed Area — Section 77Q, Customs Act 1901
          </h1>
          <p style="font-size:14px; color:rgba(255,255,255,0.7); margin:2px 0 0; font-weight:500; letter-spacing:0.01em;">
            Mandatory Visitor Record Log · ABF Regulatory Compliance Requirement
          </p>
        </div>
      </div>

      {/* ── KPI Summary ─────────────────────────────────────────────────── */}
      <div style="display:flex; align-items:stretch; background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.04),0 4px 20px rgba(0,0,0,0.07);">
        {[
          { label: 'Total Visitors',  value: stats.totalVisitors,   icon: ICONS.walkIn,   color: '#1C1917' },
          { label: 'Currently On-Site', value: stats.currentlyOnSite, icon: ICONS.check,    color: 'var(--brand-color)' },
          { label: 'Completed Visits', value: stats.completedVisits, icon: ICONS.bookings, color: '#22C55E' },
        ].map((kpi, i) => (
          <div key={kpi.label} style={`flex:1; min-width:0; padding:22px 26px; ${i === 0 ? '' : 'border-left:1px solid rgba(0,0,0,0.07);'}`}>
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
              <div style={`width:34px; height:34px; border-radius:12px; background:rgba(0,0,0,0.03); display:flex; align-items:center; justify-content:center; color:${kpi.color};`}>
                <Icon name={kpi.icon} size={17} />
              </div>
              <p style="font-size:14px; font-weight:600; color:#44403C; margin:0;">{kpi.label}</p>
            </div>
            <p style="font-size:40px; font-weight:800; color:#1C1917; margin:0; letter-spacing:-0.04em; line-height:1;">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────────── */}
      <div style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; padding:12px 20px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          {/* Quick Date Range */}
          <div style="display:flex; background:#F7F6F5; border-radius:8px; padding:3px; border:1px solid rgba(0,0,0,0.05);">
            {[
              { label: 'Today',  days: 0 },
              { label: '7 Days',  days: 7 },
              { label: '15 Days', days: 15 },
            ].map((d) => {
              const today = new Date().toISOString().split('T')[0]
              const start = new Date(Date.now() - d.days * 86400000).toISOString().split('T')[0]
              const isActive = filters.from === start && filters.to === today
              return (
                <a
                  key={d.label}
                  href={`/reception/reports/visitor-log?from=${start}&to=${today}`}
                  style={`padding:8px 14px; font-size:15px; font-weight:600; text-decoration:none; border-radius:6px; transition:all 0.15s ease; ${isActive ? 'background:#FFFFFF; color:var(--brand-color); box-shadow:0 1px 2px rgba(0,0,0,0.08);' : 'color:#4B5563;'}`}
                >
                  {d.label}
                </a>
              )
            })}
          </div>

          {/* Custom Date Range */}
          <form style="display:flex; align-items:center; gap:8px;">
            <input type="date" name="from" value={filters.from || ''} style="font-size:15px; border:1px solid rgba(0,0,0,0.1); border-radius:6px; padding:8px 12px; height:48px; outline:none; box-sizing:border-box;" />
            <span style="font-size:12px;c3F3D; font-weight:700;">→</span>
            <input type="date" name="to" value={filters.to || ''} style="font-size:15px; border:1px solid rgba(0,0,0,0.1); border-radius:6px; padding:8px 12px; height:48px; outline:none; box-sizing:border-box;" />
            
            {/* Native status search logic via params */}
            <select name="status" style="font-size:15px; border:1px solid rgba(0,0,0,0.1); border-radius:6px; padding:8px 12px; height:48px; outline:none; background:#FFF; color:#1C1917; box-sizing:border-box;">
              <option value="">All Statuses</option>
              <option value="checked_in" selected={filters.status === 'checked_in'}>Checked In</option>
              <option value="completed" selected={filters.status === 'completed'}>Completed</option>
              <option value="scheduled" selected={filters.status === 'scheduled'}>Scheduled</option>
            </select>

            <button type="submit" style="background:#1C1917; color:#FFF; border:none; border-radius:6px; padding:0 20px; height:48px; font-size:15px; font-weight:600; cursor:pointer;">Filter</button>
            {(filters.from || filters.to || filters.status || filters.search) && (
              <a href="/reception/reports/visitor-log" style="font-size:15px; color:#4B5563; text-decoration:none; font-weight:500; margin-left:8px;">Clear</a>
            )}
          </form>
        </div>

        <div style="display:flex; align-items:center; gap:10px;">
          <input 
            type="text" 
            placeholder="Search visitor, ID, or person..." 
            value={filters.search || ''}
            onchange="window.location.href='/reception/reports/visitor-log?search='+encodeURIComponent(this.value)"
            style="font-size:16px; border:1px solid rgba(0,0,0,0.1); border-radius:6px; padding:0 16px; width:260px; height:48px; outline:none; box-sizing:border-box;" 
          />
          <button 
            onclick="exportVisitorLogCsv()"
            style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.12); border-radius:8px; padding:0 16px; height:48px; font-size:15px; font-weight:600; color:#1C1917; display:flex; align-items:center; gap:8px; cursor:pointer; transition:background 0.15s ease; box-sizing:border-box;"
            onmouseover="this.style.background='#F7F6F5'"
            onmouseout="this.style.background='#FFFFFF'"
          >
            <Icon name={ICONS.download} size={15} />
            CSV
          </button>
          <button 
            style="background:rgba(var(--brand-rgb),0.07); border:1px solid rgba(var(--brand-rgb),0.20); border-radius:8px; padding:0 16px; height:48px; font-size:15px; font-weight:600; color:var(--brand-color); display:flex; align-items:center; gap:8px; cursor:pointer; box-sizing:border-box;"
          >
            <Icon name={ICONS.reports} size={15} />
            PDF
          </button>
        </div>
      </div>

      {/* ── Table Area ────────────────────────────────────────────────────── */}
      <div style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.07);">
        <div style="padding:16px 24px; border-bottom:1px solid rgba(0,0,0,0.07); background:rgba(0,0,0,0.01); display:flex; align-items:center; justify-content:space-between;">
           <p style="font-size:13px; font-weight:700; color:#1C1917;">Visitor Activity Log <span style="font-weight:400;c3F3D; margin-left:6px;">Showing {records.length} records</span></p>
        </div>
        <div style="overflow-x:auto;">
          <table id="visitor-log-table" style="width:100%; border-collapse:collapse; font-size:11.5px; white-space:nowrap;">
            <thead>
              <tr style="background:#F7F6F5; border-bottom:1px solid rgba(0,0,0,0.07);">
                {[
                  'Date', 'Full Name', 'Address', 'ID Type', 'ID Number', 'DOB', 
                  'ID Signed By', 'Reason', 'Person Visited', 'Escort', 'Entry Time', 'Exit Time'
                ].map(h => (
                  <th key={h} style="text-align:left; padding:12px 16px; color:var(--text-secondary); font-weight:500; text-transform:none; letter-spacing:0; font-size:14px;">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const b = r.bookings
                const name = r.licence_name || b?.driver_name || '—'
                const reason = r.walk_in_reason || b?.service_type?.toUpperCase() || '—'
                
                return (
                  <tr key={r.id} style="border-bottom:1px solid rgba(0,0,0,0.08); transition:background 0.1s ease;" onmouseover="this.style.background='rgba(0,0,0,0.015)'" onmouseout="this.style.background='transparent'">
                    <td style="padding:18px 16px; color:#1C1917; font-weight:500; font-size:15px;">{formatDate(r.check_in_time)}</td>
                    <td style="padding:18px 16px; font-weight:700; color:#1C1917; font-size:16px;">{name}</td>
                    <td style="padding:18px 16px; color:#4B5563; max-width:200px; overflow:hidden; text-overflow:ellipsis; font-size:16px;">{r.licence_address || '—'}</td>
                    <td style="padding:18px 16px; color:#4B5563; font-size:15px;">{r.licence_scan_method || 'Manual'}</td>
                    <td style="padding:18px 16px; font-family:ui-monospace,monospace; color:#1C1917; font-weight:700; font-size:16px;">{r.licence_number || '—'}</td>
                    <td style="padding:18px 16px; color:#4B5563; font-size:15px;">{formatDate(r.licence_dob)}</td>
                    <td style="padding:18px 16px; color:#4B5563; font-style:italic; font-size:15px;">Pending</td>
                    <td style="padding:18px 16px;"><span style="background:rgba(0,0,0,0.04); padding:4px 10px; border-radius:6px; font-weight:600; color:#374151; font-size:14px;">{reason}</span></td>
                    <td style="padding:18px 16px; color:#1C1917; font-weight:600; font-size:16px;">{r.visit_person_name || '—'}</td>
                    <td style="padding:18px 16px; color:#4B5563; font-style:italic; font-size:15px;">None</td>
                    <td style="padding:18px 16px; color:#16A34A; font-weight:700; font-size:15px;">{formatDateTime(r.check_in_time)}</td>
                    <td style="padding:18px 16px; color:#4B5563; font-size:15px;">{b?.completed_at ? formatDateTime(b.completed_at) : '—'}</td>
                  </tr>
                )
              })}
              {records.length === 0 && (
                <tr>
                  <td colspan={12} style="padding:64px 20px; text-align:center;">
                    <Icon name={ICONS.reports} size={40} style="color:rgba(0,0,0,0.1); margin:0 auto 12px; display:block;" />
                    <p style="font-size:14px; font-weight:600; color:#78716C; margin:0;">No visitor records found</p>
                    <p style="font-size:12px;c3F3D; margin:4px 0 0;">Try adjusting your filters or date range.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        window.exportVisitorLogCsv = function() {
          const header = ['Date', 'Full Name', 'Address', 'ID Type', 'ID Number', 'DOB', 'Reason', 'Person Visited', 'Entry Time', 'Exit Time'];
          const rows = [header];
          const trs = document.querySelectorAll('#visitor-log-table tbody tr');
          
          trs.forEach(tr => {
            const tds = tr.querySelectorAll('td');
            if (tds.length < 10) return;
            const row = [
              tds[0].innerText.trim(),
              tds[1].innerText.trim(),
              tds[2].innerText.trim().replace(/,/g, ';'),
              tds[3].innerText.trim(),
              tds[4].innerText.trim(),
              tds[5].innerText.trim(),
              tds[7].innerText.trim(),
              tds[8].innerText.trim(),
              tds[10].innerText.trim(),
              tds[11].innerText.trim()
            ];
            rows.push(row.map(v => '"' + v + '"'));
          });
          
          const csv = rows.map(r => r.join(',')).join('\\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          const url = URL.createObjectURL(blob);
          link.setAttribute('href', url);
          link.setAttribute('download', 'ABF_Visitor_Log_' + new Date().toISOString().split('T')[0] + '.csv');
          link.click();
        };
      `}} />
    </div>
  )
}
