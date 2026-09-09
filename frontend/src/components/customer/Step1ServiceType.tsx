import { useServiceRequestWizard } from '@/contexts/ServiceRequestWizardContext'
import { OptionTile } from './OptionTile'
import type { ServiceCategory } from '@/data/types'
import shipImg from '@/assets/ship.png'
import exportImg from '@/assets/export.png'
import serviceImg from '@/assets/service.png'

const OPTIONS: Array<{ value: ServiceCategory; label: string; description: string; image: string }> = [
  { value: 'import', label: 'Import', description: 'Bringing cargo into the country', image: shipImg },
  { value: 'export', label: 'Export', description: 'Sending cargo out of the country', image: exportImg },
]

export function Step1ServiceType() {
  const { state, dispatch } = useServiceRequestWizard()

  // FR 1.1.2 — selecting a service type auto-advances to Service Selection.
  const selectCategory = (value: ServiceCategory) => {
    dispatch({ type: 'SET', field: 'serviceCategory', value })
    setTimeout(() => {
      dispatch({ type: 'SET', field: 'step', value: 3 })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 280)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src={serviceImg} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
        </div>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>New service request</h2>
          <p style={{ fontSize: 15, color: '#4F4F4F', lineHeight: 1.5, margin: '4px 0 0' }}>Select a service type to continue</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {OPTIONS.map(opt => (
          <OptionTile
            key={opt.value}
            selected={state.serviceCategory === opt.value}
            onClick={() => selectCategory(opt.value)}
            image={opt.image}
            title={opt.label}
            desc={opt.description}
          />
        ))}
      </div>
    </div>
  )
}
