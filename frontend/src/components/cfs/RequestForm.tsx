import { useRef, useState } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { cfs, RELATED_SERVICES, uploadCfsFile, type Direction, type NewContainerInput } from '@/lib/cfs'
import { Btn, CARD, Field, PhotoThumb, Select, SectionTitle, TextArea, TextInput } from './ui'

/**
 * The "Create request" form, shared by the customer portal and the staff screen.
 * Staff additionally enter the customer's name/email/phone; the request they create is
 * auto-accepted by the backend. Customers' requests land as "Awaiting acceptance".
 */

interface Row extends NewContainerInput { key: number; date: string }
const CONTAINER_NO = /^[A-Z]{4}\d{7}$/
const TYPES = ['20GP', '40GP', '40HC', '20RF', '40RF', 'Other']

let rowKey = 0
const blankRow = (): Row => ({ key: ++rowKey, containerNumber: '', sealNumber: '', containerType: '40HC', vessel: '', date: '' })

export interface CreatedRequest { id: string; request_ref: string; status: string; direction: Direction; containerCount: number; warnings: string[] }

export default function RequestForm({ staff, initialDirection = 'import', lockDirection, onCreated, onCancel }: {
  staff?: boolean
  initialDirection?: Direction
  lockDirection?: boolean
  onCreated: (r: CreatedRequest) => void
  onCancel?: () => void
}) {
  const [direction, setDirection] = useState<Direction>(initialDirection)
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' })
  const [rows, setRows] = useState<Row[]>([blankRow()])
  const [services, setServices] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<Array<{ storagePath: string; fileName: string }>>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isImport = direction === 'import'
  const patchRow = (key: number, patch: Partial<Row>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)))

  const pickFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    setUploading(true)
    try {
      for (const f of Array.from(list)) {
        try { const up = await uploadCfsFile(f, staff ? 'cfs-staff' : 'cfs-request'); setFiles(prev => [...prev, up]) }
        catch (e: any) { toast(e.message || `Could not upload ${f.name}`, 'error') }
      }
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (staff && !customer.name.trim()) e.customerName = 'Customer name is required'
    if (customer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) e.customerEmail = 'Enter a valid email'
    const seen = new Set<string>()
    rows.forEach(r => {
      const no = r.containerNumber.replace(/[\s-]/g, '').toUpperCase()
      if (!no) e[`c${r.key}`] = 'Container number is required'
      else if (!CONTAINER_NO.test(no)) e[`c${r.key}`] = 'Use 4 letters + 7 digits, e.g. MSKU1234567'
      else if (seen.has(no)) e[`c${r.key}`] = 'This container is listed twice'
      seen.add(no)
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async () => {
    setFormError(null)
    if (!validate()) return
    setSubmitting(true)
    try {
      const res = await cfs.createRequest({
        direction,
        customer: staff ? { name: customer.name.trim(), email: customer.email.trim() || undefined, phone: customer.phone.trim() || undefined } : undefined,
        relatedServices: isImport ? [] : services,
        notes: notes.trim() || undefined,
        photos: files,
        containers: rows.map(r => ({
          containerNumber: r.containerNumber.replace(/[\s-]/g, '').toUpperCase(),
          sealNumber: r.sealNumber?.trim() || undefined,
          containerType: r.containerType || undefined,
          vessel: r.vessel?.trim() || undefined,
          ...(isImport ? { eta: r.date || undefined } : { etd: r.date || undefined }),
        })),
      })
      onCreated({ id: res.request.id, request_ref: res.request.request_ref, status: res.request.status, direction, containerCount: rows.length, warnings: res.warnings ?? [] })
    } catch (e: any) {
      setFormError(e.message || 'Could not create the request')
    } finally { setSubmitting(false) }
  }

  const toggleService = (k: string) => setServices(s => (s.includes(k) ? s.filter(x => x !== k) : [...s, k]))

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Direction */}
      <div style={CARD}>
        <SectionTitle>What do you need?</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {([['import', 'Unpacking', 'Container arriving — unpack it at our CFS', ICONS.import], ['export', 'Packing', 'Pack your cargo into a container for export', ICONS.export]] as const).map(([d, title, sub, icon]) => {
            const active = direction === d
            const disabled = lockDirection && !active
            return (
              <button key={d} type="button" disabled={disabled} aria-pressed={active} onClick={() => setDirection(d)}
                style={{ textAlign: 'left', padding: 14, borderRadius: 'var(--r-md)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, fontFamily: 'inherit',
                  border: active ? '2px solid var(--brand-color)' : '1px solid rgba(0,0,0,0.12)', background: active ? 'rgba(var(--brand-rgb),0.07)' : '#fff', display: 'flex', gap: 12, alignItems: 'center' }}>
                <Icon name={icon} size={26} style={{ color: active ? 'var(--brand-color)' : '#78716C', flexShrink: 0 }} />
                <span><span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#1C1917' }}>{title}</span>
                  <span style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)' }}>{sub}</span></span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Customer (staff only) */}
      {staff && (
        <div style={CARD}>
          <SectionTitle>Customer</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <Field label="Customer name *">
              <TextInput value={customer.name} onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))} maxLength={200} aria-invalid={!!errors.customerName} />
              {errors.customerName && <p role="alert" style={{ color: '#DC2626', fontSize: 12, margin: '4px 0 0' }}>{errors.customerName}</p>}
            </Field>
            <Field label="Email" hint="Used for the Contact customer button">
              <TextInput type="email" value={customer.email} onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))} maxLength={200} aria-invalid={!!errors.customerEmail} />
              {errors.customerEmail && <p role="alert" style={{ color: '#DC2626', fontSize: 12, margin: '4px 0 0' }}>{errors.customerEmail}</p>}
            </Field>
            <Field label="Phone"><TextInput type="tel" value={customer.phone} onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))} maxLength={50} /></Field>
          </div>
        </div>
      )}

      {/* Containers */}
      <div style={CARD}>
        <SectionTitle action={rows.length < 50 ? <Btn small onClick={() => setRows(r => [...r, blankRow()])}><Icon name={ICONS.add} size={16} /> Add container</Btn> : undefined}>
          Containers
        </SectionTitle>
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((r, i) => (
            <div key={r.key} style={{ border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', padding: 12, background: '#FAFAF9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Container {i + 1}</span>
                {rows.length > 1 && <Btn small variant="ghost" onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))} aria-label={`Remove container ${i + 1}`}><Icon name={ICONS.trash} size={16} /> Remove</Btn>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                <Field label="Container number *" span={1}>
                  <TextInput value={r.containerNumber} onChange={e => patchRow(r.key, { containerNumber: e.target.value.toUpperCase() })} placeholder="MSKU1234567" maxLength={15} aria-invalid={!!errors[`c${r.key}`]} autoCapitalize="characters" />
                  {errors[`c${r.key}`] && <p role="alert" style={{ color: '#DC2626', fontSize: 12, margin: '4px 0 0' }}>{errors[`c${r.key}`]}</p>}
                </Field>
                <Field label="Type">
                  <Select value={r.containerType} onChange={v => patchRow(r.key, { containerType: v })} options={TYPES.map(t => ({ value: t, label: t }))} />
                </Field>
                <Field label="Seal number"><TextInput value={r.sealNumber} onChange={e => patchRow(r.key, { sealNumber: e.target.value })} maxLength={50} /></Field>
                <Field label="Vessel"><TextInput value={r.vessel} onChange={e => patchRow(r.key, { vessel: e.target.value })} maxLength={100} /></Field>
                <Field label={isImport ? 'ETA' : 'ETD'}><TextInput type="date" value={r.date} onChange={e => patchRow(r.key, { date: e.target.value })} /></Field>
              </div>
            </div>
          ))}
        </div>
        {isImport && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '10px 0 0' }}>House bills and cargo details come from the manifest — you don't need to enter them.</p>}
      </div>

      {/* Related services (packing) */}
      {!isImport && (
        <div style={CARD}>
          <SectionTitle>Related services</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {RELATED_SERVICES.map(s => {
              const on = services.includes(s.key)
              return (
                <button key={s.key} type="button" aria-pressed={on} onClick={() => toggleService(s.key)}
                  style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    border: on ? '1px solid var(--brand-color)' : '1px solid rgba(0,0,0,0.14)', background: on ? 'rgba(var(--brand-rgb),0.1)' : '#fff', color: on ? 'var(--brand-color)' : '#44403C' }}>
                  {on ? '✓ ' : ''}{s.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Notes + files */}
      <div style={CARD}>
        <SectionTitle>Notes and documents</SectionTitle>
        <Field label="Notes">
          <TextArea value={notes} onChange={e => setNotes(e.target.value)} maxLength={4000} placeholder="Anything we should know — special handling, access, timing…" />
        </Field>
        <div style={{ marginTop: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Photos / documents</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {files.map((f, i) => <PhotoThumb key={f.storagePath + i} path={f.storagePath} name={f.fileName} onRemove={() => setFiles(fs => fs.filter((_, j) => j !== i))} />)}
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ width: 92, height: 92, borderRadius: 'var(--r-md)', border: '1.5px dashed rgba(0,0,0,0.25)', background: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'inherit' }}>
              <Icon name={ICONS.upload} size={22} />{uploading ? 'Uploading…' : 'Add file'}
            </button>
            <input ref={fileRef} type="file" multiple accept="image/*,.pdf" hidden onChange={e => pickFiles(e.target.files)} />
          </div>
        </div>
      </div>

      {formError && <div role="alert" style={{ ...CARD, borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.05)', color: '#7F1D1D', fontSize: 14 }}>{formError}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        {onCancel && <Btn variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Btn>}
        <Btn variant="primary" loading={submitting} disabled={uploading} onClick={submit}>
          {staff ? 'Create request' : 'Submit request'}
        </Btn>
      </div>
    </div>
  )
}
