import { useState, useEffect, useRef } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { KioskProvider, useKiosk } from '@/contexts/KioskContext'
import type { KioskScreen } from '@/contexts/KioskContext'
import { usePageTitle } from '@/lib/usePageTitle'
import { useTenantInfo } from '@/lib/useTenantInfo'
import KioskLayout from '@/layouts/KioskLayout'
import { KioskStepper } from '@/components/kiosk/KioskStepper'
import { KioskScene3D } from '@/components/kiosk/KioskScene3D'
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
import { I18nProvider } from '@/lib/i18n'

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
  const { wakeFromScreensaver } = useKiosk()
  const tenant = useTenantInfo()
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

// Ordinal position of each screen — used only to pick a slide direction
// (forward vs. back) for the 3D parallax transition between steps.
const SCREEN_ORDER: Record<KioskScreen, number> = {
  welcome: 0,
  lookup: 1, scan: 1, 'slot-picker': 1, confirm: 2, consent: 3, idscan: 4, arrived: 5,
  purpose: 1, walkin: 2,
  screensaver: -1,
}

const parallaxVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 48 : -48, rotateY: dir >= 0 ? 10 : -10, scale: 0.95 }),
  center: { opacity: 1, x: 0, rotateY: 0, scale: 1 },
  exit: (dir: number) => ({ opacity: 0, x: dir >= 0 ? -48 : 48, rotateY: dir >= 0 ? -10 : 10, scale: 0.97 }),
}
const fadeVariants = { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }

// Only the active screen is ever mounted — each screen component no longer
// self-guards against state.currentScreen (see KioskContext consumers), so
// AnimatePresence can play a real exit animation on the outgoing screen
// instead of it instantly blanking out when the shared state moves on.
const SCREEN_ELEMENTS: Record<KioskScreen, React.ReactNode> = {
  welcome:      <WelcomeScreen />,
  lookup:       <LookupScreen />,
  scan:         <ScanScreen />,
  purpose:      <PurposeScreen />,
  consent:      <ConsentScreen />,
  idscan:       <IDScanScreen />,
  confirm:      <ConfirmScreen />,
  arrived:      <ArrivedScreen />,
  walkin:       <WalkInScreen />,
  'slot-picker': <SlotPickerScreen />,
  screensaver:  <ScreensaverScreen />,
}

// ─── Offline / poor-signal banner ─────────────────────────────────────────────
// Gate kiosks sit exactly where connectivity is worst — surface it instead of a silent hang.
function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on  = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

function OfflineBanner() {
  const online = useOnlineStatus()
  const [checking, setChecking] = useState(false)
  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            padding: '10px 20px', background: '#DC2626', color: '#fff',
            fontSize: 14, fontWeight: 600, boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
          }}
        >
          <Icon name={ICONS.warning} size={16} />
          No internet connection — check-in will resume once the network is back.
          <button
            type="button"
            onClick={() => { setChecking(true); setTimeout(() => setChecking(false), 900) }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8, padding: '4px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {checking ? 'Checking…' : 'Retry'}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function KioskContent() {
  const { state } = useKiosk()
  const reduce = useReducedMotion()
  const prevOrderRef = useRef(SCREEN_ORDER[state.currentScreen])
  const dirRef = useRef(1)

  const currentOrder = SCREEN_ORDER[state.currentScreen]
  if (currentOrder !== prevOrderRef.current) {
    dirRef.current = currentOrder >= prevOrderRef.current ? 1 : -1
    prevOrderRef.current = currentOrder
  }

  const showScene = state.currentScreen !== 'screensaver'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <OfflineBanner />
      <KioskStepper />
      {showScene && (
        <div style={{ position: 'relative', flexShrink: 0, height: 'clamp(190px, 30vh, 340px)', zIndex: 1 }}>
          <KioskScene3D screen={state.currentScreen} service={state.lookupResult?.service ?? null} />
        </div>
      )}
      <div style={{
        flex: 1, position: 'relative', overflowY: 'auto', overflowX: 'hidden', minHeight: 0, perspective: 1400, zIndex: 2,
        ...(showScene ? {
          marginTop: -26,
          borderRadius: '30px 30px 0 0',
          background: 'rgba(255,255,255,0.74)',
          backdropFilter: 'blur(20px) saturate(1.25)', WebkitBackdropFilter: 'blur(20px) saturate(1.25)',
          boxShadow: '0 -2px 24px rgba(15,23,42,0.08), inset 0 1.5px 0 rgba(255,255,255,0.7)',
          borderTop: '1px solid rgba(255,255,255,0.7)',
        } : {}),
      }}>
        <AnimatePresence mode="wait" initial={false} custom={dirRef.current}>
          <motion.div
            key={state.currentScreen}
            custom={dirRef.current}
            variants={reduce ? fadeVariants : parallaxVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            style={{ minHeight: '100%' }}
          >
            {SCREEN_ELEMENTS[state.currentScreen]}
          </motion.div>
        </AnimatePresence>
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
    // Pick readable text colour for buttons/chips filled with the brand colour
    const luminance = (0.2126 * (r / 255) ** 2.2 + 0.7152 * (g / 255) ** 2.2 + 0.0722 * (b / 255) ** 2.2)
    const contrastWithBlack = (luminance + 0.05) / 0.05
    const contrastWithWhite = 1.05 / (luminance + 0.05)
    document.documentElement.style.setProperty('--brand-text', contrastWithBlack >= contrastWithWhite ? '#000000' : '#ffffff')
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
    <I18nProvider>
      <KioskProvider>
        <KioskLayout>
          <KioskContent />
        </KioskLayout>
      </KioskProvider>
    </I18nProvider>
  )
}
