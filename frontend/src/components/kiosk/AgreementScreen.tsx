import { useEffect, useRef, useState } from 'react'
import { useKiosk } from '@/contexts/KioskContext'
import { useTenantInfo } from '@/lib/useTenantInfo'
import { Icon, ICONS } from '@/lib/Icon'

export function AgreementScreen() {
  const { state, confirmAgreement, goTo } = useKiosk()
  const tenant = useTenantInfo()

  const scrollRef  = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [agreed,   setAgreed]   = useState(false)

  // Wait for tenant to load; if terms empty after load → skip immediately
  useEffect(() => {
    if (tenant === null) return  // still loading
    setLoading(false)
    if (!tenant.kioskTerms?.trim()) {
      confirmAgreement()
    }
  }, [tenant]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset checkbox each time user arrives at this screen
  useEffect(() => {
    if (state.currentScreen === 'agreement') setAgreed(false)
  }, [state.currentScreen])

  // Detect scroll-to-bottom (needed only for the "read" indicator)
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const reached = el.scrollTop + el.clientHeight >= el.scrollHeight - 20
    if (reached) setAtBottom(true)
  }

  if (state.currentScreen !== 'agreement') return null

  const terms   = tenant?.kioskTerms ?? ''
  const tenantName = tenant?.name || 'the facility'

  if (loading || !terms.trim()) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '3px solid rgba(var(--brand-rgb),0.15)', borderTopColor: 'var(--brand-color)',
          animation: 'ag-spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes ag-spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // Detect if content is long enough to need scrolling
  const isLong = terms.length > 400

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: '#fff',
    }}>

      {/* ── Fixed header ── */}
      <div style={{
        flexShrink: 0,
        padding: '28px 32px 20px',
        borderBottom: '1px solid rgba(0,0,0,0.07)',
        background: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, maxWidth: 560, margin: '0 auto', width: '100%' }}>
          <div style={{
            width: 52, height: 52, flexShrink: 0,
            background: 'rgba(var(--brand-rgb),0.09)',
            borderRadius: 'var(--r-lg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name={ICONS.document} size={28} style={{ color: 'var(--brand-color)' }} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--brand-color)', margin: '0 0 2px' }}>
              Site Entry Agreement
            </p>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', margin: 0, letterSpacing: '-0.01em' }}>
              Please read and agree to continue
            </h2>
          </div>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 32px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={{ maxWidth: 560, margin: '0 auto' }}>

          {/* Intro line */}
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
            By entering <strong style={{ color: '#1C1917' }}>{tenantName}</strong>, you agree to the following terms and conditions.
          </p>

          {/* Terms content — preserve whitespace & line breaks */}
          <div style={{
            fontSize: 15,
            color: '#374151',
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: '#FAFAF9',
            border: '1px solid rgba(0,0,0,0.07)',
            borderRadius: 'var(--r-lg)',
            padding: '20px 24px',
          }}>
            {terms}
          </div>

          {/* Scroll hint — shown only for long content that isn't yet scrolled to bottom */}
          {isLong && !atBottom && (
            <div style={{
              marginTop: 16, textAlign: 'center',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              color: 'var(--text-tertiary)', fontSize: 14, animation: 'ag-bounce 1.4s ease-in-out infinite',
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Scroll to read more
            </div>
          )}

          {/* Spacer so last line isn't hidden behind footer */}
          <div style={{ height: 24 }} />
        </div>
      </div>

      {/* ── Fixed footer ── */}
      <div style={{
        flexShrink: 0,
        padding: '16px 32px 28px',
        borderTop: '1px solid rgba(0,0,0,0.07)',
        background: '#fff',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.05)',
      }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Checkbox acknowledgement */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 14,
            padding: '16px 18px',
            background: agreed ? 'rgba(var(--brand-rgb),0.05)' : '#FAFAF9',
            border: `2px solid ${agreed ? 'rgba(var(--brand-rgb),0.35)' : 'rgba(0,0,0,0.10)'}`,
            borderRadius: 'var(--r-lg)',
            cursor: 'pointer',
            transition: 'background 0.15s, border-color 0.15s',
            userSelect: 'none',
          }}>
            {/* Custom checkbox */}
            <div style={{
              flexShrink: 0,
              width: 26, height: 26, marginTop: 1,
              borderRadius: 6,
              border: `2px solid ${agreed ? 'var(--brand-color)' : 'rgba(0,0,0,0.22)'}`,
              background: agreed ? 'var(--brand-color)' : '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}>
              {agreed && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 7l3.5 3.5 5.5-6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
            />
            <span style={{ fontSize: 16, lineHeight: 1.5, color: agreed ? '#1C1917' : 'var(--text-secondary)', fontWeight: agreed ? 600 : 400 }}>
              I have read and agree to the terms and conditions above
            </span>
          </label>

          {/* Agree button — disabled until checkbox is ticked */}
          <button
            className="kiosk-btn kiosk-btn-primary"
            style={{
              width: '100%', borderRadius: 'var(--r-lg)', fontSize: 18, fontWeight: 700,
              opacity: agreed ? 1 : 0.4,
              cursor: agreed ? 'pointer' : 'not-allowed',
            }}
            disabled={!agreed}
            onClick={confirmAgreement}
          >
            <Icon name={ICONS.check} size={22} />
            I Agree &amp; Continue
          </button>

          {/* Back */}
          <button
            className="kiosk-btn kiosk-btn-secondary"
            style={{ width: '100%', borderRadius: 'var(--r-lg)', fontSize: 16 }}
            onClick={() => goTo(state.pendingAction === 'walkin' ? 'walkin' : 'idscan')}
          >
            Go Back
          </button>

        </div>
      </div>

      <style>{`
        @keyframes ag-bounce {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50%       { transform: translateY(4px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
