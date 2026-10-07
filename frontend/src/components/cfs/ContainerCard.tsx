import { Link } from 'react-router-dom'
import { Icon, ICONS } from '@/lib/Icon'
import { containerPath, fmtDate, fmtTime, serviceLabel, STAGE_ORDER, stageLabel, type CfsContainer, type Stage } from '@/lib/cfs'
import { Chip, ComplianceBadges, CELL_LABEL, MatchBadge, StagePill } from './ui'

// Same shape as the Planner trip cards: flat white card, r-md corners, brand border on hover,
// a stage pill top right, a dotted progress row, then labelled value columns.
function Cell({ label, children, minWidth = 110 }: { label: string; children: React.ReactNode; minWidth?: number }) {
  return (
    <div style={{ minWidth }}>
      <p style={{ ...CELL_LABEL, margin: '0 0 2px' }}>{label}</p>
      <p style={{ color: '#1C1917', margin: 0 }}>{children}</p>
    </div>
  )
}

/** One container as a card — used by every stage tab (list view). */
export function ContainerCard({ c, actions, compact }: { c: CfsContainer; actions?: React.ReactNode; compact?: boolean }) {
  const isImport = c.direction === 'import'
  const stageIdx = STAGE_ORDER.indexOf(c.status as Stage)
  const cancelled = c.status === 'cancelled'
  const pillLabel = cancelled ? 'Cancelled' : stageLabel(c.status as Stage, c.direction)
  const eta = isImport ? c.eta : c.etd

  return (
    <div className="cfs-card"
      style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', overflow: 'hidden', transition: 'border-color 0.15s ease' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(var(--brand-rgb),0.45)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)' }}>
      <Link to={containerPath(c.direction, c.id)} style={{ display: 'block', padding: '14px 16px', color: 'inherit', textDecoration: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: compact ? 8 : 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
            <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: '#1C1917' }}>{c.container_number}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-tertiary)' }}>{c.request_ref}</span>
            {c.request_status === 'submitted' && <Chip tone="amber">Awaiting acceptance</Chip>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <MatchBadge pct={isImport ? c.match_pct : null} />
            <StagePill status={c.status}>{pillLabel}</StagePill>
            <span aria-hidden style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-color)' }}>
              <Icon name={ICONS.arrowRight} size={15} />
            </span>
          </div>
        </div>

        {!compact && !cancelled && stageIdx >= 0 && (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            {STAGE_ORDER.map((st, i) => {
              const done = i <= stageIdx
              return (
                <div key={st} style={{ display: 'flex', alignItems: 'center', flex: i < STAGE_ORDER.length - 1 ? 1 : undefined }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 11, height: 11, borderRadius: '50%', flexShrink: 0,
                      background: done ? 'var(--brand-color)' : '#fff',
                      border: done ? 'none' : '2px solid rgba(0,0,0,0.16)',
                      boxShadow: i === stageIdx ? '0 0 0 4px rgba(var(--brand-rgb),0.15)' : 'none',
                    }} />
                    <span style={{ fontSize: 11.5, fontWeight: done ? 600 : 500, color: done ? '#1C1917' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {stageLabel(st, c.direction)}
                    </span>
                  </div>
                  {i < STAGE_ORDER.length - 1 && <div style={{ flex: 1, height: 2, margin: '0 6px 18px', borderRadius: 2, background: i < stageIdx ? 'var(--brand-color)' : 'rgba(0,0,0,0.08)' }} />}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px 28px', flexWrap: 'wrap', fontSize: 13.5 }}>
          <Cell label="Customer" minWidth={140}>{c.customer_name || '—'}</Cell>
          <Cell label="Vessel" minWidth={140}>{c.vessel ? `${c.vessel}${c.voyage ? ` · ${c.voyage}` : ''}` : '—'}</Cell>
          <Cell label={isImport ? 'ETA' : 'ETD'}>{eta ? fmtDate(eta) : '—'}</Cell>
          <Cell label="Shipments" minWidth={80}>{c.shipment_count}</Cell>
          {c.planned_date && (
            <>
              <Cell label="Planned" minWidth={150}>{fmtDate(c.planned_date)} · {fmtTime(c.planned_start)}–{fmtTime(c.planned_end)}</Cell>
              <Cell label="Location / team" minWidth={170}>{[c.location_name, c.team_name].filter(Boolean).join(' · ') || '—'}</Cell>
            </>
          )}
        </div>

        {!compact && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12, alignItems: 'center' }}>
            <ComplianceBadges c={c} />
            {c.status === 'planned' && (c.plan_confirmed_at ? <Chip tone="green">Plan confirmed</Chip> : <Chip tone="amber">Draft plan</Chip>)}
            {c.status === 'result_validation' && <Chip tone="purple">Result to validate</Chip>}
            {c.related_services?.slice(0, 3).map(s => <Chip key={s}>{serviceLabel(s)}</Chip>)}
            {c.related_services?.length > 3 && <Chip>+{c.related_services.length - 3}</Chip>}
          </div>
        )}
      </Link>
      {actions && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderTop: '1px solid rgba(0,0,0,0.06)', background: '#FAFAF9', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  )
}
