import { useState, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { getAllocatorTrips, allocateResources, updateTripDetails } from '@/lib/db/allocator-trips'
import { setTripStage } from '@/lib/db/trips'
import { getTrucks, getTrailers, getDrivers } from '@/lib/db/resources'
import { toast } from '@/lib/toast'
import type { AllocatorTrip, AllocationStatus, TripPriority, Truck, Trailer, Driver } from '@/data/types'
import { ResourceDetailModal, type ResourceSelector } from '@/components/allocator/ResourceDetailModals'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { getTripCustomField } from '@/lib/db/trip-custom-field'
import { customFieldInputType, type CustomFieldType } from '@/lib/db/truck-custom-field'

type AllocTab = 'pending' | 'allocated' | 'ongoing' | 'completed' | 'all'
const TABS: Array<{ key: AllocTab; label: string }> = [
  { key: 'pending', label: 'Pending Allocation' }, { key: 'allocated', label: 'Allocated' },
  { key: 'ongoing', label: 'Ongoing' }, { key: 'completed', label: 'Completed' }, { key: 'all', label: 'All Trips' },
]

type ServiceTypeFilter = 'collection' | 'delivery' | 'dehire'
const SERVICE_TYPE_FILTERS: Array<{ key: ServiceTypeFilter; label: string }> = [
  { key: 'collection', label: 'Wharf' }, { key: 'delivery', label: 'Delivery' }, { key: 'dehire', label: 'Dehire' },
]

const PLAIN_INPUT: React.CSSProperties = { width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }

const PRIORITY_STYLE: Record<TripPriority, { bg: string; color: string }> = {
  high:   { bg: 'rgba(239,68,68,0.10)',  color: '#DC2626' },
  medium: { bg: 'rgba(234,88,12,0.10)',  color: '#EA580C' },
  low:    { bg: 'rgba(37,99,235,0.08)',  color: '#2563EB' },
}

export default function TripAllocationPage() {
  usePageTitle('Glido | Trip Allocation')
  const navigate = useNavigate()
  const [tab, setTab] = useState<AllocTab>('pending')
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<TripPriority | ''>('')
  const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceTypeFilter | ''>('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [trips, setTrips] = useState<AllocatorTrip[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [allocatingTrip, setAllocatingTrip] = useState<AllocatorTrip | null>(null)
  const [detailResource, setDetailResource] = useState<ResourceSelector>(null)
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true))
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const paneRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (isWide && (allocatingTrip || detailResource)) {
      paneRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [allocatingTrip, detailResource, isWide])

  const [tripFieldLabel, setTripFieldLabel] = useState<string | null>(null)
  const [tripFieldType, setTripFieldType] = useState<CustomFieldType>('text')
  useEffect(() => { getTripCustomField().then(c => { setTripFieldLabel(c.label); setTripFieldType(c.type) }).catch(() => {}) }, [])

  const [trucks, setTrucks] = useState<Truck[]>([])
  const [trailers, setTrailers] = useState<Trailer[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  useEffect(() => {
    Promise.all([getTrucks(), getTrailers(), getDrivers()]).then(([t, tr, d]) => { setTrucks(t); setTrailers(tr); setDrivers(d) }).catch(() => {})
  }, [])

  const load = () => {
    setIsLoading(true)
    getAllocatorTrips({
      allocationStatus: tab === 'pending' || tab === 'allocated' ? (tab as AllocationStatus) : undefined,
      stage: tab === 'ongoing' ? 'in_progress' : tab === 'completed' ? 'completed' : undefined,
      serviceType: serviceTypeFilter || undefined,
      search: search.trim() || undefined,
      sort: 'trip_ref',
    })
      .then(rows => { setTrips(rows); setIsLoading(false) })
      .catch(() => setIsLoading(false))
  }
  useEffect(load, [tab, search, serviceTypeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredTrips = priorityFilter ? trips.filter(t => t.priority === priorityFilter) : trips
  const hasFilters = !!(search || priorityFilter || serviceTypeFilter)

  const completeTrip = async (t: AllocatorTrip) => {
    const result = await setTripStage(t.id, 'completed')
    if (result) { toast('Trip marked as completed', 'success'); load() }
    else toast('Could not complete trip', 'error')
  }

  const truckById = (id?: string | null) => trucks.find(t => t.id === id)
  const trailerById = (id?: string | null) => trailers.find(t => t.id === id)
  const driverById = (id?: string | null) => drivers.find(d => d.id === id)

  return (
    <>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

      <button type="button" onClick={() => navigate('/allocator')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 4px', marginBottom: 12, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5L4.5 7l4 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back
      </button>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, background: '#F0F0EF', padding: 4, borderRadius: 'var(--r-full)', width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            style={{ padding: '8px 16px', borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', background: tab === t.key ? '#fff' : 'transparent', color: tab === t.key ? '#1C1917' : 'var(--text-secondary)', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.10)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {SERVICE_TYPE_FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setServiceTypeFilter(prev => prev === f.key ? '' : f.key)}
            style={{ height: 32, padding: '0 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', borderRadius: 'var(--r-full)', cursor: 'pointer', border: `1px solid ${serviceTypeFilter === f.key ? 'rgba(var(--brand-rgb),0.35)' : 'rgba(0,0,0,0.12)'}`, background: serviceTypeFilter === f.key ? 'rgba(var(--brand-rgb),0.10)' : '#fff', color: serviceTypeFilter === f.key ? 'var(--brand-color)' : '#374151' }}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 280, flexShrink: 0 }}>
          <Icon name={ICONS.search} size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input type="text" placeholder="Search trips by reference, container" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 38, padding: '0 14px 0 36px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setFilterOpen(v => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', fontSize: 14, fontWeight: 600, color: priorityFilter ? 'var(--brand-color)' : '#374151', background: priorityFilter ? 'rgba(var(--brand-rgb),0.08)' : '#fff', border: `1px solid ${priorityFilter ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.12)'}`, borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Icon name={ICONS.filter} size={14} />{priorityFilter ? `${priorityFilter[0].toUpperCase()}${priorityFilter.slice(1)} Priority` : 'Filter'}
          </button>
          {filterOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setFilterOpen(false)} />
              <div style={{ position: 'absolute', top: 44, left: 0, zIndex: 101, width: 180, background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                <button type="button" onClick={() => { setPriorityFilter(''); setFilterOpen(false) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 14, fontWeight: !priorityFilter ? 700 : 500, color: !priorityFilter ? 'var(--brand-color)' : '#374151', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  All Priorities
                </button>
                {(['high', 'medium', 'low'] as TripPriority[]).map(p => (
                  <button key={p} type="button" onClick={() => { setPriorityFilter(p); setFilterOpen(false) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 14, fontWeight: priorityFilter === p ? 700 : 500, color: priorityFilter === p ? 'var(--brand-color)' : '#374151', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                    {p} Priority
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {hasFilters && (
          <button onClick={() => { setSearch(''); setPriorityFilter(''); setServiceTypeFilter('') }}
            style={{ height: 38, padding: '0 14px', fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)', background: 'none', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear
          </button>
        )}
      </div>

      {/* Split view: list (left) + docked detail pane (right) on wide screens */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading ? (
          [0, 1, 2].map(i => <div key={i} style={{ height: 130, borderRadius: 'var(--r-md)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)
        ) : filteredTrips.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0 48px' }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--r-sm)', background: '#EBEBEA', border: '1px solid rgba(0,0,0,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name={ICONS.container} size={22} style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917' }}>No trips found.</p>
          </div>
        ) : filteredTrips.map(t => {
          const pr = PRIORITY_STYLE[t.priority]
          const allocated = t.allocationStatus === 'allocated'
          return (
            <div key={t.id} style={{ background: allocated ? 'rgba(34,197,94,0.03)' : '#FFFFFF', border: `1px solid ${allocated ? 'rgba(34,197,94,0.22)' : 'rgba(0,0,0,0.07)'}`, borderRadius: 'var(--r-md)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: '#1C1917' }}>#{t.tripRef}</p>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-full)', background: pr.bg, color: pr.color, textTransform: 'uppercase' }}>{t.priority}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-full)', background: allocated ? 'rgba(34,197,94,0.10)' : 'rgba(0,0,0,0.05)', color: allocated ? '#16A34A' : 'var(--text-secondary)' }}>
                      {allocated ? 'Allocated' : 'Pending Allocation'}
                    </span>
                  </div>
                  <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{t.serviceType} · {t.containerNumber ?? 'No container'}</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13.5, marginBottom: 10 }}>
                <InfoCell label="Date" value={t.tripDate ?? '—'} />
                <InfoCell label="Time" value={t.timeWindowStart && t.timeWindowEnd ? `${t.timeWindowStart}–${t.timeWindowEnd}` : '—'} />
                <InfoCell label="Origin" value={t.origin ?? '—'} />
                <InfoCell label="Destination" value={t.destination ?? '—'} />
                <InfoCell label="Time to Reach" value={t.timeToReach ?? '—'} />
                <InfoCell label="Time to Complete" value={t.timeToComplete ?? '—'} />
                <InfoCell label="Weight" value={t.weight ?? '—'} />
                {tripFieldLabel && <InfoCell label={tripFieldLabel} value={t.customFieldValue ?? '—'} />}
              </div>

              {allocated && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  {truckById(t.truckId) && <ResourcePill icon={ICONS.truck} color="#2563EB" label={truckById(t.truckId)!.resourceCode} onClick={() => setDetailResource({ kind: 'truck', id: t.truckId! })} />}
                  {trailerById(t.trailerId) && <ResourcePill icon={ICONS.trailer} color="#7C3AED" label={trailerById(t.trailerId)!.resourceCode} onClick={() => setDetailResource({ kind: 'trailer', id: t.trailerId! })} />}
                  {driverById(t.driverId) && <ResourcePill icon={ICONS.driver} color="#16A34A" label={driverById(t.driverId)!.driverName} onClick={() => setDetailResource({ kind: 'driver', id: t.driverId! })} />}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-full)', background: t.isHazardous ? 'rgba(239,68,68,0.10)' : 'rgba(0,0,0,0.05)', color: t.isHazardous ? '#DC2626' : 'var(--text-tertiary)' }}>
                    Haz: {t.isHazardous ? 'Y' : 'N'}
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-full)', background: t.isOOG ? 'rgba(234,88,12,0.10)' : 'rgba(0,0,0,0.05)', color: t.isOOG ? '#EA580C' : 'var(--text-tertiary)' }}>
                    OOG: {t.isOOG ? `Y (${t.oogWidth ?? '—'} / ${t.oogLength ?? '—'} / ${t.oogHeight ?? '—'})` : 'N'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => toast('Contractor will be notified by email — coming soon', 'info')}
                    style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Send to Contractor
                  </button>
                  {allocated ? (
                    <button type="button" onClick={() => setAllocatingTrip(t)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', fontSize: 13, fontWeight: 700, color: '#16A34A', background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <Icon name={ICONS.checkSquare} size={14} />Allocated
                    </button>
                  ) : (
                    <button type="button" onClick={() => setAllocatingTrip(t)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Allocate Resources
                    </button>
                  )}
                  {t.stage !== 'completed' && (
                    <button type="button" onClick={() => completeTrip(t)}
                      style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, color: '#16A34A', background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Complete
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>{/* end list column */}

      {/* Docked pane — split view (wide screens): Allocate Resources form takes priority over resource details */}
      {isWide && (allocatingTrip ? (
        <div ref={paneRef} style={{ width: 460, flexShrink: 0, position: 'sticky', top: 12, height: 'calc(100vh - var(--dash-header-h) - 24px)', minHeight: 'calc(100vh - var(--dash-header-h) - 24px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <AllocateModal
            key={allocatingTrip.id}
            trip={allocatingTrip}
            trucks={trucks} trailers={trailers} drivers={drivers}
            onClose={() => setAllocatingTrip(null)}
            onDone={() => { setAllocatingTrip(null); load() }}
            tripFieldLabel={tripFieldLabel}
            tripFieldType={tripFieldType}
            docked
          />
        </div>
      ) : detailResource && (
        <div ref={paneRef} style={{ width: 460, flexShrink: 0, position: 'sticky', top: 12, height: 'calc(100vh - var(--dash-header-h) - 24px)', minHeight: 'calc(100vh - var(--dash-header-h) - 24px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ResourceDetailModal key={`${detailResource.kind}-${detailResource.id}`} selector={detailResource} onClose={() => setDetailResource(null)} onSelect={setDetailResource} onUpdated={load} docked />
        </div>
      ))}
      </div>{/* end split row */}

      {/* Overlay fallback — narrow screens */}
      {!isWide && allocatingTrip && (
        <AllocateModal
          trip={allocatingTrip}
          trucks={trucks} trailers={trailers} drivers={drivers}
          onClose={() => setAllocatingTrip(null)}
          onDone={() => { setAllocatingTrip(null); load() }}
          tripFieldLabel={tripFieldLabel}
          tripFieldType={tripFieldType}
        />
      )}
      {!isWide && detailResource && (
        <ResourceDetailModal key={`${detailResource.kind}-${detailResource.id}`} selector={detailResource} onClose={() => setDetailResource(null)} onSelect={setDetailResource} onUpdated={load} />
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

function ResourcePill({ icon, color, label, onClick }: { icon: string; color: string; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--r-full)', background: `${color}12`, color, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
      <Icon name={icon} size={13} />{label}
    </button>
  )
}

function AllocateModal({ trip, trucks, trailers, drivers, onClose, onDone, tripFieldLabel, tripFieldType, docked = false }: {
  trip: AllocatorTrip; trucks: Truck[]; trailers: Trailer[]; drivers: Driver[]; onClose: () => void; onDone: () => void; tripFieldLabel?: string | null; tripFieldType?: CustomFieldType; docked?: boolean
}) {
  const [truckId, setTruckId] = useState(trip.truckId ?? '')
  const [trailerId, setTrailerId] = useState(trip.trailerId ?? '')
  const [driverId, setDriverId] = useState(trip.driverId ?? '')
  const [timeToReach, setTimeToReach] = useState(trip.timeToReach ?? '')
  const [timeToComplete, setTimeToComplete] = useState(trip.timeToComplete ?? '')
  const [isHazardous, setIsHazardous] = useState(trip.isHazardous)
  const [weight, setWeight] = useState(trip.weight ?? '')
  const [isOOG, setIsOOG] = useState(trip.isOOG)
  const [oogLength, setOogLength] = useState(trip.oogLength ?? '')
  const [oogWidth, setOogWidth] = useState(trip.oogWidth ?? '')
  const [oogHeight, setOogHeight] = useState(trip.oogHeight ?? '')
  const [customFieldValue, setCustomFieldValue] = useState(trip.customFieldValue ?? '')
  const [submitting, setSubmitting] = useState(false)
  const isAmend = trip.allocationStatus === 'allocated'

  const availableTrucks = trucks.filter(t => t.status === 'available' || t.id === trip.truckId)
  const availableTrailers = trailers.filter(t => t.status === 'available' || t.id === trip.trailerId)
  const availableDrivers = drivers.filter(d => d.status !== 'on_leave' && (d.status === 'off_duty' || d.id === trip.driverId))

  // Picking a truck auto-fills whatever trailer/driver is already paired to it in Resources
  // Management (Assigned Resources) — only into fields that are still blank, and only if that
  // pairing is actually available to allocate (not already busy on another trip).
  const handleTruckChange = (nextTruckId: string) => {
    setTruckId(nextTruckId)
    if (!nextTruckId) return
    if (!trailerId) {
      const pairedTrailer = trailers.find(tr => tr.attachedTruckId === nextTruckId)
      if (pairedTrailer && availableTrailers.some(t => t.id === pairedTrailer.id)) setTrailerId(pairedTrailer.id)
    }
    if (!driverId) {
      const pairedDriver = drivers.find(d => d.assignedTruckId === nextTruckId)
      if (pairedDriver && availableDrivers.some(d => d.id === pairedDriver.id)) setDriverId(pairedDriver.id)
    }
  }

  const submit = async () => {
    if (!truckId || !driverId) { toast('Truck and driver are required to allocate a trip', 'error'); return }
    setSubmitting(true)
    try {
      const result = await allocateResources(trip.id, { truck_id: truckId, trailer_id: trailerId || null, driver_id: driverId })
      if (!result) { toast('Could not allocate resources. Please try again.', 'error'); return }
      await updateTripDetails(trip.id, {
        time_to_reach: timeToReach.trim() || '', time_to_complete: timeToComplete.trim() || '',
        is_hazardous: isHazardous, weight: weight.trim() || '', is_oog: isOOG,
        oog_length: oogLength.trim() || '', oog_width: oogWidth.trim() || '', oog_height: oogHeight.trim() || '',
        custom_field_value: customFieldValue.trim() || '',
      })
      toast(isAmend ? 'Resources amended' : 'Resources allocated', 'success')
      onDone()
    } catch (err: any) {
      toast(err?.message || 'Could not allocate resources. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const panelStyle: React.CSSProperties = docked
    ? { position: 'relative', height: '100%', width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 6px 24px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9011, width: 'min(460px, 100vw)', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }

  return (
    <>
      {!docked && (
        <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}
          style={{ position: 'fixed', inset: 0, zIndex: 9010, background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(2px)' }} />
      )}
      <motion.div style={panelStyle}
        initial={docked ? { opacity: 0, x: 16 } : { x: '100%' }} animate={docked ? { opacity: 1, x: 0 } : { x: 0 }}
        transition={docked ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] } : { type: 'spring', stiffness: 400, damping: 40 }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', margin: 0 }}>{isAmend ? 'Amend Resources' : 'Allocate Resources'}</p>
            <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>Trip #{trip.tripRef}</p>
          </div>
          <button type="button" onClick={onClose}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: '#F7F6F5', borderRadius: 'var(--r-full)', cursor: 'pointer', color: '#374151', flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: 24, overflowY: 'auto', minHeight: 0, flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Truck">
              <CustomSelect
                value={truckId} onChange={handleTruckChange} placeholder="Select truck…"
                options={availableTrucks.map(t => ({ value: t.id, label: `${t.resourceCode} — ${t.truckType ?? ''}` }))}
              />
            </Field>
            <Field label="Trailer (optional)">
              <CustomSelect
                value={trailerId} onChange={setTrailerId} placeholder="None"
                options={availableTrailers.map(t => ({ value: t.id, label: `${t.resourceCode} — ${t.trailerType ?? ''}` }))}
              />
            </Field>
            <Field label="Driver">
              <CustomSelect
                value={driverId} onChange={setDriverId} placeholder="Select driver…"
                options={availableDrivers.map(d => ({ value: d.id, label: `${d.driverName} — ${d.licenseClass ?? ''}` }))}
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Time to Reach">
                <input value={timeToReach} onChange={e => setTimeToReach(e.target.value)} placeholder="e.g. 45 mins" style={PLAIN_INPUT} />
              </Field>
              <Field label="Time to Complete">
                <input value={timeToComplete} onChange={e => setTimeToComplete(e.target.value)} placeholder="e.g. 2 hours" style={PLAIN_INPUT} />
              </Field>
            </div>
            <Field label="Weight">
              <input value={weight} onChange={e => setWeight(e.target.value)} placeholder="e.g. 20T" style={PLAIN_INPUT} />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={isHazardous} onChange={e => setIsHazardous(e.target.checked)} />
              Hazardous
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={isOOG} onChange={e => setIsOOG(e.target.checked)} />
              Out of Gauge (OOG)
            </label>
            {isOOG && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Field label="Width"><input value={oogWidth} onChange={e => setOogWidth(e.target.value)} style={PLAIN_INPUT} /></Field>
                <Field label="Length"><input value={oogLength} onChange={e => setOogLength(e.target.value)} style={PLAIN_INPUT} /></Field>
                <Field label="Height"><input value={oogHeight} onChange={e => setOogHeight(e.target.value)} style={PLAIN_INPUT} /></Field>
              </div>
            )}
            {tripFieldLabel && (
              <Field label={tripFieldLabel}>
                <input type={customFieldInputType(tripFieldType ?? 'text')} value={customFieldValue} onChange={e => setCustomFieldValue(e.target.value)} style={PLAIN_INPUT} />
              </Field>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 24px', borderTop: '1px solid rgba(0,0,0,0.06)', flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={submitting}
            style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={submitting}
            style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Saving…' : isAmend ? 'Save Changes' : 'Allocate'}
          </button>
        </div>
      </motion.div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>{label}</p>
      {children}
    </div>
  )
}
