import { useNavigate, useBlocker } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useServiceRequestWizard } from '@/contexts/ServiceRequestWizardContext'
import { createServiceRequest } from '@/lib/db/service-requests'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { StepModeSelect } from './StepModeSelect'
import { Step1ServiceType } from './Step1ServiceType'
import { Step2ServiceSelection } from './Step2ServiceSelection'
import { Step3DocumentUpload } from './Step3DocumentUpload'
import { Step4Confirmation } from './Step4Confirmation'

// Mirrors STEP_CTX in the booking wizard's BookingWizard.tsx — same circular
// connected-step stepper, just 5 steps instead of 7.
const STEP_CTX = [
  { label: 'Mode',              icon: ICONS.ship     },
  { label: 'Service Type',      icon: ICONS.cargo    },
  { label: 'Service Selection', icon: ICONS.layers   },
  { label: 'Document Upload',   icon: ICONS.upload   },
  { label: 'Confirmation',      icon: ICONS.shield   },
]

const parallaxVariants = {
  enter:  (dir: number) => ({ opacity: 0, x: dir * 56, scale: 0.97 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit:   (dir: number) => ({ opacity: 0, x: dir * -56, scale: 0.97 }),
}
const fadeVariants = { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }

export default function ServiceRequestWizard() {
  const { state, dispatch, canProceed } = useServiceRequestWizard()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const prevStepRef = useRef(state.step)
  const dirRef = useRef(1)
  if (state.step !== prevStepRef.current) {
    dirRef.current = state.step > prevStepRef.current ? 1 : -1
    prevStepRef.current = state.step
  }

  const shouldBlock = state.step > 1 && !state.requestConfirmed
  const blocker = useBlocker(shouldBlock)

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!shouldBlock) return
      e.preventDefault(); e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [shouldBlock])

  const next = () => { dispatch({ type: 'SET', field: 'step', value: state.step + 1 }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const back = () => { dispatch({ type: 'SET', field: 'step', value: state.step - 1 }); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const submit = async () => {
    dispatch({ type: 'SET', field: 'submitting', value: true })
    dispatch({ type: 'SET', field: 'submitError', value: null })
    try {
      const result = await createServiceRequest({
        request_id: state.pendingRequestId ?? undefined,
        service_category: state.serviceCategory!,
        services: state.selectedServices.map(s => ({
          service_key: s.serviceKey,
          sub_type: s.subType,
          details: s.storeDetails?.length ? { entries: JSON.stringify(s.storeDetails) } : undefined,
        })),
        documents: state.documentFiles.map(d => ({ doc_type: d.docType, filename: d.name, size: d.size, storage_path: d.storagePath ?? '' })),
        terms_accepted: state.termsAccepted,
        is_oog: state.isOOG,
        oog_length: state.isOOG ? state.oogLength || undefined : undefined,
        oog_width: state.isOOG ? state.oogWidth || undefined : undefined,
        oog_height: state.isOOG ? state.oogHeight || undefined : undefined,
      })
      if (!result) {
        dispatch({ type: 'SET', field: 'submitError', value: 'Could not submit your request. Please try again.' })
        return
      }
      dispatch({ type: 'SET', field: 'confirmationRequestId', value: result.requestId })
      dispatch({ type: 'SET', field: 'requestConfirmed', value: true })
      toast('Service request submitted', 'success')
    } catch (err: any) {
      dispatch({ type: 'SET', field: 'submitError', value: err?.message ?? 'Could not submit your request. Please try again.' })
    } finally {
      dispatch({ type: 'SET', field: 'submitting', value: false })
    }
  }

  const steps = {
    1: <StepModeSelect />, 2: <Step1ServiceType />, 3: <Step2ServiceSelection />,
    4: <Step3DocumentUpload />, 5: <Step4Confirmation />,
  } as Record<number, React.ReactNode>

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <style>{`
        .wizard-field {
          display: block; width: 100%; padding: 12px 16px; font-size: 14px; color: #111827;
          background: linear-gradient(180deg, #FBFBFA 0%, #FFFFFF 40%); border: 1.5px solid #e5e7eb; border-radius: 10px;
          outline: none; box-sizing: border-box; transition: border-color 0.15s ease, box-shadow 0.15s ease;
          font-family: inherit; box-shadow: inset 0 1.5px 3px rgba(0,0,0,0.05); height: 40px;
        }
        .wizard-field:focus { border-color: var(--brand-color); box-shadow: inset 0 1.5px 3px rgba(0,0,0,0.05), 0 0 0 3px rgba(var(--brand-rgb),0.14); }
        .btn-primary {
          display: inline-flex; align-items: center; gap: 8px; padding: 10px 24px;
          font-size: 15px; font-weight: 600; color: var(--brand-text, #000000);
          background: linear-gradient(160deg, color-mix(in srgb, var(--brand-color) 90%, #fff) 0%, var(--brand-color) 60%, color-mix(in srgb, var(--brand-color) 82%, #000) 100%);
          border: none; border-radius: 9999px; cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.08), 0 4px 12px rgba(var(--brand-rgb),0.35), inset 0 1.5px 0 rgba(255,255,255,0.45), inset 0 -2px 3px rgba(0,0,0,0.10);
          transition: all 0.18s ease; font-family: inherit;
        }
        .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 3px 6px rgba(0,0,0,0.10), 0 8px 20px rgba(var(--brand-rgb),0.42), inset 0 1.5px 0 rgba(255,255,255,0.5), inset 0 -2px 3px rgba(0,0,0,0.10); }
        .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; transform: none; }
        .btn-ghost {
          display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px;
          font-size: 15px; font-weight: 600; color: #374151;
          background: linear-gradient(160deg, #FFFFFF 0%, #F7F6F5 100%); border: 1.5px solid rgba(0,0,0,0.08); border-radius: 9999px;
          cursor: pointer; transition: all 0.15s ease; font-family: inherit;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04), inset 0 1.5px 0 rgba(255,255,255,0.8);
        }
        .btn-ghost:hover:not(:disabled) { border-color: #d1d5db; transform: translateY(-1px); box-shadow: 0 2px 5px rgba(0,0,0,0.06), inset 0 1.5px 0 rgba(255,255,255,0.8); }
        .wiz-tile {
          border-radius: var(--r-lg); border: 1.5px solid rgba(0,0,0,0.08);
          background: linear-gradient(160deg, #FFFFFF 0%, #FAFAF9 100%);
          box-shadow: 0 1px 2px rgba(0,0,0,0.03), 0 3px 8px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.7);
          transition: all 0.18s cubic-bezier(0.16,1,0.3,1);
        }
        .wiz-tile:hover { transform: translateY(-1.5px); box-shadow: 0 2px 4px rgba(0,0,0,0.05), 0 8px 18px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.7); }
        .wiz-tile.selected {
          border-color: var(--brand-color) !important;
          background: linear-gradient(160deg, color-mix(in srgb, var(--brand-color) 8%, #fff) 0%, color-mix(in srgb, var(--brand-color) 3%, #fff) 100%) !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.04), 0 6px 16px rgba(var(--brand-rgb),0.18), inset 0 1px 0 rgba(255,255,255,0.8) !important;
        }
        .wiz-step-circle { width: 40px; height: 40px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; transition: all 0.25s ease; flex-shrink: 0; }
      `}</style>

      {/* Stepper — same circular connected-step treatment as BookingWizard */}
      {!state.requestConfirmed && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
          {STEP_CTX.flatMap((ctx, i) => {
            const n = i + 1
            const done = n < state.step
            const active = n === state.step
            const filled = done || active
            const els = []

            if (i > 0) els.push(
              <div key={`conn-${n}`} style={{ flex: 1, height: 4, marginTop: 19, minWidth: 8, borderRadius: 999, position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg, rgba(0,0,0,0.09), rgba(0,0,0,0.03))', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.10)' }}>
                <motion.div
                  initial={false}
                  animate={{ width: (done || active) ? '100%' : '0%' }}
                  transition={{ type: 'spring', stiffness: 180, damping: 26 }}
                  style={{ position: 'absolute', inset: 0, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--brand-color), color-mix(in srgb, var(--brand-color) 70%, #fff))', boxShadow: '0 0 8px rgba(var(--brand-rgb),0.55), inset 0 1px 0 rgba(255,255,255,0.5)' }}
                />
              </div>
            )

            els.push(
              <div key={`step-${n}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <motion.div
                  className="wiz-step-circle"
                  animate={{ scale: active ? 1.1 : 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 20 }}
                  style={filled ? {
                    border: 'none', color: 'var(--brand-text)',
                    background: 'linear-gradient(160deg, color-mix(in srgb, var(--brand-color) 88%, #fff) 0%, var(--brand-color) 55%, color-mix(in srgb, var(--brand-color) 80%, #000) 100%)',
                    boxShadow: active
                      ? '0 2px 3px rgba(0,0,0,0.10), 0 8px 18px rgba(var(--brand-rgb),0.38), inset 0 1.5px 0 rgba(255,255,255,0.55), inset 0 -2px 4px rgba(0,0,0,0.14), 0 0 0 6px rgba(var(--brand-rgb),0.14)'
                      : '0 1px 2px rgba(0,0,0,0.08), 0 4px 10px rgba(var(--brand-rgb),0.22), inset 0 1.5px 0 rgba(255,255,255,0.5), inset 0 -2px 4px rgba(0,0,0,0.12)',
                  } : {
                    border: '1.5px solid rgba(0,0,0,0.08)', color: '#B0AEAC',
                    background: 'linear-gradient(160deg, #FFFFFF 0%, #F3F2F1 100%)',
                    boxShadow: 'inset 0 1.5px 3px rgba(0,0,0,0.07), 0 1px 1px rgba(255,255,255,0.9)',
                  }}
                >
                  {done ? <Icon name={ICONS.check} size={16} /> : <Icon name={ctx.icon} size={17} />}
                </motion.div>
                <span style={{ fontSize: 12.5, fontWeight: active ? 700 : 400, color: active || done ? '#101010' : '#605F5F', whiteSpace: 'nowrap', transition: 'all 0.25s ease' }}>
                  {ctx.label}
                </span>
              </div>
            )
            return els
          })}
        </div>
      )}

      <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)' }}>
        <AnimatePresence mode="wait" initial={false} custom={dirRef.current}>
          <motion.div
            key={state.step}
            custom={dirRef.current}
            variants={reduce ? fadeVariants : parallaxVariants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            {steps[state.step]}
          </motion.div>
        </AnimatePresence>

        {/* Footer nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, paddingTop: 20, borderTop: '1px solid rgba(0,0,0,0.07)' }}>
          {state.requestConfirmed ? (
            <button type="button" className="btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { dispatch({ type: 'RESET' }); navigate('/customer/requests') }}>
              View My Requests
            </button>
          ) : (
            <>
              <button type="button" className="btn-ghost" onClick={back}
                style={{ opacity: state.step === 1 ? 0 : 1, pointerEvents: state.step === 1 ? 'none' : 'auto' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M8.5 2.5L4.5 7l4 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Back
              </button>

              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#57534E', letterSpacing: '-0.01em' }}>{STEP_CTX[state.step - 1]?.label}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{state.step} of 5</span>
              </div>

              {state.step < 5 ? (
                <button type="button" className="btn-primary" disabled={!canProceed} onClick={next}>
                  {state.step === 4 ? 'Continue to confirmation' : 'Continue'}
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ) : (
                <button type="button" className="btn-primary" disabled={!canProceed || state.submitting} onClick={submit}>
                  {state.submitting ? 'Submitting…' : 'Confirm Request'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Leave-page confirm modal */}
      {blocker.state === 'blocked' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}>
          <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: '24px 24px 20px', maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.20)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', marginBottom: 8 }}>Leave without submitting?</h3>
            <p style={{ fontSize: 14.5, color: 'var(--text-secondary)', marginBottom: 20 }}>Your progress on this request will be lost.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-ghost" onClick={() => blocker.reset?.()}>Stay</button>
              <button type="button" onClick={() => blocker.proceed?.()}
                style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: '#fff', background: '#DC2626', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
