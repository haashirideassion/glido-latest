import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useKiosk } from '@/contexts/KioskContext'
import { Icon, ICONS } from '@/lib/Icon'
import { motion, useReducedMotion } from 'motion/react'
import { GlidoLogo } from '@/lib/GlidoLogo'
import { useTenantInfo } from '@/lib/useTenantInfo'
import type { KioskScreen } from '@/contexts/KioskContext'

const BOOKING_SCREENS: KioskScreen[] = ['lookup', 'scan', 'confirm', 'consent', 'idscan', 'slot-picker']
const WALKIN_SCREENS:  KioskScreen[] = ['purpose', 'walkin']

// ── Shared style helpers ─────────────────────────────────────────────────────

const circle = (active: boolean, done: boolean): CSSProperties => ({
  width: 46, height: 46, borderRadius: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  transition: 'all 0.25s ease',
  ...(active || done
    ? {
        border: 'none', color: 'var(--brand-text)',
        background: 'linear-gradient(160deg, color-mix(in srgb, var(--brand-color) 88%, #fff) 0%, var(--brand-color) 55%, color-mix(in srgb, var(--brand-color) 80%, #000) 100%)',
        boxShadow: active
          ? '0 2px 3px rgba(0,0,0,0.10), 0 8px 18px rgba(var(--brand-rgb),0.38), inset 0 1.5px 0 rgba(255,255,255,0.55), 0 0 0 6px rgba(var(--brand-rgb),0.14)'
          : '0 1px 2px rgba(0,0,0,0.08), 0 4px 10px rgba(var(--brand-rgb),0.22), inset 0 1.5px 0 rgba(255,255,255,0.5)',
      }
    : { border: '1.5px solid rgba(0,0,0,0.08)', color: '#B0AEAC', background: 'linear-gradient(160deg, #FFFFFF 0%, #F3F2F1 100%)', boxShadow: 'inset 0 1.5px 3px rgba(0,0,0,0.07)' }
  ),
})

const labelStyle = (active: boolean, done: boolean): CSSProperties => ({
  fontSize: 13, fontWeight: active ? 700 : 400,
  color: active || done ? '#101010' : '#605F5F',
  transition: 'all 0.25s ease',
})

// Horizontal connector (inline / header mode)
const hline = (done: boolean, afterActive = false): CSSProperties => ({
  height: 4, flex: 1, borderRadius: 999, marginTop: 21, minWidth: 8, overflow: 'hidden',
  background: done
    ? 'linear-gradient(90deg, var(--brand-color), color-mix(in srgb, var(--brand-color) 70%, #fff))'
    : afterActive ? 'linear-gradient(90deg, var(--brand-color), #C2C2C2)'
    : 'linear-gradient(180deg, rgba(0,0,0,0.09), rgba(0,0,0,0.03))',
  boxShadow: done ? '0 0 8px rgba(var(--brand-rgb),0.45)' : 'inset 0 1px 2px rgba(0,0,0,0.10)',
  transition: 'background 0.3s ease',
})

// Vertical connector (sidebar mode)
const vline = (done: boolean): CSSProperties => ({
  width: 2, height: 28, marginLeft: 22, borderRadius: 999, flexShrink: 0,
  background: done
    ? 'linear-gradient(180deg, var(--brand-color), color-mix(in srgb, var(--brand-color) 70%, #fff))'
    : 'linear-gradient(180deg, rgba(0,0,0,0.09), rgba(0,0,0,0.03))',
  boxShadow: done ? '0 0 6px rgba(var(--brand-rgb),0.40)' : 'inset 1px 0 2px rgba(0,0,0,0.06)',
  transition: 'background 0.3s ease',
})

// ── Step components ──────────────────────────────────────────────────────────

/** Horizontal step (header / inline mode) — circle on top, label below */
function HStep({ icon, label, active, done }: { icon: string; label: string; active: boolean; done: boolean }) {
  const reduce = useReducedMotion()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <motion.div
        animate={reduce ? undefined : { scale: active ? 1.06 : 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        style={circle(active, done)}
      >
        <Icon name={icon} size={19} />
      </motion.div>
      <span style={{ ...labelStyle(active, done), textAlign: 'center', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

/** Vertical step (sidebar mode) — circle on left, label on right */
function VStep({ icon, label, active, done }: { icon: string; label: string; active: boolean; done: boolean }) {
  const reduce = useReducedMotion()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <motion.div
        animate={reduce ? undefined : { scale: active ? 1.06 : 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        style={circle(active, done)}
      >
        <Icon name={icon} size={19} />
      </motion.div>
      <span style={{ ...labelStyle(active, done), lineHeight: 1.3 }}>{label}</span>
    </div>
  )
}

// ── Back button (shared) ─────────────────────────────────────────────────────
function BackBtn({ onClick, style }: { onClick: () => void; style?: CSSProperties }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '7px 14px 7px 10px', fontSize: 13, fontWeight: 600,
        color: '#374151', border: '1.5px solid rgba(0,0,0,0.10)',
        borderRadius: 'var(--r-full)',
        background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        cursor: 'pointer', transition: 'all 0.15s ease',
        ...style,
      }}
      onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.95)' }}
      onMouseOut={e  => { e.currentTarget.style.background = 'rgba(255,255,255,0.7)' }}
    >
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
        <path d="M8.5 2.5L4.5 7l4 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Back
    </button>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function KioskStepper({ sidebar = false }: { sidebar?: boolean }) {
  const { state, goTo } = useKiosk()
  const tenant = useTenantInfo()
  const [logoErr, setLogoErr] = useState(false)
  const s = state.currentScreen
  const isBooking = BOOKING_SCREENS.includes(s)
  const isWalkIn  = WALKIN_SCREENS.includes(s)

  const logoEl = tenant?.logoUrl && !logoErr
    ? <img src={tenant.logoUrl} alt="" onError={() => setLogoErr(true)} style={{ maxHeight: 22, objectFit: 'contain', display: 'block' }} />
    : <GlidoLogo height={22} />

  // Welcome — just the logo in a slim bar
  if (s === 'welcome') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 24px 16px', flexShrink: 0 }}>
        {logoEl}
      </div>
    )
  }

  if (!isBooking && !isWalkIn) return null

  const back = () => {
    if (isBooking) {
      const map: Partial<Record<KioskScreen, KioskScreen>> = {
        lookup: 'welcome', scan: 'lookup', 'slot-picker': 'lookup',
        confirm: 'lookup', consent: 'confirm', idscan: 'consent',
      }
      goTo(map[s] ?? 'welcome')
    } else {
      goTo(s === 'purpose' ? 'welcome' : 'purpose')
    }
  }

  // ── SIDEBAR mode: vertical steps, fills the column height ─────────────────
  if (sidebar) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px 20px 32px 24px' }}>
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          {logoEl}
        </div>

        {/* Back */}
        <BackBtn onClick={back} style={{ alignSelf: 'flex-start', marginBottom: 0 }} />

        {/* Steps pushed to vertical centre */}
        <div style={{ flex: 1 }} />

        {isBooking && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <VStep icon={ICONS.search} label="Find Booking" active={['lookup','scan','slot-picker'].includes(s)} done={['confirm','consent','idscan'].includes(s)} />
            <div style={vline(['confirm','consent','idscan'].includes(s))} />
            <VStep icon={ICONS.check}  label="Confirm"      active={s === 'confirm'}               done={['consent','idscan'].includes(s)} />
            <div style={vline(['consent','idscan'].includes(s))} />
            <VStep icon={ICONS.shield} label="Verify ID"    active={['consent','idscan'].includes(s)} done={false} />
          </div>
        )}

        {isWalkIn && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <VStep icon={ICONS.users} label="Visit Type"   active={s === 'purpose'} done={s === 'walkin'} />
            <div style={vline(s === 'walkin')} />
            <VStep icon={ICONS.user}  label="Your Details" active={s === 'walkin'}  done={false} />
          </div>
        )}

        <div style={{ flex: 1 }} />
      </div>
    )
  }

  // ── INLINE mode: compact horizontal header bar ─────────────────────────────
  return (
    <div style={{ position: 'relative', padding: '12px 24px 14px', flexShrink: 0 }}>

      {/* Back button — absolute top-left */}
      <div style={{ position: 'absolute', top: 12, left: 16, zIndex: 2 }}>
        <BackBtn onClick={back} />
      </div>

      {/* Logo — small, centred */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        {logoEl}
      </div>

      {/* Horizontal booking steps */}
      {isBooking && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', maxWidth: 480, margin: '0 auto' }}>
          <HStep icon={ICONS.search} label="Find Booking" active={['lookup','scan','slot-picker'].includes(s)} done={['confirm','consent','idscan'].includes(s)} />
          <div style={hline(['confirm','consent','idscan'].includes(s), ['lookup','scan','slot-picker'].includes(s))} />
          <HStep icon={ICONS.check}  label="Confirm"      active={s === 'confirm'}               done={['consent','idscan'].includes(s)} />
          <div style={hline(['consent','idscan'].includes(s), s === 'confirm')} />
          <HStep icon={ICONS.shield} label="Verify ID"    active={['consent','idscan'].includes(s)} done={false} />
        </div>
      )}

      {/* Horizontal walk-in steps */}
      {isWalkIn && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', maxWidth: 320, margin: '0 auto' }}>
          <HStep icon={ICONS.users} label="Visit Type"   active={s === 'purpose'} done={s === 'walkin'} />
          <div style={hline(s === 'walkin', s === 'purpose')} />
          <HStep icon={ICONS.user}  label="Your Details" active={s === 'walkin'}  done={false} />
        </div>
      )}
    </div>
  )
}
