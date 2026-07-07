import { useState } from 'react'
import { useKiosk } from '@/contexts/KioskContext'
import { useTenantInfo } from '@/lib/useTenantInfo'
import { Icon, ICONS } from '@/lib/Icon'
import { validators } from '@/lib/validation'
import { TermsBlock } from '@/components/kiosk/IDScanScreen'

const OFFICE_REASONS = [
  'Meeting with Staff',
  'Document Submission',
  'Invoice / Payment Query',
  'Customs Documentation',
  'General Enquiry',
]

const YARD_REASONS = [
  'Container Inspection',
  'Cargo Survey',
  'Damage Assessment',
  'Photography / Documentation',
  'Customs Examination',
  'Insurance Assessment',
  'Quality Control Inspection',
]

export function WalkInScreen() {
  const { state, dispatch, submitWalkIn, goTo } = useKiosk()
  const tenant = useTenantInfo()
  const [phoneError, setPhoneError] = useState('')
  const [agreed, setAgreed] = useState(false)

  type WalkInField = 'walkInPurpose' | 'walkInName' | 'walkInPhone' | 'walkInVehicle' | 'walkInBLRef' | 'walkInPersonVisited' | 'walkInReason'
  const set = (field: WalkInField, value: string) =>
    dispatch({ type: 'SET_WALK_IN_FIELD', field: field as any, value })

  const validatePhone = (val: string): boolean => {
    const err = validators.phoneAU(val)
    setPhoneError(err)
    return !err
  }

  const purpose    = state.walkInPurpose
  const isPickup   = purpose === 'walk_in_pickup'
  const isDropoff  = purpose === 'walk_in_dropoff'
  const isCargo    = isPickup || isDropoff
  const isOffice   = purpose === 'visit_office'
  const isYard     = purpose === 'visit_yard'
  const isVisit    = isOffice || isYard || purpose === 'visit_person'

  const reasonOptions = isOffice ? OFFICE_REASONS : isYard ? YARD_REASONS : []

  const bodyTitle = isOffice ? 'Visiting Office' : isYard ? 'Visiting Yard' : 'Walk-In Registration'
  const bodySubtitle = isOffice
    ? 'Meeting staff, document submission, enquiry'
    : isYard
    ? 'Container inspection, survey, customs examination'
    : 'Please provide your details so reception can assist you'

  const LABEL: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }
  const FIELD: React.CSSProperties = { minHeight: 64, padding: '20px 14px', fontSize: 15 }

  const terms = tenant?.kioskTerms?.trim() ?? ''
  const canSubmit = canProceed(state.walkInName, state.walkInPhone, state.walkInReason, isOffice || isYard) && (!terms || isYard || agreed)

  const handleSubmit = () => {
    if (isYard) {
      dispatch({ type: 'SET_ARRIVED_VISITOR', name: state.walkInName.trim() })
      goTo('consent')
    } else {
      submitWalkIn()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 16px' }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', margin: '0 0 4px', textAlign: 'center' }}>{bodyTitle}</h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '0 0 24px', textAlign: 'center' }}>{bodySubtitle}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <label style={LABEL}>Your Name <span style={{ color: '#EF4444' }}>*</span></label>
            <input type="text" placeholder="Full name" className="wizard-field" style={FIELD} value={state.walkInName} onChange={e => set('walkInName', e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>Phone Number <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 10 }}>(optional)</span></label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="04XX XXX XXX"
              className="wizard-field"
              style={FIELD}
              value={state.walkInPhone}
              onKeyDown={e => {
                const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End']
                if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) {
                  e.preventDefault()
                }
              }}
              onChange={e => {
                const numeric = e.target.value.replace(/\D/g, '')
                set('walkInPhone', numeric)
                if (phoneError) validatePhone(numeric)
              }}
              onBlur={e => validatePhone(e.target.value)}
            />
            {phoneError && <p style={{ color: '#EF4444', fontSize: 15, marginTop: 6, marginBottom: 0 }}>{phoneError}</p>}
          </div>

          {/* Cargo-specific fields */}
          {isCargo && (
            <>
              <div>
                <label style={LABEL}>Vehicle Registration <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 10 }}>(optional)</span></label>
                <input type="text" placeholder="LEA-1234" className="wizard-field uppercase" style={{ ...FIELD, textTransform: 'uppercase' }} value={state.walkInVehicle} onChange={e => set('walkInVehicle', e.target.value.toUpperCase())} />
              </div>
              <div>
                <label style={LABEL}>B/L or Shipment Reference <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 10 }}>(optional)</span></label>
                <input type="text" placeholder="e.g. COSCO2026041201" className="wizard-field" style={FIELD} value={state.walkInBLRef} onChange={e => set('walkInBLRef', e.target.value)} />
              </div>
            </>
          )}

          {/* Person being visited — for visit_person legacy + office/yard */}
          {isVisit && (
            <div>
              <label style={LABEL}>Person You're Visiting <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 10 }}>(optional)</span></label>
              <input type="text" placeholder="Staff member's name" className="wizard-field" style={FIELD} value={state.walkInPersonVisited} onChange={e => set('walkInPersonVisited', e.target.value)} />
            </div>
          )}

          {/* Reason for Visit — dropdown for office/yard, free text for cargo/legacy */}
          <div>
            <label style={LABEL}>
              Reason for Visit
              {(isOffice || isYard) && <span style={{ color: '#EF4444', marginLeft: 3 }}>*</span>}
              {!isOffice && !isYard && <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 10, marginLeft: 6 }}>(optional)</span>}
            </label>
            {(isOffice || isYard) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {reasonOptions.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => set('walkInReason', r)}
                    style={{
                      width: '100%',
                      padding: '16px 20px',
                      borderRadius: 'var(--r-md)',
                      border: state.walkInReason === r ? '2px solid var(--brand-color)' : '2px solid rgba(0,0,0,0.10)',
                      background: state.walkInReason === r ? 'rgba(var(--brand-rgb),0.06)' : '#fff',
                      color: state.walkInReason === r ? 'var(--brand-color)' : '#1C1917',
                      fontSize: 16,
                      fontWeight: state.walkInReason === r ? 700 : 500,
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            ) : (
              <input type="text" placeholder="e.g. Delivery, meeting, container pickup…" className="wizard-field" style={FIELD} value={state.walkInReason} onChange={e => set('walkInReason', e.target.value)} />
            )}
          </div>

          {/* Yard visit licence scan notice */}
          {isYard && (
            <div style={{ background: 'rgba(var(--brand-rgb),0.07)', border: '1px solid rgba(var(--brand-rgb),0.22)', borderRadius: 'var(--r-md)', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Icon name={ICONS.shield} size={16} style={{ color: 'var(--brand-color)', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Yard access requires <strong style={{ color: '#1C1917' }}>ID verification</strong>. You will be asked to scan your driver's licence before entry.
              </p>
            </div>
          )}

          {/* Inline T&C — only for non-yard, only when terms are configured */}
          {terms && !isYard && (
            <TermsBlock
              terms={terms}
              tenantName={tenant?.name || 'the facility'}
              agreed={agreed}
              onToggle={() => setAgreed(v => !v)}
            />
          )}

          <button
            className="btn-primary"
            style={{ width: '100%', padding: '18px 24px', fontSize: 16, fontWeight: 700, borderRadius: 'var(--r-md)', justifyContent: 'center', opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            <Icon name={ICONS.check} size={20} />
            {isYard ? 'Continue to ID Scan' : 'Register My Visit'}
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}

function canProceed(name: string, phone: string, reason: string, requireReason: boolean): boolean {
  if (!name.trim()) return false
  if (requireReason && !reason.trim()) return false
  if (phone.trim() && validators.phoneAU(phone)) return false
  return true
}
