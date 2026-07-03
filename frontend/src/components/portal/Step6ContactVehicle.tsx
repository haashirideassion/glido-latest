import { useRef, useState } from 'react'
import { useWizard } from '@/contexts/WizardContext'
import type { DocumentFile } from '@/contexts/WizardContext'
import { Icon, ICONS } from '@/lib/Icon'
import documentsImg from '@/assets/documents.png'
import { rawFetcher } from '@/lib/fetcher'
import { openSignedUrl } from '@/lib/useSignedUrl'
import { toast } from '@/lib/toast'
import { todaySydney } from '@/lib/time'

// ─── Document slot definitions per combination ────────────────────────────────

interface DocSlot { docType: string; label: string; required: boolean; badge?: string; acceptAttr?: string; helpText?: string }

// Convert "PDF, JPG, PNG" → ".pdf,.jpg,.jpeg,.png"
function toAccept(fileTypes: string): string {
  return fileTypes.split(',').map(t => {
    const ext = t.trim().toLowerCase()
    if (ext === 'pdf')               return '.pdf'
    if (ext === 'jpg' || ext === 'jpeg') return '.jpg,.jpeg'
    if (ext === 'png')               return '.png'
    if (ext === 'docx')              return '.docx'
    return '.' + ext
  }).join(',')
}

const DOC_SLOTS: Record<string, DocSlot[]> = {
  'pickup-lcl': [
    { docType: 'delivery_order',    label: 'Delivery Order',                             required: true,  acceptAttr: '.pdf',                   helpText: 'PDF only · Max 10 MB' },
    { docType: 'biosecurity',       label: 'Biosecurity Direction (if required)',          required: false, acceptAttr: '.pdf,.jpg,.jpeg,.png',    helpText: 'PDF, JPG, PNG · Max 10 MB' },
  ],
  'dropoff-lcl': [
    { docType: 'interim_receipt',      label: 'Interim Receipt',              required: true,  acceptAttr: '.pdf,.jpg,.jpeg,.png,.docx', helpText: 'PDF, JPG, PNG, DOCX · Max 10 MB' },
    { docType: 'booking_confirmation', label: 'Booking Confirmation',         required: true,  acceptAttr: '.pdf',                helpText: 'PDF only · Max 10 MB' },
    { docType: 'packing_list',         label: 'Packing List (not mandatory)', required: false, acceptAttr: '.pdf,.jpg,.jpeg,.png', helpText: 'PDF, JPG, PNG · Max 10 MB' },
  ],
  'pickup-fcl': [
    { docType: 'cartage_advice',   label: 'Cartage Advice',                              required: true,  acceptAttr: '.pdf',                helpText: 'PDF only · Max 10 MB' },
    { docType: 'delivery_order',   label: 'Delivery Order',                              required: true,  acceptAttr: '.pdf',                helpText: 'PDF only · Max 10 MB' },
    { docType: 'dangerous_goods',  label: 'Dangerous Goods Docs (if required)',           required: false, acceptAttr: '.pdf',                helpText: 'PDF only · Max 10 MB' },
  ],
  'dropoff-fcl': [
    { docType: 'cartage_advice',   label: 'Cartage Advice',                              required: true,  acceptAttr: '.pdf',                    helpText: 'PDF only · Max 10 MB' },
    { docType: 'delivery_order',   label: 'Delivery Order',                              required: true,  acceptAttr: '.pdf',                    helpText: 'PDF only · Max 10 MB' },
    { docType: 'dangerous_goods',  label: 'Dangerous Goods Docs (if required)',           required: false, acceptAttr: '.pdf',                    helpText: 'PDF only · Max 10 MB' },
    { docType: 'biosecurity',      label: 'Biosecurity Direction (if required)',          required: false, acceptAttr: '.pdf,.jpg,.jpeg,.png',    helpText: 'PDF, JPG, PNG · Max 10 MB' },
  ],
}

export function Step6ContactVehicle() {
  const { state, dispatch } = useWizard()
  const multi = state.slotCount > 1

  // ── Resolve doc slots for a given combo ──────────────────────────────────────
  const ALWAYS_REQUIRED = ['interim_receipt', 'interim receipt', 'delivery_order', 'delivery order', 'booking_confirmation', 'booking confirmation', 'cartage_advice', 'cartage advice']

  function resolveDocSlots(serviceType: string, loadType: string): DocSlot[] {
    const comboCode = `${serviceType}_${loadType}`
    const comboKey  = `${serviceType}-${loadType}`
    if (state.tenantDocs && state.tenantDocs.length > 0) {
      // 1. Filter to combo first
      const filtered = state.tenantDocs.filter(d => !d.appliesTo || d.appliesTo.length === 0 || d.appliesTo.includes(comboCode))
      const list = filtered.length > 0 ? filtered : state.tenantDocs
      // 2. Deduplicate AFTER filtering, keeping first occurrence per id
      const uniqueDocs = list.filter(
        (doc, index, self) => index === self.findIndex(d => d.id === doc.id)
      )
      // 3. Map to DocSlot, overriding required for known doc types
      return uniqueDocs.map(d => {
        const isRequired = ALWAYS_REQUIRED.includes(d.id?.toLowerCase()) || ALWAYS_REQUIRED.includes(d.name?.toLowerCase()) || d.required
        return {
          docType:    d.id,
          label:      d.name,
          required:   isRequired,
          acceptAttr: toAccept(
            Array.isArray(d.fileTypes)
              ? (d.fileTypes.filter(Boolean).length > 0 ? d.fileTypes.join(', ') : 'PDF')
              : (typeof d.fileTypes === 'string' && d.fileTypes.trim() ? d.fileTypes : 'PDF')
          ),
          helpText:   (() => {
            const raw = Array.isArray(d.fileTypes) ? d.fileTypes : (d.fileTypes as unknown as string ?? '')
            const types = Array.isArray(raw)
              ? raw.filter(Boolean)
              : raw.split(',').map((t: string) => t.trim()).filter(Boolean)
            const labels = types.length > 0
              ? types.map((t: string) => t.toUpperCase()).join(', ')
              : 'PDF'
            return `${labels} · Max 10 MB`
          })(),
        }
      })
    }
    return DOC_SLOTS[comboKey] ?? DOC_SLOTS['pickup-lcl']
  }

  // Single-slot: uses top-level state.documentFiles + ADD_DOCUMENT/REMOVE_DOCUMENT
  const [dragging,   setDragging]  = useState(false)
  const [uploading,  setUploading] = useState<Record<string, boolean>>({})
  const generalInputRef = useRef<HTMLInputElement>(null)
  const slotInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const uploadFileSingle = async (file: File, docType: string) => {
    const slot = slots.find(s => s.docType === docType)
    if (slot?.acceptAttr) {
      const allowed = slot.acceptAttr.split(',').map(e => e.trim().replace('.', '').toLowerCase())
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!allowed.includes(ext)) {
        toast(`Invalid file type. Allowed: ${slot.acceptAttr.replace(/\./g, '').toUpperCase()}`, 'error')
        return
      }
    }
    const date = todaySydney()
    const sanitizeFilename = (name: string) =>
      name
        .normalize('NFC')
        .replace(/[^\x20-\x7E]/g, '_')   // strip non-ASCII (catches   narrow no-break space)
        .replace(/\s+/g, '_')             // spaces → underscore
        .replace(/[^a-zA-Z0-9._\-]/g, '_') // any remaining special chars → underscore
        .replace(/_+/g, '_')              // collapse multiple underscores
        .replace(/^_|_$/, '')             // trim edges
    const safeName = sanitizeFilename(file.name)
    const path = `${date}/${docType}/${safeName}`
    setUploading(u => ({ ...u, [docType]: true }))
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('path', path)
      const res = await rawFetcher('/api/uploads', { method: 'POST', body: formData })
      if (!res || !res.ok) throw new Error('Upload failed')
      const json = await res.json()
      const storagePath = json?.data?.filename ?? path
      dispatch({ type: 'ADD_DOCUMENT', doc: { name: file.name, size: file.size, docType, storagePath } })
    } catch { toast('Upload failed. Please try again.', 'error') }
    finally { setUploading(u => ({ ...u, [docType]: false })) }
  }

  // ── Multi-slot: render one DocSection per slot ────────────────────────────────
  if (multi) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src={documentsImg} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>Documents</h2>
            <p style={{ fontSize: 15, color: '#4F4F4F', lineHeight: 1.5, margin: '4px 0 0' }}>Upload the required documents for each booking slot.</p>
          </div>
        </div>
        {state.slotConfigs.map(cfg => (
          <div key={cfg.index} style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
              Slot {cfg.index} — {cfg.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'} · {(cfg.loadType ?? '').toUpperCase()}
            </p>
            <SlotDocSection
              slotIndex={cfg.index}
              docFiles={cfg.documentFiles}
              docSlots={resolveDocSlots(cfg.serviceType ?? 'pickup', cfg.loadType ?? 'lcl')}
              onAdd={(doc) => {
                const existing = cfg.documentFiles ?? []
                const updated = existing.find(d => d.name === doc.name) ? existing : [...existing, doc]
                dispatch({ type: 'SET_SLOT_DETAIL', slotIndex: cfg.index, field: 'documentFiles', value: updated })
              }}
              onRemove={(name) => {
                const existing = cfg.documentFiles ?? []
                dispatch({ type: 'SET_SLOT_DETAIL', slotIndex: cfg.index, field: 'documentFiles', value: existing.filter(d => d.name !== name) })
              }}
            />
          </div>
        ))}
      </div>
    )
  }

  // ── Single-slot UI (unchanged) ────────────────────────────────────────────────
  const serviceType = state.slotConfigs?.[0]?.serviceType ?? state.serviceType ?? 'pickup'
  const loadType    = state.slotConfigs?.[0]?.loadType    ?? state.loadType    ?? 'lcl'
  const slots       = resolveDocSlots(serviceType, loadType)

  const filesForSlot = (docType: string) => state.documentFiles.filter(d => d.docType === docType)
  const hasSlot      = (docType: string) => filesForSlot(docType).length > 0
  const missingRequired = slots.filter(s => s.required && !hasSlot(s.docType))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src={documentsImg} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
        </div>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>Documents</h2>
          <p style={{ fontSize: 15, color: '#4F4F4F', lineHeight: 1.5, margin: '4px 0 0' }}>Upload the required documents for your booking. Required documents must be uploaded before you can continue.</p>
        </div>
      </div>

      {/* ── Per-combination document slots ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {slots
          .filter((slot, i, arr) => arr.findIndex(s => s.docType === slot.docType) === i)
          .map(slot => {
          const uploaded    = filesForSlot(slot.docType)
          const isMissing   = slot.required && uploaded.length === 0
          const isUploaded  = uploaded.length > 0

          return (
            <div key={slot.docType} style={{ background: '#fff', border: `1.5px solid ${isMissing ? '#EF4444' : isUploaded ? 'rgba(34,197,94,0.35)' : 'rgba(0,0,0,0.08)'}`, borderRadius: 'var(--r-lg)', padding: '14px 16px', transition: 'border-color 0.15s ease' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 'var(--r-full)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: isUploaded ? 'rgba(34,197,94,0.14)' : 'rgba(0,0,0,0.05)', color: isUploaded ? '#22C55E' : '#A8A29E', transition: 'all 0.15s' }}>
                      <Icon name={ICONS.check} size={12} />
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#1C1917' }}>{slot.label}</span>
                    {slot.required
                      ? <span style={{ fontSize: 13, fontWeight: 600, color: isMissing ? '#EF4444' : '#78716C', background: isMissing ? 'rgba(239,68,68,0.08)' : 'transparent', padding: isMissing ? '2px 6px' : 0, borderRadius: 'var(--r-xs)' }}>Required</span>
                      : <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Optional</span>
                    }
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: '3px 0 0', paddingLeft: 30 }}>
                    {slot.helpText ?? 'PDF, JPG, PNG · Max 10 MB'}
                  </p>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', flexShrink: 0, transition: 'all 0.12s ease', cursor: uploading[slot.docType] ? 'not-allowed' : 'pointer', opacity: uploading[slot.docType] ? 0.6 : 1 }}
                  onClick={uploading[slot.docType] ? e => e.preventDefault() : undefined}
                  onMouseOver={e => { if (!uploading[slot.docType]) { e.currentTarget.style.background = '#EBEBEA'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.18)' } }}
                  onMouseOut={e  => { e.currentTarget.style.background = '#F7F6F5'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.10)' }}>
                  <Icon name={ICONS.upload} size={13} />
                  {uploading[slot.docType] ? 'Uploading…' : 'Upload'}
                  <input type="file" multiple accept={slot.acceptAttr ?? '.pdf,.jpg,.jpeg,.png'} style={{ display: 'none' }} disabled={uploading[slot.docType]}
                    ref={el => { slotInputRefs.current[slot.docType] = el }}
                    onChange={e => { if (!e.target.files) return; Array.from(e.target.files).forEach(f => uploadFileSingle(f, slot.docType)) }} />
                </label>
              </div>
              {uploaded.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {uploaded.map((doc, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 'var(--r-sm)', padding: '7px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Icon name={ICONS.document} size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                        <span style={{ fontSize: 14, fontWeight: 500, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                        {doc.size > 0 && <span style={{ fontSize: 13, color: 'var(--text-tertiary)', flexShrink: 0 }}>{(doc.size / 1024).toFixed(0)} KB</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                        <button type="button"
                          onClick={() => openSignedUrl(doc.storagePath ?? '')}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 13, fontWeight: 600, color: '#374151', background: '#F3F4F6', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}
                          onMouseOver={e => { e.currentTarget.style.background = '#E5E7EB' }} onMouseOut={e => { e.currentTarget.style.background = '#F3F4F6' }}>
                          <Icon name={ICONS.eye} size={13} />View
                        </button>
                        <button type="button" onClick={() => dispatch({ type: 'REMOVE_DOCUMENT', name: doc.name })}
                          style={{ color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 'var(--r-xs)', display: 'flex', alignItems: 'center' }}
                          onMouseOver={e => (e.currentTarget.style.color = '#DC2626')} onMouseOut={e => (e.currentTarget.style.color = '#EF4444')}>
                          <Icon name={ICONS.trash} size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {isMissing && <p style={{ fontSize: 13, color: '#EF4444', marginTop: 8 }}>This document is required before you can continue.</p>}
            </div>
          )
        })}
      </div>

      {/* ── General drag-and-drop zone ── */}
      <div style={{ border: `2px dashed ${dragging ? 'var(--brand-color)' : '#e5e7eb'}`, borderRadius: 'var(--r-md)', background: dragging ? 'rgba(var(--brand-rgb),0.03)' : '#fafafa', padding: '32px 24px', textAlign: 'center', transition: 'border-color 0.15s ease,background 0.15s ease', cursor: 'pointer' }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); Array.from(e.dataTransfer.files).forEach(f => uploadFileSingle(f, 'general')) }}
        onClick={() => generalInputRef.current?.click()}>
        <div style={{ width: 44, height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <Icon name={ICONS.upload} size={22} style={{ color: 'var(--text-secondary)' }} />
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 3 }}>Add additional documents</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 14 }}>Drag &amp; drop or click to browse — PDF, JPG, PNG, max 10 MB</p>
        <label className="btn-ghost" style={{ padding: '8px 16px', fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
          <Icon name={ICONS.upload} size={13} />Browse files
          <input ref={generalInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => { if (e.target.files) Array.from(e.target.files).forEach(f => uploadFileSingle(f, 'general')) }} />
        </label>
      </div>

      {state.documentFiles.filter(d => !d.docType).length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 4 }}>Additional uploaded files</p>
          {state.documentFiles.filter(d => !d.docType).map((doc, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 'var(--r-sm)', padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Icon name={ICONS.document} size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 500, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{doc.size ? (doc.size / 1024).toFixed(0) + ' KB' : ''}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12, flexShrink: 0 }}>
                <button type="button"
                  onClick={() => openSignedUrl(doc.storagePath ?? '')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 13, fontWeight: 600, color: '#374151', background: '#F3F4F6', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}
                  onMouseOver={e => { e.currentTarget.style.background = '#E5E7EB' }} onMouseOut={e => { e.currentTarget.style.background = '#F3F4F6' }}>
                  <Icon name={ICONS.eye} size={13} />View
                </button>
                <button type="button" onClick={() => dispatch({ type: 'REMOVE_DOCUMENT', name: doc.name })}
                  style={{ flexShrink: 0, color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 'var(--r-xs)', display: 'flex', alignItems: 'center' }}
                  onMouseOver={e => (e.currentTarget.style.color = '#DC2626')} onMouseOut={e => (e.currentTarget.style.color = '#EF4444')}>
                  <Icon name={ICONS.trash} size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {false && missingRequired.length > 0 && (
        <div style={{ marginTop: 16, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 'var(--r-sm)', padding: '12px 16px', fontSize: 14, color: '#DC2626' }}>
          Please upload the following required documents before continuing: {missingRequired.map(d => d.label).join(', ')}.
        </div>
      )}
    </div>
  )
}

// ─── Per-slot document section for multi-slot mode ───────────────────────────

function SlotDocSection({ slotIndex, docFiles, docSlots, onAdd, onRemove }: {
  slotIndex:  number
  docFiles:   DocumentFile[]
  docSlots:   DocSlot[]
  onAdd:      (doc: DocumentFile) => void
  onRemove:   (name: string) => void
}) {
  const [uploading, setUploading] = useState<Record<string, boolean>>({})

  const uploadFile = async (file: File, docType: string) => {
    const date = todaySydney()
    const safeName = file.name
      .normalize('NFC')
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._\-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/, '')
    const path = `slot${slotIndex}/${date}/${docType}/${safeName}`
    setUploading(u => ({ ...u, [docType]: true }))
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('path', path)
      const res = await rawFetcher('/api/uploads', { method: 'POST', body: formData })
      if (!res || !res.ok) throw new Error('Upload failed')
      const json = await res.json()
      const storagePath = json?.data?.filename ?? path
      onAdd({ name: file.name, size: file.size, docType, storagePath })
    } catch { toast('Upload failed. Please try again.', 'error') }
    finally { setUploading(u => ({ ...u, [docType]: false })) }
  }

  const safeDocFiles = docFiles ?? []
  const filesFor = (docType: string) => safeDocFiles.filter(d => d.docType === docType)
  const missingRequired = docSlots.filter(s => s.required && filesFor(s.docType).length === 0)

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        {docSlots.map(slot => {
          const uploaded   = filesFor(slot.docType)
          const isMissing  = slot.required && uploaded.length === 0
          const isUploaded = uploaded.length > 0
          return (
            <div key={slot.docType} style={{ background: '#fff', border: `1.5px solid ${isMissing ? '#EF4444' : isUploaded ? 'rgba(34,197,94,0.35)' : 'rgba(0,0,0,0.08)'}`, borderRadius: 'var(--r-lg)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 'var(--r-full)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: isUploaded ? 'rgba(34,197,94,0.14)' : 'rgba(0,0,0,0.05)', color: isUploaded ? '#22C55E' : '#A8A29E' }}>
                      <Icon name={ICONS.check} size={11} />
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#1C1917' }}>{slot.label}</span>
                    {slot.required ? <span style={{ fontSize: 13, fontWeight: 600, color: isMissing ? '#EF4444' : '#78716C' }}>Required</span> : <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Optional</span>}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-mid)', margin: 0, paddingLeft: 26 }}>
                    {slot.helpText ?? 'PDF, JPG, PNG · Max 10 MB'}
                  </p>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', cursor: uploading[slot.docType] ? 'not-allowed' : 'pointer', opacity: uploading[slot.docType] ? 0.6 : 1 }}>
                  <Icon name={ICONS.upload} size={12} />
                  {uploading[slot.docType] ? 'Uploading…' : 'Upload'}
                  <input type="file" multiple accept={slot.acceptAttr ?? '.pdf,.jpg,.jpeg,.png'} style={{ display: 'none' }} disabled={uploading[slot.docType]}
                    onChange={e => { if (e.target.files) Array.from(e.target.files).forEach(f => uploadFile(f, slot.docType)) }} />
                </label>
              </div>
              {uploaded.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {uploaded.map((doc, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 'var(--r-sm)', padding: '6px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <Icon name={ICONS.document} size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                        <span style={{ fontSize: 14, fontWeight: 500, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                        {doc.size > 0 && <span style={{ fontSize: 13, color: 'var(--text-tertiary)', flexShrink: 0 }}>{(doc.size / 1024).toFixed(0)} KB</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                        <button type="button"
                          onClick={() => openSignedUrl(doc.storagePath ?? '')}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', fontSize: 13, fontWeight: 600, color: '#374151', background: '#F3F4F6', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}
                          onMouseOver={e => { e.currentTarget.style.background = '#E5E7EB' }} onMouseOut={e => { e.currentTarget.style.background = '#F3F4F6' }}>
                          <Icon name={ICONS.eye} size={12} />View
                        </button>
                        <button type="button" onClick={() => onRemove(doc.name)}
                          style={{ color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 'var(--r-xs)', display: 'flex', alignItems: 'center' }}
                          onMouseOver={e => (e.currentTarget.style.color = '#DC2626')} onMouseOut={e => (e.currentTarget.style.color = '#EF4444')}>
                          <Icon name={ICONS.trash} size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {isMissing && <p style={{ fontSize: 13, color: '#EF4444', marginTop: 6 }}>This document is required before you can continue.</p>}
            </div>
          )
        })}
      </div>
      {false && missingRequired.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 'var(--r-sm)', padding: '10px 14px', fontSize: 14, color: '#DC2626' }}>
          Missing: {missingRequired.map(d => d.label).join(', ')}.
        </div>
      )}
    </div>
  )
}
