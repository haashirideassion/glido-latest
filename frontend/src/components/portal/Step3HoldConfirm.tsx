import { useEffect, useState } from 'react'
import { useWizard } from '@/contexts/WizardContext'
import fclImg     from '@/assets/fcl.png'
import lclImg     from '@/assets/lcl.png'
import packageImg from '@/assets/package.png'

const LOAD_OPTIONS = [
  {
    value: 'fcl' as const,
    img: fclImg,
    label: 'FCL',
    sub: 'Select this for packed container',
    bullets: ['Container number required', 'No HBL needed'],
  },
  {
    value: 'lcl' as const,
    img: lclImg,
    label: 'LCL',
    sub: 'Loose cargo, pallets, cartons, vehicles etc',
    bullets: ['HBL + container number', 'ICS auto-checked'],
  },
]

export function Step3HoldConfirm() {
  const { state, dispatch } = useWizard()
  const [applyAll, setApplyAll] = useState(false)

  const multi = state.slotCount > 1

  // Tab state for multi-slot — lifted into WizardState so the 3D scene can focus on the slot being edited
  const activeSlot = state.step3ActiveSlot ?? 0
  const setActiveSlot = (i: number) => dispatch({ type: 'SET', field: 'step3ActiveSlot', value: i })

  // Start on the first slot that hasn't been filled yet (only on first visit)
  useEffect(() => {
    if (state.step3ActiveSlot === 0) {
      const firstIncomplete = state.slotConfigs.findIndex(c => !c.loadType)
      if (firstIncomplete > 0) setActiveSlot(firstIncomplete)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setLoad = (slotIndex: number, v: 'fcl' | 'lcl') =>
    dispatch({ type: 'SET_SLOT_CONFIG', slotIndex, field: 'loadType', value: v })

  const setLoadAll = (v: 'fcl' | 'lcl') => {
    for (const cfg of state.slotConfigs) {
      dispatch({ type: 'SET_SLOT_CONFIG', slotIndex: cfg.index, field: 'loadType', value: v })
    }
  }

  const handleSelect = (slotIndex: number, v: 'fcl' | 'lcl') => {
    if (applyAll) {
      setLoadAll(v)
    } else {
      setLoad(slotIndex, v)
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
            <img src={packageImg} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>Cargo type</h2>
            <p style={{ fontSize: 15, color: '#4F4F4F', lineHeight: 1.5, margin: '4px 0 0' }}>
              {multi
                ? 'Select FCL or LCL for each slot.'
                : 'Select whether your shipment is FCL or LCL — this determines which details we ask for next.'}
            </p>
          </div>
        </div>
        {multi && (
          <ApplyAllToggle
            on={applyAll}
            onToggle={() => setApplyAll(v => !v)}
            slotCount={state.slotCount}
            field="load type"
          />
        )}
      </div>

      {/* Tab bar — only when multi and not applyAll */}
      {multi && !applyAll && (
        <div style={{ display: 'flex', borderBottom: '2px solid #F3F4F6', marginBottom: 24, gap: 0 }}>
          {state.slotConfigs.map((cfg, i) => {
            const done = !!cfg.loadType
            const active = activeSlot === i
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActiveSlot(i)}
                style={{
                  padding: '10px 24px', fontSize: 15,
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--brand-color, #FC6514)' : '#6B7280',
                  background: 'none', border: 'none',
                  borderBottom: active ? '2px solid var(--brand-color, #FC6514)' : '2px solid transparent',
                  marginBottom: -2, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  transition: 'all 0.15s', fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}
              >
                {done && (
                  <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                    <path d="M1 5L4.5 8.5L11 1" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                Slot {i + 1}
              </button>
            )
          })}
        </div>
      )}

      {/* Copy from the previous slot — quick fill for repetitive multi-slot bookings */}
      {multi && !applyAll && activeSlot > 0 && state.slotConfigs[activeSlot - 1]?.loadType && (
        <button
          type="button"
          onClick={() => setLoad(activeCfg.index, state.slotConfigs[activeSlot - 1].loadType as 'fcl' | 'lcl')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
            color: 'var(--brand-color)', background: 'rgba(var(--brand-rgb),0.06)',
            border: '1px solid rgba(var(--brand-rgb),0.18)', borderRadius: 999, padding: '6px 14px',
            marginBottom: 16, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M3 10.5V3.5C3 2.9 3.4 2.5 4 2.5H10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Copy from Slot {activeSlot}
        </button>
      )}

      {/* Cards — single slot view */}
      <style>{`@keyframes slideInFromRight{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}`}</style>
      <div key={activeSlot} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24, animation: 'slideInFromRight 0.22s ease forwards' }}>
        {LOAD_OPTIONS.map(opt => {
          const currentVal = applyAll ? state.slotConfigs[0]?.loadType : activeCfg?.loadType
          const sel = currentVal === opt.value
          return (
            <LoadCard
              key={opt.value}
              selected={sel}
              onClick={() => handleSelect(activeCfg?.index ?? 1, opt.value)}
              icon={<img src={opt.img} alt={opt.label} style={{ width: 80, height: 80, objectFit: 'contain' }} />}
              label={opt.label}
              sub={opt.sub}
              bullets={opt.bullets}
            />
          )
        })}
      </div>
    </div>
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

function LoadCard({ selected, onClick, icon, label, sub, bullets }: {
  selected: boolean; onClick: () => void; icon: React.ReactNode
  label: string; sub: string; bullets: string[]
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
      <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 2, lineHeight: 1.2 }}>{label}</p>
      <p style={{ fontSize: 14, color: '#9CA3AF', marginBottom: 4, lineHeight: 1.3 }}>{sub}</p>
    </button>
  )
}
