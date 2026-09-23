import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { getTrip, setTripStage } from '@/lib/db/trips'
import { Rego } from '@/components/ui/Rego'
import { usePlannerPermissions } from '@/lib/usePlannerPermissions'
import { toast } from '@/lib/toast'
import type { Trip, TripStage } from '@/data/types'

// Dedicated trip detail screen (FRD 2.4.2.2 — "navigated to the trip details of the respective
// trip"). Replaces the docked slide-over the list used to open, matching the decision already
// taken for Customer Portal request details: a record you can deep-link, refresh and share.

const STAGES: TripStage[] = ['planned', 'assigned', 'in_progress', 'completed']
const STAGE_LABEL: Record<TripStage, string> = {
  planned: 'Planned', assigned: 'Assigned', in_progress: 'In Progress', completed: 'Completed',
}
const STAGE_STYLE: Record<TripStage, { bg: string; color: string }> = {
  planned:     { bg: 'rgba(0,0,0,0.05)',     color: 'var(--text-secondary)' },
  assigned:    { bg: 'rgba(37,99,235,0.08)', color: '#2563EB' },
  in_progress: { bg: 'rgba(234,179,8,0.10)', color: '#A16207' },
  completed:   { bg: 'rgba(34,197,94,0.10)', color: '#16A34A' },
}

const CARD: React.CSSProperties = {
  background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)',
}

const fmtDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function TripDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const perms = usePlannerPermissions()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)
  const [advancing, setAdvancing] = useState(false)

  usePageTitle(trip ? `Glido | Trip ${trip.tripRef}` : 'Glido | Trip')

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    getTrip(id)
      .then(t => { if (!cancelled) { setTrip(t); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  useEffect(load, [load])

  const back = () => navigate('/planner/trips')

  const css = `
    @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
    .td-wrap { max-width: 1180px; }
    .td-grid { display: grid; grid-template-columns: minmax(0,1fr) 320px; gap: 16px; align-items: start; }
    .td-rail { position: sticky; top: 0; display: flex; flex-direction: column; gap: 12px; }
    .td-summary { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; }
    @media (max-width: 1040px) { .td-grid { grid-template-columns: 1fr; } .td-rail { position: static; } }
    @media (max-width: 720px)  { .td-summary { grid-template-columns: 1fr; } }
    .td-back:hover { color: #1C1917 !important; }
  `

  if (loading) {
    return (
      <div className="td-wrap">
        <style>{css}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ height: 34, width: 300, borderRadius: 'var(--r-sm)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div className="td-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[0, 1].map(i => <div key={i} style={{ height: 180, borderRadius: 'var(--r-lg)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
            </div>
            <div style={{ height: 260, borderRadius: 'var(--r-lg)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      </div>
    )
  }

  if (!trip) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Icon name={ICONS.truck} size={30} style={{ color: 'rgba(0,0,0,0.14)' }} />
        <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: '12px 0 4px' }}>Trip not found</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 18px' }}>It may have been removed, or the link is wrong.</p>
        <button type="button" onClick={back}
          style={{ padding: '10px 20px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
          Back to Trips
        </button>
      </div>
    )
  }

  const stageIdx = STAGES.indexOf(trip.stage)
  const s        = STAGE_STYLE[trip.stage]
  const nextStage: Record<TripStage, TripStage | null> = {
    planned: 'assigned', assigned: 'in_progress', in_progress: 'completed', completed: null,
  }
  const next = nextStage[trip.stage]
  const progressPct = stageIdx >= 0 ? Math.round(((stageIdx + 1) / STAGES.length) * 100) : 0

  const advance = async () => {
    if (!next) return
    setAdvancing(true)
    try {
      const result = await setTripStage(trip.id, next)
      if (result) { toast(`Trip advanced to ${STAGE_LABEL[next]}`, 'success'); setTrip(result) }
      else toast('Could not update trip', 'error')
    } catch (err: any) {
      toast(err?.message ?? 'Could not update trip', 'error')
    } finally {
      setAdvancing(false)
    }
  }

  return (
    <div className="td-wrap" style={{ paddingBottom: 60 }}>
      <style>{css}</style>

      {/* Breadcrumb + heading on one line, same treatment as the request detail screen. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" onClick={back} className="td-back"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 2px', flexShrink: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.13s' }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5L4.5 7l4 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Trips
        </button>

        <span aria-hidden style={{ width: 1, height: 18, background: 'rgba(0,0,0,0.12)', flexShrink: 0 }} />

        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', margin: 0 }}>
          Trip <span style={{ fontFamily: 'ui-monospace,monospace' }}>#{trip.tripRef}</span>
        </h1>
        <span style={{ background: s.bg, color: s.color, padding: '4px 11px', borderRadius: 'var(--r-full)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {STAGE_LABEL[trip.stage]}
        </span>
        <span style={{ fontSize: 13.5, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>
          {trip.serviceCategory} · {trip.serviceType}
        </span>

        {next && perms.can_create_trip && (
          <button type="button" onClick={advance} disabled={advancing}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', flexShrink: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: advancing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: advancing ? 0.6 : 1 }}>
            <Icon name={ICONS.arrowRight} size={13} />
            {advancing ? 'Updating…' : `Advance to ${STAGE_LABEL[next]}`}
          </button>
        )}
      </div>

      <div className="td-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

          {/* Progress — the four stages the FRD names, read-only */}
          <section style={{ ...CARD, padding: '18px 20px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0 }}>Trip Progress</h2>
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                {stageIdx >= 0 ? `Stage ${stageIdx + 1} of ${STAGES.length}` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {STAGES.map((st, i) => {
                const done = i <= stageIdx
                return (
                  <div key={st} style={{ display: 'flex', alignItems: 'center', flex: i < STAGES.length - 1 ? 1 : undefined }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 11, height: 11, borderRadius: '50%', flexShrink: 0,
                        background: done ? 'var(--brand-color)' : '#fff',
                        border: done ? 'none' : '2px solid rgba(0,0,0,0.16)',
                        boxShadow: i === stageIdx ? '0 0 0 4px rgba(var(--brand-rgb),0.15)' : 'none',
                      }} />
                      <span style={{ fontSize: 11.5, fontWeight: done ? 600 : 500, color: done ? '#1C1917' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{STAGE_LABEL[st]}</span>
                    </div>
                    {i < STAGES.length - 1 && <div style={{ flex: 1, height: 2, margin: '0 6px 18px', borderRadius: 2, background: i < stageIdx ? 'var(--brand-color)' : 'rgba(0,0,0,0.08)' }} />}
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Overall progress</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1C1917', fontVariantNumeric: 'tabular-nums' }}>{progressPct}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <div style={{ width: `${progressPct}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--brand-color), color-mix(in srgb, var(--brand-color) 70%, #fff))', transition: 'width 0.3s ease' }} />
              </div>
            </div>
          </section>

          {/* Summary cards */}
          <div className="td-summary">
            <SummaryCard icon={ICONS.container} label="Container" primary={trip.containerNumber || '—'} mono />
            <SummaryCard icon={ICONS.ship}      label="Vessel"    primary={trip.vesselName || '—'} />
            <SummaryCard icon={ICONS.cargo}     label="Trip Date" primary={trip.tripDate || '—'} />
          </div>

          {/* Assignment — read-only. This screen is a record of the trip, not a form: edits
              happen on the Trips list, and allocation happens in the Allocator. */}
          <section style={{ ...CARD, padding: '18px 20px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: '0 0 12px' }}>Assignment</h2>
            <DefRow label="Vehicle" value={trip.vehicle} />
            <ValueRow label="Driver" last>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: trip.driver ? '#1C1917' : 'var(--text-tertiary)' }}>
                {trip.driver || '—'}
              </span>
              <Rego value={trip.vehicleRego} />
            </ValueRow>
            {(!trip.vehicle || !trip.driver) && (
              <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: '10px 0 0', lineHeight: 1.45 }}>
                Allocation is handled in the Allocator module.
              </p>
            )}
          </section>
        </div>

        <aside className="td-rail">
          <section style={{ ...CARD, padding: '16px 18px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', margin: '0 0 10px' }}>Cargo</h3>
            <DefRow label="Hazardous" value={trip.isHazardous ? 'Yes' : 'No'} />
            <DefRow label="Weight" value={trip.weight} />
            <DefRow label="Out of Gauge" last
              value={trip.isOOG ? `${trip.oogLength || '—'} × ${trip.oogWidth || '—'} × ${trip.oogHeight || '—'} cm` : 'No'} />
          </section>

          <section style={{ ...CARD, padding: '16px 18px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', margin: '0 0 10px' }}>Activity</h3>
            <DefRow label="Created"      value={fmtDateTime(trip.createdAt)} />
            <DefRow label="Last Updated" value={fmtDateTime(trip.updatedAt)} last />
          </section>
        </aside>
      </div>
    </div>
  )
}

/** A DefRow whose value side holds more than one element — e.g. a driver plus their rego. */
function ValueRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
      padding: '7px 0', borderBottom: last ? 'none' : '1px solid rgba(0,0,0,0.05)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function SummaryCard({ icon, label, primary, mono }: { icon: string; label: string; primary: string; mono?: boolean }) {
  return (
    <section style={{ ...CARD, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <div style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={17} style={{ color: 'var(--text-secondary)' }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>{label}</p>
        <p style={{ fontSize: 14.5, fontWeight: 700, color: '#1C1917', margin: 0, fontFamily: mono ? 'ui-monospace,monospace' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primary}</p>
      </div>
    </section>
  )
}

function DefRow({ label, value, mono, last }: { label: string; value?: string | null; mono?: boolean; last?: boolean }) {
  const empty = value == null || value === ''
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
      padding: '7px 0', borderBottom: last ? 'none' : '1px solid rgba(0,0,0,0.05)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 13.5, fontWeight: 600, color: empty ? 'var(--text-tertiary)' : '#1C1917',
        fontFamily: mono && !empty ? 'ui-monospace,monospace' : 'inherit',
        textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
      }}>
        {empty ? '—' : value}
      </span>
    </div>
  )
}
