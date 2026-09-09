import { useRef, useState } from 'react'
import { useServiceRequestWizard } from '@/contexts/ServiceRequestWizardContext'
import type { RequestDocumentFile, ParsedField } from '@/contexts/ServiceRequestWizardContext'
import { Icon, ICONS } from '@/lib/Icon'
import { rawFetcher } from '@/lib/fetcher'
import { openSignedUrl } from '@/lib/useSignedUrl'
import { toast } from '@/lib/toast'
import documentsImg from '@/assets/documents.png'
import { getDocSlotsForServices } from '@/lib/serviceRequestDocs'

const ACCEPT = '.html,.htm,.pdf'
const ACCEPT_EXTS = ['html', 'htm', 'pdf']

// Simulated field-extraction per document type (FR 1.1.3.3) — no real OCR/parsing service is
// wired up yet, so this mocks the "auto-fill from upload" behaviour with a fixed field list per
// doc type and a random subset marked as not-parsed, to be highlighted in the UI.
const SIMULATED_FIELDS: Record<string, string[]> = {
  bill_of_lading:        ['Container Number', 'Vessel Name', 'Voyage Number', 'Shipper'],
  commercial_invoice:    ['Invoice Number', 'Total Value', 'Currency'],
  packing_list:          ['Package Count', 'Total Weight'],
  certificate_of_origin: ['Country of Origin', 'HS Code'],
  general:               ['Document Type'],
}

function simulateParse(docType: string): ParsedField[] {
  const fields = SIMULATED_FIELDS[docType] ?? SIMULATED_FIELDS.general
  return fields.map((name, i) => {
    // Deterministic-ish: roughly 1 in 4 fields comes back unparsed, never the very first field.
    const parsed = i === 0 || Math.random() > 0.25
    return { name, value: parsed ? `Sample ${name}` : '', parsed }
  })
}

export function Step3DocumentUpload() {
  const { state, dispatch } = useServiceRequestWizard()
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const generalInputRef = useRef<HTMLInputElement>(null)
  const slotInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const docSlots = getDocSlotsForServices(state.selectedServices.map(s => s.serviceKey))
  const filesForSlot = (docType: string) => state.documentFiles.filter(d => d.docType === docType)

  // A required-document slot holds exactly one file — uploading again replaces it rather than
  // appending, so "Replace" (FR 1.1.3.3) is just "upload again" instead of a separate action.
  const uploadFile = async (file: File, docType: string, replacing?: RequestDocumentFile) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ACCEPT_EXTS.includes(ext)) {
      toast('Invalid file type. Allowed: HTML, HTM, PDF', 'error')
      return
    }
    const safeName = file.name
      .normalize('NFC')
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._\-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/, '')
    setUploading(u => ({ ...u, [docType]: true }))
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('path', `service-requests/${docType}/${safeName}`)
      const res = await rawFetcher('/api/uploads', { method: 'POST', body: formData })
      if (!res || !res.ok) throw new Error('Upload failed')
      const json = await res.json()
      const storagePath = json?.data?.filename ?? safeName
      if (replacing) dispatch({ type: 'REMOVE_DOCUMENT', name: replacing.name })
      const doc: RequestDocumentFile = { name: file.name, size: file.size, docType, storagePath, parsedFields: simulateParse(docType) }
      dispatch({ type: 'ADD_DOCUMENT', doc })
    } catch {
      toast('Upload failed. Please try again.', 'error')
    } finally {
      setUploading(u => ({ ...u, [docType]: false }))
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src={documentsImg} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
        </div>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>Document Upload</h2>
          <p style={{ fontSize: 15, color: '#4F4F4F', lineHeight: 1.5, margin: '4px 0 0' }}>Upload required documents for your service request</p>
        </div>
      </div>

      {/* Required Documents list — driven by the services selected in Step 2 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {docSlots.map(slot => {
          const uploaded = filesForSlot(slot.docType)
          const isUploaded = uploaded.length > 0
          const existing = uploaded[0]
          return (
            <div key={slot.docType} style={{ background: '#FFFFFF', border: `1.5px solid ${isUploaded ? 'rgba(34,197,94,0.35)' : 'rgba(0,0,0,0.08)'}`, borderRadius: 'var(--r-lg)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 'var(--r-full)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isUploaded ? 'rgba(34,197,94,0.14)' : 'rgba(0,0,0,0.05)', color: isUploaded ? '#22C55E' : '#A8A29E' }}>
                    <Icon name={ICONS.check} size={12} />
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#1C1917' }}>{slot.label}</span>
                  {slot.required
                    ? <span style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>*</span>
                    : <span style={{ fontSize: 13, color: '#16A34A', fontWeight: 600 }}>Optional</span>}
                </div>
                <label className="btn-ghost" style={{ cursor: uploading[slot.docType] ? 'not-allowed' : 'pointer', opacity: uploading[slot.docType] ? 0.6 : 1 }}>
                  <Icon name={ICONS.upload} size={13} />
                  {uploading[slot.docType] ? 'Uploading…' : isUploaded ? 'Replace' : 'Upload'}
                  <input type="file" accept={ACCEPT} style={{ display: 'none' }} disabled={uploading[slot.docType]}
                    ref={el => { slotInputRefs.current[slot.docType] = el }}
                    onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0], slot.docType, existing) }} />
                </label>
              </div>
              {uploaded.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {uploaded.map((doc, i) => (
                    <div key={i}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 'var(--r-sm)', padding: '7px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <Icon name={ICONS.document} size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                          <span style={{ fontSize: 14, fontWeight: 500, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                          <button type="button" onClick={() => openSignedUrl(doc.storagePath ?? '')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 13, fontWeight: 600, color: '#374151', background: '#F3F4F6', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}>
                            <Icon name={ICONS.eye} size={13} />Preview
                          </button>
                          <button type="button" onClick={() => dispatch({ type: 'REMOVE_DOCUMENT', name: doc.name })}
                            style={{ color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 'var(--r-xs)', display: 'flex', alignItems: 'center' }}>
                            <Icon name={ICONS.trash} size={14} />
                          </button>
                        </div>
                      </div>
                      <ParsedFieldsBlock fields={doc.parsedFields} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Drag and drop area */}
      <div
        style={{ border: `2px dashed ${dragging ? 'var(--brand-color)' : '#e5e7eb'}`, borderRadius: 'var(--r-md)', background: dragging ? 'rgba(var(--brand-rgb),0.03)' : '#fafafa', padding: '32px 24px', textAlign: 'center', transition: 'border-color 0.15s ease,background 0.15s ease', cursor: 'pointer' }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0], 'general') }}
        onClick={() => generalInputRef.current?.click()}
      >
        <div style={{ width: 44, height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <Icon name={ICONS.upload} size={22} style={{ color: 'var(--text-secondary)' }} />
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 3 }}>Drop your document here</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 14 }}>Upload HTML, HTM, word, png, jpeg or PDF files for document processing</p>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 14 }}>Supported formats: HTML, HTM, PDF</p>
        <label className="btn-ghost" onClick={e => e.stopPropagation()}>
          <Icon name={ICONS.upload} size={13} />Select Document
          <input ref={generalInputRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0], 'general') }} />
        </label>
      </div>

      {state.documentFiles.filter(d => d.docType === 'general').length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.documentFiles.filter(d => d.docType === 'general').map((doc, i) => (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 'var(--r-sm)', padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Icon name={ICONS.document} size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  <p style={{ fontSize: 15, fontWeight: 500, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</p>
                </div>
                <button type="button" onClick={() => dispatch({ type: 'REMOVE_DOCUMENT', name: doc.name })}
                  style={{ color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 'var(--r-xs)', display: 'flex', alignItems: 'center' }}>
                  <Icon name={ICONS.trash} size={16} />
                </button>
              </div>
              <ParsedFieldsBlock fields={doc.parsedFields} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// FR 1.1.3.3 — shows the simulated auto-extracted fields for an uploaded document, with any
// field the mock parser "couldn't extract" highlighted rather than silently omitted.
function ParsedFieldsBlock({ fields }: { fields?: ParsedField[] }) {
  if (!fields?.length) return null
  const unparsedCount = fields.filter(f => !f.parsed).length
  return (
    <div style={{ margin: '4px 0 2px 10px', padding: '8px 10px', background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 'var(--r-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Parsed Information</span>
        {unparsedCount > 0 && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#DC2626', background: 'rgba(239,68,68,0.10)', padding: '2px 7px', borderRadius: 'var(--r-full)' }}>
            {unparsedCount} field{unparsedCount > 1 ? 's' : ''} not parsed
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {fields.map(f => (
          <span key={f.name} title={f.parsed ? undefined : 'Could not be extracted from this document — please verify manually'}
            style={{ fontSize: 12.5, padding: '3px 8px', borderRadius: 'var(--r-sm)', background: f.parsed ? '#fff' : 'rgba(239,68,68,0.07)', border: `1px solid ${f.parsed ? 'rgba(0,0,0,0.08)' : 'rgba(239,68,68,0.30)'}`, color: f.parsed ? '#374151' : '#B91C1C' }}>
            <strong style={{ fontWeight: 600 }}>{f.name}:</strong> {f.parsed ? f.value : 'Not parsed'}
          </span>
        ))}
      </div>
    </div>
  )
}
