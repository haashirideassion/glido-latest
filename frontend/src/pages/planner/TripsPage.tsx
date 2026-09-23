import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { BackButton } from '@/components/ui/BackButton'
import { InlineEdit, InlineOOG, INLINE_LABEL } from '@/components/ui/InlineEdit'
import { Rego } from '@/components/ui/Rego'
import { getTrips, createTrip, setTripStage, updateTrip } from '@/lib/db/trips'
import type { UpdateTripPayload } from '@/lib/db/trips'
import type { TripMilestone } from '@/lib/db/trips'
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

// FRD 2.4.2.2 gives the secondary tabs two different shapes. Import filters by where the vessel
// is — slotted / discharged / arriving — because that is what decides when an import trip can be
// worked. Export keeps the job-type filter: export vessels load, they never discharge.
type SecondaryTab = 'all' | TripServiceType | TripMilestone

const MILESTONE_TABS: TripMilestone[] = ['slotted', 'discharged', 'arriving']
const isMilestone = (t: SecondaryTab): t is TripMilestone => (MILESTONE_TABS as string[]).includes(t)

// 'All Requests' sits last on Import, as the FRD lists it, but is still the default selection.
const IMPORT_SECONDARY_TABS: Array<{ key: SecondaryTab; label: string }> = [
  { key: 'slotted', label: 'Slotted' }, { key: 'discharged', label: 'Discharged' },
  { key: 'arriving', label: 'Arriving' }, { key: 'all', label: 'All Requests' },
]
const EXPORT_SECONDARY_TABS: Array<{ key: SecondaryTab; label: string }> = [
  { key: 'all', label: 'All Requests' }, { key: 'collection', label: 'Collection' },
  { key: 'delivery', label: 'Delivery' }, { key: 'dehire', label: 'Dehire' },
]
const NEXT_STAGE: Record<TripStage, TripStage | null> = {
  planned: 'assigned', assigned: 'in_progress', in_progress: 'completed', completed: null,
}

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
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [stageFilter, setStageFilter] = useState<'all' | TripStage>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [settings, setSettings] = useState<PlannerSettings | null>(null)
  const [page, setPage] = useState(1)
  useEffect(() => { getPlannerSettings().then(setSettings).catch(() => {}) }, [])
  // Lifted to the page so the inline Vessel cell on every card can offer the list.
  useEffect(() => { getVessels().then(setVessels).catch(() => {}) }, [])

  const load = () => {
    setIsLoading(true)
    getTrips({
      category,
      // One tab set or the other, never both — Import sends a milestone, Export a service type.
      serviceType: isMilestone(secondary) || secondary === 'all' ? undefined : secondary,
      milestone:   isMilestone(secondary) ? secondary : undefined,
      search: search.trim() || undefined, sort,
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
  // The two tab sets share no keys beyond 'all', so switching primary tab has to reset the
  // secondary — otherwise 'Collection' would stay selected on Import, where it does not exist.
  useEffect(() => { setSecondary('all') }, [category])

  const secondaryTabs = category === 'import' ? IMPORT_SECONDARY_TABS : EXPORT_SECONDARY_TABS

  // FRD 2.4.2.2 — "Action available on card without clicking on more options". Advancing is the
  // repeated one-click action a planner works through a list with, so it sits on the card face;
  // the rarer actions stay behind the '...'.
  const [advancingId, setAdvancingId] = useState<string | null>(null)

  // Cards are edited in place — no menu, no panel. Each cell saves itself and patches the row,
  // so the list keeps its scroll position, tab and filters instead of refetching.
  const saveField = async (trip: Trip, patch: UpdateTripPayload): Promise<boolean> => {
    try {
      const updated = await updateTrip(trip.id, patch)
      if (!updated) { toast('Could not save changes', 'error'); return false }
      setTrips(prev => prev.map(r => (r.id === updated.id ? { ...r, ...updated } : r)))
      return true
    } catch (err: any) {
      toast(err?.message ?? 'Could not save changes', 'error')
      return false
    }
  }
  const advanceTrip = async (trip: Trip) => {
    const next = NEXT_STAGE[trip.stage]
    if (!next) return
    setAdvancingId(trip.id)
    try {
      const result = await setTripStage(trip.id, next)
      if (result) { toast(`Trip ${trip.tripRef} advanced to ${STAGE_LABEL[next]}`, 'success'); load() }
      else toast('Could not update trip', 'error')
    } catch (err: any) {
      toast(err?.message ?? 'Could not update trip', 'error')
    } finally {
      setAdvancingId(null)
    }
  }

  const itemsPerPage = settings?.itemsPerPage ?? 10
  const pageCount = Math.max(1, Math.ceil(trips.length / itemsPerPage))
  const pagedTrips = useMemo(() => trips.slice((page - 1) * itemsPerPage, page * itemsPerPage), [trips, page, itemsPerPage])

  return (
    <>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

      {/* Scope row — Back, then Import/Export (what am I looking at), then service type (which
          slice of it). Back sits inline rather than on a row of its own: FRD 2.4.2.2 requires the
          control, not a band of chrome for it. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
        <BackButton to="/planner" />
        <span style={{ width: 1, height: 24, background: 'rgba(0,0,0,0.08)', flexShrink: 0 }} />

        <div style={{ display: 'flex', gap: 6, background: '#F0F0EF', padding: 4, borderRadius: 'var(--r-full)', width: 'fit-content', flexShrink: 0 }}>
          {(['import', 'export'] as TripCategory[]).map(t => (
            <button key={t} type="button" onClick={() => setCategory(t)}
              style={{ padding: '8px 20px', borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', textTransform: 'capitalize', background: category === t ? '#fff' : 'transparent', color: category === t ? '#1C1917' : 'var(--text-secondary)', boxShadow: category === t ? '0 1px 3px rgba(0,0,0,0.10)' : 'none' }}>
              {t}
            </button>
          ))}
        </div>

        <span aria-hidden style={{ width: 1, height: 26, background: 'rgba(0,0,0,0.10)', flexShrink: 0 }} />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {secondaryTabs.map(t => {
            const active = secondary === t.key
            return (
              <button key={t.key} type="button" onClick={() => setSecondary(t.key)}
                style={{ height: 34, padding: '0 14px', fontSize: 13.5, fontWeight: active ? 700 : 500, borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit',
                  background: active ? 'rgba(var(--brand-rgb),0.10)' : '#F7F6F5',
                  border: `1px solid ${active ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.08)'}`,
                  color: active ? 'var(--brand-color)' : 'var(--text-secondary)' }}>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Toolbar — sticks to the top of the scroll area so filters stay reachable down a long list.
          Background must be opaque (matches PlannerLayout's #f9f9f9) since cards pass behind it. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap', background: '#f9f9f9', paddingTop: 8, paddingBottom: 10 }}>
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
          // A completed trip is history the Allocator reports on — the API 409s on edits to it.
          const locked = t.stage === 'completed'
          return (
            <div key={t.id} onClick={() => navigate(`/planner/trips/${t.id}`)}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(var(--brand-rgb),0.45)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)' }}
              style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s ease' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: '#1C1917' }}>#{t.tripRef}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)', background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
                    {STAGE_LABEL[t.stage]}
                  </span>

                  {NEXT_STAGE[t.stage] && (
                    <button type="button" disabled={advancingId === t.id}
                      onClick={e => { e.stopPropagation(); advanceTrip(t) }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 11px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--brand-color)', background: 'rgba(var(--brand-rgb),0.08)', border: '1px solid rgba(var(--brand-rgb),0.24)', borderRadius: 'var(--r-full)', cursor: advancingId === t.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: advancingId === t.id ? 0.6 : 1 }}>
                      <Icon name={ICONS.arrowRight} size={12} />
                      {advancingId === t.id ? 'Updating…' : `Advance to ${STAGE_LABEL[NEXT_STAGE[t.stage]!]}`}
                    </button>
                  )}

                  <button type="button" onClick={e => { e.stopPropagation(); navigate(`/planner/trips/${t.id}`) }} aria-label="View trip details"
                    style={{ width: 26, height: 26, borderRadius: 'var(--r-sm)', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--brand-color)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  </button>
                </div>
              </div>

              {/* Progress stages — the FRD names all four, so each dot carries its label. Same
                  treatment as the Customer Portal request cards and the request detail page. */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
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
                        <span style={{ fontSize: 11.5, fontWeight: done ? 600 : 500, color: done ? '#1C1917' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                          {STAGE_LABEL[st]}
                        </span>
                      </div>
                      {i < STAGES.length - 1 && <div style={{ flex: 1, height: 2, margin: '0 6px 18px', borderRadius: 2, background: i < stageIdx ? 'var(--brand-color)' : 'rgba(0,0,0,0.08)' }} />}
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13.5 }}>
                <Cell label="Container">
                  <InlineEdit value={t.containerNumber} mono locked={locked}
                    onSave={v => saveField(t, { container_number: v || null })} />
                </Cell>
                <Cell label="Vessel">
                  <InlineEdit type="select" value={t.vesselId ?? ''} display={t.vesselName} locked={locked}
                    options={vessels.map(v => ({ value: v.id, label: v.vesselName }))}
                    onSave={v => saveField(t, { vessel_id: v || null, vessel_name: vessels.find(x => x.id === v)?.vesselName ?? null })} />
                </Cell>
                <Cell label="Date">
                  <InlineEdit type="date" value={t.tripDate} locked={locked}
                    onSave={v => saveField(t, { trip_date: v || null })} />
                </Cell>
                {/* FRD: vehicle and driver stay blank until assigned, not dashed. */}
                <Cell label="Vehicle">
                  <InlineEdit value={t.vehicle} placeholder="" locked={locked}
                    onSave={v => saveField(t, { vehicle: v || null })} />
                </Cell>
                <Cell label="Driver" minWidth={170}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                    <InlineEdit value={t.driver} placeholder="" locked={locked}
                      onSave={v => saveField(t, { driver: v || null })} />
                    {/* Rego of the allocated truck — a driver is identified at the gate by the
                        plate they arrive on, so the two are always shown together. */}
                    <Rego value={t.vehicleRego} />
                  </div>
                </Cell>
                {/* Hazardous and Weight are written by the Allocator's operational endpoint, not
                    the one this page calls — read-only here rather than silently unsaveable. */}
                <InfoCell label="Haz" value={t.isHazardous ? 'Yes' : 'No'} />
                <InfoCell label="Weight" value={t.weight ?? '—'} />
                <Cell label="OOG" minWidth={220}>
                  <InlineOOG locked={locked}
                    value={{ isOOG: t.isOOG, length: t.oogLength, width: t.oogWidth, height: t.oogHeight }}
                    onSave={v => saveField(t, { is_oog: v.isOOG, oog_length: v.length, oog_width: v.width, oog_height: v.height })} />
                </Cell>
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

      {createOpen && (
        <CreateTripModal
          defaultCategory={category}
          onClose={() => setCreateOpen(false)}
          onCreated={trip => {
            setCreateOpen(false)
            // FRD 2.4.2.2 — "the newly created trip must be displayed within the trip list".
            // A new trip is always Planned, so it would be hidden by a milestone tab, a
            // service-type tab it doesn't match, or a stage filter. Clear those so it is visible.
            const alreadyVisible = trip.serviceCategory === category && secondary === 'all' && stageFilter === 'all'
            setCategory(trip.serviceCategory)
            setSecondary('all')
            setStageFilter('all')
            if (alreadyVisible) load()   // no state changed, so the load effect won't fire
          }}
        />
      )}



    </>
  )
}

function Cell({ label, children, minWidth = 130 }: { label: string; children: React.ReactNode; minWidth?: number }) {
  return (
    <div style={{ minWidth }}>
      <p style={INLINE_LABEL}>{label}</p>
      {children}
    </div>
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

function CreateTripModal({ defaultCategory, onClose, onCreated }: { defaultCategory: TripCategory; onClose: () => void; onCreated: (trip: Trip) => void }) {
  // Opens on the tab you were looking at. Defaulting to Import regardless meant creating an
  // export trip from the Export tab silently produced an import one.
  const [category, setCategory] = useState<TripCategory>(defaultCategory)
  const [serviceType, setServiceType] = useState<TripServiceType>('collection')
  const [containerNumber, setContainerNumber] = useState('')
  const [vesselId, setVesselId] = useState('')
  const [tripDate, setTripDate] = useState('')
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
      })
      if (!result) { toast('Could not create trip. Please try again.', 'error'); return }
      toast('Trip created', 'success')
      onCreated(result)
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
              <CustomSelect
                neutral
                value={category}
                onChange={v => setCategory(v as TripCategory)}
                options={[
                  { value: 'import', label: 'Import' },
                  { value: 'export', label: 'Export' },
                ]}
              />
            </Field>
            <Field label="Service Type">
              <CustomSelect
                neutral
                value={serviceType}
                onChange={v => setServiceType(v as TripServiceType)}
                options={[
                  { value: 'collection', label: 'Collection' },
                  { value: 'delivery',   label: 'Delivery' },
                  { value: 'dehire',     label: 'Dehire' },
                ]}
              />
            </Field>
          </div>
          <Field label="Container Number">
            <input value={containerNumber} onChange={e => setContainerNumber(e.target.value)} placeholder="CONT29523" style={INPUT} />
          </Field>
          <Field label="Vessel">
            <CustomSelect
              neutral
              placeholder="Select vessel…"
              value={vesselId}
              onChange={setVesselId}
              options={vessels.map(v => ({ value: v.id, label: v.vesselName }))}
            />
          </Field>
          <Field label="Trip Date">
            <input type="date" value={tripDate} onChange={e => setTripDate(e.target.value)} style={INPUT} />
          </Field>
          {/* Vehicle and Driver are not captured here. They are display mirrors of a real truck
              and driver, written when the Allocator allocates the trip — typing them as free text
              produced trips naming people who do not exist in Resource Management. */}
          <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.45, margin: 0 }}>
            Vehicle and driver are assigned in the Allocator module once the trip is planned.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={onClose} disabled={submitting}
            style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={submitting}
            style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
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

