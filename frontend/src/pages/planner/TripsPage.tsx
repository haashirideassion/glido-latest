import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { getTrips, createTrip, setTripStage } from '@/lib/db/trips'
import { getVessels } from '@/lib/db/vessels'
import { getPlannerSettings } from '@/lib/db/planner-settings'
import { usePlannerPermissions } from '@/lib/usePlannerPermissions'
import { toast } from '@/lib/toast'
import type { Trip, TripCategory, TripServiceType, TripStage, Vessel, PlannerSettings } from '@/data/types'

const STAGES: TripStage[] = ['planned', 'assigned', 'in_progress', 'completed']
const STAGE_LABEL: Record<TripStage, string> = { planned: 'Planned', assigned: 'Assigned', in_progress: 'In Progress', completed: 'Completed' }
const STAGE_STYLE: Record<TripStage, { bg: string; color: string }> = {
  planned:     { bg: 'rgba(0,0,0,0.05)',      color: 'var(--text-secondary)' },
  assigned:    { bg: 'rgba(37,99,235,0.08)',  color: '#2563EB' },
  in_progress: { bg: 'rgba(234,179,8,0.10)',  color: '#A16207' },
  completed:   { bg: 'rgba(34,197,94,0.10)',  color: '#16A34A' },
}

type SecondaryTab = 'all' | TripServiceType
const SECONDARY_TABS: Array<{ key: SecondaryTab; label: string }> = [
  { key: 'all', label: 'All Requests' }, { key: 'collection', label: 'Collection' },
  { key: 'delivery', label: 'Delivery' }, { key: 'dehire', label: 'Dehire' },
]
type SortKey = 'newest' | 'oldest' | 'trip_ref'

export default function TripsPage() {
  usePageTitle('Glido | Trips')
  const navigate = useNavigate()
  const perms = usePlannerPermissions()
  const [category, setCategory] = useState<TripCategory>('import')
  const [secondary, setSecondary] = useState<SecondaryTab>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [sortOpen, setSortOpen] = useState(false)
  const [trips, setTrips] = useState<Trip[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionsMenuId, setActionsMenuId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [stageFilter, setStageFilter] = useState<'all' | TripStage>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [settings, setSettings] = useState<PlannerSettings | null>(null)
  const [page, setPage] = useState(1)
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true))
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => { getPlannerSettings().then(setSettings).catch(() => {}) }, [])

  const load = () => {
    setIsLoading(true)
    getTrips({
      category, serviceType: secondary === 'all' ? undefined : secondary, search: search.trim() || undefined, sort,
      stage: stageFilter === 'all' ? undefined : stageFilter,
      // Planner Settings → "Show completed items by default" — only applies when the user
      // hasn't explicitly filtered to a specific stage (an explicit filter always wins).
      excludeCompleted: stageFilter === 'all' && settings ? !settings.showCompletedDefault : false,
    })
      .then(rows => { setTrips(rows); setIsLoading(false) })
      .catch(() => setIsLoading(false))
  }

  useEffect(load, [category, secondary, search, sort, stageFilter, settings]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1) }, [category, secondary, search, sort, stageFilter])

  const itemsPerPage = settings?.itemsPerPage ?? 10
  const pageCount = Math.max(1, Math.ceil(trips.length / itemsPerPage))
  const pagedTrips = useMemo(() => trips.slice((page - 1) * itemsPerPage, page * itemsPerPage), [trips, page, itemsPerPage])

  return (
    <>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

      <button type="button" onClick={() => navigate('/planner')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 4px', marginBottom: 12, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5L4.5 7l4 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back
      </button>

      {/* Primary tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, background: '#F0F0EF', padding: 4, borderRadius: 'var(--r-full)', width: 'fit-content' }}>
        {(['import', 'export'] as TripCategory[]).map(t => (
          <button key={t} type="button" onClick={() => setCategory(t)}
            style={{ padding: '8px 20px', borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', textTransform: 'capitalize', background: category === t ? '#fff' : 'transparent', color: category === t ? '#1C1917' : 'var(--text-secondary)', boxShadow: category === t ? '0 1px 3px rgba(0,0,0,0.10)' : 'none' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Secondary tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {SECONDARY_TABS.map(t => {
          const active = secondary === t.key
          return (
            <button key={t.key} type="button" onClick={() => setSecondary(t.key)}
              style={{ height: 36, padding: '0 14px', fontSize: 13.5, fontWeight: active ? 700 : 500, borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit',
                background: active ? 'rgba(var(--brand-rgb),0.10)' : '#F7F6F5',
                border: `1px solid ${active ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.08)'}`,
                color: active ? 'var(--brand-color)' : 'var(--text-secondary)' }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Search + sort + create */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 280, flexShrink: 0 }}>
          <Icon name={ICONS.search} size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input type="text" placeholder="Search trips by container number, vessel" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 38, padding: '0 14px 0 36px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setSortOpen(v => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', fontSize: 14, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Icon name={ICONS.sort} size={14} />Sort
          </button>
          {sortOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setSortOpen(false)} />
              <div style={{ position: 'absolute', top: 44, left: 0, zIndex: 101, width: 170, background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                {([{ key: 'newest', label: 'Newest' }, { key: 'oldest', label: 'Oldest' }, { key: 'trip_ref', label: 'Trip Ref' }] as { key: SortKey; label: string }[]).map(s => (
                  <button key={s.key} type="button" onClick={() => { setSort(s.key); setSortOpen(false) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 14, fontWeight: sort === s.key ? 700 : 500, color: sort === s.key ? 'var(--brand-color)' : '#374151', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setFilterOpen(v => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'inherit', cursor: 'pointer', borderRadius: 'var(--r-full)',
              background: stageFilter !== 'all' ? 'rgba(var(--brand-rgb),0.10)' : '#fff',
              border: `1px solid ${stageFilter !== 'all' ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.12)'}`,
              color: stageFilter !== 'all' ? 'var(--brand-color)' : '#374151' }}>
            <Icon name={ICONS.filter} size={14} />{stageFilter === 'all' ? 'Filter' : STAGE_LABEL[stageFilter]}
          </button>
          {filterOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setFilterOpen(false)} />
              <div style={{ position: 'absolute', top: 44, left: 0, zIndex: 101, width: 170, background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                <button type="button" onClick={() => { setStageFilter('all'); setFilterOpen(false) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 14, fontWeight: stageFilter === 'all' ? 700 : 500, color: stageFilter === 'all' ? 'var(--brand-color)' : '#374151', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  All Stages
                </button>
                {STAGES.map(st => (
                  <button key={st} type="button" onClick={() => { setStageFilter(st); setFilterOpen(false) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 14, fontWeight: stageFilter === st ? 700 : 500, color: stageFilter === st ? 'var(--brand-color)' : '#374151', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {STAGE_LABEL[st]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {perms.can_create_trip && (
          <button type="button" onClick={() => setCreateOpen(true)}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 16px', fontSize: 14, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.30)' }}>
            <Icon name={ICONS.add} size={15} />Create Trip
          </button>
        )}
      </div>

      {/* Split view: list (left) + docked detail pane (right) on wide screens */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading ? (
          [0, 1, 2].map(i => <div key={i} style={{ height: 110, borderRadius: 'var(--r-md)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)
        ) : trips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0 48px' }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--r-sm)', background: '#EBEBEA', border: '1px solid rgba(0,0,0,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name={ICONS.truck} size={22} style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917' }}>No trips found.</p>
          </div>
        ) : pagedTrips.map(t => {
          const stageIdx = STAGES.indexOf(t.stage)
          const s = STAGE_STYLE[t.stage]
          return (
            <div key={t.id} style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: '#1C1917' }}>#{t.tripRef}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)', background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
                    {STAGE_LABEL[t.stage]}
                  </span>
                  <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                    <button type="button" onClick={() => setActionsMenuId(v => v === t.id ? null : t.id)}
                      aria-label="Actions" style={{ width: 26, height: 26, borderRadius: 'var(--r-sm)', border: 'none', background: actionsMenuId === t.id ? 'rgba(0,0,0,0.06)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><circle cx="4" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="16" cy="10" r="1.6"/></svg>
                    </button>
                    {actionsMenuId === t.id && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setActionsMenuId(null)} />
                        <div style={{ position: 'absolute', top: 30, right: 0, zIndex: 101, width: 170, background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                          <ActionsMenuContent trip={t} onDone={() => { setActionsMenuId(null); load() }} />
                        </div>
                      </>
                    )}
                  </div>
                  <button type="button" onClick={e => { e.stopPropagation(); setSelectedTrip(t) }} aria-label="View trip details"
                    style={{ width: 26, height: 26, borderRadius: 'var(--r-sm)', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--brand-color)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  </button>
                </div>
              </div>

              {/* Progress stages */}
              <div style={{ display: 'flex', alignItems: 'center', maxWidth: 360, marginBottom: 12 }}>
                {STAGES.map((st, i) => (
                  <div key={st} style={{ display: 'flex', alignItems: 'center', flex: i < STAGES.length - 1 ? 1 : undefined }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: i <= stageIdx ? 'var(--brand-color)' : 'rgba(0,0,0,0.12)', flexShrink: 0 }} />
                    {i < STAGES.length - 1 && <div style={{ flex: 1, height: 1.5, margin: '0 3px', background: i < stageIdx ? 'var(--brand-color)' : 'rgba(0,0,0,0.10)' }} />}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13.5 }}>
                <InfoCell label="Container" value={t.containerNumber ?? '—'} />
                <InfoCell label="Vessel" value={t.vesselName ?? '—'} />
                <InfoCell label="Date" value={t.tripDate ?? '—'} />
                <InfoCell label="Vehicle" value={t.vehicle ?? ''} />
                <InfoCell label="Driver" value={t.driver ?? ''} />
                <InfoCell label="OOG" value={t.isOOG ? `Yes — ${t.oogLength || '—'} × ${t.oogWidth || '—'} × ${t.oogHeight || '—'} cm` : 'No'} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination — driven by Planner Settings' "Items per page" */}
      {!isLoading && trips.length > itemsPerPage && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 }}>
          <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ height: 34, padding: '0 14px', fontSize: 13.5, fontWeight: 600, color: page === 1 ? 'var(--text-tertiary)' : '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: page === 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            Previous
          </button>
          <span style={{ fontSize: 13.5, color: 'var(--text-tertiary)' }}>Page {page} of {pageCount}</span>
          <button type="button" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page === pageCount}
            style={{ height: 34, padding: '0 14px', fontSize: 13.5, fontWeight: 600, color: page === pageCount ? 'var(--text-tertiary)' : '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: page === pageCount ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            Next
          </button>
        </div>
      )}

      </div>{/* end list column */}

      {/* Docked detail pane — split view (wide screens) */}
      {selectedTrip && isWide && (
        <div style={{ width: 480, flexShrink: 0, position: 'sticky', top: 12, height: 'calc(100vh - var(--dash-header-h) - 24px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <TripDetailSlideOver key={selectedTrip.id} trip={selectedTrip} docked onClose={() => setSelectedTrip(null)} />
        </div>
      )}
      </div>{/* end split row */}

      {createOpen && (
        <CreateTripModal onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load() }} />
      )}

      {/* Detail overlay — narrow screens */}
      {selectedTrip && !isWide && (
        <TripDetailSlideOver key={selectedTrip.id} trip={selectedTrip} onClose={() => setSelectedTrip(null)} />
      )}
    </>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 90 }}>
      <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 2px' }}>{label}</p>
      <p style={{ color: '#1C1917', margin: 0 }}>{value}</p>
    </div>
  )
}

function TripDetailSlideOver({ trip, onClose, docked = false }: { trip: Trip; onClose: () => void; docked?: boolean }) {
  const stageIdx = STAGES.indexOf(trip.stage)
  const s = STAGE_STYLE[trip.stage]

  const panelStyle: React.CSSProperties = docked
    ? { position: 'relative', height: '100%', width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 6px 24px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9011, width: 'min(480px, 100vw)', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }

  return (
    <>
      {!docked && (
        <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}
          style={{ position: 'fixed', inset: 0, zIndex: 9010, background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(2px)' }} />
      )}
      <motion.div style={panelStyle}
        initial={docked ? { opacity: 0, x: 16 } : { x: '100%' }} animate={docked ? { opacity: 1, x: 0 } : { x: 0 }}
        transition={docked ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] } : { type: 'spring', stiffness: 400, damping: 40 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.07)', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917' }}>
              Trip <span style={{ fontFamily: 'ui-monospace,monospace' }}>#{trip.tripRef}</span>
            </p>
            <span style={{ fontSize: 12.5, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)', background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
              {STAGE_LABEL[trip.stage]}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ width: 34, height: 34, borderRadius: 'var(--r-full)', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: 'var(--text-secondary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 22, flex: 1, overflowY: 'auto', minHeight: 0 }}>

          {/* Progress stages */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {STAGES.map((st, i) => (
              <div key={st} style={{ display: 'flex', alignItems: 'center', flex: i < STAGES.length - 1 ? 1 : undefined }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: i <= stageIdx ? 'var(--brand-color)' : 'rgba(0,0,0,0.12)' }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: i <= stageIdx ? '#1C1917' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{STAGE_LABEL[st]}</span>
                </div>
                {i < STAGES.length - 1 && <div style={{ flex: 1, height: 2, margin: '0 4px 16px', background: i < stageIdx ? 'var(--brand-color)' : 'rgba(0,0,0,0.08)' }} />}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DetailRow label="Service" value={`${trip.serviceCategory} · ${trip.serviceType}`} />
            <DetailRow label="Container" value={trip.containerNumber ?? '—'} />
            <DetailRow label="Vessel" value={trip.vesselName ?? '—'} />
            <DetailRow label="Trip Date" value={trip.tripDate ?? '—'} />
            <DetailRow label="Vehicle" value={trip.vehicle ?? '—'} />
            <DetailRow label="Driver" value={trip.driver ?? '—'} />
            <DetailRow label="OOG" value={trip.isOOG ? `Yes — ${trip.oogLength || '—'} × ${trip.oogWidth || '—'} × ${trip.oogHeight || '—'} cm` : 'No'} />
            <DetailRow label="Created" value={new Date(trip.createdAt).toLocaleString('en-AU')} />
            <DetailRow label="Last Updated" value={new Date(trip.updatedAt).toLocaleString('en-AU')} />
          </div>
        </div>
      </motion.div>
    </>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
      <span style={{ fontSize: 13.5, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function ActionsMenuContent({ trip, onDone }: { trip: Trip; onDone: () => void }) {
  const nextStage: Record<TripStage, TripStage | null> = { planned: 'assigned', assigned: 'in_progress', in_progress: 'completed', completed: null }
  const next = nextStage[trip.stage]
  const advance = async () => {
    if (!next) return
    const result = await setTripStage(trip.id, next)
    if (result) { toast(`Trip advanced to ${next.replace('_', ' ')}`, 'success'); onDone() }
    else { toast('Could not update trip', 'error') }
  }
  return (
    <button type="button" onClick={advance} disabled={!next}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 12px', fontSize: 13.5, fontWeight: 500, color: next ? '#374151' : 'var(--text-tertiary)', background: 'none', border: 'none', cursor: next ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
      <Icon name={ICONS.arrowRight} size={13} />{next ? `Advance to ${STAGE_LABEL[next]}` : 'Trip completed'}
    </button>
  )
}

function CreateTripModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [category, setCategory] = useState<TripCategory>('import')
  const [serviceType, setServiceType] = useState<TripServiceType>('collection')
  const [containerNumber, setContainerNumber] = useState('')
  const [vesselId, setVesselId] = useState('')
  const [tripDate, setTripDate] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [driver, setDriver] = useState('')
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { getVessels().then(setVessels).catch(() => {}) }, [])

  const submit = async () => {
    setSubmitting(true)
    try {
      const vessel = vessels.find(v => v.id === vesselId)
      const result = await createTrip({
        service_category: category,
        service_type: serviceType,
        container_number: containerNumber.trim() || undefined,
        vessel_id: vesselId || undefined,
        vessel_name: vessel?.vesselName,
        trip_date: tripDate || undefined,
        vehicle: vehicle.trim() || undefined,
        driver: driver.trim() || undefined,
      })
      if (!result) { toast('Could not create trip. Please try again.', 'error'); return }
      toast('Trip created', 'success')
      onCreated()
    } catch {
      toast('Could not create trip. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: 24, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.20)' }} onClick={e => e.stopPropagation()}>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 16 }}>Create Trip</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Category">
              <select value={category} onChange={e => setCategory(e.target.value as TripCategory)} style={INPUT}>
                <option value="import">Import</option>
                <option value="export">Export</option>
              </select>
            </Field>
            <Field label="Service Type">
              <select value={serviceType} onChange={e => setServiceType(e.target.value as TripServiceType)} style={INPUT}>
                <option value="collection">Collection</option>
                <option value="delivery">Delivery</option>
                <option value="dehire">Dehire</option>
              </select>
            </Field>
          </div>
          <Field label="Container Number">
            <input value={containerNumber} onChange={e => setContainerNumber(e.target.value)} placeholder="CONT29523" style={INPUT} />
          </Field>
          <Field label="Vessel">
            <select value={vesselId} onChange={e => setVesselId(e.target.value)} style={INPUT}>
              <option value="">Select vessel…</option>
              {vessels.map(v => <option key={v.id} value={v.id}>{v.vesselName}</option>)}
            </select>
          </Field>
          <Field label="Trip Date">
            <input type="date" value={tripDate} onChange={e => setTripDate(e.target.value)} style={INPUT} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Vehicle (optional)">
              <input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="ABC-123" style={INPUT} />
            </Field>
            <Field label="Driver (optional)">
              <input value={driver} onChange={e => setDriver(e.target.value)} placeholder="Driver name" style={INPUT} />
            </Field>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={onClose} disabled={submitting}
            style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={submitting}
            style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Creating…' : 'Create Trip'}
          </button>
        </div>
      </div>
    </div>
  )
}

const INPUT: React.CSSProperties = { width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>{label}</p>
      {children}
    </div>
  )
}
