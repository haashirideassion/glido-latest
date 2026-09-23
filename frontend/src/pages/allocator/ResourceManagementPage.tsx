import { useState, useEffect, useRef } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { Rego } from '@/components/ui/Rego'
import {
  getTrucks, getTrailers, getDrivers,
  createTruck, createTrailer, createDriver, assignTruckResources,
} from '@/lib/db/resources'
import { toast } from '@/lib/toast'
import { useAllocatorPermissions } from '@/lib/useAllocatorPermissions'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { getTruckCustomField, customFieldInputType, type CustomFieldType } from '@/lib/db/truck-custom-field'
import type { Truck, Trailer, Driver, ResourceStatus, DriverStatus } from '@/data/types'
import {
  RESOURCE_STATUS_STYLE, DRIVER_STATUS_STYLE, fmtResourceDate as fmtDate,
  StatusBadge, AssignedResourcesSection, ResourceDetailModal,
  type ResourceSelector,
} from '@/components/allocator/ResourceDetailModals'

type ResourceTab = 'all' | 'trucks' | 'trailers' | 'drivers'
type ViewMode = 'grid' | 'table'

const TABS: Array<{ key: ResourceTab; label: string }> = [
  { key: 'all', label: 'All Resources' }, { key: 'trucks', label: 'Trucks' },
  { key: 'trailers', label: 'Trailers' }, { key: 'drivers', label: 'Drivers' },
]

export default function ResourceManagementPage() {
  usePageTitle('Glido | Resources Management')
  const perms = useAllocatorPermissions()
  const [tab, setTab] = useState<ResourceTab>('all')
  const [view, setView] = useState<ViewMode>('grid')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [detailResource, setDetailResource] = useState<ResourceSelector>(null)
  const viewTruck = (id: string) => setDetailResource({ kind: 'truck', id })
  const viewTrailer = (id: string) => setDetailResource({ kind: 'trailer', id })
  const viewDriver = (id: string) => setDetailResource({ kind: 'driver', id })
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true))
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const paneRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (isWide && detailResource) paneRef.current?.scrollIntoView({ block: 'nearest' })
  }, [detailResource, isWide])

  const [truckFieldLabel, setTruckFieldLabel] = useState<string | null>(null)
  const [truckFieldType, setTruckFieldType] = useState<CustomFieldType>('text')
  useEffect(() => { getTruckCustomField().then(c => { setTruckFieldLabel(c.label); setTruckFieldType(c.type) }).catch(() => {}) }, [])

  const [trucks, setTrucks] = useState<Truck[]>([])
  const [trailers, setTrailers] = useState<Trailer[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = () => {
    setIsLoading(true)
    Promise.all([
      getTrucks({ search: search.trim() || undefined, status: statusFilter || undefined }),
      getTrailers({ search: search.trim() || undefined, status: statusFilter || undefined }),
      getDrivers({ search: search.trim() || undefined, status: statusFilter || undefined }),
    ])
      .then(([t, tr, d]) => { setTrucks(t); setTrailers(tr); setDrivers(d); setIsLoading(false) })
      .catch(() => setIsLoading(false))
  }

  useEffect(load, [search, statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const truckById = (id?: string | null) => trucks.find(t => t.id === id)
  const trailerAttachedTo = (truckId: string) => trailers.find(tr => tr.attachedTruckId === truckId)
  const driverAssignedTo = (truckId: string) => drivers.find(d => d.assignedTruckId === truckId)

  const [dragOverTruckId, setDragOverTruckId] = useState<string | null>(null)
  const handleDropOnTruck = async (truckId: string, e: React.DragEvent) => {
    e.preventDefault()
    setDragOverTruckId(null)
    const raw = e.dataTransfer.getData('application/json')
    if (!raw) return
    try {
      const { kind, id } = JSON.parse(raw) as { kind: 'trailer' | 'driver'; id: string }
      const result = await assignTruckResources(truckId, kind === 'trailer' ? { trailerId: id } : { driverId: id })
      if (result) { toast(`${kind === 'trailer' ? 'Trailer' : 'Driver'} assigned to truck`, 'success'); load() }
      else toast('Could not assign resource', 'error')
    } catch {
      toast('Could not assign resource', 'error')
    }
  }

  const hasFilters = !!(search || statusFilter)
  const statusOptions = tab === 'drivers' ? (['on_duty', 'off_duty', 'on_leave'] as DriverStatus[]) : (['available', 'on_trip', 'maintenance'] as ResourceStatus[])
  const statusStyleFor = (s: string) => (tab === 'drivers' ? DRIVER_STATUS_STYLE[s as DriverStatus] : RESOURCE_STATUS_STYLE[s as ResourceStatus])

  return (
    <>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

      {/* Tabs + Grid/Table toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, background: '#F0F0EF', padding: 4, borderRadius: 'var(--r-full)', width: 'fit-content' }}>
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              style={{ padding: '8px 16px', borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', background: tab === t.key ? '#fff' : 'transparent', color: tab === t.key ? '#1C1917' : 'var(--text-secondary)', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.10)' : 'none' }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#F0F0EF', padding: 4, borderRadius: 'var(--r-full)' }}>
          <button type="button" onClick={() => setView('grid')} title="Grid view"
            style={{ width: 34, height: 34, borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: view === 'grid' ? '#fff' : 'transparent', color: view === 'grid' ? '#1C1917' : 'var(--text-secondary)', boxShadow: view === 'grid' ? '0 1px 3px rgba(0,0,0,0.10)' : 'none' }}>
            <Icon name={ICONS.grid} size={16} />
          </button>
          <button type="button" onClick={() => setView('table')} title="Table view"
            style={{ width: 34, height: 34, borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: view === 'table' ? '#fff' : 'transparent', color: view === 'table' ? '#1C1917' : 'var(--text-secondary)', boxShadow: view === 'table' ? '0 1px 3px rgba(0,0,0,0.10)' : 'none' }}>
            <Icon name={ICONS.list} size={16} />
          </button>
        </div>
      </div>

      {/* Search + filter + add */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 280, flexShrink: 0 }}>
          <Icon name={ICONS.search} size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input type="text" placeholder="Search resources" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 38, padding: '0 14px 0 36px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setFilterOpen(v => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', fontSize: 14, fontWeight: 600, color: statusFilter ? 'var(--brand-color)' : '#374151', background: statusFilter ? 'rgba(var(--brand-rgb),0.08)' : '#fff', border: `1px solid ${statusFilter ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.12)'}`, borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Icon name={ICONS.filter} size={14} />{statusFilter ? statusStyleFor(statusFilter).label : 'Filter'}
          </button>
          {filterOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setFilterOpen(false)} />
              <div style={{ position: 'absolute', top: 44, left: 0, zIndex: 101, width: 170, background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                <button type="button" onClick={() => { setStatusFilter(''); setFilterOpen(false) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 14, fontWeight: !statusFilter ? 700 : 500, color: !statusFilter ? 'var(--brand-color)' : '#374151', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  All Statuses
                </button>
                {statusOptions.map(s => (
                  <button key={s} type="button" onClick={() => { setStatusFilter(s); setFilterOpen(false) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 14, fontWeight: statusFilter === s ? 700 : 500, color: statusFilter === s ? 'var(--brand-color)' : '#374151', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {statusStyleFor(s).label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {hasFilters && (
          <button onClick={() => { setSearch(''); setStatusFilter('') }}
            style={{ height: 38, padding: '0 14px', fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)', background: 'none', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear
          </button>
        )}
        {perms.can_create_resource && (
          <button type="button" onClick={() => setAddOpen(true)}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 16px', fontSize: 14, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.30)' }}>
            <Icon name={ICONS.add} size={15} />Add Resource
          </button>
        )}
      </div>

      {/* Split view: list (left) + docked detail pane (right) on wide screens */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2].map(i => <div key={i} style={{ height: 120, borderRadius: 'var(--r-md)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
        </div>
      ) : view === 'table' ? (
        <>
          {(tab === 'all' || tab === 'trucks') && <TruckTable trucks={trucks} onView={viewTruck} fieldLabel={truckFieldLabel} />}
          {(tab === 'all' || tab === 'trailers') && <TrailerTable trailers={trailers} trucks={trucks} onView={viewTrailer} onViewTruck={viewTruck} />}
          {(tab === 'all' || tab === 'drivers') && <DriverTable drivers={drivers} trucks={trucks} onView={viewDriver} onViewTruck={viewTruck} />}
        </>
      ) : (
        (() => {
          const showTrucks = tab === 'all' || tab === 'trucks'
          const showTrailers = tab === 'all' || tab === 'trailers'
          const showDrivers = tab === 'all' || tab === 'drivers'
          const isEmpty = (!showTrucks || trucks.length === 0) && (!showTrailers || trailers.length === 0) && (!showDrivers || drivers.length === 0)
          if (isEmpty) {
            return (
              <div style={{ textAlign: 'center', padding: '64px 0 48px' }}>
                <div style={{ width: 48, height: 48, borderRadius: 'var(--r-sm)', background: '#EBEBEA', border: '1px solid rgba(0,0,0,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Icon name={ICONS.container} size={22} style={{ color: 'var(--text-tertiary)' }} />
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917' }}>No resources found.</p>
              </div>
            )
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {showTrucks && trucks.map(t => (
                <TruckCard key={t.id} truck={t} trailer={trailerAttachedTo(t.id)} driver={driverAssignedTo(t.id)} onView={() => viewTruck(t.id)} fieldLabel={truckFieldLabel}
                  isDragOver={dragOverTruckId === t.id}
                  onDragOver={e => { e.preventDefault(); setDragOverTruckId(t.id) }}
                  onDragLeave={() => setDragOverTruckId(prev => prev === t.id ? null : prev)}
                  onDrop={e => handleDropOnTruck(t.id, e)}
                />
              ))}
              {showTrailers && trailers.map(tr => (
                <TrailerCard key={tr.id} trailer={tr} truck={truckById(tr.attachedTruckId)} onView={() => viewTrailer(tr.id)} onViewTruck={viewTruck} />
              ))}
              {showDrivers && drivers.map(d => (
                <DriverCard key={d.id} driver={d} truck={truckById(d.assignedTruckId)} onView={() => viewDriver(d.id)} onViewTruck={viewTruck} />
              ))}
            </div>
          )
        })()
      )}
      </div>{/* end list column */}

      {/* Docked detail pane — split view (wide screens) */}
      {detailResource && isWide && (
        <div ref={paneRef} style={{ width: 460, flexShrink: 0, position: 'sticky', top: 12, height: 'calc(100vh - var(--dash-header-h) - 24px)', minHeight: 'calc(100vh - var(--dash-header-h) - 24px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ResourceDetailModal key={`${detailResource.kind}-${detailResource.id}`} selector={detailResource} onClose={() => setDetailResource(null)} onSelect={setDetailResource} onUpdated={load} docked />
        </div>
      )}
      </div>{/* end split row */}

      {addOpen && <AddResourceModal onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); load() }} trucks={trucks} truckFieldLabel={truckFieldLabel} truckFieldType={truckFieldType} />}

      {/* Detail overlay — narrow screens */}
      {detailResource && !isWide && (
        <ResourceDetailModal key={`${detailResource.kind}-${detailResource.id}`} selector={detailResource} onClose={() => setDetailResource(null)} onSelect={setDetailResource} onUpdated={load} />
      )}
    </>
  )
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ minWidth: 90 }}>
      <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 2px' }}>{label}</p>
      <p style={{ color: '#1C1917', margin: 0, fontSize: 13.5 }}>{value}</p>
    </div>
  )
}

function DragHandle() {
  return (
    <span title="Drag to assign to a truck" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 'var(--r-sm)', color: 'var(--text-tertiary)', cursor: 'grab', flexShrink: 0 }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <circle cx="3" cy="2" r="1.2" /><circle cx="9" cy="2" r="1.2" />
        <circle cx="3" cy="6" r="1.2" /><circle cx="9" cy="6" r="1.2" />
        <circle cx="3" cy="10" r="1.2" /><circle cx="9" cy="10" r="1.2" />
      </svg>
    </span>
  )
}

function TruckCard({ truck, trailer, driver, onView, fieldLabel, isDragOver, onDragOver, onDragLeave, onDrop }: {
  truck: Truck; trailer?: Trailer; driver?: Driver; onView: () => void; fieldLabel?: string | null
  isDragOver?: boolean; onDragOver?: (e: React.DragEvent) => void; onDragLeave?: () => void; onDrop?: (e: React.DragEvent) => void
}) {
  return (
    <div role="button" tabIndex={0} onClick={onView} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onView() }}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      style={{
        background: isDragOver ? 'rgba(var(--brand-rgb),0.05)' : '#FFFFFF',
        border: isDragOver ? '1.5px dashed var(--brand-color)' : '1px solid rgba(0,0,0,0.07)',
        borderRadius: 'var(--r-md)', padding: '14px 16px', cursor: 'pointer', transition: 'background 0.12s ease, border-color 0.12s ease',
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: 'var(--brand-color)' }}>
              {truck.resourceCode}
            </span>
            {/* resourceCode is an internal asset reference; the rego is the plate on the vehicle. */}
            <Rego value={truck.vehicleRegistration} />
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-full)', background: 'rgba(37,99,235,0.08)', color: '#2563EB' }}>Truck</span>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{truck.truckType ?? '—'}</p>
        </div>
        <StatusBadge status={truck.status} />
      </div>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13.5, marginBottom: 10 }}>
        <InfoCell label="Rego" value={truck.vehicleRegistration ?? '—'} />
        <InfoCell label="Capacity" value={truck.capacity ?? '—'} />
        {fieldLabel && <InfoCell label={fieldLabel} value={truck.customFieldValue ?? '—'} />}
        <InfoCell label="Location" value={truck.location ?? '—'} />
        <InfoCell label="Last Service" value={fmtDate(truck.lastServiceDate)} />
      </div>
      <AssignedResourcesSection trailer={trailer} driver={driver} />
      {isDragOver && (
        <p style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--brand-color)', textAlign: 'center' }}>Drop to assign</p>
      )}
    </div>
  )
}

function TrailerCard({ trailer, truck, onView, onViewTruck }: { trailer: Trailer; truck?: Truck; onView: () => void; onViewTruck: (id: string) => void }) {
  return (
    <div role="button" tabIndex={0} onClick={onView} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onView() }}
      draggable onDragStart={e => { e.dataTransfer.setData('application/json', JSON.stringify({ kind: 'trailer', id: trailer.id })); e.dataTransfer.effectAllowed = 'move' }}
      style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', padding: '14px 16px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <DragHandle />
            <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: 'var(--brand-color)' }}>
              {trailer.resourceCode}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-full)', background: 'rgba(124,58,237,0.08)', color: '#7C3AED' }}>Trailer</span>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{trailer.trailerType ?? '—'}</p>
        </div>
        <StatusBadge status={trailer.status} />
      </div>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13.5 }}>
        <InfoCell label="Capacity" value={trailer.capacity ?? '—'} />
        <InfoCell label="Attached To" value={truck ? (
          <button type="button" onClick={e => { e.stopPropagation(); onViewTruck(truck.id) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13.5, fontFamily: 'inherit', fontWeight: 600 }}>
            <Icon name={ICONS.truck} size={12} />{truck.resourceCode}
          </button>
        ) : 'None'} />
        <InfoCell label="Last Service" value={fmtDate(trailer.lastServiceDate)} />
      </div>
    </div>
  )
}

function DriverCard({ driver, truck, onView, onViewTruck }: { driver: Driver; truck?: Truck; onView: () => void; onViewTruck: (id: string) => void }) {
  return (
    <div role="button" tabIndex={0} onClick={onView} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onView() }}
      draggable onDragStart={e => { e.dataTransfer.setData('application/json', JSON.stringify({ kind: 'driver', id: driver.id })); e.dataTransfer.effectAllowed = 'move' }}
      style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', padding: '14px 16px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <DragHandle />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1917' }}>{driver.driverName}</span>
            <Rego value={truck?.vehicleRegistration} />
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-full)', background: 'rgba(34,197,94,0.08)', color: '#16A34A' }}>Driver</span>
          </div>
          <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13.5, color: 'var(--text-secondary)' }}>{driver.resourceCode}</p>
        </div>
        <StatusBadge status={driver.status} driver />
      </div>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13.5 }}>
        <InfoCell label="ID" value={driver.resourceCode} />
        <InfoCell label="License" value={driver.licenseClass ?? '—'} />
        <InfoCell label="Experience" value={driver.experienceYears != null ? `${driver.experienceYears}y` : '—'} />
        <InfoCell label="Assigned Vehicle" value={truck ? (
          <button type="button" onClick={e => { e.stopPropagation(); onViewTruck(truck.id) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13.5, fontFamily: 'inherit', fontWeight: 600 }}>
            <Icon name={ICONS.truck} size={12} />{truck.resourceCode}
          </button>
        ) : 'None'} />
      </div>
    </div>
  )
}

const TH: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid rgba(0,0,0,0.08)' }
const TD: React.CSSProperties = { padding: '11px 12px', fontSize: 13.5, color: '#1C1917', borderBottom: '1px solid rgba(0,0,0,0.05)' }

function EmptyState({ label, icon }: { label: string; icon: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0 40px' }}>
      <div style={{ width: 48, height: 48, borderRadius: 'var(--r-sm)', background: '#EBEBEA', border: '1px solid rgba(0,0,0,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <Icon name={icon} size={22} style={{ color: 'var(--text-tertiary)' }} />
      </div>
      <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917' }}>{label}</p>
    </div>
  )
}

function TruckTable({ trucks, onView, fieldLabel }: { trucks: Truck[]; onView: (id: string) => void; fieldLabel?: string | null }) {
  if (!trucks.length) return <EmptyState label="No truck resources found" icon={ICONS.truck} />
  return (
    <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', marginBottom: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={TH}>ID</th><th style={TH}>Rego</th><th style={TH}>Type</th><th style={TH}>Capacity</th>{fieldLabel && <th style={TH}>{fieldLabel}</th>}<th style={TH}>Location</th><th style={TH}>Last Service</th><th style={TH}>Status</th></tr></thead>
        <tbody>
          {trucks.map(t => (
            <tr key={t.id}>
              <td style={TD}><button type="button" onClick={() => onView(t.id)} style={{ fontFamily: 'ui-monospace,monospace', color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>{t.resourceCode}</button></td>
              <td style={{ ...TD, fontFamily: 'ui-monospace,monospace' }}>{t.vehicleRegistration ?? '—'}</td>
              <td style={TD}>{t.truckType ?? '—'}</td>
              <td style={TD}>{t.capacity ?? '—'}</td>
              {fieldLabel && <td style={TD}>{t.customFieldValue ?? '—'}</td>}
              <td style={TD}>{t.location ?? '—'}</td>
              <td style={TD}>{fmtDate(t.lastServiceDate)}</td>
              <td style={TD}><StatusBadge status={t.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TrailerTable({ trailers, trucks, onView, onViewTruck }: { trailers: Trailer[]; trucks: Truck[]; onView: (id: string) => void; onViewTruck: (id: string) => void }) {
  if (!trailers.length) return <EmptyState label="No trailer resources found" icon={ICONS.trailer} />
  return (
    <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', marginBottom: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={TH}>ID</th><th style={TH}>Type</th><th style={TH}>Capacity</th><th style={TH}>Attached To</th><th style={TH}>Last Service</th><th style={TH}>Status</th></tr></thead>
        <tbody>
          {trailers.map(tr => {
            const truck = trucks.find(t => t.id === tr.attachedTruckId)
            return (
              <tr key={tr.id}>
                <td style={TD}><button type="button" onClick={() => onView(tr.id)} style={{ fontFamily: 'ui-monospace,monospace', color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>{tr.resourceCode}</button></td>
                <td style={TD}>{tr.trailerType ?? '—'}</td>
                <td style={TD}>{tr.capacity ?? '—'}</td>
                <td style={TD}>{truck ? <button type="button" onClick={() => onViewTruck(truck.id)} style={{ color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>{truck.resourceCode}</button> : 'None'}</td>
                <td style={TD}>{fmtDate(tr.lastServiceDate)}</td>
                <td style={TD}><StatusBadge status={tr.status} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DriverTable({ drivers, trucks, onView, onViewTruck }: { drivers: Driver[]; trucks: Truck[]; onView: (id: string) => void; onViewTruck: (id: string) => void }) {
  if (!drivers.length) return <EmptyState label="No driver resources found" icon={ICONS.driver} />
  return (
    <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', marginBottom: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={TH}>ID</th><th style={TH}>Name</th><th style={TH}>License</th><th style={TH}>Experience</th><th style={TH}>Assigned Vehicle</th><th style={TH}>Status</th></tr></thead>
        <tbody>
          {drivers.map(d => {
            const truck = trucks.find(t => t.id === d.assignedTruckId)
            return (
              <tr key={d.id}>
                <td style={TD}><button type="button" onClick={() => onView(d.id)} style={{ fontFamily: 'ui-monospace,monospace', color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>{d.resourceCode}</button></td>
                <td style={TD}>{d.driverName}</td>
                <td style={TD}>{d.licenseClass ?? '—'}</td>
                <td style={TD}>{d.experienceYears != null ? `${d.experienceYears}y` : '—'}</td>
                <td style={TD}>{truck ? <button type="button" onClick={() => onViewTruck(truck.id)} style={{ color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>{truck.resourceCode}</button> : 'None'}</td>
                <td style={TD}><StatusBadge status={d.status} driver /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AddResourceModal({ onClose, onCreated, trucks, truckFieldLabel, truckFieldType }: { onClose: () => void; onCreated: () => void; trucks: Truck[]; truckFieldLabel?: string | null; truckFieldType?: CustomFieldType }) {
  const [kind, setKind] = useState<'truck' | 'trailer' | 'driver'>('truck')
  const [rego, setRego] = useState('')
  const [type, setType] = useState('')
  const [capacity, setCapacity] = useState('')
  const [location, setLocation] = useState('')
  const [customFieldValue, setCustomFieldValue] = useState('')
  const [attachedTruckId, setAttachedTruckId] = useState('')
  const [driverName, setDriverName] = useState('')
  const [licenseClass, setLicenseClass] = useState('')
  const [experienceYears, setExperienceYears] = useState('')
  const [driverStatus, setDriverStatus] = useState<DriverStatus>('off_duty')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    setSubmitting(true)
    try {
      if (kind === 'truck') {
        const result = await createTruck({ vehicle_registration: rego.trim() || undefined, truck_type: type.trim() || undefined, capacity: capacity.trim() || undefined, location: location.trim() || undefined, custom_field_value: customFieldValue.trim() || undefined })
        if (!result) { toast('Could not add truck. Please try again.', 'error'); return }
        toast('Truck added', 'success')
      } else if (kind === 'trailer') {
        const result = await createTrailer({ trailer_type: type.trim() || undefined, capacity: capacity.trim() || undefined, attached_truck_id: attachedTruckId || undefined })
        if (!result) { toast('Could not add trailer. Please try again.', 'error'); return }
        toast('Trailer added', 'success')
      } else {
        if (!driverName.trim()) { toast('Driver name is required', 'error'); return }
        const result = await createDriver({ driver_name: driverName.trim(), license_class: licenseClass.trim() || undefined, experience_years: experienceYears ? Number(experienceYears) : undefined, assigned_truck_id: attachedTruckId || undefined, status: driverStatus })
        if (!result) { toast('Could not add driver. Please try again.', 'error'); return }
        toast('Driver added', 'success')
      }
      onCreated()
    } catch {
      toast('Could not add resource. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: 24, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.20)' }} onClick={e => e.stopPropagation()}>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 16 }}>Add Resource</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Resource Type">
            <CustomSelect
              value={kind} onChange={v => setKind(v as typeof kind)}
              options={[
                { value: 'truck',   label: 'Truck' },
                { value: 'trailer', label: 'Trailer' },
                { value: 'driver',  label: 'Driver' },
              ]}
            />
          </Field>

          {kind === 'truck' && (
            <>
              <Field label="Rego"><input value={rego} onChange={e => setRego(e.target.value)} placeholder="ABC-123" style={INPUT} /></Field>
              <Field label="Type"><input value={type} onChange={e => setType(e.target.value)} placeholder="Semi-Trailer" style={INPUT} /></Field>
              <Field label="Capacity"><input value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="40T" style={INPUT} /></Field>
              {truckFieldLabel && (
                <Field label={truckFieldLabel}><input type={customFieldInputType(truckFieldType ?? 'text')} value={customFieldValue} onChange={e => setCustomFieldValue(e.target.value)} style={INPUT} /></Field>
              )}
              <Field label="Location"><input value={location} onChange={e => setLocation(e.target.value)} placeholder="Sydney Depot" style={INPUT} /></Field>
            </>
          )}
          {kind === 'trailer' && (
            <>
              <Field label="Type"><input value={type} onChange={e => setType(e.target.value)} placeholder="Flatbed" style={INPUT} /></Field>
              <Field label="Capacity"><input value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="40FT" style={INPUT} /></Field>
              <Field label="Attached Truck (optional)">
                <CustomSelect
                  value={attachedTruckId} onChange={setAttachedTruckId} placeholder="None"
                  options={trucks.map(t => ({ value: t.id, label: t.resourceCode }))}
                />
              </Field>
            </>
          )}
          {kind === 'driver' && (
            <>
              <Field label="Driver Name"><input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Jane Smith" style={INPUT} /></Field>
              <Field label="License Class"><input value={licenseClass} onChange={e => setLicenseClass(e.target.value)} placeholder="HC" style={INPUT} /></Field>
              <Field label="Experience (years)"><input type="number" min={0} value={experienceYears} onChange={e => setExperienceYears(e.target.value)} placeholder="5" style={INPUT} /></Field>
              <Field label="Status">
                <CustomSelect value={driverStatus} onChange={v => setDriverStatus(v as DriverStatus)} options={[{ value: 'on_duty', label: 'On Duty' }, { value: 'off_duty', label: 'Off Duty' }, { value: 'on_leave', label: 'On Leave' }]} />
              </Field>
              <Field label="Assigned Vehicle (optional)">
                <CustomSelect
                  value={attachedTruckId} onChange={setAttachedTruckId} placeholder="None"
                  options={trucks.map(t => ({ value: t.id, label: t.resourceCode }))}
                />
              </Field>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={onClose} disabled={submitting}
            style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={submitting}
            style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Adding…' : 'Add Resource'}
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
