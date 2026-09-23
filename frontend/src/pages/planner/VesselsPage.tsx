import { useState, useEffect, useMemo } from 'react'
import { motion } from 'motion/react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { getVessels, createVessel, setVesselStatus } from '@/lib/db/vessels'
import { getTrips } from '@/lib/db/trips'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { BackButton } from '@/components/ui/BackButton'
import { getPlannerSettings } from '@/lib/db/planner-settings'
import { usePlannerPermissions } from '@/lib/usePlannerPermissions'
import { toast } from '@/lib/toast'
import type { Vessel, VesselStatus, Trip, TripStage } from '@/data/types'

const TRIP_STAGE_STYLE: Record<TripStage, { bg: string; color: string; label: string }> = {
  planned:     { bg: 'rgba(0,0,0,0.05)',       color: 'var(--text-secondary)', label: 'Planned'     },
  assigned:    { bg: 'rgba(37,99,235,0.08)',   color: '#2563EB',               label: 'Assigned'    },
  in_progress: { bg: 'rgba(234,179,8,0.10)',   color: '#A16207',               label: 'In Progress' },
  completed:   { bg: 'rgba(34,197,94,0.10)',   color: '#16A34A',               label: 'Completed'   },
}

const STATUS_STYLE: Record<VesselStatus, { bg: string; color: string; label: string }> = {
  scheduled:  { bg: 'rgba(37,99,235,0.08)',  color: '#2563EB', label: 'Scheduled'  },
  in_transit: { bg: 'rgba(234,179,8,0.10)',  color: '#A16207', label: 'In Transit' },
  arrived:    { bg: 'rgba(34,197,94,0.10)',  color: '#16A34A', label: 'Arrived'    },
}

// FRD 2.4.2.1 pins the timestamp format to YYYY-MM-DD HH:MM.
function fmtEta(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fmtCapacity = (n?: number) => (n == null ? '—' : n.toLocaleString())

export default function VesselsPage() {
  usePageTitle('Glido | Vessels')
  const perms = usePlannerPermissions()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<VesselStatus | ''>('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [page, setPage] = useState(1)
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true))

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => { getPlannerSettings().then(s => { if (s) setItemsPerPage(s.itemsPerPage) }).catch(() => {}) }, [])

  const load = () => {
    setIsLoading(true)
    getVessels({ search: search.trim() || undefined, status: statusFilter || undefined })
      .then(rows => { setVessels(rows); setIsLoading(false) })
      .catch(() => setIsLoading(false))
  }

  useEffect(load, [search, statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1) }, [search, statusFilter])

  const hasFilters = !!(search || statusFilter)
  const pageCount = Math.max(1, Math.ceil(vessels.length / itemsPerPage))
  const pagedVessels = useMemo(() => vessels.slice((page - 1) * itemsPerPage, page * itemsPerPage), [vessels, page, itemsPerPage])

  return (
    <>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* FRD 2.4.2.1: Back returns to the Planner Dashboard. Inline in the toolbar rather than
            on a row of its own, so it costs no vertical space. */}
        <BackButton to="/planner" />
        <span style={{ width: 1, height: 24, background: 'rgba(0,0,0,0.08)', flexShrink: 0 }} />

        <div style={{ position: 'relative', width: 260, flexShrink: 0 }}>
          <Icon name={ICONS.search} size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          {/* Matches name, ID, voyage and Lloyd number server-side (FRD 2.4.2.1). */}
          <input type="text" placeholder="Search vessel" title="Search by vessel name, ID, voyage or Lloyd number" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 38, padding: '0 14px 0 36px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }} />
        </div>

        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setFilterOpen(v => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', fontSize: 14, fontWeight: 600, color: statusFilter ? 'var(--brand-color)' : '#374151', background: statusFilter ? 'rgba(var(--brand-rgb),0.08)' : '#fff', border: `1px solid ${statusFilter ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.12)'}`, borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Icon name={ICONS.filter} size={14} />{statusFilter ? STATUS_STYLE[statusFilter].label : 'Filter'}
          </button>
          {filterOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setFilterOpen(false)} />
              <div style={{ position: 'absolute', top: 44, left: 0, zIndex: 101, width: 170, background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                {(['scheduled', 'in_transit', 'arrived'] as VesselStatus[]).map(s => (
                  <button key={s} type="button" onClick={() => { setStatusFilter(s); setFilterOpen(false) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 14, fontWeight: statusFilter === s ? 700 : 500, color: statusFilter === s ? 'var(--brand-color)' : '#374151', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {STATUS_STYLE[s].label}
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

        {perms.can_create_vessel && (
          <button type="button" onClick={() => setAddOpen(true)}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 16px', fontSize: 14, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.30)' }}>
            <Icon name={ICONS.add} size={15} />Add Vessel
          </button>
        )}
      </div>

      {/* Split view: list (left) + docked detail pane (right) on wide screens — same pattern as
          Planner Trips / Customer Portal My Requests, instead of centered modals. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {isLoading ? (
              [0, 1, 2].map(i => <div key={i} style={{ height: 160, borderRadius: 'var(--r-md)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)
            ) : vessels.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '64px 0 48px' }}>
                <div style={{ width: 48, height: 48, borderRadius: 'var(--r-sm)', background: '#EBEBEA', border: '1px solid rgba(0,0,0,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Icon name={ICONS.ship} size={22} style={{ color: 'var(--text-tertiary)' }} />
                </div>
                {/* The FRD separates the two cases: a search or filter that matched nothing is
                    'no results found'; an empty list with nothing applied is 'no vessels found'.
                    Keying off hasFilters rather than search alone matters — a status filter that
                    excludes everything used to claim there were no vessels at all. */}
                <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917' }}>{hasFilters ? 'No results found' : 'No vessels found'}</p>
                {hasFilters && (
                  <button type="button" onClick={() => { setSearch(''); setStatusFilter('') }}
                    style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : pagedVessels.map(v => {
              const s = STATUS_STYLE[v.status]
              const isSel = selectedVessel?.id === v.id
              return (
                <div key={v.id} onClick={() => setSelectedVessel(v)}
                  style={{ background: isSel ? 'rgba(var(--brand-rgb),0.04)' : '#FFFFFF', border: `1px solid ${isSel ? 'rgba(var(--brand-rgb),0.45)' : 'rgba(0,0,0,0.07)'}`, borderRadius: 'var(--r-md)', padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                    <div>
                      <p style={{ fontSize: 15.5, fontWeight: 700, color: '#1C1917', marginBottom: 2 }}>{v.vesselName}</p>
                      <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12.5, color: 'var(--text-tertiary)' }}>{v.vesselCode}</p>
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)', background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 12px', fontSize: 13.5, marginBottom: 12 }}>
                    <InfoCell label="ETA" value={fmtEta(v.eta)} />
                    <InfoCell label="Port" value={v.port ?? '—'} />
                    <InfoCell label="Containers" value={String(v.containerCount)} />
                    <InfoCell label="Capacity" value={fmtCapacity(v.capacity)} />
                  </div>
                  <button type="button" onClick={e => { e.stopPropagation(); setSelectedVessel(v) }}
                    style={{ width: '100%', height: 34, fontSize: 13.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
                    View Details
                  </button>
                </div>
              )
            })}
          </div>

          {!isLoading && vessels.length > itemsPerPage && (
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
        </div>

        {/* Docked detail pane — split view (wide screens) */}
        {selectedVessel && isWide && (
          <div style={{ width: 480, flexShrink: 0, position: 'sticky', top: 12, height: 'calc(100vh - var(--dash-header-h) - 24px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <VesselDetailPanel key={selectedVessel.id} vessel={selectedVessel} docked onClose={() => setSelectedVessel(null)} onUpdated={v => { load(); setSelectedVessel(v) }} />
          </div>
        )}
      </div>

      {addOpen && (
        <AddVesselModal onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); load() }} />
      )}

      {/* Detail overlay — narrow screens */}
      {selectedVessel && !isWide && (
        <VesselDetailPanel key={selectedVessel.id} vessel={selectedVessel} onClose={() => setSelectedVessel(null)} onUpdated={v => { load(); setSelectedVessel(v) }} />
      )}
    </>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 2px' }}>{label}</p>
      <p style={{ color: '#1C1917', margin: 0 }}>{value}</p>
    </div>
  )
}

function VesselDetailPanel({ vessel, onClose, onUpdated, docked = false }: { vessel: Vessel; onClose: () => void; onUpdated: (v: Vessel) => void; docked?: boolean }) {
  const s = STATUS_STYLE[vessel.status]
  const [advancing, setAdvancing] = useState(false)
  const [trips, setTrips] = useState<Trip[]>([])
  const [tripsLoading, setTripsLoading] = useState(true)
  const nextStatus: Record<VesselStatus, VesselStatus | null> = { scheduled: 'in_transit', in_transit: 'arrived', arrived: null }
  const next = nextStatus[vessel.status]

  useEffect(() => {
    let cancelled = false
    setTripsLoading(true)
    getTrips({ vesselId: vessel.id }).then(rows => { if (!cancelled) { setTrips(rows); setTripsLoading(false) } }).catch(() => { if (!cancelled) setTripsLoading(false) })
    return () => { cancelled = true }
  }, [vessel.id])

  const advance = async () => {
    if (!next) return
    setAdvancing(true)
    try {
      const result = await setVesselStatus(vessel.id, next)
      if (result) { toast(`Vessel marked as ${STATUS_STYLE[next].label.toLowerCase()}`, 'success'); onUpdated(result) }
      else toast('Could not update vessel', 'error')
    } finally {
      setAdvancing(false)
    }
  }

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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917' }}>{vessel.vesselName}</p>
              <span style={{ fontSize: 12.5, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)', background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
            </div>
            <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>{vessel.vesselCode}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ width: 34, height: 34, borderRadius: 'var(--r-full)', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: 'var(--text-secondary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 22, flex: 1, overflowY: 'auto', minHeight: 0 }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DetailRow label="ETA" value={fmtEta(vessel.eta)} />
            <DetailRow label="ETD" value={fmtEta(vessel.etd)} />
            <DetailRow label="Port" value={vessel.port ?? '—'} />
            <DetailRow label="Voyage" value={vessel.voyageNumber ?? '—'} mono />
            <DetailRow label="Lloyd No." value={vessel.lloydNumber ?? '—'} mono />
            <DetailRow label="Capacity" value={fmtCapacity(vessel.capacity)} />
            <DetailRow label="Containers" value={String(vessel.containerCount)} />
            {/* Milestones drive the list sort order; shown only once they have been recorded. */}
            {vessel.slottedAt    && <DetailRow label="Slotted"    value={fmtEta(vessel.slottedAt)} />}
            {vessel.dischargedAt && <DetailRow label="Discharged" value={fmtEta(vessel.dischargedAt)} />}
          </div>

          {next && (
            <button type="button" onClick={advance} disabled={advancing}
              style={{ height: 38, fontSize: 14, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: advancing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: advancing ? 0.6 : 1 }}>
              {advancing ? 'Updating…' : `Mark ${STATUS_STYLE[next].label}`}
            </button>
          )}

          {/* "When clicked on a vessel, list of containers (business request cards) opens
              pertaining to that vessel." — each trip is one container/business request. */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Containers Assigned to This Vessel</p>
            {tripsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[0, 1].map(i => <div key={i} style={{ height: 56, borderRadius: 'var(--r-sm)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
              </div>
            ) : trips.length === 0 ? (
              <p style={{ fontSize: 13.5, color: 'var(--text-tertiary)', margin: 0 }}>No containers assigned to this vessel yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {trips.map(t => {
                  const ts = TRIP_STAGE_STYLE[t.stage]
                  return (
                    <div key={t.id} style={{ border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                        <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13.5, fontWeight: 700, color: '#1C1917' }}>{t.tripRef}</p>
                        <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-full)', background: ts.bg, color: ts.color, whiteSpace: 'nowrap' }}>{ts.label}</span>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, textTransform: 'capitalize' }}>
                        {t.serviceCategory} · {t.serviceType.replace('_', ' ')}{t.containerNumber ? ` · ${t.containerNumber}` : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const empty = value === '—'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
      <span style={{ fontSize: 13.5, color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: empty ? 'var(--text-tertiary)' : '#1C1917', fontFamily: mono && !empty ? 'ui-monospace,monospace' : 'inherit', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{value}</span>
    </div>
  )
}

function AddVesselModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [vesselName, setVesselName] = useState('')
  const [vesselCode, setVesselCode] = useState('')
  const [voyage, setVoyage] = useState('')
  const [lloyd, setLloyd] = useState('')
  const [port, setPort] = useState('')
  const [eta, setEta] = useState('')
  const [etd, setEtd] = useState('')
  const [capacity, setCapacity] = useState('')
  const [status, setStatus] = useState<VesselStatus>('scheduled')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!vesselName.trim()) { toast('Vessel name is required', 'error'); return }
    // Capacity is optional, but if it's filled in it has to be a whole number of containers —
    // catching it here avoids a round trip to the same check on the server.
    if (capacity.trim() && !/^\d+$/.test(capacity.trim())) {
      toast('Capacity must be a whole number of containers', 'error'); return
    }
    setSubmitting(true)
    try {
      const result = await createVessel({
        vessel_name:   vesselName.trim(),
        vessel_code:   vesselCode.trim() || undefined,   // server allocates one when blank
        voyage_number: voyage.trim() || undefined,
        lloyd_number:  lloyd.trim() || undefined,
        port:          port.trim() || undefined,
        eta:           eta || undefined,
        etd:           etd || undefined,
        capacity:      capacity.trim() ? Number(capacity.trim()) : undefined,
        status,
      })
      if (!result) { toast('Could not create vessel. Please try again.', 'error'); return }
      toast('Vessel added', 'success')
      onCreated()
    } catch (err: any) {
      toast(err?.message ?? 'Could not create vessel. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: 24, maxWidth: 560, width: '100%', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.20)' }} onClick={e => e.stopPropagation()}>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 16 }}>Add Vessel</p>

        {/* Two columns — nine fields in a single stack made the modal taller than the viewport. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <Field label="Vessel Name" full>
            <input value={vesselName} onChange={e => setVesselName(e.target.value)} placeholder="MSC Anna" style={INPUT} />
          </Field>
          <Field label="Vessel ID">
            <input value={vesselCode} onChange={e => setVesselCode(e.target.value)} placeholder="Auto-generated if blank" style={INPUT} />
          </Field>
          <Field label="Voyage">
            <input value={voyage} onChange={e => setVoyage(e.target.value)} placeholder="044W" style={INPUT} />
          </Field>
          <Field label="Lloyd No.">
            <input value={lloyd} onChange={e => setLloyd(e.target.value)} placeholder="9876543" style={INPUT} />
          </Field>
          <Field label="Port">
            <input value={port} onChange={e => setPort(e.target.value)} placeholder="Sydney" style={INPUT} />
          </Field>
          <Field label="ETA">
            <input type="datetime-local" value={eta} onChange={e => setEta(e.target.value)} style={INPUT} />
          </Field>
          <Field label="ETD">
            <input type="datetime-local" value={etd} onChange={e => setEtd(e.target.value)} style={INPUT} />
          </Field>
          <Field label="Capacity (containers)">
            <input type="number" min={0} step={1} inputMode="numeric" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="2400" style={INPUT} />
          </Field>
          <Field label="Status">
            <CustomSelect
              value={status}
              onChange={v => setStatus(v as VesselStatus)}
              options={[
                { value: 'scheduled',  label: 'Scheduled' },
                { value: 'in_transit', label: 'In Transit' },
                { value: 'arrived',    label: 'Arrived' },
              ]}
            />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={onClose} disabled={submitting}
            style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={submitting}
            style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Adding…' : 'Add Vessel'}
          </button>
        </div>
      </div>
    </div>
  )
}

const INPUT: React.CSSProperties = { width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>{label}</p>
      {children}
    </div>
  )
}
