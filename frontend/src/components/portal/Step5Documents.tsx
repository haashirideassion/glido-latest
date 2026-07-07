import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { fetchSavedDrivers } from '@/lib/useSavedDrivers'
import type { SavedDriver } from '@/lib/useSavedDrivers'
import { useWizard } from '@/contexts/WizardContext'
import rollImg from '@/assets/roll.png'
import type { SlotConfig } from '@/contexts/WizardContext'
import { Icon, ICONS } from '@/lib/Icon'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { lookupShipment, lookupShipmentByContainer } from '@/lib/db/cfs-shipments'
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'
import { validators, sanitize } from '@/lib/validation'

const FL: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 6 }
const ROW: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }

const ICS_MAP: Record<string, { bg: string; color: string; border: string; label: string }> = {
  cleared:     { bg: 'rgba(34,197,94,0.12)',  color: '#22C55E', border: 'rgba(34,197,94,0.22)',  label: 'Cleared'  },
  held:        { bg: 'rgba(239,68,68,0.12)',  color: '#EF4444', border: 'rgba(239,68,68,0.22)',  label: 'Held'     },
  examination: { bg: 'rgba(251,191,36,0.10)', color: '#FBBF24', border: 'rgba(251,191,36,0.22)', label: 'Examination' },
  unavailable: { bg: 'rgba(0,0,0,0.04)',      color: '#78716C', border: 'rgba(0,0,0,0.10)',      label: 'N/A'        },
  pending:     { bg: 'rgba(234,179,8,0.12)',  color: '#854D0E',               border: 'rgba(234,179,8,0.30)', label: 'Pending'  },
}

const CONTAINER_SIZES = [
  '', '20ft Standard', '40ft Standard', '40ft High Cube', '45ft High Cube',
]

const PURPOSES = [
  '', 'Delivery to Consignee', 'Customs Examination', 'Transfer to Another Depot', 'Return to Shipper',
]

// ─── Per-slot "done" check ────────────────────────────────────────────────────
function isSlotDetailDone(cfg: any): boolean {
  if (!(cfg.driverName ?? '').trim() || !(cfg.vehicleRegistration ?? '').trim()) return false
  const svc = cfg.serviceType; const lt = cfg.loadType
  const cn = (cfg.containerNumber ?? '').trim()
  const hbl = (cfg.hbl ?? '').trim()
  const cs = (cfg.containerSize ?? '').trim()
  const en = (cfg.entryNumber ?? '').trim()
  const pu = (cfg.purpose ?? '').trim()
  const co = (cfg.consolidator ?? '').trim()
  const br = (cfg.bookingReference ?? '').trim()
  if (svc === 'pickup'  && lt === 'lcl')   return !!(cn && hbl)
  if (svc === 'pickup'  && lt === 'fcl')   return !!(cn && cs)
  if (svc === 'dropoff' && lt === 'lcl')   return !!(br && co && en && pu)
  if (svc === 'dropoff' && lt === 'fcl')   return !!(cn && cs && en && pu)
  return false
}

export function Step5Documents() {
  const { state, dispatch, canProceed } = useWizard()
  const [touched, setTouch] = useState<Record<string, boolean>>({})

  const set = (f: keyof typeof state, v: string) => dispatch({ type: 'SET', field: f as any, value: v })
  const touch = (f: string) => setTouch(p => ({ ...p, [f]: true }))

  const multi = state.slotCount > 1

  // ── Step auto-advance (fires once when canProceed flips true) ─────────────
  const [stepCountdown,  setStepCountdown]  = useState<number | null>(null)
  const stepCountdownRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const stepAdvancedRef   = useRef(false)   // resets only on unmount (component stays mounted while on step 5)

  const clearStepCountdown = () => {
    if (stepCountdownRef.current) { clearInterval(stepCountdownRef.current); stepCountdownRef.current = null }
    setStepCountdown(null)
  }

  useEffect(() => {
    if (canProceed && !stepAdvancedRef.current) {
      let remaining = 3
      setStepCountdown(remaining)
      stepCountdownRef.current = setInterval(() => {
        remaining--
        if (remaining <= 0) {
          clearInterval(stepCountdownRef.current!); stepCountdownRef.current = null
          setStepCountdown(null)
          stepAdvancedRef.current = true
          dispatch({ type: 'SET', field: 'step', value: state.step + 1 })
          window.scrollTo({ top: 0, behavior: 'smooth' })
        } else {
          setStepCountdown(remaining)
        }
      }, 1000)
    } else if (!canProceed) {
      // If user edits and breaks completion, cancel and reset so it can fire again
      clearStepCountdown()
      stepAdvancedRef.current = false
    }
    return () => { if (stepCountdownRef.current) clearInterval(stepCountdownRef.current) }
  }, [canProceed]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tab state for multi-slot — lifted into WizardState so BookingWizard footer can react
  const activeSlot5 = state.step5ActiveSlot ?? 0
  const setActiveSlot5 = (i: number) => dispatch({ type: 'SET', field: 'step5ActiveSlot', value: i })

  const isPickupLcl  = state.serviceType === 'pickup'  && state.loadType === 'lcl'
  const isPickupFcl  = state.serviceType === 'pickup'  && state.loadType === 'fcl'
  const isDropoffLcl = state.serviceType === 'dropoff' && state.loadType === 'lcl'
  const isDropoffFcl = state.serviceType === 'dropoff' && state.loadType === 'fcl'

  // ── Shipment lookup ────────────────────────────────────────────────────────
  const fetchLcl = async () => {
    if (!state.hbl.trim()) return
    dispatch({ type: 'SET_SHIPMENT', data: null, loading: true, error: null, fetched: false })
    try {
      const data = await lookupShipment(DEFAULT_TENANT_ID, state.hbl.trim())
      dispatch({ type: 'SET_SHIPMENT', data: data ?? null, loading: false, error: data ? null : 'HBL not found.', fetched: true })
      if (data?.containerNumber) dispatch({ type: 'SET', field: 'containerNumber', value: data.containerNumber })
      if (data?.icsStatus) dispatch({ type: 'SET_SLOT_DETAIL', slotIndex: 0, field: 'icsStatus', value: data.icsStatus })
    } catch {
      dispatch({ type: 'SET_SHIPMENT', data: null, loading: false, error: 'Lookup failed.', fetched: false })
    }
  }

  const fetchFcl = async () => {
    if (!state.containerNumber.trim()) return
    dispatch({ type: 'SET_SHIPMENT', data: null, loading: true, error: null, fetched: false })
    try {
      const data = await lookupShipmentByContainer(DEFAULT_TENANT_ID, state.containerNumber.trim())
      const result = data ?? { id: '', hbl: '', containerNumber: state.containerNumber.trim(), icsStatus: 'unavailable', readyForCollection: false }
      dispatch({ type: 'SET_SHIPMENT', data: result, loading: false, error: data ? null : 'Container not found in CFS records — ICS status unavailable.', fetched: true })
      dispatch({ type: 'SET_SLOT_DETAIL', slotIndex: 0, field: 'icsStatus', value: result.icsStatus })
    } catch {
      dispatch({ type: 'SET_SHIPMENT', data: null, loading: false, error: 'Lookup failed. Enter details manually.', fetched: false })
    }
  }

  const fetchByEntry = async () => {
    if (!state.entryNumber.trim()) return
    dispatch({ type: 'SET_SHIPMENT', data: null, loading: true, error: null, fetched: false })
    try {
      const data = await lookupShipment(DEFAULT_TENANT_ID, state.entryNumber.trim())
      dispatch({ type: 'SET_SHIPMENT', data: data ?? null, loading: false, error: data ? null : 'Customs entry not found in CFS records.', fetched: true })
      if (data?.icsStatus) dispatch({ type: 'SET_SLOT_DETAIL', slotIndex: 0, field: 'icsStatus', value: data.icsStatus })
    } catch {
      dispatch({ type: 'SET_SHIPMENT', data: null, loading: false, error: 'Lookup failed.', fetched: false })
    }
  }

  const sd        = state.shipmentData
  const icsBadge  = ICS_MAP[sd?.icsStatus ?? ''] ?? ICS_MAP.pending
  const showChep  = sd?.palletType === 'chep'
  const showHeld  = sd?.icsStatus === 'held'

  // Multi-slot: tab switcher + per-slot driver fields
  if (multi) {
    const [sameDriver, setSameDriver] = useState(false)

    const setSlot = (slotIndex: number) => (f: string, v: string) => {
      const driverFields = ['driverName', 'driverPhone', 'vehicleRegistration']
      if (sameDriver && driverFields.includes(f)) {
        for (const cfg of state.slotConfigs) {
          dispatch({ type: 'SET_SLOT_DETAIL', slotIndex: cfg.index, field: f, value: v })
        }
      } else {
        dispatch({ type: 'SET_SLOT_DETAIL', slotIndex, field: f, value: v })
      }
    }

    const toggleSameDriver = (on: boolean) => {
      setSameDriver(on)
      if (on && activeCfg5) {
        const { driverName, driverPhone, vehicleRegistration } = activeCfg5
        for (const cfg of state.slotConfigs) {
          dispatch({ type: 'SET_SLOT_DETAIL', slotIndex: cfg.index, field: 'driverName',          value: driverName          ?? '' })
          dispatch({ type: 'SET_SLOT_DETAIL', slotIndex: cfg.index, field: 'driverPhone',         value: driverPhone         ?? '' })
          dispatch({ type: 'SET_SLOT_DETAIL', slotIndex: cfg.index, field: 'vehicleRegistration', value: vehicleRegistration ?? '' })
        }
      }
    }

    const activeCfg5 = state.slotConfigs[activeSlot5]

    const advanceToNextIncomplete = () => {
      const nextIncomplete = state.slotConfigs.findIndex((c, i) => i > activeSlot5 && !isSlotDetailDone(c))
      if (nextIncomplete !== -1) setActiveSlot5(nextIncomplete)
    }

    // Auto-advance countdown — only fires once per slot (tracked by alreadyAdvanced set)
    // Pre-populate with slots that are already done so toast doesn't re-appear on navigate-back
    const [countdown, setCountdown] = useState<number | null>(null)
    const countdownRef    = useRef<ReturnType<typeof setInterval> | null>(null)
    const alreadyAdvanced = useRef<Set<number>>(
      new Set(state.slotConfigs.map((cfg, i) => isSlotDetailDone(cfg) ? i : -1).filter(i => i >= 0))
    )

    const clearCountdown = () => {
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
      setCountdown(null)
    }

    useEffect(() => {
      const isDone  = activeCfg5 && isSlotDetailDone(activeCfg5)
      const hasNext = state.slotConfigs.some((_, i) => i > activeSlot5)
      const alreadyDone = alreadyAdvanced.current.has(activeSlot5)
      if (isDone && hasNext && !alreadyDone) {
        let remaining = 5
        setCountdown(remaining)
        countdownRef.current = setInterval(() => {
          remaining--
          if (remaining <= 0) {
            clearInterval(countdownRef.current!); countdownRef.current = null
            setCountdown(null)
            alreadyAdvanced.current.add(activeSlot5)
            advanceToNextIncomplete()
          } else {
            setCountdown(remaining)
          }
        }, 1000)
      } else {
        clearCountdown()
      }
      return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
    }, [activeSlot5, activeCfg5?.driverName, activeCfg5?.vehicleRegistration, activeCfg5?.hbl, activeCfg5?.containerNumber, activeCfg5?.containerSize, activeCfg5?.entryNumber, activeCfg5?.purpose, activeCfg5?.consolidator, activeCfg5?.bookingReference]) // eslint-disable-line react-hooks/exhaustive-deps

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src={rollImg} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>Load Information</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '4px 0 0' }}>Enter shipment details for each booking slot.</p>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'linear-gradient(180deg, #ECEBEA 0%, #F5F4F3 100%)', borderRadius: 'var(--r-md)', padding: 5, boxShadow: 'inset 0 1.5px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(255,255,255,0.7)', overflowX: 'auto' }}>
          {state.slotConfigs.map((cfg, i) => {
            const done   = isSlotDetailDone(cfg)
            const active = activeSlot5 === i
            return (
              <motion.button
                key={i}
                type="button"
                onClick={() => { clearCountdown(); setActiveSlot5(i) }}
                whileTap={{ scale: 0.97 }}
                style={{
                  position: 'relative', padding: '9px 18px', fontSize: 15,
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--brand-color, #FC6514)' : '#6B7280',
                  background: 'transparent', border: 'none', borderRadius: 'var(--r-sm)',
                  cursor: 'pointer', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  transition: 'color 0.2s', fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}
              >
                {active && (
                  <motion.span
                    layoutId="slot5-tab-pill"
                    transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                    style={{ position: 'absolute', inset: 0, borderRadius: 'var(--r-sm)', zIndex: 0, background: 'linear-gradient(160deg, #FFFFFF 0%, #FAFAF9 100%)', boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.10), inset 0 1.5px 0 rgba(255,255,255,0.9)' }}
                  />
                )}
                <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {done && (
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  Slot {i + 1}
                </span>
              </motion.button>
            )
          })}
        </div>

        {/* Slot-switch toast — portalled to body to escape motion.div transform */}
        {countdown !== null && stepCountdown === null && createPortal(
          <div style={{ position: 'fixed', bottom: 182, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#1C1917', borderRadius: 'var(--r-full)', boxShadow: '0 8px 32px rgba(0,0,0,0.28)', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
                Slot {activeSlot5 + 1} complete ✓ — moving to Slot {activeSlot5 + 2} in {countdown}s
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--brand-color)', borderRadius: 99, width: `${((5 - countdown) / 5) * 100}%`, transition: 'width 1s linear' }} />
              </div>
            </div>
            <button type="button" onClick={clearCountdown} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 'var(--r-full)', padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}>
              Stay
            </button>
          </div>,
          document.body
        )}

        {/* Step-advance toast — portalled to body to escape motion.div transform */}
        {stepCountdown !== null && createPortal(
          <div style={{ position: 'fixed', bottom: 182, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#1C1917', borderRadius: 'var(--r-full)', boxShadow: '0 8px 32px rgba(0,0,0,0.28)', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
                All slots complete ✓ — continuing in {stepCountdown}s
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--brand-color)', borderRadius: 99, width: `${((3 - stepCountdown) / 3) * 100}%`, transition: 'width 1s linear' }} />
              </div>
            </div>
            <button type="button" onClick={clearStepCountdown} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 'var(--r-full)', padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}>
              Stay
            </button>
          </div>,
          document.body
        )}

        {/* Active slot panel */}
        <style>{`@keyframes slideInFromRight{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}`}</style>
        {activeCfg5 && (
          <div key={activeSlot5} style={{ animation: 'slideInFromRight 0.22s ease forwards' }}>
          <div style={{ padding: 20, background: '#F9F9F8', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', marginBottom: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 16 }}>
              Slot {activeCfg5.index} — {activeCfg5.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'} · {(activeCfg5.loadType ?? '').toUpperCase()}
              {activeCfg5.selectedSlotLabel && <span style={{ fontWeight: 400, marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>{activeCfg5.selectedDate} {activeCfg5.selectedSlotLabel}</span>}
            </p>
            <SlotDetailFields
              cfg={activeCfg5}
              set={setSlot(activeCfg5.index)}
              touched={touched}
              touch={touch}
              touchPrefix={`s${activeSlot5}_`}
              slotIndex={activeCfg5.index}
            />
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(0,0,0,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.07em', textTransform: 'uppercase', margin: 0 }}>Driver / Vehicle</p>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <button
                    type="button"
                    onClick={() => toggleSameDriver(!sameDriver)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: 0, background: 'none', border: 'none',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <span style={{
                      position: 'relative', width: 28, height: 16, borderRadius: 'var(--r-full)',
                      background: sameDriver ? 'var(--brand-color, #FC6514)' : '#D1D5DB',
                      display: 'inline-block', flexShrink: 0, transition: 'background 0.15s',
                    }}>
                      <span style={{
                        position: 'absolute', top: 2, left: sameDriver ? 14 : 2,
                        width: 12, height: 12, borderRadius: 'var(--r-full)',
                        background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.18)', transition: 'left 0.15s',
                      }} />
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: sameDriver ? 'var(--brand-color, #FC6514)' : '#6B7280', whiteSpace: 'nowrap' }}>
                      Apply to all slots
                    </span>
                  </button>
                  <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                    {sameDriver
                      ? `Same driver for all ${state.slotCount} slots`
                      : `Use the same driver for all ${state.slotCount} slots`}
                  </span>
                </div>
              </div>
              <DriverFields
                state={{
                  driverName:          activeCfg5.driverName ?? '',
                  driverPhone:         activeCfg5.driverPhone ?? '',
                  vehicleRegistration: activeCfg5.vehicleRegistration ?? '',
                }}
                set={setSlot(activeCfg5.index)}
                touch={(f: string) => touch(`s${activeSlot5}_${f}`)}
                touched={touched}
              />
            </div>
          </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Step-advance toast — single slot, portalled to body */}
      {stepCountdown !== null && createPortal(
        <div style={{ position: 'fixed', bottom: 182, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#1C1917', borderRadius: 'var(--r-full)', boxShadow: '0 8px 32px rgba(0,0,0,0.28)', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
              All done ✓ — continuing in {stepCountdown}s
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--brand-color)', borderRadius: 99, width: `${((3 - stepCountdown) / 3) * 100}%`, transition: 'width 1s linear' }} />
            </div>
          </div>
          <button type="button" onClick={clearStepCountdown} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: 'var(--r-full)', padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}>
            Stay
          </button>
        </div>,
        document.body
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src={rollImg} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
        </div>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>Load Information</h2>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '4px 0 0' }}>
            {isPickupLcl  && 'Enter your container and house bill details. ICS clearance status is checked automatically.'}
            {isPickupFcl  && 'Enter your container number and size. ICS clearance status is checked automatically.'}
            {isDropoffLcl && 'Enter your booking and customs details. ICS clearance status is checked automatically using the Customs Entry number.'}
            {isDropoffFcl && 'Enter your container details and customs information. ICS clearance status is checked automatically.'}
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          1. PICKUP + LCL
          Fields: Container Number (req), HBL Number (req)
      ══════════════════════════════════════════════════════ */}
      {isPickupLcl && (
        <div>
          <div style={{ ...ROW, marginBottom: 24 }}>
            <FField label="Container Number" required error={touched.containerNumber && !state.containerNumber.trim()}>
              <input
                type="text" className="wizard-field"
                value={state.containerNumber}
                onChange={e => set('containerNumber', e.target.value.toUpperCase())}
                onBlur={() => touch('containerNumber')}
                placeholder="e.g. MSCU1234567"
                style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
              />
            </FField>
            <FField label="House Bill of Lading #" required error={touched.hbl && !state.hbl.trim()}>
              <input
                type="text" className="wizard-field"
                value={state.hbl}
                onChange={e => set('hbl', e.target.value.toUpperCase())}
                onBlur={() => touch('hbl')}
                placeholder="e.g. SYHMSCU001847"
                style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
              />
              <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 5 }}>Enter the lowest house bill number</p>
            </FField>
          </div>
          <div style={{ marginBottom: 32 }}>
            <button type="button" className="btn-primary" onClick={fetchLcl} disabled={state.hbl.trim().length < 4 || state.shipmentLoading}>
              {state.shipmentLoading ? <Spinner /> : <Icon name={ICONS.search} size={16} />}
              {state.shipmentLoading ? 'Looking up...' : 'Look Up Shipment'}
            </button>
          </div>
          {state.shipmentFetched && sd && (
            <ShipmentCard sd={sd} icsBadge={icsBadge} showHeld={showHeld} showChep={showChep} />
          )}
          <DriverFields state={state} set={set} touch={touch} touched={touched} />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          2. DROPOFF + LCL
          Fields: Booking Confirmation # (req), Consolidator (req),
                  Entry Number (req), Purpose (req dropdown)
      ══════════════════════════════════════════════════════ */}
      {isDropoffLcl && (
        <div>
          <div style={{ ...ROW, marginBottom: 24 }}>
            <FField label="Booking Confirmation #" required error={touched.bookingReference && !state.bookingReference.trim()}>
              <input
                type="text" className="wizard-field"
                value={state.bookingReference}
                onChange={e => set('bookingReference', e.target.value)}
                onBlur={() => touch('bookingReference')}
                placeholder="e.g. BK-2026-00142"
              />
            </FField>
            <FField label="Consolidator / Freight Forwarder" required error={touched.consolidator && !state.consolidator.trim()}>
              <input
                type="text" className="wizard-field"
                value={state.consolidator}
                onChange={e => set('consolidator', e.target.value)}
                onBlur={() => touch('consolidator')}
                placeholder="e.g. Kuehne + Nagel"
              />
            </FField>
          </div>
          <div style={{ ...ROW, marginBottom: 16 }}>
            <FField label="Customs Entry #">
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="text" className="wizard-field"
                  value={state.entryNumber}
                  onChange={e => set('entryNumber', e.target.value.toUpperCase())}
                  onBlur={() => touch('entryNumber')}
                  placeholder="e.g. CE2026100142"
                  style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}
                />
                <button type="button" className="btn-primary" onClick={fetchByEntry} disabled={state.entryNumber.trim().length < 4 || state.shipmentLoading} style={{ flexShrink: 0 }}>
                  {state.shipmentLoading ? <Spinner /> : null}
                  Look Up
                </button>
              </div>
            </FField>
            <FField label="Purpose" required error={touched.purpose && !state.purpose.trim()}>
              <CustomSelect
                placeholder="Select purpose…"
                value={state.purpose}
                onChange={v => set('purpose', v)}
                onBlur={() => touch('purpose')}
                options={PURPOSES.filter(Boolean).map(p => ({ value: p, label: p }))}
              />
            </FField>
          </div>
          <ICSLookupBlock sd={sd} icsBadge={icsBadge} fetched={state.shipmentFetched} error={state.shipmentError} showHeld={showHeld} />
          <DriverFields state={state} set={set} touch={touch} touched={touched} />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          3. PICKUP + FCL
          Fields: Container Number (req), Container Size (req dropdown)
      ══════════════════════════════════════════════════════ */}
      {isPickupFcl && (
        <div>
          <div style={{ ...ROW, marginBottom: 24 }}>
            <FField label="Container Number" required error={touched.containerNumber && !state.containerNumber.trim()}>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="text" className="wizard-field"
                  value={state.containerNumber}
                  onChange={e => set('containerNumber', e.target.value.toUpperCase())}
                  onBlur={() => touch('containerNumber')}
                  placeholder="e.g. MSCU1234567"
                  style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}
                />
                <button type="button" className="btn-primary" onClick={fetchFcl} disabled={state.containerNumber.trim().length < 4 || state.shipmentLoading} style={{ flexShrink: 0 }}>
                  {state.shipmentLoading ? <Spinner /> : null}
                  Look Up
                </button>
              </div>
            </FField>
            <FField label="Container Size" required error={touched.containerSize && !state.containerSize.trim()}>
              <CustomSelect
                placeholder="Select size…"
                value={state.containerSize}
                onChange={v => set('containerSize', v)}
                onBlur={() => touch('containerSize')}
                options={CONTAINER_SIZES.filter(Boolean).map(s => ({ value: s, label: s }))}
              />
            </FField>
          </div>
          <ICSLookupBlock sd={sd} icsBadge={icsBadge} fetched={state.shipmentFetched} error={state.shipmentError} showHeld={showHeld} />
          <DriverFields state={state} set={set} touch={touch} touched={touched} />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          4. DROPOFF + FCL
          Fields: Container Number (req), Container Size (req dropdown),
                  Entry Number (req), Purpose (req dropdown)
      ══════════════════════════════════════════════════════ */}
      {isDropoffFcl && (
        <div>
          <div style={{ ...ROW, marginBottom: 24 }}>
            <FField label="Container Number" required error={touched.containerNumber && !state.containerNumber.trim()}>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="text" className="wizard-field"
                  value={state.containerNumber}
                  onChange={e => set('containerNumber', e.target.value.toUpperCase())}
                  onBlur={() => touch('containerNumber')}
                  placeholder="e.g. MSCU1234567"
                  style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}
                />
                <button type="button" className="btn-primary" onClick={fetchFcl} disabled={state.containerNumber.trim().length < 4 || state.shipmentLoading} style={{ flexShrink: 0 }}>
                  {state.shipmentLoading ? <Spinner /> : null}
                  Look Up
                </button>
              </div>
            </FField>
            <FField label="Container Size" required error={touched.containerSize && !state.containerSize.trim()}>
              <CustomSelect
                placeholder="Select size…"
                value={state.containerSize}
                onChange={v => set('containerSize', v)}
                onBlur={() => touch('containerSize')}
                options={CONTAINER_SIZES.filter(Boolean).map(s => ({ value: s, label: s }))}
              />
            </FField>
          </div>
          <div style={{ ...ROW, marginBottom: 16 }}>
            <FField label="Customs Entry #">
              <input
                type="text" className="wizard-field"
                value={state.entryNumber}
                onChange={e => set('entryNumber', e.target.value.toUpperCase())}
                onBlur={() => touch('entryNumber')}
                placeholder="e.g. CE2026100142"
                style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
              />
            </FField>
            <FField label="Purpose" required error={touched.purpose && !state.purpose.trim()}>
              <CustomSelect
                placeholder="Select purpose…"
                value={state.purpose}
                onChange={v => set('purpose', v)}
                onBlur={() => touch('purpose')}
                options={PURPOSES.filter(Boolean).map(p => ({ value: p, label: p }))}
              />
            </FField>
          </div>
          <ICSLookupBlock sd={sd} icsBadge={icsBadge} fetched={state.shipmentFetched} error={state.shipmentError} showHeld={showHeld} />
          <DriverFields state={state} set={set} touch={touch} touched={touched} />
        </div>
      )}

    </div>
  )
}

// ─── Reusable ICS lookup result block ────────────────────────────────────────

function ICSLookupBlock({ sd, icsBadge, fetched, error, showHeld = false, showChep = false }: {
  sd: any
  icsBadge: { bg: string; color: string; border: string; label: string }
  fetched: boolean
  error: string | null
  showHeld?: boolean
  showChep?: boolean
}) {
  if (!fetched) return null
  return (
    <div style={{ marginBottom: 24 }}>
      {sd && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>ICS Status:</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-full)', border: `1px solid ${icsBadge.border}`, background: icsBadge.bg, color: icsBadge.color }}>
            {icsBadge.label}
          </span>
        </div>
      )}
      {showHeld && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 'var(--r-sm)', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <Icon name={ICONS.warning} size={18} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontWeight: 600, color: '#EF4444', fontSize: 15, margin: '0 0 4px' }}>ICS Hold Detected</p>
            <p style={{ fontSize: 14, color: 'rgba(239,68,68,0.70)', lineHeight: 1.5, margin: 0 }}>This shipment is held by Australian Border Force. Contact your freight forwarder.</p>
          </div>
        </div>
      )}
      {showChep && (
        <div style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 'var(--r-sm)', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <Icon name={ICONS.warning} size={18} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontWeight: 600, color: '#B45309', fontSize: 15, margin: '0 0 4px' }}>CHEP Pallet Exchange Required</p>
            <p style={{ fontSize: 14, color: '#92400E', lineHeight: 1.5, margin: 0 }}>Bring the same number of empty CHEP pallets to exchange at collection.</p>
          </div>
        </div>
      )}
      {error && (
        <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 'var(--r-sm)', padding: '10px 14px', marginBottom: 16, fontSize: 14, color: '#B45309', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={ICONS.info} size={14} style={{ color: '#B45309', flexShrink: 0 }} />
          {error}
        </div>
      )}
      {sd && (sd.weightKg || sd.volumeCbm) && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 'var(--r-md)', padding: 20 }}>
          <p style={{ ...FL, marginBottom: 16 }}>Container details</p>
          <div style={ROW}>
            {[['Gross Weight', sd.weightKg ? `${sd.weightKg} kg` : '—'], ['Volume', sd.volumeCbm ? `${sd.volumeCbm} CBM` : '—']].map(([l, v]) => (
              <div key={l} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
                <p style={{ fontSize: 10, color: 'var(--text-secondary)', margin: '0 0 4px' }}>{l}</p>
                <p style={{ fontWeight: 600, color: '#1C1917', fontSize: 15, margin: 0 }}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Field wrapper with inline validation ─────────────────────────────────────

function FField({ label, required, error, children }: { label: string; required?: boolean; error?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ ...FL, color: error ? '#EF4444' : '#78716C' }}>
        {label}{required && <span style={{ color: '#EF4444', marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {error && <p style={{ fontSize: 13, color: '#EF4444', marginTop: 4 }}>This field is required</p>}
    </div>
  )
}

// ─── Driver fields ────────────────────────────────────────────────────────────

function DriverFields({ state, set, touch, touched }: { state: any; set: (f: any, v: string) => void; touch: (f: string) => void; touched: Record<string, boolean> }) {
  const [driverNameErr,  setDriverNameErr]  = useState('')
  const [savedDrivers,   setSavedDrivers]   = useState<SavedDriver[]>([])
  useEffect(() => { fetchSavedDrivers().then(setSavedDrivers) }, [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 8 }}>
      {savedDrivers.length > 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <FField label="Saved Drivers">
            <CustomSelect
              placeholder="Select a saved driver…"
              value={savedDrivers.find(s => s.name === state.driverName && s.vehicle_registration === state.vehicleRegistration)?.id ?? ''}
              onChange={id => {
                const d = savedDrivers.find(s => s.id === id)
                if (!d) return
                set('driverName', d.name)
                set('driverPhone', d.phone ?? '')
                set('vehicleRegistration', d.vehicle_registration)
              }}
              options={savedDrivers.map(d => ({ value: d.id, label: `${d.name} — ${d.vehicle_registration}` }))}
            />
          </FField>
        </div>
      )}
      <div>
        <FField label="Driver Name" required error={touched.driverName && !state.driverName.trim()}>
          <input
            type="text" className="wizard-field"
            value={state.driverName}
            onChange={e => { set('driverName', sanitize.nameChars(e.target.value)); if (driverNameErr) setDriverNameErr('') }}
            onBlur={() => { touch('driverName'); setDriverNameErr(validators.name(state.driverName)) }}
            placeholder="Person physically visiting"
          />
        </FField>
        {driverNameErr && <p style={{ fontSize: 13, color: '#EF4444', marginTop: 4 }}>{driverNameErr}</p>}
      </div>
      <FField label="Vehicle Registration" required error={touched.vehicleRegistration && !(state.vehicleRegistration ?? '').trim()}>
        <input
          type="text" className="wizard-field"
          value={state.vehicleRegistration ?? ''}
          onChange={e => set('vehicleRegistration', e.target.value.toUpperCase())}
          onBlur={() => touch('vehicleRegistration')}
          placeholder="e.g. ABC123"
          style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
        />
      </FField>
      <FField label="Driver Phone">
        <input
          type="tel" className="wizard-field"
          value={state.driverPhone ?? ''}
          onChange={e => set('driverPhone', e.target.value)}
          onBlur={() => touch('driverPhone')}
          placeholder="04xx xxx xxx"
        />
      </FField>
    </div>
  )
}

// ─── Shipment card (LCL pickup — full CFS data + estimated charges) ───────────

function ShipmentCard({ sd, icsBadge, showHeld, showChep }: any) {
  const charges = sd ? (() => {
    const storageDays = sd.storageStartDate ? Math.max(1, Math.ceil((Date.now() - new Date(sd.storageStartDate).getTime()) / 86400000)) : 0
    const storageCharge = sd.volumeCbm ? sd.volumeCbm * 8.5 * storageDays : 0
    const shrinkWrap = sd.palletCount ? sd.palletCount * 12 : 0
    const subtotal = storageCharge + shrinkWrap + 5
    const gst = subtotal * 0.1
    return { storageCharge, shrinkWrap, subtotal, gst, total: subtotal + gst }
  })() : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>ICS Status:</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-full)', border: `1px solid ${icsBadge.border}`, background: icsBadge.bg, color: icsBadge.color }}>{icsBadge.label}</span>
      </div>
      {showHeld && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 'var(--r-sm)', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 24 }}>
          <Icon name={ICONS.warning} size={18} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontWeight: 600, color: '#EF4444', fontSize: 15, margin: '0 0 4px' }}>ICS Hold Detected</p>
            <p style={{ fontSize: 14, color: 'rgba(239,68,68,0.70)', lineHeight: 1.5, margin: 0 }}>This shipment is held by Australian Border Force. Contact your freight forwarder.</p>
          </div>
        </div>
      )}
      {showChep && (
        <div style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 'var(--r-sm)', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 24 }}>
          <Icon name={ICONS.warning} size={18} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontWeight: 600, color: '#B45309', fontSize: 15, margin: '0 0 4px' }}>CHEP Pallet Exchange Required</p>
            <p style={{ fontSize: 14, color: '#92400E', lineHeight: 1.5, margin: 0 }}>Bring the same number of empty CHEP pallets to exchange at collection.</p>
          </div>
        </div>
      )}
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 'var(--r-md)', padding: 20, marginBottom: 24 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.09em', textTransform: 'uppercase', margin: '0 0 16px' }}>Auto-populated from CFS records</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[['Weight', sd.weightKg ? sd.weightKg + ' kg' : '—'], ['Volume', sd.volumeCbm ? sd.volumeCbm + ' CBM' : '—'], ['Packages', sd.packageCount || '—'], ['Pallets', sd.palletCount ? `${sd.palletCount} × ${sd.palletType}` : '—'], ['Storage from', sd.storageStartDate || '—'], ['Days in store', '—']].map(([l, v]) => (
            <div key={l} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
              <p style={{ fontSize: 10, color: 'var(--text-secondary)', margin: '0 0 4px' }}>{l}</p>
              <p style={{ fontWeight: 600, color: '#1C1917', fontSize: 15, margin: 0 }}>{String(v)}</p>
            </div>
          ))}
        </div>
      </div>
      {charges && charges.total > 5.5 && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 'var(--r-md)', padding: 20, marginBottom: 32 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: '0 0 16px' }}>Estimated Charges</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 15 }}>
            {charges.storageCharge > 0 && <ChargeRow label="Storage" val={`$${charges.storageCharge.toFixed(2)}`} />}
            {charges.shrinkWrap   > 0 && <ChargeRow label="Shrink wrap" val={`$${charges.shrinkWrap.toFixed(2)}`} />}
            <ChargeRow label="Slot fee" val="$5.00" />
            <div style={{ height: 1, background: 'rgba(0,0,0,0.07)', margin: '2px 0' }} />
            <ChargeRow label="Subtotal" val={`$${charges.subtotal.toFixed(2)}`} bold />
            <ChargeRow label="GST (10%)" val={`$${charges.gst.toFixed(2)}`} small />
            <div style={{ height: 1, background: 'rgba(0,0,0,0.07)', margin: '2px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1C1917', fontSize: 15 }}>
              <span>Total</span><span style={{ color: 'var(--brand-color)' }}>${charges.total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ChargeRow({ label, val, bold, small }: { label: string; val: string; bold?: boolean; small?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', color: bold ? '#1C1917' : '#78716C', fontWeight: bold ? 600 : 400, fontSize: small ? 12 : 13 }}>
      <span>{label}</span><span>{val}</span>
    </div>
  )
}

function Spinner() {
  return <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.25)', borderTopColor: '#fff', borderRadius: 'var(--r-full)', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
}

// ─── Per-slot detail fields for multi-slot mode ───────────────────────────────

function SlotDetailFields({ cfg, set, touched, touch, touchPrefix, slotIndex }: {
  cfg: SlotConfig
  set: (f: string, v: string) => void
  touched: Record<string, boolean>
  touch: (f: string) => void
  touchPrefix: string
  slotIndex: number
}) {
  const { dispatch } = useWizard()
  const [slotShipmentData,    setSlotShipmentData]    = useState<any>(null)
  const [slotShipmentFetched, setSlotShipmentFetched] = useState(false)
  const [slotShipmentLoading, setSlotShipmentLoading] = useState(false)
  const [slotShipmentError,   setSlotShipmentError]   = useState<string | null>(null)

  const fetchSlotLcl = async () => {
    const hblVal = (cfg.hbl ?? '').trim()
    if (!hblVal) return
    setSlotShipmentLoading(true); setSlotShipmentData(null); setSlotShipmentFetched(false); setSlotShipmentError(null)
    try {
      const data = await lookupShipment(DEFAULT_TENANT_ID, hblVal)
      setSlotShipmentData(data ?? null)
      setSlotShipmentError(data ? null : 'HBL not found.')
      setSlotShipmentFetched(true)
      if (data?.containerNumber) {
        set('containerNumber', data.containerNumber)
        dispatch({ type: 'SET_SLOT_DETAIL', slotIndex, field: 'containerNumber', value: data.containerNumber })
      }
      if (data?.icsStatus) dispatch({ type: 'SET_SLOT_DETAIL', slotIndex, field: 'icsStatus', value: data.icsStatus })
    } catch { setSlotShipmentError('Lookup failed.') }
    finally { setSlotShipmentLoading(false) }
  }

  const fetchSlotFcl = async () => {
    const cnVal = (cfg.containerNumber ?? '').trim()
    if (!cnVal) return
    setSlotShipmentLoading(true); setSlotShipmentData(null); setSlotShipmentFetched(false); setSlotShipmentError(null)
    try {
      const data = await lookupShipmentByContainer(DEFAULT_TENANT_ID, cnVal)
      const result = data ?? { id: '', hbl: '', containerNumber: cnVal, icsStatus: 'unavailable', readyForCollection: false }
      setSlotShipmentData(result)
      setSlotShipmentError(data ? null : 'Container not found in CFS records — ICS status unavailable.')
      setSlotShipmentFetched(true)
      dispatch({ type: 'SET_SLOT_DETAIL', slotIndex, field: 'icsStatus', value: result.icsStatus })
    } catch { setSlotShipmentError('Lookup failed. Enter details manually.') }
    finally { setSlotShipmentLoading(false) }
  }

  const fetchSlotEntry = async () => {
    const enVal = (cfg.entryNumber ?? '').trim()
    if (!enVal) return
    setSlotShipmentLoading(true); setSlotShipmentData(null); setSlotShipmentFetched(false); setSlotShipmentError(null)
    try {
      const data = await lookupShipment(DEFAULT_TENANT_ID, enVal)
      setSlotShipmentData(data ?? null)
      setSlotShipmentError(data ? null : 'Customs entry not found in CFS records.')
      setSlotShipmentFetched(true)
      if (data?.icsStatus) dispatch({ type: 'SET_SLOT_DETAIL', slotIndex, field: 'icsStatus', value: data.icsStatus })
    } catch { setSlotShipmentError('Lookup failed.') }
    finally { setSlotShipmentLoading(false) }
  }

  const sd       = slotShipmentData
  const icsBadge = ICS_MAP[sd?.icsStatus ?? ''] ?? ICS_MAP.pending
  const showHeld = sd?.icsStatus === 'held'

  const svc = cfg.serviceType; const lt = cfg.loadType
  const isPickupLcl  = svc === 'pickup'  && lt === 'lcl'
  const isPickupFcl  = svc === 'pickup'  && lt === 'fcl'
  const isDropoffLcl = svc === 'dropoff' && lt === 'lcl'
  const isDropoffFcl = svc === 'dropoff' && lt === 'fcl'
  const p = touchPrefix  // key prefix to avoid cross-slot touch collision

  // Safe accessors — guard against undefined when restored from sessionStorage
  const cn  = cfg.containerNumber  ?? ''
  const hbl = cfg.hbl              ?? ''
  const cs  = cfg.containerSize    ?? ''
  const en  = cfg.entryNumber      ?? ''
  const pu  = cfg.purpose          ?? ''
  const co  = cfg.consolidator     ?? ''
  const br  = cfg.bookingReference ?? ''

  if (isPickupLcl) return (
    <div>
      <div style={{ ...ROW, marginBottom: 16 }}>
        <FField label="Container Number" required error={touched[p+'cn'] && !cn.trim()}>
          <input type="text" className="wizard-field" value={cn}
            onChange={e => set('containerNumber', e.target.value.toUpperCase())}
            onBlur={() => touch(p+'cn')} placeholder="e.g. MSCU1234567"
            style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }} />
        </FField>
        <FField label="House Bill of Lading #" required error={touched[p+'hbl'] && !hbl.trim()}>
          <input type="text" className="wizard-field" value={hbl}
            onChange={e => set('hbl', e.target.value.toUpperCase())}
            onBlur={() => touch(p+'hbl')} placeholder="e.g. SYHMSCU001847"
            style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }} />
          <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 5 }}>Enter the lowest house bill number</p>
        </FField>
      </div>
      <div style={{ marginBottom: 16 }}>
        <button type="button" className="btn-primary" onClick={fetchSlotLcl}
          disabled={hbl.trim().length < 4 || slotShipmentLoading}>
          {slotShipmentLoading ? <Spinner /> : <Icon name={ICONS.search} size={16} />}
          {slotShipmentLoading ? 'Looking up...' : 'Look Up Shipment'}
        </button>
      </div>
      <ICSLookupBlock sd={sd} icsBadge={icsBadge} fetched={slotShipmentFetched} error={slotShipmentError} showHeld={showHeld} />
    </div>
  )

  if (isPickupFcl) return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
        <FField label="Container Number" required error={touched[p+'cn'] && !cn.trim()}>
          <div style={{ display: 'flex', gap: 10 }}>
            <input type="text" className="wizard-field" value={cn}
              onChange={e => set('containerNumber', e.target.value.toUpperCase())}
              onBlur={() => touch(p+'cn')} placeholder="e.g. MSCU1234567"
              style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }} />
            <button type="button" className="btn-primary" onClick={fetchSlotFcl}
              disabled={cn.trim().length < 4 || slotShipmentLoading} style={{ flexShrink: 0 }}>
              {slotShipmentLoading ? <Spinner /> : null}
              Look Up
            </button>
          </div>
        </FField>
        <FField label="Container Size" required error={touched[p+'cs'] && !cs.trim()}>
          <CustomSelect placeholder="Select size…" value={cs}
            onChange={v => set('containerSize', v)} onBlur={() => touch(p+'cs')}
            options={CONTAINER_SIZES.filter(Boolean).map(s => ({ value: s, label: s }))} />
        </FField>
      </div>
      <ICSLookupBlock sd={sd} icsBadge={icsBadge} fetched={slotShipmentFetched} error={slotShipmentError} showHeld={showHeld} />
    </div>
  )

  if (isDropoffLcl) return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
        <FField label="Booking Confirmation #" required error={touched[p+'br'] && !br.trim()}>
          <input type="text" className="wizard-field" value={br}
            onChange={e => set('bookingReference', e.target.value)}
            onBlur={() => touch(p+'br')} placeholder="e.g. BK-2026-00142" />
        </FField>
        <FField label="Consolidator / Freight Forwarder" required error={touched[p+'co'] && !co.trim()}>
          <input type="text" className="wizard-field" value={co}
            onChange={e => set('consolidator', e.target.value)}
            onBlur={() => touch(p+'co')} placeholder="e.g. Kuehne + Nagel" />
        </FField>
        <FField label="Customs Entry #">
          <div style={{ display: 'flex', gap: 10 }}>
            <input type="text" className="wizard-field" value={en}
              onChange={e => set('entryNumber', e.target.value.toUpperCase())}
              onBlur={() => touch(p+'en')} placeholder="e.g. CE2026100142"
              style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }} />
            <button type="button" className="btn-primary" onClick={fetchSlotEntry}
              disabled={en.trim().length < 4 || slotShipmentLoading} style={{ flexShrink: 0 }}>
              {slotShipmentLoading ? <Spinner /> : null}
              Look Up
            </button>
          </div>
        </FField>
        <FField label="Purpose" required error={touched[p+'pu'] && !pu.trim()}>
          <CustomSelect placeholder="Select purpose…" value={pu}
            onChange={v => set('purpose', v)} onBlur={() => touch(p+'pu')}
            options={PURPOSES.filter(Boolean).map(p2 => ({ value: p2, label: p2 }))} />
        </FField>
      </div>
      <ICSLookupBlock sd={sd} icsBadge={icsBadge} fetched={slotShipmentFetched} error={slotShipmentError} showHeld={showHeld} />
    </div>
  )

  if (isDropoffFcl) return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
        <FField label="Container Number" required error={touched[p+'cn'] && !cn.trim()}>
          <div style={{ display: 'flex', gap: 10 }}>
            <input type="text" className="wizard-field" value={cn}
              onChange={e => set('containerNumber', e.target.value.toUpperCase())}
              onBlur={() => touch(p+'cn')} placeholder="e.g. MSCU1234567"
              style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }} />
            <button type="button" className="btn-primary" onClick={fetchSlotFcl}
              disabled={cn.trim().length < 4 || slotShipmentLoading} style={{ flexShrink: 0 }}>
              {slotShipmentLoading ? <Spinner /> : null}
              Look Up
            </button>
          </div>
        </FField>
        <FField label="Container Size" required error={touched[p+'cs'] && !cs.trim()}>
          <CustomSelect placeholder="Select size…" value={cs}
            onChange={v => set('containerSize', v)} onBlur={() => touch(p+'cs')}
            options={CONTAINER_SIZES.filter(Boolean).map(s => ({ value: s, label: s }))} />
        </FField>
        <FField label="Customs Entry #">
          <input type="text" className="wizard-field" value={en}
            onChange={e => set('entryNumber', e.target.value.toUpperCase())}
            onBlur={() => touch(p+'en')} placeholder="e.g. CE2026100142"
            style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }} />
        </FField>
        <FField label="Purpose" required error={touched[p+'pu'] && !pu.trim()}>
          <CustomSelect placeholder="Select purpose…" value={pu}
            onChange={v => set('purpose', v)} onBlur={() => touch(p+'pu')}
            options={PURPOSES.filter(Boolean).map(p2 => ({ value: p2, label: p2 }))} />
        </FField>
      </div>
      <ICSLookupBlock sd={sd} icsBadge={icsBadge} fetched={slotShipmentFetched} error={slotShipmentError} showHeld={showHeld} />
    </div>
  )

  return null
}
