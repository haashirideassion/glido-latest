import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { getServiceRequest } from '@/lib/db/service-requests'
import type { ServiceRequest, ServiceKey, RequestStage, ServiceStatus, StoreDetailEntry } from '@/data/types'

// Full-page request detail (FRD 2.4.1.3). The FRD describes this as a pop-up; it is a dedicated
// screen by explicit product decision, so the heading, the back affordance and scrolling differ
// from the literal clauses. Everything else follows the FRD's own section order:
// progress -> summary cards -> Service Timeline & Details -> Additional Information.
//
// The rail carries data 2.4.1.3 does not name (estimated cost, voyage, collection date, OOG) so
// that nothing already captured disappears from the screen.

function parseStoreEntries(details: Record<string, string> | undefined): StoreDetailEntry[] {
  if (!details?.entries) return []
  try {
    const parsed = JSON.parse(details.entries)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const STAGES: RequestStage[] = ['received', 'in_transit', 'arrived', 'completed']
const STAGE_LABEL: Record<RequestStage, string> = { received: 'Received', in_transit: 'In Transit', arrived: 'Arrived', completed: 'Completed' }

const SERVICE_STAGES: ServiceStatus[] = ['pending', 'in_progress', 'completed']

interface ServiceMeta {
  label: string
  icon: string
  description: string
  /** FRD "Service Details" field names for this service. Values come from svc.details. */
  fields: string[]
  /** FRD common detail vi — "the list of requirements applicable to that service". */
  requirements: string[]
  duration: string
}

// Field lists are the FRD's, verbatim. "Delivery" maps to FCL/LCL collection: FR 1.1.2.2 names
// those tiles "FCL Delivery" / "LCL Delivery" and FR 1.1.4.2 renames them to collection.
const SERVICE_META: Record<ServiceKey, ServiceMeta> = {
  fcl_collection_terminal: {
    label: 'FCL run into Terminal', icon: ICONS.truck,
    description: 'Full container load collection from port terminal',
    fields: ['Terminal', 'Slot', 'Time Window', 'Contact'],
    requirements: ['Terminal release', 'Booking reference', 'Driver and vehicle details'],
    duration: '2-4 hours',
  },
  inspection_compliance: {
    label: 'Inspection & compliance', icon: ICONS.shield,
    description: 'Customs and quarantine compliance checks',
    fields: ['Type', 'Authority', 'Reference', 'Requirements', 'Certificates'],
    requirements: ['Customs entry', 'Quarantine declaration', 'Supporting certificates'],
    duration: '1-3 days',
  },
  fcl_storage: {
    label: 'FCL Storage', icon: ICONS.container,
    description: 'Full container load storage at the depot',
    fields: ['Location', 'Type', 'Capacity', 'Duration', 'Conditions'],
    requirements: ['Storage type confirmed', 'Expected dwell time', 'Special handling notes'],
    duration: 'Ongoing',
  },
  lcl_storage: {
    label: 'LCL storage', icon: ICONS.container,
    description: 'Less than container load storage at the depot',
    fields: ['Location', 'Type', 'Capacity', 'Duration', 'Conditions'],
    requirements: ['Storage type confirmed', 'Expected dwell time', 'Special handling notes'],
    duration: 'Ongoing',
  },
  fcl_collection: {
    label: 'FCL collection', icon: ICONS.truck,
    description: 'Full container load delivery to the nominated address',
    fields: ['Address', 'Method', 'Drop Type', 'Access Hours', 'Contact', 'Special Instructions'],
    requirements: ['Delivery address', 'Site access hours', 'Receiving contact'],
    duration: '2-4 hours',
  },
  lcl_collection: {
    label: 'LCL collection', icon: ICONS.truck,
    description: 'Less than container load delivery to the nominated address',
    fields: ['Address', 'Method', 'Drop Type', 'Access Hours', 'Contact', 'Special Instructions'],
    requirements: ['Delivery address', 'Site access hours', 'Receiving contact'],
    duration: '2-4 hours',
  },
  dehire: {
    label: 'Empty container collection', icon: ICONS.truck,
    description: 'Empty container return / dehire',
    fields: ['Location', 'Condition', 'Inspection', 'Documentation', 'Charges'],
    requirements: ['Dehire location', 'Container condition report', 'Release documentation'],
    duration: '1-2 hours',
  },
  unpack: {
    label: 'Pack', icon: ICONS.layers,
    description: 'Container pack/unpack and cargo segregation',
    fields: ['Location', 'Method', 'Cargo Type', 'Palletization', 'Segregation'],
    requirements: ['Packing list', 'Cargo handling notes', 'Segregation requirements'],
    duration: '3-6 hours',
  },
}

const FALLBACK_META: ServiceMeta = { label: 'Service', icon: ICONS.cargo, description: '', fields: [], requirements: [], duration: '—' }

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  pending:     { background: 'rgba(0,0,0,0.05)',            color: 'var(--text-secondary)' },
  approved:    { background: 'rgba(59,130,246,0.10)',       color: '#2563EB' },
  in_progress: { background: 'rgba(var(--brand-rgb),0.10)', color: 'var(--brand-color)' },
  completed:   { background: 'rgba(34,197,94,0.10)',        color: '#16A34A' },
  rejected:    { background: 'rgba(239,68,68,0.10)',        color: '#DC2626' },
}
const STATUS_LABEL: Record<string, string> = { pending: 'Pending', approved: 'Approved', in_progress: 'In Progress', completed: 'Completed', rejected: 'Rejected' }

const CARD: React.CSSProperties = {
  background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)',
}

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const fmtShortDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '—'

// Service Details values live in svc.details, a free-form map. Field names are matched
// case-insensitively and with separators normalised, so "Time Window" finds "time_window".
function detailValue(details: Record<string, string> | undefined, field: string): string | undefined {
  if (!details) return undefined
  const snake = field.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  const hit = details[snake] ?? details[field] ?? details[field.toLowerCase()]
  return hit && String(hit).trim() ? String(hit) : undefined
}

export default function RequestDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [request, setRequest] = useState<ServiceRequest | null>(null)
  const [loading, setLoading] = useState(true)

  usePageTitle(request ? `Glido | Request ${request.requestId}` : 'Glido | Request')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getServiceRequest(id)
      .then(r => { if (!cancelled) { setRequest(r); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  const back = () => navigate('/customer/requests')

  const css = `
    @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
    .rd-wrap  { max-width: 1180px; }
    .rd-grid  { display: grid; grid-template-columns: minmax(0,1fr) 320px; gap: 16px; align-items: start; }
    .rd-rail  { position: sticky; top: 0; display: flex; flex-direction: column; gap: 12px; }
    .rd-summary { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; }
    .rd-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px 18px; }
    @media (max-width: 1040px) {
      .rd-grid { grid-template-columns: 1fr; }
      .rd-rail { position: static; }
    }
    @media (max-width: 720px) { .rd-summary { grid-template-columns: 1fr; } }
    .rd-back:hover { color: #1C1917 !important; }
  `

  if (loading) {
    return (
      <div className="rd-wrap">
        <style>{css}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ height: 34, width: 320, borderRadius: 'var(--r-sm)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div className="rd-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[0, 1].map(i => <div key={i} style={{ height: 190, borderRadius: 'var(--r-lg)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
            </div>
            <div style={{ height: 300, borderRadius: 'var(--r-lg)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      </div>
    )
  }

  if (!request) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Icon name={ICONS.bookings} size={30} style={{ color: 'rgba(0,0,0,0.14)' }} />
        <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: '12px 0 4px' }}>Request not found</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 18px' }}>It may have been removed, or the link is wrong.</p>
        <button type="button" onClick={back}
          style={{ padding: '10px 20px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
          Back to My Requests
        </button>
      </div>
    )
  }

  const services    = request.services ?? []
  const doneCount   = services.filter(s => s.status === 'completed').length
  const stageIdx    = STAGES.indexOf(request.stage)
  const shipmentTyp = request.serviceCategory === 'export' ? 'Export Shipment' : 'Import Shipment'
  // Overall completion — the stage timeline is the only progression the request actually has.
  const progressPct = stageIdx >= 0 ? Math.round(((stageIdx + 1) / STAGES.length) * 100) : 0

  return (
    <div className="rd-wrap" style={{ paddingBottom: 60 }}>
      <style>{css}</style>

      {/* Breadcrumb + heading on one line. The FRD's pop-up heading "Request Details – <id>" is
          kept verbatim; the back link stands in for the pop-up's X. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" onClick={back} className="rd-back"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 2px', flexShrink: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.13s' }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5L4.5 7l4 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
          My Requests
        </button>

        <span aria-hidden style={{ width: 1, height: 18, background: 'rgba(0,0,0,0.12)', flexShrink: 0 }} />

        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', margin: 0 }}>
          Request Details – <span style={{ fontFamily: 'ui-monospace,monospace' }}>{request.requestId}</span>
        </h1>
        <span style={{ ...STATUS_STYLE[request.status], padding: '4px 11px', borderRadius: 'var(--r-full)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {STATUS_LABEL[request.status]}
        </span>

        {/* Shipment details are editable only while the request is Pending — the detail view
            itself stays read-only, per the FRD. */}
        {request.status === 'pending' && (
          <button type="button" onClick={() => navigate(`/customer/requests/${id}/edit`)}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', flexShrink: 0, fontSize: 13.5, fontWeight: 600, color: '#1C1917', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.13s' }}>
            <Icon name={ICONS.edit} size={14} style={{ color: 'var(--text-secondary)' }} />
            Edit
          </button>
        )}
      </div>

      <div className="rd-grid">

        {/* ── Main column, in the FRD's own order ──────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

          {/* 1 — Shipment progress. Stage stepper plus the scope/progress bar the FRD asks for. */}
          <section style={{ ...CARD, padding: '18px 20px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0 }}>Shipment Progress</h2>
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                {stageIdx >= 0 ? `Stage ${stageIdx + 1} of ${STAGES.length}` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {STAGES.map((s, i) => {
                const done = i <= stageIdx
                return (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STAGES.length - 1 ? 1 : undefined }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 11, height: 11, borderRadius: '50%', flexShrink: 0,
                        background: done ? 'var(--brand-color)' : '#fff',
                        border: done ? 'none' : '2px solid rgba(0,0,0,0.16)',
                        boxShadow: i === stageIdx ? '0 0 0 4px rgba(var(--brand-rgb),0.15)' : 'none',
                      }} />
                      <span style={{ fontSize: 11.5, fontWeight: done ? 600 : 500, color: done ? '#1C1917' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{STAGE_LABEL[s]}</span>
                    </div>
                    {i < STAGES.length - 1 && <div style={{ flex: 1, height: 2, margin: '0 6px 18px', borderRadius: 2, background: i < stageIdx ? 'var(--brand-color)' : 'rgba(0,0,0,0.08)' }} />}
                  </div>
                )
              })}
            </div>

            <ProgressBar
              pct={progressPct}
              scope={services.length === 0 ? 'No services on this request' : `${services.length} service${services.length === 1 ? '' : 's'} in scope · ${doneCount} complete`}
            />
          </section>

          {/* 2 — Summary cards */}
          <div className="rd-summary">
            <SummaryCard
              icon={ICONS.container} label="Container"
              primary={request.containerNumber || '—'}
              secondary={request.containerSize ? `Size: ${request.containerSize}` : request.containerType || ''}
              mono
            />
            <SummaryCard
              icon={ICONS.ship} label="Vessel"
              primary={request.vesselLine || '—'}
              secondary={request.voyageNumber ? `Voyage ${request.voyageNumber}` : ''}
            />
            <SummaryCard
              icon={ICONS.cargo} label="Type"
              primary={shipmentTyp}
              secondary={fmtShortDate(request.collectionDate || request.createdAt)}
            />
          </div>

          {/* 3 — Service Timeline & Details */}
          <section style={{ ...CARD, padding: '18px 20px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0 }}>Service Timeline &amp; Details</h2>
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                {services.length === 0 ? 'None selected' : `${doneCount} of ${services.length} complete`}
              </span>
            </div>

            {services.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>No services on this request.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {services.map(svc => {
                  const meta        = SERVICE_META[svc.serviceKey] ?? FALLBACK_META
                  const statusStyle = STATUS_STYLE[svc.status] ?? STATUS_STYLE.pending
                  const running     = svc.status === 'in_progress'
                  const entries     = parseStoreEntries(svc.details)
                  const mailSubject = encodeURIComponent(`Request ${request.requestId} — ${meta.label}`)
                  const mailBody    = encodeURIComponent(
                    `Request: ${request.requestId}\nService: ${meta.label}\nContainer: ${request.containerNumber || '—'}\n\nMy question:\n`
                  )
                  return (
                    <article key={svc.id} style={{
                      border: `1px solid ${running ? 'rgba(var(--brand-rgb),0.30)' : 'rgba(0,0,0,0.08)'}`,
                      borderRadius: 'var(--r-md)', padding: '14px 16px',
                      background: running ? 'rgba(var(--brand-rgb),0.03)' : '#FCFCFC',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 'var(--r-sm)', background: running ? 'rgba(var(--brand-rgb),0.10)' : 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon name={meta.icon} size={15} style={{ color: running ? 'var(--brand-color)' : 'var(--text-secondary)' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14.5, fontWeight: 700, color: '#1C1917', margin: 0 }}>
                            {meta.label}{svc.subType ? ` · ${svc.subType}` : ''}
                          </p>
                          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '1px 0 0' }}>{meta.description}</p>
                        </div>
                        <span style={{ ...statusStyle, padding: '3px 9px', borderRadius: 'var(--r-full)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {STATUS_LABEL[svc.status]}
                        </span>
                      </div>

                      {running && (
                        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--brand-color)', margin: '0 0 10px' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-color)', flexShrink: 0 }} />
                          Currently in progress
                        </p>
                      )}

                      <ServiceTimeline status={svc.status} />

                      {svc.currentInfo && (
                        <div style={{ background: 'rgba(var(--brand-rgb),0.06)', borderRadius: 'var(--r-sm)', padding: '9px 11px', marginBottom: 10 }}>
                          <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--brand-color)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>Current information</p>
                          <p style={{ fontSize: 13, color: '#1C1917', margin: 0 }}>{svc.currentInfo}</p>
                        </div>
                      )}

                      {/* Container & vessel repeated per card — the FRD lists them as card-level
                          detail so each service reads on its own without scrolling back up. */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', padding: '8px 11px', marginBottom: 10, background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 'var(--r-sm)' }}>
                        <MiniFact label="Container" value={request.containerNumber} mono />
                        <MiniFact label="Size" value={request.containerSize || request.containerType} />
                        <MiniFact label="Vessel" value={request.vesselLine} />
                        <MiniFact label="Voyage" value={request.voyageNumber} mono />
                      </div>

                      {entries.length > 0 && (
                        <div style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 'var(--r-sm)', padding: '9px 11px', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {entries.map((entry, i) => (
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

                      {/* Service Details — the FRD's per-service field list, with values */}
                      {meta.fields.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 7px' }}>Service Details</p>
                          <div className="rd-details">
                            {meta.fields.map(f => {
                              const v = detailValue(svc.details, f)
                              return (
                                <div key={f} style={{ minWidth: 0 }}>
                                  <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 1px' }}>{f}</p>
                                  <p style={{ fontSize: 13, fontWeight: v ? 600 : 400, color: v ? '#1C1917' : 'var(--text-tertiary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {v ?? 'Not set'}
                                  </p>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Requirements */}
                      {meta.requirements.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 7px' }}>Requirements</p>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {meta.requirements.map(r => (
                              <span key={r} style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.04)', padding: '3px 8px', borderRadius: 'var(--r-full)', whiteSpace: 'nowrap' }}>
                                {r}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                        <Chip label="Duration" value={svc.durationLabel ?? meta.duration} />
                        <a href={`mailto:?subject=${mailSubject}&body=${mailBody}`}
                          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--brand-color)', background: 'rgba(var(--brand-rgb),0.07)', border: '1px solid rgba(var(--brand-rgb),0.22)', borderRadius: 'var(--r-full)', textDecoration: 'none', flexShrink: 0 }}>
                          <Icon name={ICONS.bell} size={12} />
                          Raise an enquiry
                        </a>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          {/* 4 — Additional Information, at the end of the screen */}
          <section style={{ ...CARD, padding: '18px 20px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: '0 0 12px' }}>Additional Information</h2>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Progress</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', fontVariantNumeric: 'tabular-nums' }}>{progressPct}%</span>
              </div>
              <Meter pct={progressPct} />
            </div>
            <DefRow label="Submitted"    value={fmtDate(request.createdAt)} />
            <DefRow label="Last Updated" value={fmtDate(request.updatedAt)} last />
          </section>
        </div>

        {/* ── Rail — data 2.4.1.3 does not name, kept so nothing captured is lost ──── */}
        <aside className="rd-rail">
          <section style={{ ...CARD, padding: '16px 18px' }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Estimated Cost</p>
            <p style={{ fontSize: 26, fontWeight: 700, color: request.estimatedCost != null ? '#1C1917' : 'var(--text-tertiary)', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
              {request.estimatedCost != null ? `$${request.estimatedCost.toFixed(2)}` : '—'}
            </p>
            {request.estimatedCost == null && (
              <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: '5px 0 0', lineHeight: 1.4 }}>Provided once your request is reviewed.</p>
            )}
          </section>

          <section style={{ ...CARD, padding: '16px 18px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', margin: '0 0 10px' }}>Shipment</h3>
            <DefRow label="Container Type" value={request.containerType} />
            <DefRow label="Voyage"         value={request.voyageNumber} mono />
            <DefRow label="Collection"     value={request.collectionDate} last />
          </section>

          <section style={{ ...CARD, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', margin: 0 }}>Out of Gauge</h3>
              <span style={{
                padding: '3px 9px', borderRadius: 'var(--r-full)', fontSize: 12, fontWeight: 600,
                background: request.isOOG ? 'rgba(234,88,12,0.10)' : 'rgba(0,0,0,0.05)',
                color: request.isOOG ? '#EA580C' : 'var(--text-secondary)',
              }}>
                {request.isOOG ? 'Yes' : 'No'}
              </span>
            </div>
            {request.isOOG && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
                {request.oogLength || '—'} × {request.oogWidth || '—'} × {request.oogHeight || '—'} cm <span style={{ color: 'var(--text-tertiary)' }}>(L×W×H)</span>
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, primary, secondary, mono }: { icon: string; label: string; primary: string; secondary?: string; mono?: boolean }) {
  return (
    <section style={{ ...CARD, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <div style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={17} style={{ color: 'var(--text-secondary)' }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>{label}</p>
        <p style={{ fontSize: 14.5, fontWeight: 700, color: '#1C1917', margin: 0, fontFamily: mono ? 'ui-monospace,monospace' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primary}</p>
        {secondary && <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secondary}</p>}
      </div>
    </section>
  )
}

function Meter({ pct }: { pct: number }) {
  return (
    <div style={{ height: 8, borderRadius: 999, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--brand-color), color-mix(in srgb, var(--brand-color) 70%, #fff))', transition: 'width 0.3s ease' }} />
    </div>
  )
}

function ProgressBar({ pct, scope }: { pct: number; scope: string }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{scope}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1C1917', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
      </div>
      <Meter pct={pct} />
    </div>
  )
}

function MiniFact({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
      {label}:{' '}
      <span style={{ fontWeight: 600, color: value ? '#1C1917' : 'var(--text-tertiary)', fontFamily: mono && value ? 'ui-monospace,monospace' : 'inherit' }}>
        {value || '—'}
      </span>
    </span>
  )
}

function DefRow({ label, value, mono, last }: { label: string; value?: string | null; mono?: boolean; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
      padding: '7px 0', borderBottom: last ? 'none' : '1px solid rgba(0,0,0,0.05)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: 13.5, fontWeight: 600, color: value ? '#1C1917' : 'var(--text-tertiary)',
        fontFamily: mono && value ? 'ui-monospace,monospace' : 'inherit',
        textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
      }}>
        {value || '—'}
      </span>
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#1C1917', background: 'rgba(0,0,0,0.05)', padding: '3px 8px', borderRadius: 'var(--r-full)', whiteSpace: 'nowrap' }}>
      {label}: <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{value}</span>
    </span>
  )
}

function ServiceTimeline({ status }: { status: ServiceStatus }) {
  const idx  = SERVICE_STAGES.indexOf(status)
  const last = SERVICE_STAGES.length - 1
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '0 0 12px' }}>
      {SERVICE_STAGES.map((s, i) => {
        const done = i <= idx
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < last ? 1 : undefined }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: done ? 'var(--brand-color)' : '#fff',
                border: done ? 'none' : '2px solid rgba(0,0,0,0.16)',
              }} />
              <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', color: done ? '#1C1917' : 'var(--text-tertiary)' }}>{STATUS_LABEL[s]}</span>
            </div>
            {i < last && <div style={{ flex: 1, height: 2, margin: '0 4px 14px', borderRadius: 2, background: i < idx ? 'var(--brand-color)' : 'rgba(0,0,0,0.08)' }} />}
          </div>
        )
      })}
    </div>
  )
}
