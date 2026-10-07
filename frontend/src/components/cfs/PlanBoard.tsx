import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, ICONS } from '@/lib/Icon'
import { addDaysYMD, cfs, containerPath, fmtTime, toYMD, type CfsContainer } from '@/lib/cfs'
import { Btn, CARD, ErrorBanner, Spinner, useLive } from './ui'

const DAYS = 7

function dayHeader(ymd: string) {
  const d = new Date(ymd + 'T00:00:00')
  return {
    dow: d.toLocaleDateString('en-AU', { weekday: 'short' }),
    label: d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
    isToday: ymd === toYMD(new Date()),
  }
}

/** Days × locations calendar of planned jobs, with capacity per location per day. */
export default function PlanBoard({ q = '', confirmed = 'all', refreshKey = 0 }: { q?: string; confirmed?: 'all' | 'draft' | 'confirmed'; refreshKey?: number }) {
  const [from, setFrom] = useState(() => toYMD(new Date()))
  const { data, error, loading, refresh } = useLive(() => cfs.planBoard(from, DAYS), [from, refreshKey], 30000)

  // Capacity counts every job in a cell; the search and Draft / Confirmed filters only decide which cards are shown.
  const byCell = useMemo(() => {
    const m = new Map<string, CfsContainer[]>()
    for (const j of data?.jobs ?? []) {
      if (!j.location_id || !j.planned_date) continue
      const k = `${j.location_id}|${String(j.planned_date).slice(0, 10)}`
      m.set(k, [...(m.get(k) ?? []), j])
    }
    return m
  }, [data])

  const needle = q.trim().toLowerCase()
  const matches = (j: CfsContainer) => {
    if (confirmed === 'confirmed' && !j.plan_confirmed_at) return false
    if (confirmed === 'draft' && j.plan_confirmed_at) return false
    if (!needle) return true
    return [j.container_number, j.request_ref, j.customer_name].some(v => String(v ?? '').toLowerCase().includes(needle))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Btn small onClick={() => setFrom(addDaysYMD(from, -DAYS))} aria-label="Previous week"><Icon name={ICONS.arrowLeft} size={16} /></Btn>
        <Btn small onClick={() => setFrom(toYMD(new Date()))}>Today</Btn>
        <Btn small onClick={() => setFrom(addDaysYMD(from, DAYS))} aria-label="Next week"><Icon name={ICONS.arrowRight} size={16} /></Btn>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', marginLeft: 6 }}>
          {data ? `${dayHeader(data.days[0]).label} – ${dayHeader(data.days[data.days.length - 1]).label}` : ''}
        </span>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => refresh()} />}
      {loading && !data && <Spinner />}

      {data && (
        <div style={{ ...CARD, padding: 0, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 860, tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: 150, textAlign: 'left', padding: '10px 12px', fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>Location</th>
                {data.days.map(d => {
                  const h = dayHeader(d)
                  return (
                    <th key={d} style={{ textAlign: 'left', padding: '10px 10px', borderBottom: '1px solid rgba(0,0,0,0.08)', borderLeft: '1px solid rgba(0,0,0,0.05)', background: h.isToday ? 'rgba(var(--brand-rgb),0.07)' : undefined }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h.dow}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1C1917' }}>{h.label}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {data.locations.length === 0 && (
                <tr><td colSpan={DAYS + 1} style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>No active locations. Add them in Settings.</td></tr>
              )}
              {data.locations.map(loc => (
                <tr key={loc.id}>
                  <td style={{ padding: '10px 12px', verticalAlign: 'top', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1C1917' }}>{loc.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{loc.kind} · {loc.capacity_per_day}/day</div>
                  </td>
                  {data.days.map(d => {
                    const jobs = byCell.get(`${loc.id}|${d}`) ?? []
                    const shown = jobs.filter(matches)
                    const full = jobs.length >= loc.capacity_per_day
                    return (
                      <td key={d} style={{ padding: 6, verticalAlign: 'top', borderBottom: '1px solid rgba(0,0,0,0.05)', borderLeft: '1px solid rgba(0,0,0,0.05)', background: full ? 'rgba(239,68,68,0.04)' : undefined }}>
                        {jobs.length > 0 && (
                          <div style={{ fontSize: 11, fontWeight: 700, color: full ? '#B91C1C' : 'var(--text-tertiary)', marginBottom: 4 }}>
                            {jobs.length}/{loc.capacity_per_day}{full ? ' · full' : ''}
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {shown.map(j => (
                            <Link key={j.id} to={containerPath(j.direction, j.id)}
                              style={{ display: 'block', padding: '5px 7px', borderRadius: 8, textDecoration: 'none', fontSize: 12, lineHeight: 1.3,
                                background: j.plan_confirmed_at ? 'rgba(34,197,94,0.14)' : 'rgba(245,158,11,0.16)', color: '#1C1917' }}
                              title={`${j.customer_name} · ${j.plan_confirmed_at ? 'confirmed' : 'draft'}`}>
                              <strong>{j.container_number}</strong>
                              <div style={{ color: 'var(--text-secondary)' }}>
                                {fmtTime(j.planned_start)}–{fmtTime(j.planned_end)} · {j.direction === 'import' ? 'Unpack' : 'Pack'}
                              </div>
                            </Link>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'rgba(34,197,94,0.5)', marginRight: 5 }} />Confirmed</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'rgba(245,158,11,0.55)', marginRight: 5 }} />Draft</span>
      </div>
    </div>
  )
}
