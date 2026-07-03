import { useState, useEffect } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import { KioskProvider, useKiosk } from '@/contexts/KioskContext'
import { usePageTitle } from '@/lib/usePageTitle'
import { useTenantInfo } from '@/lib/useTenantInfo'
import KioskLayout from '@/layouts/KioskLayout'
import { KioskStepper } from '@/components/kiosk/KioskStepper'
import { WelcomeScreen } from '@/components/kiosk/WelcomeScreen'
import { LookupScreen } from '@/components/kiosk/LookupScreen'
import { ScanScreen } from '@/components/kiosk/ScanScreen'
import { PurposeScreen } from '@/components/kiosk/PurposeScreen'
import { ConsentScreen } from '@/components/kiosk/ConsentScreen'
import { IDScanScreen } from '@/components/kiosk/IDScanScreen'
import { ConfirmScreen } from '@/components/kiosk/ConfirmScreen'
import { ArrivedScreen } from '@/components/kiosk/ArrivedScreen'
import { WalkInScreen } from '@/components/kiosk/WalkInScreen'
import { SlotPickerScreen } from '@/components/kiosk/SlotPickerScreen'
import { GlidoLogo } from '@/lib/GlidoLogo'
import { fetcher, postFetcher } from '@/lib/fetcher'
import { setToken as setAuthToken } from '@/lib/api-client'

// ─── Device token auth ────────────────────────────────────────────────────────
const DEVICE_TOKEN_KEY = 'kiosk_device_token'
type AuthStatus = 'checking' | 'valid' | 'setup'

/** Validates a token, stores the returned kiosk JWT so all subsequent API calls authenticate. */
async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await fetcher(`/api/kiosk/devices/validate?token=${encodeURIComponent(token)}`)
    if (res?.valid === true) {
      // Store kiosk JWT so postFetcher/patchFetcher calls include Authorization header
      if (res.token) setAuthToken(res.token)
      // Fire-and-forget ping to update last_seen_at
      postFetcher('/api/kiosk/devices/ping', { token }).catch(() => {})
      return true
    }
    return false
  } catch {
    return false
  }
}

// ─── Device setup screen ──────────────────────────────────────────────────────
function DeviceSetupScreen({ onActivated }: { onActivated: () => void }) {
  const [token,   setToken]   = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleActivate = async () => {
    const t = token.trim()
    if (!t || loading) return
    setLoading(true)
    setError('')
    try {
      const valid = await validateToken(t)
      if (valid) {
        localStorage.setItem(DEVICE_TOKEN_KEY, t)
        onActivated()
      } else {
        setError('Invalid token. Please contact your administrator.')
      }
    } catch {
      setError('Invalid token. Please contact your administrator.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KioskLayout>
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 32px',
      }}>
        <div style={{ width: '100%', maxWidth: 448, textAlign: 'center' }}>

          {/* Logo */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
            <GlidoLogo height={40} />
          </div>

          {/* Icon box */}
          <div style={{ width: 64, height: 64, background: 'rgba(var(--brand-rgb),0.09)', borderRadius: 'var(--r-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Icon name={ICONS.lock} size={36} style={{ color: 'var(--brand-color)' }} />
          </div>

          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#1C1917', marginBottom: 10, letterSpacing: '-0.02em' }}>
            Device Setup
          </h1>
          <p style={{ fontSize: '1.0625rem', color: 'var(--text-secondary)', marginBottom: 36, lineHeight: 1.6 }}>
            Enter the device token provided by your administrator
          </p>

          {/* Token input */}
          <input
            type="text"
            value={token}
            placeholder="Paste device token here"
            onChange={e => { setToken(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleActivate()}
            onFocus={e => {
              e.target.style.borderColor = 'var(--brand-color)'
              e.target.style.boxShadow   = '0 0 0 3px rgba(var(--brand-rgb),0.12)'
            }}
            onBlur={e => {
              e.target.style.borderColor = error ? '#EF4444' : 'rgba(0,0,0,0.15)'
              e.target.style.boxShadow   = 'none'
            }}
            style={{
              display: 'block',
              width: '100%',
              boxSizing: 'border-box',
              height: 64,
              padding: '0 20px',
              fontSize: 16,
              fontFamily: 'ui-monospace, monospace',
              letterSpacing: '0.04em',
              border: `2px solid ${error ? '#EF4444' : 'rgba(0,0,0,0.15)'}`,
              borderRadius: 'var(--r-lg)',
              background: error ? '#FEF2F2' : '#F7F6F5',
              color: '#1C1917',
              outline: 'none',
              marginBottom: error ? 8 : 20,
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
          />

          {error && (
            <p style={{ fontSize: 15, color: '#EF4444', marginBottom: 16, textAlign: 'left', paddingLeft: 4 }}>
              {error}
            </p>
          )}

          {/* Activate button */}
          <button
            onClick={handleActivate}
            disabled={!token.trim() || loading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              width: '100%',
              height: 64,
              borderRadius: 'var(--r-lg)',
              border: 'none',
              background: !token.trim() || loading ? 'rgba(0,0,0,0.10)' : 'var(--brand-color)',
              color: !token.trim() || loading ? 'rgba(0,0,0,0.35)' : 'var(--brand-text)',
              fontSize: 18,
              fontWeight: 700,
              cursor: !token.trim() || loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.15s',
            }}
          >
            {loading ? (
              <>
                <span style={{
                  display: 'inline-block', width: 22, height: 22, flexShrink: 0,
                  borderRadius: '50%',
                  border: '3px solid rgba(255,255,255,0.35)', borderTopColor: '#fff',
                  animation: 'kp-spin 0.7s linear infinite',
                }} />
                Validating…
              </>
            ) : 'Activate Device'}
          </button>

        </div>
      </div>
      <style>{`@keyframes kp-spin { to { transform: rotate(360deg) } }`}</style>
    </KioskLayout>
  )
}

// ─── Checking screen (brief spinner while stored token is being verified) ─────
function CheckingScreen() {
  return (
    <KioskLayout>
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          border: '4px solid rgba(var(--brand-rgb),0.15)', borderTopColor: 'var(--brand-color)',
          animation: 'kp-spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes kp-spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </KioskLayout>
  )
}

// ─── Existing kiosk screens (unchanged) ───────────────────────────────────────
function ScreensaverScreen() {
  const { state, wakeFromScreensaver } = useKiosk()
  const tenant = useTenantInfo()
  if (state.currentScreen !== 'screensaver') return null
  return (
    <div
      onClick={wakeFromScreensaver}
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FFFAF7', zIndex: 10, cursor: 'pointer' }}
    >
      <div style={{ textAlign: 'center', animation: 'pulse 3s ease-in-out infinite' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <GlidoLogo height={54} />
        </div>
        <p style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: 8, color: '#1C1917' }}>{tenant?.name || 'Sydney CFS'}</p>
        <p style={{ fontSize: '1.125rem', color: 'var(--text-secondary)', marginBottom: 40 }}>Container Freight Station</p>
        <p style={{ fontSize: '1rem', color: 'var(--text-tertiary)', animation: 'pulse 2s ease-in-out infinite' }}>Tap anywhere to continue</p>
      </div>
    </div>
  )
}

function KioskContent() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <KioskStepper />
      <div style={{ flex: 1, position: 'relative', overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
        <WelcomeScreen />
        <LookupScreen />
        <ScanScreen />
        <PurposeScreen />
        <ConsentScreen />
        <IDScanScreen />
        <ConfirmScreen />
        <ArrivedScreen />
        <WalkInScreen />
        <SlotPickerScreen />
        <ScreensaverScreen />
      </div>
    </div>
  )
}

// ─── KioskPage — auth-gated entry point ───────────────────────────────────────
export default function KioskPage() {
  usePageTitle('Glido | Kiosk')
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking')
  const tenant = useTenantInfo()

  // Inject tenant brand colour as CSS custom properties — same pattern as PublicLayout
  useEffect(() => {
    const color = tenant?.primaryColor
    if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) return
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    document.documentElement.style.setProperty('--brand-color', color)
    document.documentElement.style.setProperty('--brand-rgb', `${r},${g},${b}`)
  }, [tenant?.primaryColor])

  useEffect(() => {
    const token = localStorage.getItem(DEVICE_TOKEN_KEY)
    if (!token) {
      setAuthStatus('setup')
      return
    }
    validateToken(token)
      .then(valid => {
        if (valid) {
          setAuthStatus('valid')
        } else {
          localStorage.removeItem(DEVICE_TOKEN_KEY)
          setAuthStatus('setup')
        }
      })
      .catch(() => {
        // Network error on startup — fail open so a connectivity blip
        // doesn't lock out the kiosk for the day.
        setAuthStatus('valid')
      })
  }, [])

  if (authStatus === 'checking') return <CheckingScreen />
  if (authStatus === 'setup')    return <DeviceSetupScreen onActivated={() => setAuthStatus('valid')} />

  return (
    <KioskProvider>
      <KioskLayout>
        <KioskContent />
      </KioskLayout>
    </KioskProvider>
  )
}
