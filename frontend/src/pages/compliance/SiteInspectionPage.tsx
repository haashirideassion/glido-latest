import { useEffect, useState } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { useComplianceCapabilities } from '@/lib/useComplianceCapabilities'
import {
  getInspections, getInspectionsSummary, getInspectionChecklists, createInspection, updateInspection,
  startInspection, saveInspectionObservations, completeInspection,
} from '@/lib/db/compliance'
import type { ComplianceInspection, InspectionStatus, CompliancePriority, InspectionsSummary } from '@/data/types'
import {
  INPUT, EmptyState, ModalShell, ModalActions, FieldInput, FieldTextarea, FieldSelect,
} from '@/components/compliance/FormControls'

const STATUS_FILTERS: [InspectionStatus | 'all', string][] = [['all', 'All'], ['scheduled', 'Scheduled'], ['in_progress', 'In Progress'], ['completed', 'Completed']]
const STATUS_COLOR: Record<string, { fg: string; bg: string; icon: string }> = {
  scheduled:   { fg: '#2563EB', bg: 'rgba(37,99,235,0.10)', icon: ICONS.calendar },
  in_progress: { fg: '#D97706', bg: 'rgba(217,119,6,0.10)', icon: ICONS.inProgress },
  completed:   { fg: '#16A34A', bg: 'rgba(22,163,74,0.10)', icon: ICONS.checkSquare },
  overdue:     { fg: '#DC2626', bg: 'rgba(220,38,38,0.10)', icon: ICONS.siren },
}
const STATUS_LABEL: Record<string, string> = { scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed', overdue: 'Overdue' }
const PRIORITY_COLOR: Record<CompliancePriority, string> = { high: '#DC2626', medium: '#D97706', low: '#78716C' }

function fmtDateTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })} at ${d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })}`
}

export default function SiteInspectionPage() {
  usePageTitle('Glido | Site Inspection')
  const { caps } = useComplianceCapabilities()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<InspectionStatus | 'all'>('all')
  const [date, setDate] = useState('')
  const [rows, setRows] = useState<ComplianceInspection[]>([])
  const [summary, setSummary] = useState<InspectionsSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [editRow, setEditRow] = useState<ComplianceInspection | null>(null)
  const [detailsRow, setDetailsRow] = useState<ComplianceInspection | null>(null)
  const [executeRow, setExecuteRow] = useState<ComplianceInspection | null>(null)

  const load = () => {
    setIsLoading(true); setFailed(false)
    Promise.all([
      getInspections({ search: search.length >= 3 ? search : undefined, status, date: date || undefined }),
      getInspectionsSummary(),
    ]).then(([rows, summary]) => { setRows(rows); setSummary(summary); setIsLoading(false) })
      .catch(() => { setFailed(true); setIsLoading(false) })
  }
  useEffect(() => { load() }, [search, status, date])

  const handleStart = async (row: ComplianceInspection) => {
    const updated = await startInspection(row.id).catch(() => null)
    if (updated) { toast('Inspection started', 'success'); setExecuteRow(updated); load() } else toast('Failed to start inspection', 'error')
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <Icon name={ICONS.search} size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search inspections…" style={{ ...INPUT, paddingLeft: 36 }} />
        </div>
        <div style={{ position: 'relative' }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...INPUT, width: 160 }} />
        </div>
        {date && <button onClick={() => setDate('')} style={{ background: 'none', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', padding: '9px 12px', fontSize: 13, cursor: 'pointer' }}>Clear</button>}
        {caps.can_schedule_inspection && (
          <button onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--brand-color)', color: 'var(--brand-text)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            <Icon name={ICONS.add} size={16} /> Add Schedule Inspection
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--card-gap)', marginBottom: 18 }}>
        {[
          { label: 'This Week', value: summary?.thisWeek ?? 0, color: '#2563EB' },
          { label: 'In Progress', value: summary?.inProgress ?? 0, color: '#D97706' },
          { label: 'Completed', value: summary?.completed ?? 0, color: '#16A34A' },
          { label: 'Overdue', value: summary?.overdue ?? 0, color: '#DC2626' },
        ].map(m => (
          <div key={m.label} style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderLeft: `3px solid ${m.color}`, borderRadius: 'var(--r-lg)', padding: 'var(--card-pad)' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 6px' }}>{m.label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, color: '#1C1917', margin: 0 }}>{m.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map(([v, l]) => (
          <button key={v} onClick={() => setStatus(v)}
            style={{ padding: '7px 16px', borderRadius: 'var(--r-full)', border: '1px solid ' + (status === v ? 'var(--brand-color)' : 'rgba(0,0,0,0.10)'), background: status === v ? 'var(--brand-color)' : '#FFFFFF', color: status === v ? 'var(--brand-text)' : '#44403C', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {l}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map(i => <div key={i} style={{ height: 130, borderRadius: 'var(--r-lg)', background: '#F3F3F2' }} />)}
        </div>
      ) : failed ? (
        <EmptyState icon={ICONS.warning} text="Couldn't load inspections." action={{ label: 'Retry', onClick: load }} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ICONS.shield} text="No inspections found." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(row => {
            const sc = STATUS_COLOR[row.status] ?? STATUS_COLOR.scheduled
            return (
              <div key={row.id} style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <Icon name={sc.icon} size={16} style={{ color: sc.fg }} />
                      <p style={{ fontSize: 15.5, fontWeight: 700, color: '#1C1917', margin: 0 }}>{row.title}</p>
                      <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-full)', color: sc.fg, background: sc.bg }}>{STATUS_LABEL[row.status]}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: PRIORITY_COLOR[row.priority] }}>{row.priority[0].toUpperCase() + row.priority.slice(1)} Priority</span>
                    </div>
                    {row.description && <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: '0 0 8px' }}>{row.description}</p>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                      <span>📅 {fmtDateTime(row.scheduledAt)}</span>
                      {row.location && <span>📍 {row.location}</span>}
                      {row.inspectorName && <span>Inspector: {row.inspectorName}</span>}
                      {row.inspectionType && <span>{row.inspectionType}</span>}
                    </div>
                    {row.checklistItems.length > 0 && (
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>Inspection Checklist:</p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {row.checklistItems.map(item => <span key={item} style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 'var(--r-full)', background: 'rgba(0,0,0,0.06)', color: '#44403C' }}>{item}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setDetailsRow(row)} style={{ fontSize: 12.5, fontWeight: 600, border: '1px solid rgba(0,0,0,0.12)', background: '#FFF', borderRadius: 'var(--r-sm)', padding: '6px 14px', cursor: 'pointer' }}>View Details</button>
                    {caps.can_edit_inspection && (row.status === 'scheduled' || row.status === 'overdue' || row.status === 'in_progress') && (
                      <button onClick={() => setEditRow(row)} style={{ fontSize: 12.5, fontWeight: 600, border: '1px solid rgba(0,0,0,0.12)', background: '#FFF', borderRadius: 'var(--r-sm)', padding: '6px 14px', cursor: 'pointer' }}>Edit</button>
                    )}
                    {caps.can_start_inspection && (row.status === 'scheduled' || row.status === 'overdue') && (
                      <button onClick={() => handleStart(row)} style={{ fontSize: 12.5, fontWeight: 600, border: 'none', background: 'var(--brand-color)', color: 'var(--brand-text)', borderRadius: 'var(--r-sm)', padding: '6px 14px', cursor: 'pointer' }}>Start Inspection</button>
                    )}
                    {row.status === 'in_progress' && (
                      <button onClick={() => setExecuteRow(row)} style={{ fontSize: 12.5, fontWeight: 600, border: 'none', background: '#D97706', color: '#fff', borderRadius: 'var(--r-sm)', padding: '6px 14px', cursor: 'pointer' }}>Continue</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showNew && <InspectionFormModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load() }} />}
      {editRow && <InspectionFormModal existing={editRow} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); load() }} />}
      {detailsRow && <InspectionDetailsModal row={detailsRow} onClose={() => setDetailsRow(null)} />}
      {executeRow && <InspectionExecutionModal row={executeRow} onClose={() => setExecuteRow(null)} onDone={() => { setExecuteRow(null); load() }} />}
    </>
  )
}

function InspectionFormModal({ existing, onClose, onSaved }: { existing?: ComplianceInspection; onClose: () => void; onSaved: () => void }) {
  const [checklists, setChecklists] = useState<Record<string, string[]>>({})
  useEffect(() => { getInspectionChecklists().then(setChecklists) }, [])

  const [form, setForm] = useState({
    title: existing?.title ?? '', description: existing?.description ?? '',
    inspection_type: existing?.inspectionType ?? '', location: existing?.location ?? '',
    inspector_name: existing?.inspectorName ?? '', scheduled_at: existing?.scheduledAt ? existing.scheduledAt.slice(0, 16) : '',
    priority: existing?.priority ?? 'medium' as CompliancePriority,
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.title.trim()) { toast('Title is required', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        title: form.title, description: form.description || undefined, inspection_type: form.inspection_type || undefined,
        location: form.location || undefined, inspector_name: form.inspector_name || undefined,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : undefined, priority: form.priority,
      }
      const result = existing ? await updateInspection(existing.id, payload) : await createInspection(payload)
      if (result) { toast(existing ? 'Inspection updated' : 'Inspection scheduled', 'success'); onSaved() }
      else toast('Failed to save inspection', 'error')
    } finally { setSaving(false) }
  }

  const typeOptions: [string, string][] = [['', 'Select type…'], ...Object.keys(checklists).map(k => [k, k] as [string, string])]

  return (
    <ModalShell title={existing ? 'Edit Inspection' : 'Schedule Inspection'} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FieldInput label="Title *" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} full />
        <FieldSelect label="Inspection Type" value={form.inspection_type} onChange={v => setForm(f => ({ ...f, inspection_type: v }))} options={typeOptions} />
        <FieldSelect label="Priority" value={form.priority} onChange={v => setForm(f => ({ ...f, priority: v as CompliancePriority }))} options={[['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} />
        <FieldInput label="Location" value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} />
        <FieldInput label="Inspector Name" value={form.inspector_name} onChange={v => setForm(f => ({ ...f, inspector_name: v }))} />
        <FieldInput label="Scheduled Date & Time" type="datetime-local" value={form.scheduled_at} onChange={v => setForm(f => ({ ...f, scheduled_at: v }))} full />
        <FieldTextarea label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} full />
      </div>
      {form.inspection_type && checklists[form.inspection_type] && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>System-derived checklist for this type:</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {checklists[form.inspection_type].map(item => <span key={item} style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 'var(--r-full)', background: 'rgba(0,0,0,0.06)', color: '#44403C' }}>{item}</span>)}
          </div>
        </div>
      )}
      <ModalActions onClose={onClose} onSubmit={submit} saving={saving} submitLabel={existing ? 'Save Changes' : 'Schedule Inspection'} />
    </ModalShell>
  )
}

function InspectionDetailsModal({ row, onClose }: { row: ComplianceInspection; onClose: () => void }) {
  const sc = STATUS_COLOR[row.status] ?? STATUS_COLOR.scheduled
  return (
    <ModalShell title="Inspection Details" onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-color)' }}>{row.inspectionCode}</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-full)', color: sc.fg, background: sc.bg }}>{STATUS_LABEL[row.status]}</span>
      </div>
      <p style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', margin: '0 0 14px' }}>{row.title}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', fontSize: 13.5, marginBottom: 14 }}>
        <div><p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '0 0 2px', textTransform: 'uppercase' }}>Scheduled</p><p style={{ margin: 0, fontWeight: 500 }}>{fmtDateTime(row.scheduledAt)}</p></div>
        <div><p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '0 0 2px', textTransform: 'uppercase' }}>Location</p><p style={{ margin: 0, fontWeight: 500 }}>{row.location || '—'}</p></div>
        <div><p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '0 0 2px', textTransform: 'uppercase' }}>Inspector</p><p style={{ margin: 0, fontWeight: 500 }}>{row.inspectorName || '—'}</p></div>
        <div><p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '0 0 2px', textTransform: 'uppercase' }}>Type</p><p style={{ margin: 0, fontWeight: 500 }}>{row.inspectionType || '—'}</p></div>
      </div>
      {row.description && <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>{row.description}</p>}
      {row.checklistItems.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 8px' }}>Checklist Observations</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {row.checklistItems.map(item => (
              <div key={item} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 10px', background: 'rgba(0,0,0,0.03)', borderRadius: 'var(--r-sm)', fontSize: 13 }}>
                <span style={{ fontWeight: 500 }}>{item}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{row.checklistObservations[item] || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button onClick={onClose} style={{ background: 'rgba(0,0,0,0.06)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 20px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Close</button>
      </div>
    </ModalShell>
  )
}

function InspectionExecutionModal({ row, onClose, onDone }: { row: ComplianceInspection; onClose: () => void; onDone: () => void }) {
  const [observations, setObservations] = useState<Record<string, string>>(row.checklistObservations ?? {})
  const [saving, setSaving] = useState(false)

  const saveDraft = async () => {
    setSaving(true)
    try { await saveInspectionObservations(row.id, observations); toast('Observations saved', 'success') }
    catch { toast('Failed to save observations', 'error') }
    finally { setSaving(false) }
  }

  const complete = async () => {
    setSaving(true)
    try {
      await saveInspectionObservations(row.id, observations)
      const result = await completeInspection(row.id)
      if (result) { toast('Inspection completed', 'success'); onDone() } else toast('Failed to complete inspection', 'error')
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title={`Inspection Execution — ${row.title}`} onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>Record an observation for each checklist item, then mark the inspection complete.</p>
      {row.checklistItems.length === 0 ? (
        <p style={{ fontSize: 13.5, color: 'var(--text-tertiary)' }}>No checklist items configured for this inspection type.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {row.checklistItems.map(item => (
            <div key={item}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#1C1917', marginBottom: 5 }}>{item}</label>
              <input value={observations[item] ?? ''} onChange={e => setObservations(o => ({ ...o, [item]: e.target.value }))} placeholder="Observation notes…" style={INPUT} />
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={{ background: 'rgba(0,0,0,0.06)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Close</button>
        <button onClick={saveDraft} disabled={saving} style={{ background: '#FFF', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', padding: '9px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Save Draft</button>
        <button onClick={complete} disabled={saving} style={{ background: 'var(--brand-color)', color: 'var(--brand-text)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 20px', fontSize: 13.5, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Mark Completed'}</button>
      </div>
    </ModalShell>
  )
}
