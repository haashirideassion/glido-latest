import { useKiosk } from '@/contexts/KioskContext'
import { Icon, ICONS } from '@/lib/Icon'

export function ArrivedScreen() {
  const { state } = useKiosk()
  if (state.currentScreen !== 'arrived') return null

  const isWalkIn = !state.lookupResult
  const countdown = state.arrivedCountdown

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', textAlign: 'center' }}>
      <div style={{ width: 112, height: 112, background: 'rgba(22,163,74,0.10)', borderRadius: 'var(--r-full)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
        <Icon name={ICONS.check} size={64} style={{ color: '#16A34A' }} />
      </div>

      <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: 8, color: '#1C1917' }}>
        {isWalkIn ? 'Thank You! Visit Registered!' : "Thank You! You're Checked In!"}
      </h2>
      <p style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 4, color: '#16A34A' }}>
        {state.arrivedVisitorName || 'Welcome'}
      </p>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
        {isWalkIn
          ? 'Your visit has been logged. Reception has been notified and will assist you shortly.'
          : 'Your arrival has been recorded. Reception has been notified.'}
      </p>

      {/* Booking reference — only for booked check-ins */}
      {state.lookupResult?.ref && (
        <div style={{ marginBottom: 20, padding: '16px 32px', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', marginBottom: 4 }}>Booking Reference</p>
          <p style={{ fontFamily: 'ui-monospace,monospace', fontWeight: 700, fontSize: '1.5rem', color: 'var(--brand-color)' }}>{state.lookupResult.ref}</p>
        </div>
      )}

      {/* Walk-in confirmation card */}
      {isWalkIn && state.arrivedVisitorName && (
        <div style={{ marginBottom: 20, padding: '16px 32px', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', marginBottom: 4 }}>Registered Visitor</p>
          <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1C1917' }}>{state.arrivedVisitorName}</p>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 384, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
        {!isWalkIn && (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left', padding: '12px 20px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 'var(--r-md)' }}>
              <Icon name={ICONS.warning} size={18} style={{ color: '#D97706', marginTop: 2, flexShrink: 0 }} />
              <p style={{ fontSize: 15, color: '#92400E' }}>
                <strong style={{ color: '#78350F' }}>CHEP pallets: </strong>
                Ensure CHEP pallets are clearly separated before entering the depot.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left', padding: '12px 20px', background: 'rgba(var(--brand-rgb),0.05)', border: '1px solid rgba(var(--brand-rgb),0.18)', borderRadius: 'var(--r-md)' }}>
              <Icon name={ICONS.arrowRight} size={18} style={{ color: 'var(--brand-color)', marginTop: 2, flexShrink: 0 }} />
              <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
                <strong style={{ color: '#1C1917' }}>Bay assignment: </strong>
                Proceed to the reception window for bay directions.
              </p>
            </div>
          </>
        )}
        {isWalkIn && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left', padding: '12px 20px', background: 'rgba(var(--brand-rgb),0.05)', border: '1px solid rgba(var(--brand-rgb),0.18)', borderRadius: 'var(--r-md)' }}>
            <Icon name={ICONS.arrowRight} size={18} style={{ color: 'var(--brand-color)', marginTop: 2, flexShrink: 0 }} />
            <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
              <strong style={{ color: '#1C1917' }}>Next step: </strong>
              Please proceed to the reception desk — a staff member will assist you.
            </p>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: 'var(--text-tertiary)' }}>
        <span>Returning to home screen in</span>
        <span style={{ fontFamily: 'ui-monospace,monospace', fontWeight: 700, color: '#1C1917', fontSize: '1rem', fontVariantNumeric: 'tabular-nums' }}>{countdown}</span>
        <span>sec</span>
      </div>
    </div>
  )
}
