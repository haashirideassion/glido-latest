import { useKiosk } from '@/contexts/KioskContext'
import { Icon, ICONS } from '@/lib/Icon'

export function ConsentScreen() {
  const { acceptConsent, completeCheckIn } = useKiosk()

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 448, textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: 8, color: '#1C1917' }}>Identity Check Required</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>We need to verify your identity before check-in</p>

        <div style={{ textAlign: 'left', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 4px 20px rgba(0,0,0,0.07)', marginBottom: 24 }}>
          <p style={{ fontWeight: 600, marginBottom: 12, fontSize: 15, color: '#1C1917' }}>What we collect &amp; why:</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ color: '#C7C1BB', marginTop: 2 }}>•</span>
              <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}><strong style={{ color: '#1C1917' }}>Name, licence number, expiry</strong> — to verify your identity matches the booking</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ color: '#C7C1BB', marginTop: 2 }}>•</span>
              <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}><strong style={{ color: '#1C1917' }}>Date of birth &amp; address</strong> — stored for compliance and security auditing</span>
            </li>
          </ul>
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16 }}>
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              Data is stored securely, used only for CFS access management, and is not shared with third parties.
            </p>
          </div>
        </div>

        <button className="kiosk-btn kiosk-btn-primary" style={{ width: '100%', borderRadius: 'var(--r-lg)', marginBottom: 12 }} onClick={acceptConsent}>
          <Icon name={ICONS.shield} size={22} />
          I agree — Scan My ID
        </button>
        <button className="kiosk-btn kiosk-btn-secondary" style={{ width: '100%', borderRadius: 'var(--r-lg)', fontSize: 15 }} onClick={completeCheckIn}>
          Skip — I'll verify at reception
        </button>
      </div>
    </div>
  )
}
