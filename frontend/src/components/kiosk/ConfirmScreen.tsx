import { useKiosk } from '@/contexts/KioskContext'
import { Icon, ICONS } from '@/lib/Icon'

export function ConfirmScreen() {
  const { state, confirmBooking, goTo } = useKiosk()
  if (state.currentScreen !== 'confirm' || !state.lookupResult) return null
  const r = state.lookupResult

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px' }}>
      <div style={{ width: '100%', maxWidth: 448, textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: 4, color: '#1C1917' }}>Booking Found</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Please confirm this is your booking</p>

        <div style={{ textAlign: 'left', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 4px 20px rgba(0,0,0,0.07)', marginBottom: 24 }}>
          {[
            { label: 'Reference', val: r.ref,     mono: true },
            { label: 'Name',      val: r.name,    mono: false },
            { label: 'Slot',      val: r.slot,    mono: false },
            { label: 'Service',   val: r.service, mono: false },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              <span style={{ color: 'var(--text-tertiary)' }}>{row.label}</span>
              <span style={{ fontWeight: 600, fontFamily: row.mono ? 'ui-monospace,monospace' : undefined, color: row.mono ? 'var(--brand-color)' : '#1C1917' }}>{row.val}</span>
            </div>
          ))}
        </div>

        <button className="kiosk-btn kiosk-btn-primary" style={{ width: '100%', borderRadius: 'var(--r-lg)', marginBottom: 12 }} onClick={confirmBooking}>
          <Icon name={ICONS.check} size={26} />
          Yes, This Is My Booking
        </button>
        <button className="kiosk-btn kiosk-btn-secondary" style={{ width: '100%', borderRadius: 'var(--r-lg)' }} onClick={() => goTo('lookup')}>
          This is not my booking
        </button>
      </div>
    </div>
  )
}
