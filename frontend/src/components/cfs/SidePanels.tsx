import { useRef, useState } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { cfs, fmtDateTime, uploadCfsFile, type ContainerDetail, type InspectionStatus, type FumigationStatus } from '@/lib/cfs'
import { Btn, CARD, Chip, Field, Modal, PhotoThumb, SectionTitle, Select, TextArea, TextInput } from './ui'

/** Notes, photos, customer messages, compliance and the activity log for one container. */

export function CompliancePanel({ detail, onChanged }: { detail: ContainerDetail; onChanged: () => Promise<void> }) {
  const c = detail.container
  const locked = c.status === 'completed' || c.status === 'cancelled'
  const [busy, setBusy] = useState(false)
  const set = async (patch: { inspection_status?: InspectionStatus; fumigation_status?: FumigationStatus }) => {
    setBusy(true)
    try { await cfs.setCompliance(c.id, patch); await onChanged() } catch (e: any) { toast(e.message || 'Could not update', 'error') } finally { setBusy(false) }
  }
  return (
    <div style={CARD}>
      <SectionTitle>Inspection &amp; fumigation</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Field label="Inspection">
          <Select value={c.inspection_status} disabled={locked || busy} onChange={v => set({ inspection_status: v as InspectionStatus })}
            options={[{ value: 'not_required', label: 'Not required' }, { value: 'pending', label: 'Pending' }, { value: 'passed', label: 'Passed' }, { value: 'failed', label: 'Failed' }]} />
        </Field>
        <Field label="Fumigation">
          <Select value={c.fumigation_status} disabled={locked || busy} onChange={v => set({ fumigation_status: v as FumigationStatus })}
            options={[{ value: 'not_required', label: 'Not required' }, { value: 'pending', label: 'Pending' }, { value: 'completed', label: 'Completed' }, { value: 'failed', label: 'Failed' }]} />
        </Field>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>Shown on every card for this container, in every tab.</p>
    </div>
  )
}

export function NotesPanel({ detail, onChanged }: { detail: ContainerDetail; onChanged: () => Promise<void> }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    if (!text.trim()) return
    setBusy(true)
    try { await cfs.addNote(detail.container.id, text.trim()); setText(''); await onChanged() } catch (e: any) { toast(e.message || 'Could not add note', 'error') } finally { setBusy(false) }
  }
  return (
    <div style={CARD}>
      <SectionTitle>Notes</SectionTitle>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <TextArea value={text} onChange={e => setText(e.target.value)} placeholder="Add an internal note…" maxLength={2000} style={{ minHeight: 56 }} aria-label="New note" />
        <Btn variant="primary" loading={busy} disabled={!text.trim()} onClick={add}>Add</Btn>
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {detail.notes.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>No notes yet.</p>}
        {detail.notes.map(n => (
          <div key={n.id} style={{ background: '#FAFAF9', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 'var(--r-md)', padding: '8px 10px' }}>
            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{n.body}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
              <span>{n.author_name ?? 'Staff'} · {fmtDateTime(n.created_at)}</span>
              <button type="button" onClick={async () => { try { await cfs.deleteNote(n.id); await onChanged() } catch (e: any) { toast(e.message, 'error') } }}
                style={{ background: 'none', border: 'none', color: '#B91C1C', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PhotosPanel({ detail, onChanged }: { detail: ContainerDetail; onChanged: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const locked = detail.container.status === 'cancelled'
  const pick = async (list: FileList | null) => {
    if (!list?.length) return
    setUploading(true)
    try {
      for (const f of Array.from(list)) {
        try { const up = await uploadCfsFile(f, 'cfs-job'); await cfs.addPhoto(detail.container.id, up) }
        catch (e: any) { toast(e.message || `Could not upload ${f.name}`, 'error') }
      }
      await onChanged()
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }
  const tag = (s: string) => (s === 'customer' ? 'Customer' : s === 'tablet' ? 'Floor' : 'Staff')
  return (
    <div style={CARD}>
      <SectionTitle action={!locked ? <Btn small loading={uploading} onClick={() => fileRef.current?.click()}><Icon name={ICONS.camera} size={16} /> Add photo</Btn> : undefined}>Photos &amp; documents</SectionTitle>
      <input ref={fileRef} type="file" accept="image/*,.pdf" multiple hidden onChange={e => pick(e.target.files)} />
      {detail.photos.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>Nothing attached yet.</p> : (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {detail.photos.map(p => (
            <PhotoThumb key={p.id} path={p.storage_path} name={p.file_name} tag={tag(p.source)}
              onRemove={p.source === 'customer' || locked ? undefined : async () => { try { await cfs.deletePhoto(p.id); await onChanged() } catch (e: any) { toast(e.message, 'error') } }} />
          ))}
        </div>
      )}
    </div>
  )
}

export function ContactCustomerModal({ detail, onClose, onSent }: { detail: ContainerDetail; onClose: () => void; onSent: () => void }) {
  const c = detail.container
  const [subject, setSubject] = useState(`${c.container_number} — ${c.request_ref}`)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const send = async () => {
    if (!body.trim()) { setErr('Write a message'); return }
    setBusy(true); setErr(null)
    try { await cfs.message(c.id, { subject: subject.trim() || undefined, body: body.trim() }); toast('Message sent', 'success'); onSent() }
    catch (e: any) { setErr(e.message || 'Could not send'); setBusy(false) }
  }
  return (
    <Modal title={`Contact ${c.customer_name}`} onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" loading={busy} onClick={send}>Send</Btn></>}>
      <div style={{ display: 'grid', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          {c.customer_email ? <>Goes to <strong>{c.customer_email}</strong> and appears in the customer's portal.</> : 'No email on file — the message will appear in the customer\'s portal only.'}
        </p>
        <Field label="Subject"><TextInput value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} /></Field>
        <Field label="Message"><TextArea value={body} onChange={e => setBody(e.target.value)} maxLength={4000} autoFocus style={{ minHeight: 120 }} /></Field>
        {err && <p role="alert" style={{ color: '#DC2626', fontSize: 13, margin: 0 }}>{err}</p>}
      </div>
    </Modal>
  )
}

export function MessagesPanel({ detail }: { detail: ContainerDetail }) {
  if (detail.messages.length === 0) return null
  return (
    <div style={CARD}>
      <SectionTitle>Messages to customer</SectionTitle>
      <div style={{ display: 'grid', gap: 8 }}>
        {detail.messages.map(m => (
          <div key={m.id} style={{ background: '#FAFAF9', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 'var(--r-md)', padding: '8px 10px' }}>
            {m.subject && <div style={{ fontWeight: 700, fontSize: 13 }}>{m.subject}</div>}
            <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{m.body}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{m.sent_by_name ?? 'Staff'} · {fmtDateTime(m.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const ACTION_LABEL: Record<string, string> = {
  request_submitted: 'Request submitted', request_created_by_staff: 'Request created by staff', container_added: 'Container added', note_added: 'Note added', mismatches_resolved_in_bulk: 'Mismatches resolved in bulk', customer_messaged: 'Message sent to customer', request_accepted: 'Request accepted', request_declined: 'Request declined', container_edited: 'Details edited',
  manifest_refreshed: 'Manifest refreshed', mismatch_resolved: 'Mismatch resolved', shipments_saved: 'Shipments saved', manifest_confirmed: 'Manifest confirmed',
  plan_assigned: 'Plan saved', plan_removed: 'Plan removed', plan_confirmed: 'Plan confirmed', plan_recalled: 'Plan recalled',
  result_submitted: 'Result received', result_approved: 'Result approved', result_rejected: 'Result sent back', container_cancelled: 'Cancelled',
  compliance_updated: 'Inspection / fumigation updated',
}

export function ActivityPanel({ detail }: { detail: ContainerDetail }) {
  const [all, setAll] = useState(false)
  const list = all ? detail.activity : detail.activity.slice(0, 8)
  return (
    <div style={CARD}>
      <SectionTitle>Activity</SectionTitle>
      <div style={{ display: 'grid', gap: 10 }}>
        {list.map(a => (
          <div key={a.id} style={{ display: 'flex', gap: 10, fontSize: 13 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-color)', marginTop: 6, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{ACTION_LABEL[a.action] ?? a.action.replace(/_/g, ' ')}
                {typeof (a.detail as any)?.reason === 'string' && <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> — {(a.detail as any).reason}</span>}</div>
              <div style={{ color: 'var(--text-tertiary)' }}>{a.actor_name ?? 'System'} · {fmtDateTime(a.created_at)}</div>
            </div>
          </div>
        ))}
        {detail.activity.length > 8 && <Chip><button type="button" onClick={() => setAll(a => !a)} style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', padding: 0 }}>{all ? 'Show less' : `Show all ${detail.activity.length}`}</button></Chip>}
      </div>
    </div>
  )
}
