import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useWizard } from '@/contexts/WizardContext'
import pickupImg  from '@/assets/pickup.png'
import dropoffImg from '@/assets/dropoff.png'
import serviceImg from '@/assets/service.png'

type ServiceType = 'pickup' | 'dropoff'

export function Step2SlotPicker() {
  const { state, dispatch } = useWizard()
  const [applyAll, setApplyAll] = useState(false)

  const multi = state.slotCount > 1

  // Tab state for multi-slot — lifted into WizardState so the 3D scene can focus on the slot being edited
  const activeSlot = state.step2ActiveSlot ?? 0
  const setActiveSlot = (i: number) => dispatch({ type: 'SET', field: 'step2ActiveSlot', value: i })

  // Start on the first slot that hasn't been filled yet (only on first visit)
  useEffect(() => {
    if (state.step2ActiveSlot === 0) {
      const firstIncomplete = state.slotConfigs.findIndex(c => !c.serviceType)
      if (firstIncomplete > 0) setActiveSlot(firstIncomplete)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setService = (slotIndex: number, v: ServiceType) => {
    dispatch({ type: 'SET_SLOT_CONFIG', slotIndex, field: 'serviceType', value: v })
  }

  const setServiceAll = (v: ServiceType) => {
    for (const cfg of state.slotConfigs) {
      dispatch({ type: 'SET_SLOT_CONFIG', slotIndex: cfg.index, field: 'serviceType', value: v })
    }
  }

  const handleSelect = (slotIndex: number, v: ServiceType) => {
    if (applyAll) {
      setServiceAll(v)
    } else {
      setService(slotIndex, v)
      // Auto-advance to next incomplete slot
      if (multi && activeSlot < state.slotConfigs.length - 1) {
        setActiveSlot(activeSlot + 1)
      }
    }
  }

  const activeCfg = state.slotConfigs[activeSlot]

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src={serviceImg} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>Service type</h2>
            <p style={{ fontSize: 15, color: '#4F4F4F', lineHeight: 1.5, margin: '4px 0 0' }}>
              {multi
                ? 'Select the service type for each slot.'
                : 'Are you collecting cargo from us, or delivering cargo to us?'}
            </p>
          </div>
        </div>
        {multi && (
          <ApplyAllToggle
            on={applyAll}
            onToggle={() => setApplyAll(v => !v)}
            slotCount={state.slotCount}
            field="service type"
          />
        )}
      </div>

      {/* Tab bar — only when multi and not applyAll */}
      {multi && !applyAll && (
        <div className="no-scrollbar" style={{ display: 'inline-flex', maxWidth: '100%', gap: 4, marginBottom: 24, background: 'linear-gradient(180deg, #ECEBEA 0%, #F5F4F3 100%)', borderRadius: 'var(--r-md)', padding: 5, boxShadow: 'inset 0 1.5px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(255,255,255,0.7)', overflowX: 'auto' }}>
          {state.slotConfigs.map((cfg, i) => {
            const done = !!cfg.serviceType
            const active = activeSlot === i
            return (
              <motion.button
                key={i}
                type="button"
                onClick={() => setActiveSlot(i)}
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
                    layoutId="slot2-tab-pill"
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
      )}


      {/* Cards — single slot view when multi, or all-at-once when applyAll */}
      <style>{`
        @keyframes slideInFromRight{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div key={activeSlot} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28, animation: 'slideInFromRight 0.22s ease forwards' }}>
        <OptionCard
          selected={(applyAll ? state.slotConfigs[0]?.serviceType : activeCfg?.serviceType) === 'pickup'}
          onClick={() => handleSelect(activeCfg?.index ?? 1, 'pickup')}
          icon={<img src={pickupImg} alt="Pick Up" style={{ width: 80, height: 80, objectFit: 'contain' }} />}
          title="Pick Up"
          desc="Collect cargo from us"
        />
        <OptionCard
          selected={(applyAll ? state.slotConfigs[0]?.serviceType : activeCfg?.serviceType) === 'dropoff'}
          onClick={() => handleSelect(activeCfg?.index ?? 1, 'dropoff')}
          icon={<img src={dropoffImg} alt="Drop Off" style={{ width: 80, height: 80, objectFit: 'contain' }} />}
          title="Drop Off"
          desc="Deliver cargo to us"
        />
      </div>
    </div>
  )
}

function OptionCard({ selected, onClick, icon, title, desc }: {
  selected: boolean; onClick: () => void; icon: React.ReactNode
  title: string; desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`wiz-tile${selected ? ' selected' : ''}`}
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        padding: '20px 18px 18px',
        border: selected ? '2px solid var(--brand-color, #FC6514)' : undefined,
        cursor: 'pointer', textAlign: 'left',
        width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
      }}
    >
      {selected && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          width: 20, height: 20, borderRadius: 'var(--r-full)',
          background: 'linear-gradient(160deg, color-mix(in srgb, var(--brand-color) 88%, #fff), var(--brand-color))',
          boxShadow: '0 2px 5px rgba(var(--brand-rgb),0.4), inset 0 1px 0 rgba(255,255,255,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
            <path d="M1 4.5L4 7.5L10 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
      <div style={{
        width: 112, height: 112, borderRadius: 'var(--r-xl)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 14, flexShrink: 0,
        background: selected
          ? 'linear-gradient(160deg, color-mix(in srgb, var(--brand-color) 88%, #fff) 0%, var(--brand-color) 60%, color-mix(in srgb, var(--brand-color) 78%, #000) 100%)'
          : 'linear-gradient(160deg, #F7F6F5 0%, #ECEBE9 100%)',
        color: selected ? '#fff' : '#6B7280', transition: 'all 0.15s ease',
        boxShadow: selected
          ? '0 2px 4px rgba(0,0,0,0.10), 0 6px 16px rgba(var(--brand-rgb),0.30), inset 0 1.5px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.12)'
          : 'inset 0 1.5px 3px rgba(0,0,0,0.06), 0 1px 1px rgba(255,255,255,0.8)',
      }}>
        {icon}
      </div>
      <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 4, lineHeight: 1.2 }}>{title}</p>
      <p style={{ fontSize: 15, color: 'var(--text-mid)', lineHeight: 1.4, marginBottom: 0 }}>{desc}</p>
    </button>
  )
}

function ApplyAllToggle({ on, onToggle, slotCount, field }: {
  on: boolean; onToggle: () => void; slotCount: number; field: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '5px 12px', borderRadius: 'var(--r-full)',
          background: on ? 'rgba(var(--brand-rgb),0.10)' : 'rgba(0,0,0,0.06)',
          border: `1.5px solid ${on ? 'rgba(var(--brand-rgb),0.30)' : 'rgba(0,0,0,0.12)'}`,
          cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
        }}
      >
        <span style={{
          position: 'relative', width: 28, height: 16, borderRadius: 'var(--r-full)',
          background: on ? 'var(--brand-color, #FC6514)' : '#D1D5DB',
          display: 'inline-block', flexShrink: 0, transition: 'background 0.15s',
        }}>
          <span style={{
            position: 'absolute', top: 2, left: on ? 14 : 2,
            width: 12, height: 12, borderRadius: 'var(--r-full)',
            background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.18)', transition: 'left 0.15s',
          }} />
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: on ? 'var(--brand-color, #FC6514)' : '#6B7280', whiteSpace: 'nowrap' }}>
          Apply to all bookings
        </span>
      </button>
      <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
        {on
          ? `${field} selected for all ${slotCount} bookings`
          : `Use the same ${field} for all ${slotCount} bookings`}
      </span>
    </div>
  )
}
