import React, { useState } from 'react'
import { motion } from 'motion/react'
import { updateServiceRequest } from '@/lib/db/service-requests'
import { toast } from '@/lib/toast'
import type { ServiceRequest } from '@/data/types'

// Shipment details a customer may correct after submitting, while the request is still Pending.
// Selected services and uploaded documents are deliberately NOT editable here — changing those
// would invalidate any per-service status staff have already set, and needs the wizard.
//
// Layout mirrors RequestDetailsPanel exactly: docked into the 440px right-hand column on wide
// screens, a right-edge slide-over below 1024px.

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{title}</p>
      {children}
    </div>
  )
}

interface Props {
  request: ServiceRequest
  docked?: boolean
  onClose: () => void
  onSaved: (updated: ServiceRequest) => void
}

export function EditRequestPanel({ request, docked, onClose, onSaved }: Props) {
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

  const panelStyle: React.CSSProperties = docked
    ? { position: 'relative', height: '100%', width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 6px 24px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9011, width: 'min(480px, 100vw)', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column' }

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
      {!docked && (
        <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}
          style={{ position: 'fixed', inset: 0, zIndex: 9010, background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(2px)' }} />
      )}

      <motion.div style={panelStyle}
        initial={docked ? { opacity: 0, x: 16 } : { x: '100%' }} animate={docked ? { opacity: 1, x: 0 } : { x: 0 }}
        transition={docked ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] } : { type: 'spring', stiffness: 400, damping: 40 }}>

        {/* Header — matches RequestDetailsPanel */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.07)', background: '#fff', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917' }}>
              Edit Request – <span style={{ fontFamily: 'ui-monospace,monospace' }}>{request.requestId}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ width: 34, height: 34, borderRadius: 'var(--r-full)', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: 'var(--text-secondary)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 22, flex: 1, overflowY: 'auto', minHeight: 0 }}>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
              Shipment details only. Selected services and uploaded documents can't be changed after submitting.
            </p>

            <Section title="Container">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
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
            </Section>

            <Section title="Vessel">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                <Field label="Vessel Line">
                  <FocusInput value={vesselLine} onChange={e => setVesselLine(e.target.value)} placeholder="Maersk" />
                </Field>
                <Field label="Voyage Number">
                  <FocusInput value={voyageNumber} onChange={e => setVoyageNumber(e.target.value)} placeholder="V123E" />
                </Field>
              </div>
            </Section>

            <Section title="Out of Gauge (OOG)">
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: isOOG ? 14 : 0 }}>
                <input type="checkbox" checked={isOOG} onChange={e => setIsOOG(e.target.checked)}
                  style={{ accentColor: 'var(--brand-color)', width: 16, height: 16, cursor: 'pointer' }} />
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Cargo exceeds standard container dimensions</span>
              </label>
              {isOOG && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
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
            </Section>
          </div>

          {/* Footer pinned to the bottom of the panel so Save is reachable without scrolling */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: '1px solid rgba(0,0,0,0.07)', background: '#fff', flexShrink: 0 }}>
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
