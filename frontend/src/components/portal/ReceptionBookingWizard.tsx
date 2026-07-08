import { useWizard, useHoldTimer } from '@/contexts/WizardContext'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { Icon, ICONS } from '@/lib/Icon'
import { useTenantInfo } from '@/lib/useTenantInfo'
import { GlidoLogo } from '@/lib/GlidoLogo'
import { WizardScene3D, timeOfDay } from './WizardScene3D'
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

const parallaxVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 56, rotateY: dir * -8, scale: 0.97 }),
  center: { opacity: 1, x: 0, rotateY: 0, scale: 1 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -56, rotateY: dir * 8, scale: 0.97 }),
}
const fadeVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
}

export default function BookingWizard() {
  const { state, dispatch, canProceed } = useWizard()
  const tenant = useTenantInfo()
  const navigate = useNavigate()
  const [holdExpiredModal, setHoldExpiredModal] = useState(false)
  const reduce = useReducedMotion()
  const prevStepRef = useRef(state.step)
  const dirRef = useRef(1)
  if (state.step !== prevStepRef.current) {
    dirRef.current = state.step > prevStepRef.current ? 1 : -1
    prevStepRef.current = state.step
  }

  const handleHoldExpire = useCallback(() => {
    // Navigate back to the slot picker step and show an expiry modal
    dispatch({ type: 'SET', field: 'step', value: 4 })
    setHoldExpiredModal(true)
  }, [dispatch])

  const { holdActive, holdLabel, expiring } = useHoldTimer(handleHoldExpire)

  // ── Leave-page protection ───────────────────────────────────────────────────
  const shouldBlock = state.step > 1 && !state.bookingConfirmed

  // In-app navigation — custom modal via useBlocker (boolean form)
  const blocker = useBlocker(shouldBlock)

  // Real page unloads (refresh, tab close) — native browser dialog
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!shouldBlock) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [shouldBlock])

  const brandColor = tenant?.primaryColor ?? '#FC6514'
  const brandRgb   = hexToRgb(brandColor)

  const next = () => { dispatch({ type: 'SET', field: 'step', value: state.step + 1 }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const back = () => { dispatch({ type: 'SET', field: 'step', value: state.step - 1 }); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const continueLabel = 'Continue'

  // One shared content width so the stepper, form, footer nav and footer text all line up
  const bodyWide = state.slotCount > 1 && state.step >= 2 && state.step <= 6 && !state.bookingConfirmed
  const WRAP = bodyWide ? 900 : 680

  // Whichever slot's tab is open on the current step — the 3D scene focuses on that truck and
  // borrows its time-of-day, so a mixed pickup/dropoff or morning/evening convoy never looks ambiguous
  const focusSlotIndex = state.slotCount > 1
    ? [0, 0, state.step2ActiveSlot, state.step3ActiveSlot, state.step4ActiveSlot, state.step5ActiveSlot, state.step5ActiveSlot, 0][state.step] ?? 0
    : 0
  // The Document step (6) shows every slot at once, so there's no single slot to key the
  // scene's time-of-day off. If every slot shares the same time-of-day band (all morning /
  // all day / all night) show that band; only when the slots are mixed do we fall back to
  // neutral daytime — avoiding the arbitrary "borrow step 5's last-active slot" behaviour.
  const sharedTimeLabel = (() => {
    const labels = (state.slotCount > 1 ? state.slotConfigs.map(c => c.selectedSlotLabel) : [state.selectedSlotLabel])
      .filter((l): l is string => !!l)
    if (labels.length === 0) return ''
    const band = timeOfDay(labels[0])
    return labels.every(l => timeOfDay(l) === band) ? labels[0] : ''
  })()
  const focusSlotLabel = state.step === 6
    ? sharedTimeLabel
    : state.slotCount > 1
      ? (state.slotConfigs[focusSlotIndex]?.selectedSlotLabel || state.slotConfigs.find(c => c.selectedSlotLabel)?.selectedSlotLabel || '')
      : state.selectedSlotLabel

  return (
    <div style={{ background: '#fff', height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

      {/* Immersive 3D world behind the whole wizard */}
      {state.step !== 8 && (
        <WizardScene3D
          step={state.step}
          serviceType={state.serviceType}
          loadType={state.loadType}
          slotCount={state.slotCount}
          slotLabel={focusSlotLabel}
          hasDocs={(state.documentFiles?.length ?? 0) > 0}
          slots={state.slotConfigs?.map(c => ({ loadType: c.loadType, serviceType: c.serviceType }))}
          focusSlotIndex={focusSlotIndex}
        />
      )}

      {blocker.state === 'blocked' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 'var(--r-xl)', padding: 32, width: 400, maxWidth: 'calc(100vw - 48px)', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Leave booking?</h3>
            <p style={{ fontSize: 15, color: 'var(--text-mid)', lineHeight: 1.6, margin: '0 0 24px' }}>
              This booking's progress will be lost. Are you sure you want to leave?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => blocker.reset?.()}
                style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--r-sm)', border: '1px solid rgba(0,0,0,0.12)', background: '#F9F9F8', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', color: '#1C1917' }}
              >
                Stay on Page
              </button>
              <button
                type="button"
                onClick={() => {
                  try { sessionStorage.removeItem('glido_wizard_v2') } catch { /* noop */ }
                  dispatch({ type: 'RESET' })
                  blocker.proceed?.()
                }}
                style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--r-sm)', border: 'none', background: '#EF4444', color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Leave Page
              </button>
            </div>
          </div>
        </div>
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
              This slot reservation has timed out. Please select an available slot again to continue.
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
        html, body, #root { height: 100%; overflow: hidden; }
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
          background: linear-gradient(180deg, #FBFBFA 0%, #FFFFFF 40%); border: 1.5px solid #e5e7eb; border-radius: 10px;
          outline: none; box-sizing: border-box; transition: border-color 0.15s ease, box-shadow 0.15s ease;
          font-family: inherit; box-shadow: inset 0 1.5px 3px rgba(0,0,0,0.05);
        }
        .wizard-field:focus { border-color: var(--brand-color); box-shadow: inset 0 1.5px 3px rgba(0,0,0,0.05), 0 0 0 3px rgba(var(--brand-rgb),0.14); }
        .wizard-option-card {
          display: flex; align-items: center; gap: 16px; width: 100%;
          padding: 16px 20px; border-radius: 12px; border: 1.5px solid rgba(0,0,0,0.08);
          background: linear-gradient(160deg, #FFFFFF 0%, #FAFAF9 100%); cursor: pointer; text-align: left;
          transition: all 0.18s cubic-bezier(0.16,1,0.3,1);
          box-shadow: 0 1px 2px rgba(0,0,0,0.03), 0 3px 10px rgba(0,0,0,0.045), inset 0 1px 0 rgba(255,255,255,0.7);
        }
        .wizard-option-card:hover { border-color: #d1d5db; transform: translateY(-1.5px); box-shadow: 0 2px 4px rgba(0,0,0,0.05), 0 10px 22px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7); }
        .wizard-option-card:active { transform: translateY(0); }
        .wizard-option-card.selected {
          border-color: var(--brand-color);
          background: linear-gradient(160deg, color-mix(in srgb, var(--brand-color) 7%, #fff) 0%, color-mix(in srgb, var(--brand-color) 3%, #fff) 100%);
          box-shadow: 0 2px 4px rgba(0,0,0,0.04), 0 8px 20px rgba(var(--brand-rgb),0.16), inset 0 1px 0 rgba(255,255,255,0.8), 0 0 0 3px rgba(var(--brand-rgb),0.10);
        }
        .wizard-chip {
          padding: 5px 12px; font-size: 12px; font-weight: 600; border-radius: 9999px;
          border: 1.5px solid rgba(0,0,0,0.08); background: linear-gradient(160deg, #fff, #F7F6F5); color: #6b7280; cursor: pointer;
          transition: all 0.15s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.7);
        }
        .wizard-chip:hover { border-color: #d1d5db; color: #374151; transform: translateY(-1px); }
        .wizard-chip.active {
          border-color: var(--brand-color); color: var(--brand-text);
          background: linear-gradient(160deg, color-mix(in srgb, var(--brand-color) 88%, #fff), var(--brand-color));
          box-shadow: 0 2px 6px rgba(var(--brand-rgb),0.32), inset 0 1px 0 rgba(255,255,255,0.4);
        }
        .wizard-stepper-btn {
          width: 44px; height: 44px; border-radius: 10px; border: 1.5px solid rgba(0,0,0,0.08);
          background: linear-gradient(160deg, #FFFFFF 0%, #F3F2F1 100%); font-size: 20px; font-weight: 500; color: #374151;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: all 0.15s ease;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 3px 8px rgba(0,0,0,0.05), inset 0 1.5px 0 rgba(255,255,255,0.8);
        }
        .wizard-stepper-btn:hover { border-color: #d1d5db; transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0,0,0,0.06), 0 6px 14px rgba(0,0,0,0.07), inset 0 1.5px 0 rgba(255,255,255,0.8); }
        .wizard-stepper-btn:active { transform: translateY(0); box-shadow: inset 0 1.5px 3px rgba(0,0,0,0.10); }
        .wizard-stepper-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .btn-primary {
          display: inline-flex; align-items: center; gap: 8px; padding: 10px 24px;
          font-size: 13px; font-weight: 600; color: var(--brand-text, #000000);
          background: linear-gradient(160deg, color-mix(in srgb, var(--brand-color) 90%, #fff) 0%, var(--brand-color) 60%, color-mix(in srgb, var(--brand-color) 82%, #000) 100%);
          border: none; border-radius: 9999px; cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.08), 0 4px 12px rgba(var(--brand-rgb),0.35), inset 0 1.5px 0 rgba(255,255,255,0.45), inset 0 -2px 3px rgba(0,0,0,0.10);
          transition: all 0.18s ease; font-family: inherit;
        }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 3px 6px rgba(0,0,0,0.10), 0 8px 20px rgba(var(--brand-rgb),0.42), inset 0 1.5px 0 rgba(255,255,255,0.5), inset 0 -2px 3px rgba(0,0,0,0.10); }
        .btn-primary:active { transform: translateY(0); }
        .btn-dark {
          display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px;
          font-size: 13px; font-weight: 600; color: #fff; background: linear-gradient(160deg, #2B2725 0%, #1C1917 60%, #0E0C0B 100%);
          border: none; border-radius: 10px; cursor: pointer; transition: all 0.15s ease;
          box-shadow: 0 2px 6px rgba(0,0,0,0.22), inset 0 1.5px 0 rgba(255,255,255,0.12);
          font-family: inherit;
        }
        .btn-dark:hover { background: linear-gradient(160deg, #34302D 0%, #232019 60%, #111 100%); }
        .btn-dark:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-ghost {
          display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px;
          font-size: 13px; font-weight: 600; color: #374151;
          background: linear-gradient(160deg, #FFFFFF 0%, #F7F6F5 100%); border: 1.5px solid rgba(0,0,0,0.08); border-radius: 9999px;
          cursor: pointer; transition: all 0.15s ease; font-family: inherit;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04), inset 0 1.5px 0 rgba(255,255,255,0.8);
        }
        .btn-ghost:hover { border-color: #d1d5db; transform: translateY(-1px); box-shadow: 0 2px 5px rgba(0,0,0,0.06), inset 0 1.5px 0 rgba(255,255,255,0.8); }
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
        .wiz-step-circle {
          width: 46px; height: 46px; border-radius: 9999px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.25s ease; flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 600px) {
          .wiz-header { padding: 14px 20px 4px !important; }
          .wiz-body { padding-left: 20px !important; padding-right: 20px !important; padding-top: 25vh !important; }
          .wiz-footer-inner { padding: 0 16px !important; }
          .wiz-step-counter { display: none !important; }
          .wiz-btn-back, .wiz-btn-next { flex: 1 !important; justify-content: center !important; }
          .wiz-site-footer-row { display: none; }
          .wiz-scene3d-layer { height: 46vh !important; }
        }
        @media (max-width: 480px) {
          .wiz-step-circle { width: 34px !important; height: 34px !important; }
          .wiz-step-label { display: none !important; }
          .wiz-conn { min-width: 4px !important; height: 2px !important; margin-top: 17px !important; }
        }
      `}</style>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', zIndex: 2 }}>

        {/* ── Compact header (sits over the 3D world) ── */}
        {state.step !== 8 && (
          <div
            className="wiz-header"
            style={{
              position: 'relative', zIndex: 4, overflow: 'visible', padding: '18px 24px 14px', flexShrink: 0,
              background: 'linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.74) 46%, rgba(255,255,255,0.5) 72%, rgba(255,255,255,0.18) 90%, transparent 100%)',
              backdropFilter: 'blur(16px) saturate(1.3)', WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
            }}
          >
            {/* Left grid */}
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 380, pointerEvents: 'none', zIndex: 0, opacity: 0.6, WebkitMaskImage: 'linear-gradient(to right,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)', maskImage: 'linear-gradient(to right,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)' }}>
              <GridSvg side="left" />
            </div>
            {/* Right grid */}
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 380, pointerEvents: 'none', zIndex: 0, opacity: 0.6, WebkitMaskImage: 'linear-gradient(to left,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)', maskImage: 'linear-gradient(to left,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)' }}>
              <GridSvg side="right" />
            </div>

            {/* Close — returns to the reception bookings list */}
            <motion.button
              type="button"
              onClick={() => navigate('/reception/bookings')}
              aria-label="Close booking"
              whileHover={{ scale: 1.08, rotate: 90 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              style={{ position: 'absolute', top: 20, right: 24, zIndex: 3, width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.10)', background: 'linear-gradient(160deg, #FFFFFF 0%, #F3F2F1 100%)', boxShadow: '0 1px 2px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#57534E' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </motion.button>

            {/* Logo, with a soft ambient glow behind it */}
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
              <div style={{ position: 'absolute', width: 180, height: 64, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(var(--brand-rgb),0.16), transparent 75%)', filter: 'blur(6px)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.08))' }}>
                <GlidoLogo height={22} />
              </div>
            </div>

            {/* Stepper (also serves as the progress indicator) */}
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', maxWidth: WRAP, margin: '0 auto' }}>
              {STEP_CTX.flatMap((ctx, i) => {
                const n = i + 1
                const done       = n < state.step
                const active     = n === state.step
                const filled     = done || active
                // Connector between step n-1 and step n — classify relative to active step
                const connCompleted  = done || active          // leading into completed or active step → solid orange
                const connAfterActive = (n - 1) === state.step // leaving the active step → fade to grey
                const fillPct = connCompleted ? '100%' : connAfterActive ? '48%' : '0%'
                const els = []

                if (i > 0) els.push(
                  <div
                    key={`conn-${n}`}
                    className="wiz-conn"
                    style={{
                      flex: 1, height: 4, marginTop: 21, minWidth: 8, borderRadius: 999, position: 'relative', overflow: 'hidden',
                      background: 'linear-gradient(180deg, rgba(0,0,0,0.09), rgba(0,0,0,0.03))',
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.10)',
                    }}
                  >
                    <motion.div
                      initial={false}
                      animate={{ width: fillPct }}
                      transition={{ type: 'spring', stiffness: 180, damping: 26 }}
                      style={{
                        position: 'absolute', inset: 0, height: '100%', borderRadius: 999,
                        background: 'linear-gradient(90deg, var(--brand-color), color-mix(in srgb, var(--brand-color) 70%, #fff))',
                        boxShadow: '0 0 8px rgba(var(--brand-rgb),0.55), inset 0 1px 0 rgba(255,255,255,0.5)',
                      }}
                    />
                  </div>
                )

                els.push(
                  <div key={`step-${n}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <motion.div
                      className="wiz-step-circle"
                      animate={{ scale: active ? 1.1 : 1 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 20 }}
                      style={filled ? {
                        border: 'none',
                        color: 'var(--brand-text)',
                        background: 'linear-gradient(160deg, color-mix(in srgb, var(--brand-color) 88%, #fff) 0%, var(--brand-color) 55%, color-mix(in srgb, var(--brand-color) 80%, #000) 100%)',
                        boxShadow: active
                          ? '0 2px 3px rgba(0,0,0,0.10), 0 8px 18px rgba(var(--brand-rgb),0.38), inset 0 1.5px 0 rgba(255,255,255,0.55), inset 0 -2px 4px rgba(0,0,0,0.14), 0 0 0 6px rgba(var(--brand-rgb),0.14)'
                          : '0 1px 2px rgba(0,0,0,0.08), 0 4px 10px rgba(var(--brand-rgb),0.22), inset 0 1.5px 0 rgba(255,255,255,0.5), inset 0 -2px 4px rgba(0,0,0,0.12)',
                      } : {
                        border: '1.5px solid rgba(0,0,0,0.08)',
                        color: '#B0AEAC',
                        background: 'linear-gradient(160deg, #FFFFFF 0%, #F3F2F1 100%)',
                        boxShadow: 'inset 0 1.5px 3px rgba(0,0,0,0.07), 0 1px 1px rgba(255,255,255,0.9)',
                      }}
                    >
                      <Icon name={ctx.icon} size={19} />
                    </motion.div>
                    <span className="wiz-step-label" style={{ fontSize: 13, fontWeight: active ? 700 : 400, color: active || done ? '#101010' : '#605F5F', whiteSpace: 'nowrap', transition: 'all 0.25s ease' }}>
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
        {state.step !== 8 && (() => {
          const showPanel = state.slotCount > 1
            && state.step >= 2
            && state.step <= 6
            && !state.bookingConfirmed
          // On the Documents step, slot summary moves to the left
          const panelLeft = showPanel && state.step === 6
          const stepEl = {
            1: <Step1ServiceType />,
            2: <Step2SlotPicker />,
            3: <Step3HoldConfirm />,
            4: <Step4ShipmentDetails />,
            5: <Step5Documents />,
            6: <Step6ContactVehicle />,
            7: <Step7Confirmation />,
          }[state.step]
          return (
            <div className="wiz-scroll" style={{ background: 'transparent', flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', paddingBottom: 132 }}>
              <div className="wiz-body" style={{ maxWidth: WRAP, width: '100%', margin: '0 auto', paddingTop: 'clamp(150px, 25vh, 300px)' }}>
                {/* Frosted glass panel — brings the form into focus over the blurred world */}
                <div className="wiz-glass" style={{ background: 'rgba(255,255,255,0.68)', backdropFilter: 'blur(18px) saturate(1.25)', WebkitBackdropFilter: 'blur(18px) saturate(1.25)', border: '1px solid rgba(255,255,255,0.7)', borderRadius: 26, boxShadow: '0 10px 44px rgba(15,23,42,0.13), inset 0 1px 0 rgba(255,255,255,0.6)', padding: '24px 26px' }}>
                  <div style={{ display: showPanel ? 'grid' : 'block', gridTemplateColumns: showPanel ? (panelLeft ? '240px 1fr' : '1fr 240px') : undefined, gap: showPanel ? 24 : undefined, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0, order: panelLeft ? 2 : undefined, perspective: 1400 }}>
                      <AnimatePresence mode="wait" initial={false} custom={dirRef.current}>
                        <motion.div
                          key={state.step}
                          custom={dirRef.current}
                          variants={reduce ? fadeVariants : parallaxVariants}
                          initial="enter" animate="center" exit="exit"
                          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        >
                          {stepEl}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                    {showPanel && (
                      <div style={{ position: 'sticky', top: 24, order: panelLeft ? 1 : undefined }}>
                        <SlotSummaryPanel slots={state.slotConfigs} inline />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Fixed footer ── */}
      {state.step !== 8 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>

          {/* Floating pills */}
          {holdActive && state.step >= 5 && (
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
            <div className="wiz-footer-inner" style={{ width: '100%', maxWidth: WRAP, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, boxSizing: 'border-box' }}>

              {/* Back */}
              <motion.button
                type="button"
                className="wiz-btn-back btn-ghost"
                onClick={back}
                whileHover={state.step === 1 ? undefined : { x: -2 }}
                whileTap={state.step === 1 ? undefined : { scale: 0.96 }}
                style={{ opacity: state.step === 1 ? 0 : 1, pointerEvents: state.step === 1 ? 'none' : 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px 9px 14px', fontSize: 15 }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M8.5 2.5L4.5 7l4 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Back
              </motion.button>

              {/* Step counter */}
              <div className="wiz-step-counter" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: '#57534E', letterSpacing: '-0.01em' }}>
                  {STEP_CTX[state.step - 1]?.label}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{state.step} of 7</span>
              </div>

              {/* Continue — hidden on the final step (step 7 has its own pay/submit action) */}
              {state.step !== 7 ? (
                <motion.button
                  type="button"
                  className="btn-primary wiz-btn-next"
                  onClick={next}
                  whileHover={canProceed ? { y: -1, scale: 1.02 } : undefined}
                  whileTap={canProceed ? { scale: 0.96 } : undefined}
                  style={{ padding: '10px 24px', fontSize: 15, minWidth: 130, justifyContent: 'center', flexShrink: 0, height: 44, filter: !canProceed ? 'grayscale(1) opacity(0.28)' : 'none', cursor: !canProceed ? 'not-allowed' : 'pointer', pointerEvents: !canProceed ? 'none' : 'auto' }}
                >
                  {continueLabel}
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M4.5 2l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </motion.button>
              ) : (
                <div style={{ minWidth: 130, flexShrink: 0 }} />
              )}
            </div>
          </div>

          {/* Mini footer */}
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.05)', flexShrink: 0 }} className="wiz-site-footer-row">
            <div style={{ width: '100%', maxWidth: WRAP, margin: '0 auto', padding: '9px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box' }}>
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
