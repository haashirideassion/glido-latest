import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useKiosk } from '@/contexts/KioskContext'
import { Icon, ICONS } from '@/lib/Icon'

export function ConfirmScreen() {
  const { state, confirmBooking, goTo } = useKiosk()
  const reduce = useReducedMotion()
  const [confirming, setConfirming] = useState(false)
  if (!state.lookupResult) return null
  const r = state.lookupResult

  // Play a short confirm beat (button press · check pop · label flip) before advancing, so the
  // tap feels acknowledged instead of the screen jumping instantly. Reduced motion skips it.
  const handleConfirm = () => {
    if (confirming) return
    if (reduce) { confirmBooking(); return }
    setConfirming(true)
    setTimeout(confirmBooking, 700)
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 448, textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: 4, color: '#1C1917' }}>Booking Found</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Please confirm this is your booking</p>

        <motion.div
          animate={confirming ? { scale: [1, 1.015, 1] } : {}}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          style={{ textAlign: 'left', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 4px 20px rgba(0,0,0,0.07)', marginBottom: 24 }}
        >
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
        </motion.div>

        <motion.button
          className="kiosk-btn kiosk-btn-primary"
          style={{ width: '100%', borderRadius: 'var(--r-lg)', marginBottom: 12 }}
          onClick={handleConfirm}
          disabled={confirming}
          whileTap={{ scale: 0.97 }}
          animate={confirming ? { scale: [1, 1.04, 1] } : {}}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <motion.span
            style={{ display: 'inline-flex' }}
            animate={confirming ? { scale: [1, 1.5, 1], rotate: [0, -8, 0] } : {}}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <Icon name={ICONS.check} size={26} />
          </motion.span>
          {confirming ? 'Confirmed!' : 'Yes, This Is My Booking'}
        </motion.button>
        <button
          className="kiosk-btn kiosk-btn-secondary"
          style={{ width: '100%', borderRadius: 'var(--r-lg)', opacity: confirming ? 0.5 : 1 }}
          onClick={() => goTo('lookup')}
          disabled={confirming}
        >
          This is not my booking
        </button>
      </div>
    </div>
  )
}
