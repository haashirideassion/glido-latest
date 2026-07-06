import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { useKiosk } from '@/contexts/KioskContext'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { playErrorTone } from '@/lib/kioskSound'

// Stable DOM id for the html5-qrcode mount point.
const QR_ELEMENT_ID = 'kiosk-qr-reader'

type Tab = 'manual' | 'qr'

const DARK   = '#1C1917'
const MUTED  = '#78716C'

export function ScanScreen() {
  const { state, dispatch, goTo, performLookup } = useKiosk()

  const [tab,       setTab]       = useState<Tab>('qr')
  const [cameraMsg, setCameraMsg] = useState('')

  const scannerRef = useRef<Html5Qrcode | null>(null)
  // Set to true after a QR decode so the effect below can fire performLookup
  // once KioskContext has updated its referenceInput closure.
  const pendingRef = useRef(false)
  // Tracks that a lookup was triggered from a QR scan (not manual entry),
  // so we know to restart the camera and show an error on lookup failure.
  const qrScanRef  = useRef(false)

  // ── Stop the scanner (async, fire-and-forget safe) ──────────────────────────
  function stopScanner() {
    const s = scannerRef.current
    if (!s) return
    scannerRef.current = null
    if (s.isScanning) {
      s.stop()
        .then(() => s.clear())
        .catch(() => { try { s.clear() } catch { /* noop */ } })
    } else {
      try { s.clear() } catch { /* noop */ }
    }
  }

  // ── Start the html5-qrcode scanner ──────────────────────────────────────────
  async function startScanner() {
    setCameraMsg('')
    // html5-qrcode injects its own UI into the element; clear any leftover first.
    try {
      const el = document.getElementById(QR_ELEMENT_ID)
      if (el) el.innerHTML = ''
    } catch { /* noop */ }

    let scanner: Html5Qrcode
    try {
      scanner = new Html5Qrcode(QR_ELEMENT_ID)
    } catch {
      setCameraMsg('Unable to initialise QR scanner. Please use manual entry.')
      setTab('manual')
      return
    }
    scannerRef.current = scanner

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
        // ── Success: QR decoded ──────────────────────────────────────────────
        (decodedText: string) => {
          const val = decodedText.trim().toUpperCase()

          // Reject QR codes that clearly aren't booking references
          if (!val.startsWith('GLD-')) {
            toast('Invalid QR code format. Please scan your booking QR code.', 'error')
            playErrorTone()
            // Camera keeps running — do not stop or switch tabs
            return
          }

          // Valid format: stop scanner and attempt lookup
          stopScanner()
          qrScanRef.current = true
          // Dispatch the value into KioskContext, then the effect below fires
          // performLookup on the next render once the closure is updated.
          dispatch({ type: 'SET_REF_INPUT', value: val })
          pendingRef.current = true
          setTab('manual')
        },
        // ── Per-frame decode error — normal, ignore ───────────────────────────
        () => {},
      )
    } catch (err: unknown) {
      scannerRef.current = null
      const msg = String(err ?? '')
      const denied =
        msg.includes('NotAllowed') ||
        msg.includes('Permission') ||
        msg.includes('permission')
      setCameraMsg(
        denied
          ? 'Camera access denied. Please use manual entry.'
          : 'Unable to start camera. Please use manual entry.',
      )
      setTab('manual')
    }
  }

  // ── Camera lifecycle: start on QR tab, stop on cleanup ──────────────────────
  useEffect(() => {
    if (state.currentScreen !== 'scan') return
    if (tab !== 'qr') return
    const timer = setTimeout(() => {
      const el = document.getElementById(QR_ELEMENT_ID)
      if (el) startScanner()
      else setCameraMsg('Unable to initialise QR scanner. Please use manual entry.')
    }, 150)
    return () => {
      clearTimeout(timer)
      stopScanner()
    }
  }, [tab, state.currentScreen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── After QR decode: call performLookup once referenceInput closure updates ──
  useEffect(() => {
    if (pendingRef.current && state.referenceInput && !state.lookupLoading) {
      pendingRef.current = false
      performLookup()
    }
  }, [state.referenceInput, state.lookupLoading, performLookup])

  // ── If a QR-triggered lookup fails, toast and restart the camera ─────────────
  useEffect(() => {
    if (qrScanRef.current && state.lookupError && !state.lookupLoading) {
      qrScanRef.current = false
      toast('Invalid QR code. No booking found. Please try again or enter manually.', 'error')
      // Switch back to QR tab — the camera lifecycle effect will restart the scanner
      setTab('qr')
    }
  }, [state.lookupError, state.lookupLoading])

  // ── Render — mirrors LookupScreen layout exactly ─────────────────────────────
  // (Screen visibility is controlled by the parent via AnimatePresence — see KioskPage.tsx)
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px' }}>
      <div style={{ width: '100%', maxWidth: 448, textAlign: 'center' }}>

        {/* Icon — orange rounded square, identical to LookupScreen's search icon */}
        <div style={{ width: 64, height: 64, background: 'rgba(var(--brand-rgb),0.09)', borderRadius: 'var(--r-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Icon name={ICONS.qrCode} size={36} style={{ color: 'var(--brand-color)' }} />
        </div>

        {/* Title */}
        <h2 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: 8, color: DARK }}>
          Scan Your QR Code
        </h2>

        {/* Subtitle */}
        <p style={{ color: MUTED, marginBottom: 32 }}>
          Point your booking QR code at the camera
        </p>

        {/* Camera error — shown inline when scanner fails */}
        {cameraMsg && (
          <p style={{ fontSize: 15, color: '#EF4444', marginBottom: 16 }}>{cameraMsg}</p>
        )}

        {/* html5-qrcode mount point — full width, rounded, no dashed border */}
        <div
          id={QR_ELEMENT_ID}
          style={{
            width: '100%',
            minHeight: 300,
            borderRadius: 'var(--r-lg)',
            overflow: 'hidden',
            background: '#111',
            marginBottom: 24,
          }}
        />

        {/* Divider + manual fallback — mirrors LookupScreen's "Or scan your QR code" section */}
        <div style={{ marginTop: 8, paddingTop: 24, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          <p style={{ fontSize: 15, color: 'var(--text-tertiary)', marginBottom: 12 }}>Or enter manually instead</p>
          <button
            onClick={() => goTo('lookup')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Icon name={ICONS.search} size={18} />
            Enter Reference Manually
          </button>
        </div>

      </div>

      {/* Suppress the default html5-qrcode chrome — keep only the video feed */}
      <style>{`
        #${QR_ELEMENT_ID} img,
        #${QR_ELEMENT_ID} > div > span,
        #${QR_ELEMENT_ID} select,
        #${QR_ELEMENT_ID} button:not([aria-label]) { display: none !important; }
        #${QR_ELEMENT_ID} video { width: 100% !important; border-radius: 16px; display: block; }
        @keyframes sc-spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
