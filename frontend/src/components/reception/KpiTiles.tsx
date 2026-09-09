import { useNavigate } from 'react-router-dom'
import { toast } from '@/lib/toast'
import { Icon, ICONS } from '@/lib/Icon'
import { AnimatedNumber } from '@/lib/motion'
import { EmptyState } from '@/components/reception/EmptyState'
import { fmtTime } from '@/lib/time'
import type { DashboardStats, Booking } from '@/data/types'

interface Props {
  stats:    DashboardStats
  loading?: boolean
}

const TILES = [
  { statKey: 'todaysVisitors', label: "Today's Visitors", sub: 'booked for today',  icon: ICONS.calendar,  iconBg: 'rgba(251,191,36,0.10)', iconFg: '#FBBF24', valueFg: '#1C1917', line: '#FBBF24', fillStart: 'rgba(251,191,36,0.18)', fillEnd: 'rgba(251,191,36,0)', seed: 2 },
  { statKey: 'checkedIn',     label: 'Checked In',       sub: 'currently on site', icon: ICONS.userCheck, iconBg: 'rgba(34,197,94,0.10)',  iconFg: '#22C55E', valueFg: '#22C55E', line: '#22C55E', fillStart: 'rgba(34,197,94,0.18)',  fillEnd: 'rgba(34,197,94,0)',  seed: 5 },
  { statKey: 'pending',       label: 'Pending',           sub: 'yet to arrive',     icon: ICONS.clock,     iconBg: 'rgba(148,163,184,0.10)',iconFg: '#94A3B8', valueFg: '#1C1917', line: '#94A3B8', fillStart: 'rgba(148,163,184,0.15)', fillEnd: 'rgba(148,163,184,0)', seed: 1 },
  { statKey: 'icsHeld',       label: 'ICS Held',          sub: 'awaiting customs clearance', icon: ICONS.warning, iconBg: 'rgba(251,191,36,0.12)', iconFg: '#D97706', valueFg: '#D97706', line: '#F59E0B', fillStart: 'rgba(251,191,36,0.18)', fillEnd: 'rgba(251,191,36,0)', seed: 3 },
] as const

const STATUS_LABEL: Record<string, string> = { scheduled: 'Scheduled', checked_in: 'Checked In', completed: 'Completed', cancelled: 'Cancelled' }
const STATUS_STYLE: Record<string, React.CSSProperties> = {
  checked_in: { background: 'rgba(34,197,94,0.12)',  color: '#16A34A', border: '1px solid rgba(34,197,94,0.25)' },
  completed:  { background: '#F5F5F4',                color: '#78716C', border: '1px solid rgba(0,0,0,0.08)' },
  cancelled:  { background: 'rgba(239,68,68,0.08)',   color: '#DC2626', border: '1px solid rgba(239,68,68,0.20)' },
  scheduled:  { background: '#EFF6FF',                color: '#2563EB', border: '1px solid #BFDBFE' },
}
const ICS_BAR: Record<string, string> = {
  cleared:     '#22C55E',
  held:        '#EF4444',
  examination: '#FBBF24',
  pending:     '#94A3B8',
  unavailable: '#E5E7EB',
}

function StatSegment({ tile, value, loading, isFirst }: { tile: typeof TILES[number]; value: number; loading?: boolean; isFirst: boolean }) {
  return (
    <div
      style={{
        flex: 1, minWidth: 150, padding: 'var(--kpi-pad-y) var(--kpi-pad-x)', position: 'relative',
        borderLeft: isFirst ? 'none' : '1px solid rgba(0,0,0,0.07)',
        transition: 'background 0.18s ease',
      }}
      onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.015)')}
      onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 'var(--r-md)', background: tile.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${tile.iconFg}22` }}>
          <Icon name={tile.icon} size={16} style={{ color: tile.iconFg }} />
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tile.label}</p>
      </div>

      {loading ? (
        <div style={{ width: 48, height: 'var(--kpi-value)', borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.07)', animation: 'dash-pulse 1.5s ease-in-out infinite' }} />
      ) : (
        <p style={{ fontSize: 'var(--kpi-value)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: tile.valueFg, margin: '0 0 3px', fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={value} /></p>
      )}
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tile.sub}</p>
    </div>
  )
}

export function KpiTiles({ stats, loading }: Props) {
  return (
    <>
      <style>{`@keyframes dash-pulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
      <div style={{
        display: 'flex', alignItems: 'stretch',
        background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)',
        borderRadius: 'var(--r-lg)', overflowX: 'auto', overflowY: 'hidden', marginBottom: 'var(--card-gap)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)',
      }}>
        {TILES.map((t, i) => (
          <StatSegment
            key={t.statKey}
            tile={t}
            value={stats[t.statKey] ?? 0}
            loading={loading}
            isFirst={i === 0}
          />
        ))}
      </div>
    </>
  )
}

export function RecentVisitors({ stats, loading, onSelect, selectedId }: Props & { onSelect?: (b: Booking) => void; selectedId?: string }) {
  const navigate = useNavigate()
  const recent = [...(stats.recentVisitors ?? [])].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5)

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 'var(--card-pad)', boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)', marginBottom: 'var(--card-gap)' }}>
      <style>{`
        .booking-ref-copy { cursor: pointer; transition: color 0.15s ease; }
        .booking-ref-copy:hover { color: var(--brand-color) !important; }
        .booking-ref-copy:hover svg { opacity: 0.8; }
      `}</style>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0, letterSpacing: '-0.01em' }}>Recent Visitors</h3>
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>{recent.length} record{recent.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(0,0,0,0.045)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 'var(--r-full)', background: 'rgba(0,0,0,0.07)', flexShrink: 0, animation: 'dash-pulse 1.5s ease-in-out infinite' }} />
                  <div>
                    <div style={{ width: 120, height: 14, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.07)', marginBottom: 6, animation: 'dash-pulse 1.5s ease-in-out infinite' }} />
                    <div style={{ width: 90, height: 12, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.05)', animation: 'dash-pulse 1.5s ease-in-out infinite' }} />
                  </div>
                </div>
                <div style={{ width: 72, height: 26, borderRadius: 'var(--r-full)', background: 'rgba(0,0,0,0.06)', animation: 'dash-pulse 1.5s ease-in-out infinite' }} />
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <EmptyState compact variant="inbox" title="No visitor activity yet" subtitle="As the day begins, check-ins will show up here." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recent.map(b => {
              const statusKey  = b.status === 'checked_in' ? 'checked_in' : b.status === 'completed' ? 'completed' : b.status === 'cancelled' ? 'cancelled' : 'scheduled'
              const icsBar     = ICS_BAR[(b as any).icsStatus ?? ''] ?? ICS_BAR.unavailable
              const svcLabel   = b.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'
              const loadLabel  = (b.loadType ?? '').toUpperCase()
              return (
                <div
                  key={b.id}
                  onClick={() => (onSelect ? onSelect(b) : navigate(`/reception/bookings/${b.id}`))}
                  style={{ display: 'flex', cursor: 'pointer', border: `1px solid ${selectedId === b.id ? 'rgba(var(--brand-rgb),0.35)' : 'rgba(0,0,0,0.08)'}`, borderRadius: 'var(--r-lg)', background: selectedId === b.id ? 'rgba(var(--brand-rgb),0.05)' : '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden', transition: 'box-shadow 0.15s, background 0.12s, border-color 0.12s' }}
                  onMouseOver={e => { if (selectedId !== b.id) { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; e.currentTarget.style.background = '#FAFAF9' } }}
                  onMouseOut={e  => { if (selectedId !== b.id) { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.background = '#FFFFFF' } }}
                >
                  {/* ICS colour bar */}
                  <div style={{ width: 5, flexShrink: 0, background: icsBar }} />

                  {/* Card body */}
                  <div style={{ flex: 1, minWidth: 0, padding: '12px 16px' }}>
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <span
                        className="booking-ref-copy"
                        style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, fontWeight: 700, color: '#1C1917', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        title="Click to copy"
                        onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(b.referenceNumber).then(() => toast('Reference copied', 'info')).catch(() => {}) }}
                      >
                        {b.referenceNumber}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', background: '#F5F5F4', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-full)', padding: '2px 8px', whiteSpace: 'nowrap' }}>
                        {svcLabel}{loadLabel ? ` · ${loadLabel}` : ''}
                      </span>
                      <div style={{ flex: 1 }} />
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{fmtTime(b.updatedAt)}</span>
                    </div>
                    {/* Bottom row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.driverName}</span>
                      <span style={{ ...STATUS_STYLE[statusKey], borderRadius: 'var(--r-full)', padding: '2px 9px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
  )
}
