import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Icon, ICONS } from '@/lib/Icon'
import { getServiceRequest } from '@/lib/db/service-requests'
import type { ServiceRequest, ServiceKey, RequestStage, ServiceStatus, StoreDetailEntry } from '@/data/types'

function parseStoreEntries(details: Record<string, string> | undefined): StoreDetailEntry[] {
  if (!details?.entries) return []
  try {
    const parsed = JSON.parse(details.entries)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Request-level progress timeline (service_requests.stage) — the shipment's journey, shown once
// at the top of the panel.
const STAGES: RequestStage[] = ['received', 'in_transit', 'arrived', 'completed']
const STAGE_LABEL: Record<RequestStage, string> = { received: 'Received', in_transit: 'In Transit', arrived: 'Arrived', completed: 'Completed' }

// Each service ALSO carries its own lifecycle (service_request_services.status), rendered inside
// its own card — a request with three services can legitimately have one completed, one running
// and one not started, which the request-level stage above cannot express.
const SERVICE_STAGES: ServiceStatus[] = ['pending', 'in_progress', 'completed']

const SERVICE_META: Record<ServiceKey, { label: string; icon: string; description: string; fields: string[]; duration: string }> = {
  fcl_collection_terminal: { label: 'FCL run into Terminal',        icon: ICONS.truck,      description: 'Full container load collection from port terminal', fields: ['Terminal', 'Slot', 'Time Window', 'Contact'], duration: '2-4 hours' },
  inspection_compliance:   { label: 'Inspection & compliance',      icon: ICONS.shield,     description: 'Customs and quarantine compliance checks',           fields: ['Type', 'Authority', 'Reference', 'Requirements', 'Certificates'], duration: '1-3 days' },
  fcl_storage:             { label: 'FCL Storage',                  icon: ICONS.container, description: 'Full container load storage at the depot',           fields: ['Location', 'Type', 'Capacity', 'Duration', 'Conditions'], duration: 'Ongoing' },
  lcl_storage:             { label: 'LCL storage',                  icon: ICONS.container, description: 'Less than container load storage at the depot',      fields: ['Location', 'Type', 'Capacity', 'Duration', 'Conditions'], duration: 'Ongoing' },
  fcl_collection:          { label: 'FCL collection',                icon: ICONS.truck,     description: 'Full container load collection',                    fields: ['Location', 'Method', 'Contact'], duration: '2-4 hours' },
  lcl_collection:          { label: 'LCL collection',                icon: ICONS.truck,     description: 'Less than container load collection',               fields: ['Location', 'Method', 'Contact'], duration: '2-4 hours' },
  dehire:                  { label: 'Empty container collection',    icon: ICONS.truck,      description: 'Empty container return / dehire',                    fields: ['Location', 'Condition', 'Inspection', 'Documentation', 'Charges'], duration: '1-2 hours' },
  unpack:                  { label: 'Pack',                          icon: ICONS.layers,    description: 'Container pack/unpack and cargo segregation',        fields: ['Location', 'Method', 'Cargo Type', 'Palletization', 'Segregation'], duration: '3-6 hours' },
}

// Fallback for legacy service_key values from before services were split into fcl_/lcl_ variants
// (older rows may still have e.g. 'delivery', 'store', 'collection_terminal').
const FALLBACK_META = { label: 'Service', icon: ICONS.cargo, description: '', fields: [] as string[], duration: '—' }

// Shared by both the per-service status badge and the request-level Status badge (FR 2.3) —
// the latter adds 'approved'/'rejected', which per-service status never uses.
const STATUS_STYLE: Record<string, React.CSSProperties> = {
  pending:     { background: 'rgba(0,0,0,0.05)',       color: 'var(--text-secondary)' },
  approved:    { background: 'rgba(59,130,246,0.10)',  color: '#2563EB' },
  in_progress: { background: 'rgba(var(--brand-rgb),0.10)', color: 'var(--brand-color)' },
  completed:   { background: 'rgba(34,197,94,0.10)',   color: '#16A34A' },
  rejected:    { background: 'rgba(239,68,68,0.10)',   color: '#DC2626' },
}
const STATUS_LABEL: Record<string, string> = { pending: 'Pending', approved: 'Approved', in_progress: 'In Progress', completed: 'Completed', rejected: 'Rejected' }

interface Props {
  requestId: string
  docked?: boolean
  onClose: () => void
}

export function RequestDetailsPanel({ requestId, docked, onClose }: Props) {
  const [request, setRequest] = useState<ServiceRequest | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getServiceRequest(requestId).then(r => { if (!cancelled) { setRequest(r); setLoading(false) } })
    return () => { cancelled = true }
  }, [requestId])

  const panelStyle: React.CSSProperties = docked
    ? { position: 'relative', height: '100%', width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 6px 24px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9011, width: 'min(480px, 100vw)', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }

  const stageIdx = request ? STAGES.indexOf(request.stage) : -1
  const progressPct = stageIdx >= 0 ? Math.round(((stageIdx + 1) / STAGES.length) * 100) : 0

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
              Request Details – <span style={{ fontFamily: 'ui-monospace,monospace' }}>{request?.requestId ?? requestId}</span>
            </p>
            {request && (
              <span style={{ ...STATUS_STYLE[request.status], padding: '3px 9px', borderRadius: 'var(--r-full)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {STATUS_LABEL[request.status]}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ width: 34, height: 34, borderRadius: 'var(--r-full)', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: 'var(--text-secondary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {loading || !request ? (
          <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ height: 48, borderRadius: 'var(--r-sm)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
          </div>
        ) : (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 22, flex: 1, overflowY: 'auto', minHeight: 0 }}>

            {/* Progress indicator */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {STAGES.map((s, i) => {
                const done = i <= stageIdx
                return (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STAGES.length - 1 ? 1 : undefined }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: done ? 'var(--brand-color)' : 'rgba(0,0,0,0.12)' }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: done ? '#1C1917' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{STAGE_LABEL[s]}</span>
                    </div>
                    {i < STAGES.length - 1 && <div style={{ flex: 1, height: 2, margin: '0 4px 16px', background: i < stageIdx ? 'var(--brand-color)' : 'rgba(0,0,0,0.08)' }} />}
                  </div>
                )
              })}
            </div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <SummaryCard label="Container" value={request.containerNumber ?? '—'} sub={request.containerSize ? `Size: ${request.containerSize}` : undefined} />
              <SummaryCard label="Vessel" value={request.vesselLine ?? '—'} />
              <SummaryCard label="Type" value={`${request.serviceCategory === 'export' ? 'Export' : 'Import'} Shipment`} sub={request.collectionDate ?? undefined} />
            </div>

            {/* Estimated cost — data field, populated by staff/pricing; shows '—' until set */}
            <SummaryCard label="Estimated Cost" value={request.estimatedCost != null ? `$${request.estimatedCost.toFixed(2)}` : '—'} />

            {/* FR 2.3 — Out of Gauge cargo indicator */}
            <SummaryCard label="Out of Gauge (OOG)" value={request.isOOG ? 'Yes' : 'No'}
              sub={request.isOOG ? `${request.oogLength || '—'} × ${request.oogWidth || '—'} × ${request.oogHeight || '—'} cm (L×W×H)` : undefined} />

            {/* Service Timeline & Details */}
            <Section title="Service Timeline & Details">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(request.services ?? []).map(svc => {
                  const meta = SERVICE_META[svc.serviceKey] ?? FALLBACK_META
                  const statusStyle = STATUS_STYLE[svc.status] ?? STATUS_STYLE.pending
                  return (
                    <div key={svc.id} style={{ border: `1px solid ${svc.status === 'in_progress' ? 'rgba(var(--brand-rgb),0.30)' : 'rgba(0,0,0,0.08)'}`, borderRadius: 'var(--r-md)', padding: 14, background: svc.status === 'in_progress' ? 'rgba(var(--brand-rgb),0.03)' : '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon name={meta.icon} size={16} style={{ color: 'var(--text-secondary)' }} />
                          <span style={{ fontSize: 14.5, fontWeight: 700, color: '#1C1917' }}>{meta.label}{svc.subType ? ` · ${svc.subType}` : ''}</span>
                        </div>
                        <span style={{ ...statusStyle, padding: '3px 9px', borderRadius: 'var(--r-full)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{STATUS_LABEL[svc.status]}</span>
                      </div>

                      {/* This service's own timeline */}
                      <ServiceTimeline status={svc.status} />

                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>{meta.description}</p>
                      {parseStoreEntries(svc.details).length > 0 && (
                        <div style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 'var(--r-sm)', padding: '8px 10px', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {parseStoreEntries(svc.details).map((entry, i) => (
                            <div key={i}>
                              <p style={{ fontSize: 12.5, fontWeight: 700, color: '#1C1917', margin: 0 }}>
                                {entry.type}
                                {entry.type.toLowerCase() === 'reefer' && (entry.power ? ` · Power: Yes${entry.temp ? ` · Temp: ${entry.temp}` : ''}` : ' · Power: No')}
                              </p>
                              {entry.note && <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '1px 0 0' }}>{entry.note}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                      {svc.currentInfo && (
                        <div style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 'var(--r-sm)', padding: '8px 10px', marginBottom: 8 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 2px' }}>Current Information</p>
                          <p style={{ fontSize: 13, color: '#1C1917', margin: 0 }}>{svc.currentInfo}</p>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 12, fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                        <span>Duration: {svc.durationLabel ?? meta.duration}</span>
                        <span>Requirements: {meta.fields.join(', ')}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>

            {/* Additional Information */}
            <Section title="Additional Information">
              <DetailRow label="Progress" value={`${progressPct}%`} />
              <DetailRow label="Last Updated" value={new Date(request.updatedAt).toLocaleString('en-AU')} />
            </Section>
          </div>
        )}
      </motion.div>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
    </>
  )
}

// Compact three-step timeline scoped to a single service. Deliberately smaller than the old
// request-level stepper (8px dots, 10px labels) so several can sit inside stacked cards without
// the panel turning into a wall of steppers.
function ServiceTimeline({ status }: { status: ServiceStatus }) {
  const idx = SERVICE_STAGES.indexOf(status)
  const last = SERVICE_STAGES.length - 1
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '2px 0 12px' }}>
      {SERVICE_STAGES.map((s, i) => {
        const done = i <= idx
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < last ? 1 : undefined }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: done ? 'var(--brand-color)' : 'rgba(0,0,0,0.14)',
              }} />
              <span style={{
                fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                color: done ? '#1C1917' : 'var(--text-tertiary)',
              }}>
                {STATUS_LABEL[s]}
              </span>
            </div>
            {i < last && (
              <div style={{ flex: 1, height: 2, margin: '0 4px 14px', background: i < idx ? 'var(--brand-color)' : 'rgba(0,0,0,0.08)' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: '#FAFAF9', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
      <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 3px' }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>{sub}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{title}</p>
      {children}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0' }}>
      <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#1C1917' }}>{value}</span>
    </div>
  )
}
