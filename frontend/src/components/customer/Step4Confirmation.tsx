import { useState } from 'react'
import { useServiceRequestWizard } from '@/contexts/ServiceRequestWizardContext'
import { Icon, ICONS } from '@/lib/Icon'
import { openSignedUrl } from '@/lib/useSignedUrl'
import { Confetti } from '@/components/Confetti'
import type { ServiceKey } from '@/data/types'
import timerImg from '@/assets/timer.png'

const LEGAL_CONTENT: Record<'terms' | 'privacy', { title: string; body: string }> = {
  terms: {
    title: 'Terms of Service',
    body: 'By submitting a service request through the Glido Customer Portal, you confirm that the information provided is accurate and that you are authorised to request the selected services on behalf of the consignee/consignor named on the shipping documents. Glido and the depot operator are not liable for delays caused by incomplete or incorrect documentation. Charges for the requested services will be billed according to your depot’s standard rate card.',
  },
  privacy: {
    title: 'Privacy Policy',
    body: 'Information you submit — including shipment details and uploaded documents — is used only to process your service request and is shared with the depot operator and relevant customs/compliance authorities where required by law. Documents are stored securely and retained per the depot’s regulatory record-keeping obligations. You may contact your depot administrator to request access to or deletion of your data.',
  },
}

const SERVICE_LABEL: Record<ServiceKey, { label: string; icon: string }> = {
  fcl_collection_terminal: { label: 'FCL run into Terminal',      icon: ICONS.truck },
  inspection_compliance:   { label: 'Inspection & compliance',    icon: ICONS.shield },
  fcl_storage:             { label: 'FCL Storage',                icon: ICONS.container },
  lcl_storage:             { label: 'LCL storage',                icon: ICONS.container },
  fcl_collection:          { label: 'FCL collection',             icon: ICONS.truck },
  lcl_collection:          { label: 'LCL collection',             icon: ICONS.truck },
  dehire:                  { label: 'Empty container collection', icon: ICONS.truck },
  unpack:                  { label: 'Pack',                       icon: ICONS.layers },
}

export function Step4Confirmation() {
  const { state, dispatch } = useServiceRequestWizard()
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null)
  const confirmed = state.requestConfirmed && !!state.confirmationRequestId

  const copyRef = () => { if (state.confirmationRequestId) navigator.clipboard.writeText(state.confirmationRequestId).catch(() => {}) }

  return (
    <div>
      {confirmed ? (
        // Mirrors /book's ConfirmedScreen success banner 1:1 (icon + heading + copyable ref).
        <>
          <Confetti />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 'var(--r-md)', padding: '16px 20px', marginBottom: 28, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.22)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--r-full)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg,#4ADE80 0%,#16A34A 100%)', boxShadow: '0 4px 12px rgba(34,197,94,0.35)' }}>
              <Icon name={ICONS.check} size={20} style={{ color: 'var(--brand-text)' }} />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#22C55E' }}>Service Request Confirmed!</p>
              <p style={{ fontSize: 14, fontFamily: 'ui-monospace,monospace', fontWeight: 700, color: 'var(--text-secondary)', marginTop: 2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                onClick={copyRef} title="Click to copy">
                {state.confirmationRequestId}
              </p>
            </div>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src={timerImg} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>Service Confirmation</h2>
            <p style={{ fontSize: 15, color: '#4F4F4F', lineHeight: 1.5, margin: '4px 0 0' }}>Review and confirm your service request</p>
          </div>
        </div>
      )}

      {/* Request Details */}
      <Section title="Request Details">
        {state.pendingRequestId && <DetailRow label="Request ID" value={state.pendingRequestId} mono />}
        <DetailRow label="Service Type" value={state.serviceCategory === 'export' ? 'Export' : 'Import'} />

        {/* FR 2.3 — Out of Gauge cargo indicator; L/W/H (cm) captured only when OOG = Yes */}
        {confirmed ? (
          state.isOOG && (
            <DetailRow label="Out of Gauge (OOG)" value={`Yes${state.oogLength || state.oogWidth || state.oogHeight ? ` — ${state.oogLength || '—'} × ${state.oogWidth || '—'} × ${state.oogHeight || '—'} cm` : ''}`} />
          )
        ) : (
          <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Out of Gauge (OOG) cargo?</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['Yes', 'No'] as const).map(opt => {
                  const isYes = opt === 'Yes'
                  const active = state.isOOG === isYes
                  return (
                    <button key={opt} type="button"
                      onClick={() => dispatch({ type: 'SET', field: 'isOOG', value: isYes })}
                      style={{ padding: '4px 14px', fontSize: 13, fontWeight: 600, borderRadius: 'var(--r-full)', border: `1.5px solid ${active ? 'var(--brand-color)' : 'rgba(0,0,0,0.15)'}`, background: active ? 'var(--brand-color)' : '#fff', color: active ? '#fff' : '#1C1917', cursor: 'pointer' }}>
                      {opt}
                    </button>
                  )
                })}
              </div>
            </div>
            {state.isOOG && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input type="text" placeholder="Length (cm)" value={state.oogLength} onChange={e => dispatch({ type: 'SET', field: 'oogLength', value: e.target.value })} className="wizard-field" style={{ fontSize: 13.5 }} />
                <input type="text" placeholder="Width (cm)" value={state.oogWidth} onChange={e => dispatch({ type: 'SET', field: 'oogWidth', value: e.target.value })} className="wizard-field" style={{ fontSize: 13.5 }} />
                <input type="text" placeholder="Height (cm)" value={state.oogHeight} onChange={e => dispatch({ type: 'SET', field: 'oogHeight', value: e.target.value })} className="wizard-field" style={{ fontSize: 13.5 }} />
              </div>
            )}
          </div>
        )}

        {!confirmed && (
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button type="button" className="btn-ghost" disabled style={{ opacity: 0.55, cursor: 'not-allowed' }} title="Available once the request has been reviewed">
              <Icon name={ICONS.chartBar} size={13} />Estimated Cost
            </button>
            <button type="button" className="btn-ghost" disabled style={{ opacity: 0.55, cursor: 'not-allowed' }} title="Available once the request has been reviewed">
              <Icon name={ICONS.document} size={13} />Request for Quote
            </button>
          </div>
        )}
      </Section>

      {/* Selected Services */}
      <Section title="Selected Services">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.selectedServices.map(s => {
            const meta = SERVICE_LABEL[s.serviceKey]
            return (
              <div key={s.serviceKey} style={{ padding: '8px 12px', background: '#FAFAF9', borderRadius: 'var(--r-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name={meta.icon} size={16} style={{ color: 'var(--text-secondary)' }} />
                  <span style={{ fontSize: 14.5, fontWeight: 500, color: '#1C1917' }}>{meta.label}</span>
                  {s.subType && !s.storeDetails?.length && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-color)', marginLeft: 'auto' }}>{s.subType}</span>}
                </div>
                {!!s.storeDetails?.length && (
                  <div style={{ marginTop: 6, marginLeft: 26, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {s.storeDetails.map((entry, i) => (
                      <div key={i} style={{ fontSize: 13 }}>
                        <span style={{ fontWeight: 600, color: 'var(--brand-color)' }}>{entry.type}</span>
                        {entry.type.toLowerCase() === 'reefer' && (
                          <span style={{ color: 'var(--text-secondary)' }}>{entry.power ? ` · Power: Yes${entry.temp ? ` · Temp: ${entry.temp}` : ''}` : ' · Power: No'}</span>
                        )}
                        {entry.note && <span style={{ color: 'var(--text-secondary)' }}> · {entry.note}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      {/* Uploaded Documents */}
      {state.documentFiles.length > 0 && (
        <Section title="Uploaded Documents">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {state.documentFiles.map((doc, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 'var(--r-sm)', padding: '8px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <Icon name={ICONS.document} size={14} style={{ color: 'var(--text-secondary)' }} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                </div>
                <button type="button" onClick={() => openSignedUrl(doc.storagePath ?? '')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 13, fontWeight: 600, color: '#374151', background: '#F3F4F6', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}>
                  <Icon name={ICONS.eye} size={13} />Preview
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {!confirmed && (
        <>
          {/* Terms and Conditions */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 24, cursor: 'pointer' }}>
            <input type="checkbox" checked={state.termsAccepted} onChange={e => dispatch({ type: 'SET', field: 'termsAccepted', value: e.target.checked })} style={{ marginTop: 3 }} />
            <span style={{ fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              I agree to the{' '}
              <a href="#" onClick={e => { e.preventDefault(); setLegalModal('terms') }} style={{ color: 'var(--brand-color)', fontWeight: 600, textDecoration: 'none' }}>terms of service</a>
              {' '}and{' '}
              <a href="#" onClick={e => { e.preventDefault(); setLegalModal('privacy') }} style={{ color: 'var(--brand-color)', fontWeight: 600, textDecoration: 'none' }}>privacy policy</a>.
            </span>
          </label>

          {state.submitError && (
            <div style={{ marginTop: 16, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 'var(--r-sm)', padding: '12px 16px', fontSize: 14, color: '#DC2626' }}>
              {state.submitError}
            </div>
          )}
        </>
      )}

      {legalModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }} onClick={() => setLegalModal(null)}>
          <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: '24px 24px 20px', maxWidth: 480, width: '100%', maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.20)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 14 }}>{LEGAL_CONTENT[legalModal].title}</h3>
            <p style={{ fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 20 }}>{LEGAL_CONTENT[legalModal].body}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primary" onClick={() => setLegalModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{title}</p>
      {children}
    </div>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0' }}>
      <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', fontFamily: mono ? 'ui-monospace,monospace' : undefined }}>{value}</span>
    </div>
  )
}
