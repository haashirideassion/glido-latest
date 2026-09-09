import { useKiosk } from '@/contexts/KioskContext'
import { Icon, ICONS } from '@/lib/Icon'

const ICON_BOX: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 'var(--r-lg)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  lineHeight: 0,
}

const OPTIONS = [
  { purpose: 'visit_office' as const, icon: ICONS.home,      label: 'Visiting Office', sub: 'Meeting staff, document submission, enquiry'       },
  { purpose: 'visit_yard'   as const, icon: ICONS.container, label: 'Visiting Yard',   sub: 'Container inspection, survey, customs examination' },
]

export function PurposeScreen() {
  const { dispatch, goTo } = useKiosk()

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 540, textAlign: 'center' }}>

        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 8 }}>
            What brings you here today?
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Select the option that best describes your visit
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {OPTIONS.map(opt => (
            <button
              key={opt.purpose}
              className="kiosk-btn kiosk-option-card"
              style={{
                width: '100%',
                minHeight: 96,
                borderRadius: 'var(--r-lg)',
                padding: '0 24px',
                display: 'flex',
                alignItems: 'center',
                gap: 20,
              }}
              onClick={() => {
                dispatch({ type: 'SET_WALK_IN_FIELD', field: 'walkInPurpose', value: opt.purpose })
                goTo('walkin')
              }}
            >
              {/* Icon box — identical dimensions for all 3 */}
              <div style={{
                ...ICON_BOX,
                background: 'rgba(0,0,0,0.05)',
              }}>
                {/* Inner wrapper locks the icon to exactly 28×28 */}
                <span style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0, flexShrink: 0 }}>
                  <Icon name={opt.icon} size={28} style={{ color: 'var(--text-secondary)', display: 'block' }} />
                </span>
              </div>

              {/* Label */}
              <div style={{ textAlign: 'left', flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: '1.125rem', color: '#1C1917', margin: 0, lineHeight: 1.2 }}>
                  {opt.label}
                </p>
                <p style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)', margin: '4px 0 0', lineHeight: 1.4 }}>
                  {opt.sub}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
