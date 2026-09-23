import React, { useState } from 'react'
import { motion } from 'motion/react'
import { updateServiceRequest } from '@/lib/db/service-requests'
import { toast } from '@/lib/toast'
import type { ServiceRequest } from '@/data/types'

// Shipment details a customer may correct after submitting, while the request is still Pending.
// Selected services and uploaded documents are deliberately NOT editable here — changing those
// would invalidate any per-service status staff have already set, and needs the wizard.

const LABEL: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 8 }
const INPUT: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: 15, color: '#1C1917', background: '#FFFFFF', border: '1px solid #E2E0DD', borderRadius: 'var(--r-sm)', outline: 'none', transition: 'border-color 0.15s ease, box-shadow 0.15s ease', boxSizing: 'border-box' }

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

interface Props {
  request: ServiceRequest
  onClose: () => void
  onSaved: (updated: ServiceRequest) => void
}

export function EditRequestModal({ request, onClose, onSaved }: Props) {
  const [containerNumber, setContainerNumber] = useState(request.containerNumber ?? '')
  const [containerType,   setContainerType]   = useState(request.containerType   ?? '')
  const [containerSize,   setContainerSize]   = useState(request.containerSize   ?? '')
  const [vesselLine,      setVesselLine]      = useState(request.vesselLine      ?? '')
  const [voyageNumber,    setVoyageNumber]    = useState(request.voyageNumber    ?? '')
  const [collectionDate,  setCollectionDate]  = useState(request.collectionDate  ?? '')
  const [isOOG,           setIsOOG]           = useState(!!request.isOOG)
  const [oogLength,       setOogLength]       = useState(request.oogLength ?? '')
  const [oogWidth,        setOogWidth]        = useState(request.oogWidth  ?? '')
  const [oogHeight,       setOogHeight]       = useState(request.oogHeight ?? '')
  const [saving, setSaving] = useState(false)

  const dirty =
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isOOG && !oogLength.trim() && !oogWidth.trim() && !oogHeight.trim()) {
      toast('Enter at least one OOG dimension, or turn Out of Gauge off', 'error'); return
    }
    setSaving(true)
    try {
      const updated = await updateServiceRequest(request.id, {
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
      onSaved(updated)
      onClose()
    } catch (err: any) {
      // 409 from the API when staff have moved the request past Pending since the list loaded.
      toast(err?.message ?? 'Could not save changes', 'error')
    } finally { setSaving(false) }
  }

  return (
    <>
      <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}
        style={{ position: 'fixed', inset: 0, zIndex: 9020, background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(2px)' }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9021,
          width: 'min(560px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 48px)',
          background: '#fff', borderRadius: 'var(--r-lg)', boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: 0 }}>
              Edit Request – <span style={{ fontFamily: 'ui-monospace,monospace' }}>{request.requestId}</span>
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0' }}>
              Shipment details only. Services and documents can't be changed after submitting.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ width: 34, height: 34, borderRadius: 'var(--r-full)', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: 'var(--text-secondary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
              <Field label="Vessel Line">
                <FocusInput value={vesselLine} onChange={e => setVesselLine(e.target.value)} placeholder="Maersk" />
              </Field>
              <Field label="Voyage Number">
                <FocusInput value={voyageNumber} onChange={e => setVoyageNumber(e.target.value)} placeholder="V123E" />
              </Field>

              <Field label="Out of Gauge (OOG)" full>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={isOOG} onChange={e => setIsOOG(e.target.checked)}
                    style={{ accentColor: 'var(--brand-color)', width: 16, height: 16, cursor: 'pointer' }} />
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Cargo exceeds standard container dimensions</span>
                </label>
              </Field>

              {isOOG && (
                <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
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
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid rgba(0,0,0,0.07)' }}>
            <button type="button" onClick={onClose}
              style={{ padding: '10px 18px', fontSize: 14.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button type="submit" disabled={!dirty || saving}
              style={{ padding: '10px 22px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: (dirty && !saving) ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: (dirty && !saving) ? 1 : 0.45, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22),0 4px 14px rgba(var(--brand-rgb),0.40)' }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </motion.div>
    </>
  )
}
