import { useEffect, useState } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { useComplianceCapabilities } from '@/lib/useComplianceCapabilities'
import {
  getMyActivities, createActivity, updateActivity, cancelActivity,
  type CreateActivityPayload,
} from '@/lib/db/compliance'
import type { ComplianceActivity, ShipmentType } from '@/data/types'
import {
  INPUT, EmptyState, MenuItem, ModalShell, ModalActions, DetailRow,
  FieldInput, FieldTextarea, FieldSelect, Field, DetailSlideOver, SlideOverHeader,
} from '@/components/compliance/FormControls'

const STATUS_COLOR: Record<string, { fg: string; bg: string }> = {
  in_transit: { fg: '#16A34A', bg: 'rgba(22,163,74,0.10)' },
  received:   { fg: '#57534E', bg: 'rgba(87,83,78,0.10)' },
  completed:  { fg: '#78716C', bg: 'rgba(120,113,108,0.10)' },
  cancelled:  { fg: '#DC2626', bg: 'rgba(220,38,38,0.10)' },
}
const STATUS_LABEL: Record<string, string> = { in_transit: 'In Transit', received: 'Received', completed: 'Completed', cancelled: 'Cancelled' }

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit' })
}
function fmtTime(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function MyActivitiesPage() {
  usePageTitle('Glido | My Activities')
  const { caps } = useComplianceCapabilities()

  const [tab, setTab] = useState<ShipmentType>('fcl')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<ComplianceActivity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [editRow, setEditRow] = useState<ComplianceActivity | null>(null)
  const [detailsRow, setDetailsRow] = useState<ComplianceActivity | null>(null)
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true))
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const load = () => {
    setIsLoading(true); setFailed(false)
    getMyActivities({ shipment_type: tab, search: search.length >= 3 ? search : undefined })
      .then(rows => { setRows(rows); setIsLoading(false) })
      .catch(() => { setFailed(true); setIsLoading(false) })
  }
  useEffect(() => { load() }, [tab, search])

  const handleCancel = async (row: ComplianceActivity) => {
    if (!confirm(`Cancel activity ${row.entryNumber}?`)) return
    const updated = await cancelActivity(row.id).catch(() => null)
    if (updated) { toast('Activity cancelled', 'success'); load() } else toast('Failed to cancel activity', 'error')
    setMenuFor(null)
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Icon name={ICONS.search} size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by entry number, container, vessel"
            style={{ ...INPUT, paddingLeft: 36 }} />
        </div>
        {caps.can_create_activity && (
          <button onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--brand-color)', color: 'var(--brand-text)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            <Icon name={ICONS.add} size={16} /> New Activity
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {(['fcl', 'lcl'] as ShipmentType[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 18px', borderRadius: 'var(--r-full)', border: '1px solid ' + (tab === t ? 'var(--brand-color)' : 'rgba(0,0,0,0.10)'), background: tab === t ? 'var(--brand-color)' : '#FFFFFF', color: tab === t ? 'var(--brand-text)' : '#44403C', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            {t.toUpperCase()} Inspection
          </button>
        ))}
      </div>

      {/* Split view: list (left) + docked detail pane (right) on wide screens */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map(i => <div key={i} style={{ height: 96, borderRadius: 'var(--r-lg)', background: '#F3F3F2' }} />)}
        </div>
      ) : failed ? (
        <EmptyState icon={ICONS.warning} text="Couldn't load activities." action={{ label: 'Retry', onClick: load }} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ICONS.clipboard} text="No activities found." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(row => {
            const sc = STATUS_COLOR[row.status] ?? STATUS_COLOR.in_transit
            return (
              <div key={row.id} style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-color)' }}>{row.entryNumber}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-full)', color: sc.fg, background: sc.bg }}>{STATUS_LABEL[row.status]}</span>
                    </div>
                    <p style={{ fontSize: 15.5, fontWeight: 700, color: '#1C1917', margin: '0 0 8px' }}>{row.title}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 22px', fontSize: 13 }}>
                      <Field label="Request" value={row.requestNumber || '—'} />
                      <Field label="Container" value={row.containerNumber ? `${row.containerNumber}${row.containerType ? ` (${row.containerType})` : ''}` : '—'} icon={ICONS.container} />
                      <Field label="Vessel" value={row.vesselName ? `${row.vesselName}${row.voyageNumber ? ` · Voyage ${row.voyageNumber}` : ''}` : '—'} icon={ICONS.ship} />
                      <Field label="Collection" value={`${fmtDate(row.collectionDate)} ${row.collectionDate ? 'at ' + fmtTime(row.collectionDate) : ''}`} icon={ICONS.clock} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <div style={{ position: 'relative' }}>
                      <button onClick={() => setMenuFor(menuFor === row.id ? null : row.id)} style={{ width: 30, height: 30, border: 'none', background: 'rgba(0,0,0,0.04)', borderRadius: 'var(--r-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={ICONS.ellipsis} size={16} style={{ color: '#57534E' }} />
                      </button>
                      {menuFor === row.id && (
                        <>
                          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuFor(null)} />
                          <div style={{ position: 'absolute', right: 0, top: 34, zIndex: 41, width: 176, background: '#FFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                            <MenuItem label="View Details" onClick={() => { setDetailsRow(row); setMenuFor(null) }} />
                            {caps.can_edit_activity && row.status !== 'completed' && row.status !== 'cancelled' && (
                              <MenuItem label="Edit Activity" onClick={() => { setEditRow(row); setMenuFor(null) }} />
                            )}
                            {caps.can_cancel_activity && row.status !== 'completed' && row.status !== 'cancelled' && (
                              <MenuItem label="Cancel Activity" danger onClick={() => handleCancel(row)} />
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    <button onClick={() => setDetailsRow(row)} style={{ width: 30, height: 30, border: 'none', background: 'rgba(0,0,0,0.04)', borderRadius: 'var(--r-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={ICONS.arrowRight} size={16} style={{ color: '#57534E' }} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      </div>{/* end list column */}

      {/* Docked detail pane — split view (wide screens) */}
      {detailsRow && isWide && (
        <div style={{ width: 460, flexShrink: 0, position: 'sticky', top: 12, height: 'calc(100vh - var(--dash-header-h) - 24px)', minHeight: 'calc(100vh - var(--dash-header-h) - 24px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ActivityDetailsPanel row={detailsRow} onClose={() => setDetailsRow(null)} docked />
        </div>
      )}
      </div>{/* end split row */}

      {showNew && <ActivityFormModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load() }} />}
      {editRow && <ActivityFormModal existing={editRow} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); load() }} />}

      {/* Detail overlay — narrow screens */}
      {detailsRow && !isWide && <ActivityDetailsPanel row={detailsRow} onClose={() => setDetailsRow(null)} />}
    </>
  )
}

function ActivityFormModal({ existing, onClose, onSaved }: { existing?: ComplianceActivity; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: existing?.title ?? '', entry_number: existing?.entryNumber ?? '',
    request_number: existing?.requestNumber ?? '', container_number: existing?.containerNumber ?? '',
    container_type: existing?.containerType ?? '', vessel_name: existing?.vesselName ?? '',
    voyage_number: existing?.voyageNumber ?? '', shipment_type: existing?.shipmentType ?? 'fcl' as ShipmentType,
    collection_date: existing?.collectionDate ? existing.collectionDate.slice(0, 16) : '',
    description: existing?.description ?? '', status: existing?.status ?? 'in_transit',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.title.trim()) { toast('Title is required', 'error'); return }
    setSaving(true)
    try {
      const payload: CreateActivityPayload = {
        title: form.title, entry_number: form.entry_number || undefined, request_number: form.request_number || undefined,
        container_number: form.container_number || undefined, container_type: form.container_type || undefined,
        vessel_name: form.vessel_name || undefined, voyage_number: form.voyage_number || undefined,
        shipment_type: form.shipment_type, collection_date: form.collection_date ? new Date(form.collection_date).toISOString() : undefined,
        description: form.description || undefined,
      }
      const result = existing ? await updateActivity(existing.id, { ...payload, status: form.status as any }) : await createActivity(payload)
      if (result) { toast(existing ? 'Activity updated' : 'Activity created', 'success'); onSaved() }
      else toast('Failed to save activity', 'error')
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title={existing ? 'Edit Activity' : 'New Activity'} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FieldInput label="Title *" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} full />
        <FieldInput label="Entry Number" value={form.entry_number} onChange={v => setForm(f => ({ ...f, entry_number: v }))} placeholder="Auto-generated if blank" disabled={!!existing} />
        <FieldSelect label="Shipment Type" value={form.shipment_type} onChange={v => setForm(f => ({ ...f, shipment_type: v as ShipmentType }))} options={[['fcl', 'FCL'], ['lcl', 'LCL']]} />
        <FieldInput label="Request Number" value={form.request_number} onChange={v => setForm(f => ({ ...f, request_number: v }))} />
        <FieldInput label="Container Number" value={form.container_number} onChange={v => setForm(f => ({ ...f, container_number: v }))} />
        <FieldInput label="Container Type" value={form.container_type} onChange={v => setForm(f => ({ ...f, container_type: v }))} placeholder="e.g. 20GP, 40HC" />
        <FieldInput label="Vessel Name" value={form.vessel_name} onChange={v => setForm(f => ({ ...f, vessel_name: v }))} />
        <FieldInput label="Voyage Number" value={form.voyage_number} onChange={v => setForm(f => ({ ...f, voyage_number: v }))} />
        <FieldInput label="Collection Date & Time" type="datetime-local" value={form.collection_date} onChange={v => setForm(f => ({ ...f, collection_date: v }))} />
        {existing && (
          <FieldSelect label="Status" value={form.status} onChange={v => setForm(f => ({ ...f, status: v as typeof f.status }))} options={[['in_transit', 'In Transit'], ['received', 'Received'], ['completed', 'Completed']]} />
        )}
        <FieldTextarea label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} full />
      </div>
      <ModalActions onClose={onClose} onSubmit={submit} saving={saving} submitLabel={existing ? 'Save Changes' : 'Create Activity'} />
    </ModalShell>
  )
}

function ActivityDetailsPanel({ row, onClose, docked }: { row: ComplianceActivity; onClose: () => void; docked?: boolean }) {
  const sc = STATUS_COLOR[row.status] ?? STATUS_COLOR.in_transit
  const badge = <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-full)', color: sc.fg, background: sc.bg, flexShrink: 0 }}>{STATUS_LABEL[row.status]}</span>
  return (
    <DetailSlideOver docked={docked} onClose={onClose}>
      <SlideOverHeader title={row.entryNumber} badge={badge} onClose={onClose} />
      <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
        <p style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', margin: '0 0 14px' }}>{row.title}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', fontSize: 13.5 }}>
          <DetailRow label="Request Number" value={row.requestNumber} />
          <DetailRow label="Shipment Type" value={row.shipmentType.toUpperCase()} />
          <DetailRow label="Container" value={row.containerNumber ? `${row.containerNumber} (${row.containerType || '—'})` : undefined} />
          <DetailRow label="Vessel" value={row.vesselName} />
          <DetailRow label="Voyage" value={row.voyageNumber} />
          <DetailRow label="Collection Date" value={row.collectionDate ? `${fmtDate(row.collectionDate)} at ${fmtTime(row.collectionDate)}` : undefined} />
          {row.status === 'completed' && <>
            <DetailRow label="Completed Date" value={row.completedDate ? fmtDate(row.completedDate) : undefined} />
            <DetailRow label="Completed By" value={row.completedByName ?? undefined} />
            <DetailRow label="Assigned By" value={row.assignedByName ?? undefined} />
            <DetailRow label="Category" value={row.category} />
            <DetailRow label="Quality Rating" value={row.qualityRating != null ? `${row.qualityRating} / 5` : undefined} />
          </>}
        </div>
        {row.description && <p style={{ marginTop: 16, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{row.description}</p>}
        {row.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {row.tags.map(t => <span key={t} style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 'var(--r-full)', background: 'rgba(0,0,0,0.06)', color: '#44403C' }}>{t}</span>)}
          </div>
        )}
      </div>
    </DetailSlideOver>
  )
}
