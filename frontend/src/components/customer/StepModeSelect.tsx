import { useServiceRequestWizard } from '@/contexts/ServiceRequestWizardContext'
import { OptionTile } from './OptionTile'
import type { ShipmentMode } from '@/data/types'
import shipImg from '@/assets/ship.png'
import seaImg from '@/assets/sea.png'
import airImg from '@/assets/air.png'

const OPTIONS: Array<{ value: ShipmentMode; label: string; description: string; image: string; disabled?: boolean }> = [
  { value: 'sea', label: 'Sea', description: 'Container freight by sea', image: seaImg },
  { value: 'air', label: 'Air', description: 'Not available yet', image: airImg, disabled: true },
]

export function StepModeSelect() {
  const { state, dispatch } = useServiceRequestWizard()

  // Same auto-advance pattern as Service Type — ADVANCE_FROM so a pending timer can't pull the
  // user forward after they have navigated away.
  const selectMode = (value: ShipmentMode) => {
    dispatch({ type: 'SET', field: 'mode', value })
    setTimeout(() => {
      dispatch({ type: 'ADVANCE_FROM', from: 1, to: 2 })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 280)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src={shipImg} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
        </div>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>New service request</h2>
          <p style={{ fontSize: 15, color: '#4F4F4F', lineHeight: 1.5, margin: '4px 0 0' }}>Select the shipment mode to continue</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {OPTIONS.map(opt => (
          <OptionTile
            key={opt.value}
            selected={state.mode === opt.value}
            onClick={() => selectMode(opt.value)}
            image={opt.image}
            title={opt.label}
            desc={opt.description}
            disabled={opt.disabled}
          />
        ))}
      </div>
    </div>
  )
}
