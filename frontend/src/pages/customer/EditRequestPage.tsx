import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { getServiceRequest, updateServiceRequest } from '@/lib/db/service-requests'
import { toast } from '@/lib/toast'
import type { ServiceRequest } from '@/data/types'

// Shipment details a customer may correct after submitting, while the request is still Pending.
// A dedicated route rather than a drawer so the form is deep-linkable and survives a refresh, and
// so editing lives with the record (/requests/:id) rather than hanging off the list.
//
// Selected services and uploaded documents are deliberately NOT editable here — changing those
// would invalidate any per-service status staff have set, and needs the wizard.

const LABEL: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 8 }
const INPUT: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: 15, color: '#1C1917', background: '#FFFFFF', border: '1px solid #E2E0DD', borderRadius: 'var(--r-sm)', outline: 'none', transition: 'border-color 0.15s ease, box-shadow 0.15s ease', boxSizing: 'border-box' }
const CARD: React.CSSProperties = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)', marginBottom: 12 }

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <label style={LABEL}>{label}</label>
      {children}
    </div>
  )
}

function FocusInput({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} style={{ ...INPUT, ...props.style as React.CSSProperties }}
      onFocus={e => { e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.12)' }}
      onBlur={e  => { e.target.style.borderColor = 'rgba(0,0,0,0.10)'; e.target.style.boxShadow = 'none' }}
    />
  )
}

function SectionHead({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', margin: 0 }}>{title}</h2>
      {desc && <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '3px 0 0' }}>{desc}</p>}
    </div>
  )
}

export default function EditRequestPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const [request, setRequest] = useState<ServiceRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [containerNumber, setContainerNumber] = useState('')
  const [containerType,   setContainerType]   = useState('')
  const [containerSize,   setContainerSize]   = useState('')
  const [vesselLine,      setVesselLine]      = useState('')
  const [voyageNumber,    setVoyageNumber]    = useState('')
  const [collectionDate,  setCollectionDate]  = useState('')
  const [isOOG,           setIsOOG]           = useState(false)
  const [oogLength,       setOogLength]       = useState('')
  const [oogWidth,        setOogWidth]        = useState('')
  const [oogHeight,       setOogHeight]       = useState('')

  usePageTitle(request ? `Glido | Edit ${request.requestId}` : 'Glido | Edit Request')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getServiceRequest(id).then(r => {
      if (cancelled) return
      if (r) {
        setRequest(r)
        setContainerNumber(r.containerNumber ?? '')
        setContainerType(r.containerType ?? '')
        setContainerSize(r.containerSize ?? '')
        setVesselLine(r.vesselLine ?? '')
        setVoyageNumber(r.voyageNumber ?? '')
        setCollectionDate(r.collectionDate ?? '')
        setIsOOG(!!r.isOOG)
        setOogLength(r.oogLength ?? '')
        setOogWidth(r.oogWidth ?? '')
        setOogHeight(r.oogHeight ?? '')
      }
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  const toRequest = () => navigate(`/customer/requests/${id}`)

  const dirty = !!request && (
    containerNumber !== (request.containerNumber ?? '') ||
    containerType   !== (request.containerType   ?? '') ||
    containerSize   !== (request.containerSize   ?? '') ||
    vesselLine      !== (request.vesselLine      ?? '') ||
    voyageNumber    !== (request.voyageNumber    ?? '') ||
    collectionDate  !== (request.collectionDate  ?? '') ||
    isOOG           !== !!request.isOOG ||
    (isOOG && (
      oogLength !== (request.oogLength ?? '') ||
      oogWidth  !== (request.oogWidth  ?? '') ||
      oogHeight !== (request.oogHeight ?? '')
    ))
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isOOG && !oogLength.trim() && !oogWidth.trim() && !oogHeight.trim()) {
      toast('Enter at least one OOG dimension, or turn Out of Gauge off', 'error'); return
    }
    setSaving(true)
    try {
      const updated = await updateServiceRequest(id, {
        container_number: containerNumber.trim() || null,
        container_type:   containerType.trim()   || null,
        container_size:   containerSize.trim()   || null,
        vessel_line:      vesselLine.trim()      || null,
        voyage_number:    voyageNumber.trim()    || null,
        collection_date:  collectionDate         || null,
        is_oog:           isOOG,
        oog_length:       isOOG ? (oogLength.trim() || null) : null,
        oog_width:        isOOG ? (oogWidth.trim()  || null) : null,
        oog_height:       isOOG ? (oogHeight.trim() || null) : null,
      })
      if (!updated) { toast('Could not save changes', 'error'); return }
      toast('Request updated', 'success')
      // Land on the record you just changed, not back in the list.
      navigate(`/customer/requests/${id}`)
    } catch (err: any) {
      // 409 when staff moved the request past Pending since this page loaded.
      toast(err?.message ?? 'Could not save changes', 'error')
    } finally { setSaving(false) }
  }

  const css = `
    @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
    .er-wrap { max-width: 720px; }
    .er-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media (max-width: 620px) { .er-grid { grid-template-columns: 1fr; } }
    .er-back:hover { color: #1C1917 !important; }
  `

  if (loading) {
    return (
      <div className="er-wrap">
        <style>{css}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ height: 30, width: 280, borderRadius: 'var(--r-sm)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ height: 260, borderRadius: 'var(--r-lg)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />
        </div>
      </div>
    )
  }

  if (!request) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Icon name={ICONS.bookings} size={30} style={{ color: 'rgba(0,0,0,0.14)' }} />
        <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: '12px 0 4px' }}>Request not found</p>
        <button type="button" onClick={() => navigate('/customer/requests')}
          style={{ marginTop: 14, padding: '10px 20px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
          Back to My Requests
        </button>
      </div>
    )
  }

  // Guarded in the UI and again by the API, which re-checks status inside the UPDATE.
  if (request.status !== 'pending') {
    return (
      <div className="er-wrap">
        <style>{css}</style>
        <div style={{ ...CARD, textAlign: 'center', padding: '44px 24px' }}>
          <Icon name={ICONS.lock} size={26} style={{ color: 'rgba(0,0,0,0.2)' }} />
          <p style={{ fontSize: 15.5, fontWeight: 700, color: '#1C1917', margin: '12px 0 4px' }}>This request can no longer be edited</p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 18px' }}>
            It's already {request.status.replace(/_/g, ' ')}. Contact the depot if something needs changing.
          </p>
          <button type="button" onClick={toRequest}
            style={{ padding: '10px 20px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            View request
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="er-wrap" style={{ paddingBottom: 60 }}>
      <style>{css}</style>

      {/* Breadcrumb + title on one row, matching the detail page */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" onClick={toRequest} className="er-back"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 2px', flexShrink: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.13s' }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5L4.5 7l4 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
          {request.requestId}
        </button>

        <span aria-hidden style={{ width: 1, height: 18, background: 'rgba(0,0,0,0.12)', flexShrink: 0 }} />

        <h1 style={{ fontSize: 21, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', margin: 0 }}>
          Edit request
        </h1>
      </div>

      <form onSubmit={submit}>
        <div style={CARD}>
          <SectionHead title="Container" desc="Correct anything that was mistyped when you submitted." />
          <div className="er-grid">
            <Field label="Container Number">
              <FocusInput value={containerNumber} onChange={e => setContainerNumber(e.target.value)} placeholder="MSCU1234567" />
            </Field>
            <Field label="Container Type">
              <FocusInput value={containerType} onChange={e => setContainerType(e.target.value)} placeholder="40GP" />
            </Field>
            <Field label="Container Size">
              <FocusInput value={containerSize} onChange={e => setContainerSize(e.target.value)} placeholder="40ft" />
            </Field>
            <Field label="Collection Date">
              <FocusInput type="date" value={collectionDate} onChange={e => setCollectionDate(e.target.value)} />
            </Field>
          </div>
        </div>

        <div style={CARD}>
          <SectionHead title="Vessel" />
          <div className="er-grid">
            <Field label="Vessel Line">
              <FocusInput value={vesselLine} onChange={e => setVesselLine(e.target.value)} placeholder="Maersk" />
            </Field>
            <Field label="Voyage Number">
              <FocusInput value={voyageNumber} onChange={e => setVoyageNumber(e.target.value)} placeholder="V123E" />
            </Field>
          </div>
        </div>

        <div style={CARD}>
          <SectionHead title="Out of Gauge (OOG)" desc="Cargo that exceeds standard container dimensions." />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: isOOG ? 16 : 0 }}>
            <input type="checkbox" checked={isOOG} onChange={e => setIsOOG(e.target.checked)}
              style={{ accentColor: 'var(--brand-color)', width: 16, height: 16, cursor: 'pointer' }} />
            <span style={{ fontSize: 14.5, color: '#1C1917' }}>This shipment is out of gauge</span>
          </label>
          {isOOG && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Length (cm)">
                <FocusInput inputMode="numeric" value={oogLength} onChange={e => setOogLength(e.target.value)} placeholder="1250" />
              </Field>
              <Field label="Width (cm)">
                <FocusInput inputMode="numeric" value={oogWidth} onChange={e => setOogWidth(e.target.value)} placeholder="240" />
              </Field>
              <Field label="Height (cm)">
                <FocusInput inputMode="numeric" value={oogHeight} onChange={e => setOogHeight(e.target.value)} placeholder="290" />
              </Field>
            </div>
          )}
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 16px', lineHeight: 1.45 }}>
          Selected services and uploaded documents can't be changed after submitting. Contact the depot if those need to change.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={toRequest}
            style={{ padding: '10px 18px', fontSize: 14.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="submit" disabled={!dirty || saving}
            style={{ padding: '10px 22px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: (dirty && !saving) ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: (dirty && !saving) ? 1 : 0.45, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22),0 4px 14px rgba(var(--brand-rgb),0.40)' }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
