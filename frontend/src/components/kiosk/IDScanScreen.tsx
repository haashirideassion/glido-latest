import { useState } from 'react'
import { useKiosk } from '@/contexts/KioskContext'
import { useTenantInfo } from '@/lib/useTenantInfo'
import { Icon, ICONS } from '@/lib/Icon'

export function IDScanScreen() {
  const { state, dispatch, simulateScan, completeCheckIn } = useKiosk()
  const tenant = useTenantInfo()
  const [agreed, setAgreed] = useState(false)

  const ld        = state.licenceData
  const match     = ld?.nameMatchResult
  const terms     = tenant?.kioskTerms?.trim() ?? ''
  const canProceed = !terms || agreed

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 448, textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: 8, color: '#1C1917' }}>Identity Verification</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Scan your driver's licence to verify your identity</p>

        {!ld ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { title: 'Option 1 — Card Reader', icon: ICONS.shield, desc: 'Insert driver\'s licence face down', sub: 'Thales double-sided card reader' },
              { title: 'Option 2 — Digital Licence', icon: ICONS.qrCode, desc: 'Show NSW Digital Licence QR code', sub: 'NSW Service App or Digital Wallet' },
            ].map(opt => (
              <div key={opt.title} style={{ background: '#FFFFFF', border: '1.5px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-lg)', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <p style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', marginBottom: 12 }}>{opt.title}</p>
                <div style={{ height: 112, background: '#F7F6F5', border: '1.5px dashed rgba(0,0,0,0.12)', borderRadius: 'var(--r-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Icon name={opt.icon} size={36} style={{ color: '#C7C1BB' }} />
                  <p style={{ fontSize: 15, color: 'var(--text-tertiary)', marginTop: 4 }}>{opt.desc}</p>
                </div>
                <p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{opt.sub}</p>
              </div>
            ))}
            <button className="kiosk-btn" style={{ width: '100%', borderRadius: 'var(--r-lg)', background: 'rgba(var(--brand-rgb),0.07)', border: '1px solid rgba(var(--brand-rgb),0.25)', color: 'var(--brand-color)', cursor: 'pointer' }} onClick={simulateScan}>
              Simulate ID Scan (Demo)
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
            <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 4px 20px rgba(0,0,0,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Icon name={ICONS.check} size={18} style={{ color: 'var(--brand-color)' }} />
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--brand-color)' }}>Licence Scanned</p>
              </div>
              {[['Name', ld.name], ['Licence No.', ld.licenceNo], ['Date of Birth', ld.dob], ['Expiry', ld.expiry], ['Address', ld.address]].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.05)', fontSize: 15 }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                  <span style={{ fontWeight: 500, color: '#1C1917', textAlign: 'right' }}>{val}</span>
                </div>
              ))}
            </div>

            {state.licenceExpired && (
              <Alert type="error" title="Licence Expired">
                Your licence has expired. You cannot check in at the kiosk. Please speak with the reception team.
              </Alert>
            )}
            {!state.licenceExpired && match === 'mismatch' && (
              <Alert type="error" title="Name Does Not Match Booking">
                The name on your licence does not match the name on the booking. Please see the reception team.
              </Alert>
            )}
            {!state.licenceExpired && match === 'warning' && (
              <Alert type="warning" title="Name Similarity Warning">
                Your licence name is similar but may not exactly match the booking. You can still proceed — reception will verify.
              </Alert>
            )}
            {!state.licenceExpired && match === 'matched' && (
              <Alert type="success" title="Name Confirmed">
                Licence name matches the booking driver name.
              </Alert>
            )}

            {!state.licenceExpired && match !== 'mismatch' && (
              <>
                {terms && (
                  <TermsBlock
                    terms={terms}
                    tenantName={tenant?.name || 'the facility'}
                    agreed={agreed}
                    onToggle={() => setAgreed(v => !v)}
                  />
                )}
                <button
                  className="kiosk-btn kiosk-btn-primary"
                  style={{ width: '100%', borderRadius: 'var(--r-lg)', opacity: canProceed ? 1 : 0.4, cursor: canProceed ? 'pointer' : 'not-allowed' }}
                  disabled={!canProceed}
                  onClick={completeCheckIn}
                >
                  <Icon name={ICONS.arrowRight} size={24} />
                  Proceed to Check-In
                </button>
              </>
            )}
            {(state.licenceExpired || match === 'mismatch') && (
              <p style={{ textAlign: 'center', fontSize: 15, color: 'var(--text-secondary)' }}>Please proceed to the reception desk for assistance.</p>
            )}
            <button
              className="kiosk-btn kiosk-btn-secondary"
              style={{ width: '100%', borderRadius: 'var(--r-lg)', fontSize: 15 }}
              onClick={() => { dispatch({ type: 'SET_LICENCE', data: null, expired: false }); setAgreed(false) }}
            >
              Scan Again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Inline T&C block (shared) ─────────────────────────────────────────────────
export function TermsBlock({ terms, tenantName, agreed, onToggle }: {
  terms: string; tenantName: string; agreed: boolean; onToggle: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        maxHeight: 180,
        overflowY: 'auto',
        background: '#FAFAF9',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 'var(--r-md)',
        padding: '14px 16px',
        fontSize: 14,
        color: '#374151',
        lineHeight: 1.7,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        WebkitOverflowScrolling: 'touch',
      }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Site Entry Agreement — {tenantName}
        </p>
        {terms}
      </div>

      <label style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px',
        background: agreed ? 'rgba(var(--brand-rgb),0.05)' : '#fff',
        border: `2px solid ${agreed ? 'rgba(var(--brand-rgb),0.35)' : 'rgba(0,0,0,0.10)'}`,
        borderRadius: 'var(--r-md)',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
        userSelect: 'none',
      }}>
        <div style={{
          flexShrink: 0,
          width: 24, height: 24,
          borderRadius: 6,
          border: `2px solid ${agreed ? 'var(--brand-color)' : 'rgba(0,0,0,0.22)'}`,
          background: agreed ? 'var(--brand-color)' : '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}>
          {agreed && (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 7l3.5 3.5 5.5-6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <input type="checkbox" checked={agreed} onChange={onToggle} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
        <span style={{ fontSize: 15, lineHeight: 1.4, color: agreed ? '#1C1917' : 'var(--text-secondary)', fontWeight: agreed ? 600 : 400 }}>
          I have read and agree to the terms and conditions above
        </span>
      </label>
    </div>
  )
}

function Alert({ type, title, children }: { type: 'error' | 'warning' | 'success'; title: string; children: React.ReactNode }) {
  const cfg = {
    error:   { bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.25)',  icon: ICONS.close,   iconC: '#DC2626', titleC: '#DC2626', bodyC: '#EF4444' },
    warning: { bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.30)', icon: ICONS.warning, iconC: '#D97706', titleC: '#D97706', bodyC: '#B45309' },
    success: { bg: 'rgba(22,163,74,0.07)',  border: 'rgba(22,163,74,0.25)',  icon: ICONS.check,   iconC: '#16A34A', titleC: '#16A34A', bodyC: '#15803D' },
  }[type]
  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 'var(--r-md)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Icon name={cfg.icon} size={18} style={{ color: cfg.iconC }} />
        <p style={{ fontWeight: 700, fontSize: 15, color: cfg.titleC }}>{title}</p>
      </div>
      <p style={{ fontSize: 14, color: cfg.bodyC }}>{children}</p>
    </div>
  )
}
