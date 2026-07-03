import { useWizard, useHoldTimer } from '@/contexts/WizardContext'
import { useState, useCallback } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import { useTenantInfo } from '@/lib/useTenantInfo'
import { ReceptionStep1ServiceType as Step1ServiceType } from './ReceptionStep1ServiceType'
import { Step2SlotPicker } from './Step2SlotPicker'
import { Step3HoldConfirm } from './Step3HoldConfirm'
import { Step4ShipmentDetails } from './Step4ShipmentDetails'
import { Step5Documents } from './Step5Documents'
import { Step6ContactVehicle } from './Step6ContactVehicle'
import { Step7Confirmation } from './Step7Confirmation'
import { SlotSummaryPanel } from './SlotSummaryPanel'

const STEP_CTX = [
  { label: 'Booking details',  shortLabel: 'Details',      icon: ICONS.users     },
  { label: 'Service type',     shortLabel: 'Service Type', icon: ICONS.cargo     },
  { label: 'Cargo type',       shortLabel: 'Load Type',    icon: ICONS.container },
  { label: 'Choose a slot',    shortLabel: 'Time Slot',    icon: ICONS.clock     },
  { label: 'Shipment details', shortLabel: 'Details',      icon: ICONS.document  },
  { label: 'Documents',        shortLabel: 'Document',     icon: ICONS.upload    },
  { label: 'Review & pay',     shortLabel: 'Payment',      icon: ICONS.shield    },
]

function hexToRgb(hex: string): string {
  const c = hex.replace('#', '')
  const full = c.length === 3 ? c.split('').map(x => x + x).join('') : c
  const n = parseInt(full, 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

export default function BookingWizard() {
  const { state, dispatch, canProceed } = useWizard()
  const tenant = useTenantInfo()
  const [holdExpiredModal, setHoldExpiredModal] = useState(false)

  const handleHoldExpire = useCallback(() => {
    // Navigate back to the slot picker step and show an expiry modal
    dispatch({ type: 'SET', field: 'step', value: 4 })
    setHoldExpiredModal(true)
  }, [dispatch])

  const { holdActive, holdLabel, expiring } = useHoldTimer(handleHoldExpire)

  const brandColor = tenant?.primaryColor ?? '#FC6514'
  const brandRgb   = hexToRgb(brandColor)

  const next = () => { dispatch({ type: 'SET', field: 'step', value: state.step + 1 }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const back = () => { dispatch({ type: 'SET', field: 'step', value: state.step - 1 }); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const continueLabel = 'Continue'

  return (
    <div style={{ background: '#fff', minHeight: 'calc(100vh - 56px)' }}>

      {state.slotCount > 1
        && state.slotConfigs[1]?.serviceType !== null
        && state.step < 6
        && !state.bookingConfirmed && (
          <SlotSummaryPanel slots={state.slotConfigs} />
      )}

      {/* Hold-expired modal */}
      {holdExpiredModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 'var(--r-xl)', padding: '32px 28px', maxWidth: 380, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <Icon name={ICONS.clock} size={26} style={{ color: '#EF4444' }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', marginBottom: 10 }}>
              Slot hold expired
            </h3>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
              Your slot reservation has timed out. Please select an available slot again to continue your booking.
            </p>
            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '13px 24px', fontSize: 15, fontWeight: 700, borderRadius: 'var(--r-md)' }}
              onClick={() => setHoldExpiredModal(false)}
            >
              Choose a slot
            </button>
          </div>
        </div>
      )}

      <style>{`
        /* Hide the PublicLayout site footer — wizard has its own fixed footer */
        footer { display: none !important; }
        body { padding-bottom: 112px; }
        body, body * { font-family: 'Red Hat Display', ui-sans-serif, system-ui, sans-serif !important; }
        @font-face {
          font-family: 'RC-Digits';
          src: url(https://fonts.gstatic.com/s/robotocondensed/v31/ieVl2ZhZI2eCN5jzbjEETS9weq8-19K7DQk6YvM.woff2) format('woff2');
          font-weight: 400 800; font-display: swap; unicode-range: U+0030-0039, U+003A;
        }
        .slot-num { font-family: 'RC-Digits', 'Red Hat Display', ui-sans-serif !important; }
        /* Brand colour — driven by tenant.primary_color, falls back to #FC6514 */
        :root { --brand-color: ${brandColor}; --brand-rgb: ${brandRgb}; }
        .wizard-field {
          display: block; width: 100%; padding: 12px 16px; font-size: 14px; color: #111827;
          background: #fff; border: 1.5px solid #e5e7eb; border-radius: 10px;
          outline: none; box-sizing: border-box; transition: border-color 0.15s ease, box-shadow 0.15s ease;
          font-family: inherit;
        }
        .wizard-field:focus { border-color: var(--brand-color); box-shadow: 0 0 0 3px rgba(var(--brand-rgb),0.12); }
        .wizard-option-card {
          display: flex; align-items: center; gap: 16px; width: 100%;
          padding: 16px 20px; border-radius: 12px; border: 1.5px solid #e5e7eb;
          background: #fff; cursor: pointer; text-align: left; transition: all 0.15s ease;
        }
        .wizard-option-card:hover { border-color: #d1d5db; background: #fafafa; }
        .wizard-option-card.selected { border-color: var(--brand-color); background: rgba(var(--brand-rgb),0.03); }
        .wizard-chip {
          padding: 5px 12px; font-size: 12px; font-weight: 600; border-radius: 9999px;
          border: 1.5px solid #e5e7eb; background: transparent; color: #6b7280; cursor: pointer;
          transition: all 0.15s ease;
        }
        .wizard-chip:hover { border-color: #d1d5db; color: #374151; }
        .wizard-chip.active { border-color: var(--brand-color); background: rgba(var(--brand-rgb),0.06); color: var(--brand-color); }
        .wizard-stepper-btn {
          width: 44px; height: 44px; border-radius: 10px; border: 1.5px solid #e5e7eb;
          background: #fff; font-size: 20px; font-weight: 500; color: #374151;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: all 0.15s ease;
        }
        .wizard-stepper-btn:hover { border-color: #d1d5db; background: #f9fafb; }
        .wizard-stepper-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .btn-primary {
          display: inline-flex; align-items: center; gap: 8px; padding: 10px 24px;
          font-size: 13px; font-weight: 600; color: #000000;
          background: var(--brand-color);
          border: none; border-radius: 9999px; cursor: pointer;
          box-shadow: 0 2px 8px rgba(var(--brand-rgb),0.35); transition: all 0.18s ease;
          font-family: inherit;
        }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(var(--brand-rgb),0.42); }
        .btn-dark {
          display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px;
          font-size: 13px; font-weight: 600; color: #fff; background: #1C1917;
          border: none; border-radius: 10px; cursor: pointer; transition: all 0.15s ease;
          font-family: inherit;
        }
        .btn-dark:hover { background: #111; }
        .btn-dark:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-ghost {
          display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px;
          font-size: 13px; font-weight: 600; color: #374151;
          background: #fff; border: 1.5px solid #e5e7eb; border-radius: 9999px;
          cursor: pointer; transition: all 0.15s ease; font-family: inherit;
        }
        .btn-ghost:hover { border-color: #d1d5db; background: #f9fafb; }
        .wiz-step-circle {
          width: 56px; height: 56px; border-radius: 9999px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.25s ease; flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 600px) {
          .wiz-header { padding: 24px 20px 20px !important; }
          .wiz-header-title { font-size: 20px !important; }
          .wiz-body { padding: 24px 20px 32px !important; }
          .wiz-footer-inner { padding: 0 16px !important; }
          .wiz-step-counter { display: none !important; }
          .wiz-btn-back, .wiz-btn-next { flex: 1 !important; justify-content: center !important; }
          .wiz-site-footer-row { display: none; }
        }
        @media (max-width: 480px) {
          .wiz-step-circle { width: 34px !important; height: 34px !important; }
          .wiz-step-label { display: none !important; }
          .wiz-conn { min-width: 4px !important; height: 2px !important; margin-top: 17px !important; }
        }
      `}</style>

      <div style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>

        {/* ── White header panel ── */}
        {state.step !== 8 && (
          <div
            className="wiz-header"
            style={{ position: 'relative', overflow: 'visible', background: 'linear-gradient(120deg, rgba(var(--brand-rgb),0.08) 0%, rgba(var(--brand-rgb),0.02) 35%, rgba(255,255,255,0) 70%), #fff', padding: '48px 60px 44px', marginBottom: 8, borderBottom: '1px solid rgba(0,0,0,0.055)', boxShadow: '0 4px 16px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.03)' }}
          >
            {/* Left grid */}
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 380, pointerEvents: 'none', zIndex: 0, WebkitMaskImage: 'linear-gradient(to right,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)', maskImage: 'linear-gradient(to right,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)' }}>
              <GridSvg side="left" />
            </div>
            {/* Right grid */}
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 380, pointerEvents: 'none', zIndex: 0, WebkitMaskImage: 'linear-gradient(to left,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)', maskImage: 'linear-gradient(to left,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)' }}>
              <GridSvg side="right" />
            </div>

            {/* Title */}
            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', marginBottom: 40 }}>
              <h1 className="wiz-header-title" style={{ fontSize: 36, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 10 }}>New Booking</h1>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
                Create a new booking on behalf of a visitor or driver. Select a slot, fill in the details and confirm.
              </p>
            </div>

            {/* Stepper */}
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', maxWidth: 1000, margin: '0 auto' }}>
              {STEP_CTX.flatMap((ctx, i) => {
                const n = i + 1
                const done       = n < state.step
                const active     = n === state.step
                const connCompleted   = done || active
                const connAfterActive = (n - 1) === state.step
                const connBg = connCompleted
                  ? 'var(--brand-color)'
                  : connAfterActive
                  ? 'linear-gradient(to right, var(--brand-color), #D1D5DB)'
                  : '#D1D5DB'
                const els = []

                if (i > 0) els.push(
                  <div key={`conn-${n}`} className="wiz-conn" style={{ flex: 1, height: 2, marginTop: 27, minWidth: 8, borderRadius: 'var(--r-xs)', transition: 'background 0.3s ease', background: connBg }} />
                )

                els.push(
                  <div key={`step-${n}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div className="wiz-step-circle" style={{ border: `2.5px solid ${done || active ? 'var(--brand-color)' : '#C2C2C2'}`, color: done || active ? 'var(--brand-color)' : '#C2C2C2', background: '#fff' }}>
                      <Icon name={ctx.icon} size={24} />
                    </div>
                    <span className="wiz-step-label" style={{ fontSize: 15, fontWeight: active ? 700 : 400, color: active || done ? '#101010' : '#605F5F', whiteSpace: 'nowrap', transition: 'all 0.25s ease' }}>
                      {ctx.shortLabel}
                    </span>
                  </div>
                )
                return els
              })}
            </div>
          </div>
        )}

        {/* ── Step body ── */}
        {state.step !== 8 && (
          <div style={{ background: '#fff', minHeight: '60vh' }}>
            <div className="wiz-body" style={{ flex: 1, maxWidth: 1000, margin: '0 auto', padding: '48px 0 140px' }}>
              {state.step === 1 && <Step1ServiceType />}
              {state.step === 2 && <Step2SlotPicker />}
              {state.step === 3 && <Step3HoldConfirm />}
              {state.step === 4 && <Step4ShipmentDetails />}
              {state.step === 5 && <Step5Documents />}
              {state.step === 6 && <Step6ContactVehicle />}
              {state.step === 7 && <Step7Confirmation />}
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed footer ── */}
      {state.step !== 8 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>

          {/* Floating pills */}
          {holdActive && state.step >= 3 && (
            <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', paddingBottom: 10, pointerEvents: 'none' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 20px', borderRadius: 'var(--r-full)', background: '#fff', border: `1.5px solid ${expiring ? 'rgba(239,68,68,0.35)' : 'rgba(var(--brand-rgb),0.28)'}`, boxShadow: '0 4px 18px rgba(0,0,0,0.09),0 2px 8px rgba(var(--brand-rgb),0.12)', whiteSpace: 'nowrap' }}>
                <Icon name={ICONS.clock} size={26} style={{ color: expiring ? '#EF4444' : 'var(--brand-color)', flexShrink: 0 }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: expiring ? '#EF4444' : '#1C1917' }}>
                  Slot held · <span style={{ fontFamily: 'ui-monospace,monospace' }}>{holdLabel}</span>
                </span>
              </div>
            </div>
          )}

          {state.step === 1 && state.slotCount > 1 && (
            <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', paddingBottom: 10, pointerEvents: 'none' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '7px 20px', borderRadius: 'var(--r-full)', background: '#fff', border: '1.5px solid rgba(var(--brand-rgb),0.28)', boxShadow: '0 4px 18px rgba(0,0,0,0.09)', whiteSpace: 'nowrap' }}>
                <span style={{ width: 7, height: 7, borderRadius: 'var(--r-full)', background: 'var(--brand-color)', flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1917' }}>{state.slotCount} slots — you'll enter shipment details for each one separately.</span>
              </div>
            </div>
          )}

          {state.step === 4 && (
            <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', paddingBottom: 10, pointerEvents: 'none' }}>
              {state.selectedSlotLabel ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '7px 20px', borderRadius: 'var(--r-full)', background: '#fff', border: '1.5px solid rgba(239,68,68,0.30)', boxShadow: '0 4px 18px rgba(0,0,0,0.09)', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 'var(--r-full)', background: '#EF4444', flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1917' }}>{state.selectedSlotLabel}</span>
                  <span style={{ fontSize: 13, color: '#9CA3AF', background: 'rgba(0,0,0,0.05)', borderRadius: 'var(--r-sm)', padding: '2px 7px', fontWeight: 500 }}>selected</span>
                  <span style={{ fontSize: 13, color: '#EF4444', fontWeight: 600 }}>· {tenant?.slotHoldDurationMin ?? 10}-min hold on Next →</span>
                </div>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 20px', borderRadius: 'var(--r-full)', background: '#fff', border: '1.5px solid rgba(0,0,0,0.10)', boxShadow: '0 4px 18px rgba(0,0,0,0.06)', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: '#9CA3AF' }}>Select a time slot to hold your booking</span>
                </div>
              )}
            </div>
          )}

          {/* Nav row */}
          <div style={{ position: 'relative', height: 74, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <div className="wiz-footer-inner" style={{ width: '100%', maxWidth: 1120, margin: '0 auto', padding: '0 60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, boxSizing: 'border-box' }}>

              {/* Back */}
              <button
                type="button"
                className="wiz-btn-back btn-ghost"
                onClick={back}
                style={{ opacity: state.step === 1 ? 0 : 1, pointerEvents: state.step === 1 ? 'none' : 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px 9px 14px', fontSize: 15 }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M8.5 2.5L4.5 7l4 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Back
              </button>

              {/* Step counter */}
              <div className="wiz-step-counter" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#57534E', letterSpacing: '-0.01em' }}>
                  {STEP_CTX[state.step - 1]?.label}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{state.step} of 7</span>
              </div>

              {/* Continue — hidden on the final step (step 7 has its own pay/submit action) */}
              {state.step !== 7 ? (
                <button
                  type="button"
                  className="btn-primary wiz-btn-next"
                  onClick={next}
                  style={{ padding: '10px 24px', fontSize: 15, minWidth: 130, justifyContent: 'center', flexShrink: 0, height: 44, filter: !canProceed ? 'grayscale(1) opacity(0.28)' : 'none', cursor: !canProceed ? 'not-allowed' : 'pointer', pointerEvents: !canProceed ? 'none' : 'auto' }}
                >
                  {continueLabel}
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M4.5 2l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ) : (
                <div style={{ minWidth: 130, flexShrink: 0 }} />
              )}
            </div>
          </div>

          {/* Mini footer */}
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.05)', flexShrink: 0 }} className="wiz-site-footer-row">
            <div style={{ width: '100%', maxWidth: 1120, margin: '0 auto', padding: '9px 60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box' }}>
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>© 2026 {tenant?.name || 'Glido CFS'} · Sydney Container Freight Station</span>
              <div style={{ display: 'flex', gap: 18 }}>
                {['Privacy', 'Terms', 'Contact'].map(l => (
                  <a key={l} href="#" style={{ fontSize: 13, color: 'var(--text-tertiary)', textDecoration: 'none', transition: 'color 0.15s ease' }}
                    onMouseOver={e => (e.currentTarget.style.color = '#57534E')}
                    onMouseOut={e  => (e.currentTarget.style.color = '#A8A29E')}
                  >{l}</a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function GridSvg({ side }: { side: 'left' | 'right' }) {
  return (
    <svg width="497" height="418" viewBox="0 0 497 418" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', [side]: 0, top: '50%', transform: 'translateY(-50%)' }}>
      <g opacity="0.22">
        <line x1="495.384" y1="0.5" x2="-157" y2="0.499964" stroke="black"/>
        <line x1="495.384" y1="84.1426" x2="-157" y2="84.1425" stroke="black"/>
        <line x1="29.8955" y1="2.18557e-08" x2="29.8955" y2="417" stroke="black"/>
        <line x1="495.384" y1="167.785" x2="-157" y2="167.785" stroke="black"/>
        <line x1="123.093" y1="2.18557e-08" x2="123.093" y2="417" stroke="black"/>
        <line x1="495.384" y1="251.427" x2="-157" y2="251.427" stroke="black"/>
        <line x1="216.291" y1="2.18557e-08" x2="216.291" y2="417" stroke="black"/>
        <line x1="495.384" y1="333.858" x2="-157" y2="333.858" stroke="black"/>
        <line x1="309.489" y1="2.18557e-08" x2="309.489" y2="417" stroke="black"/>
        <line x1="495.384" y1="417.5" x2="-157" y2="417.5" stroke="black"/>
        <line x1="402.686" y1="2.18557e-08" x2="402.686" y2="417" stroke="black"/>
        <line x1="495.884" y1="2.18557e-08" x2="495.884" y2="417" stroke="black"/>
      </g>
    </svg>
  )
}
