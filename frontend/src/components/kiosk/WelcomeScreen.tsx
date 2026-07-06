import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Icon, ICONS } from '@/lib/Icon'
import { useKiosk } from '@/contexts/KioskContext'
import { getTenant } from '@/lib/db/tenants'
import { GlidoLogo } from '@/lib/GlidoLogo'
import { useTenantInfo } from '@/lib/useTenantInfo'
import { useSignedUrl } from '@/lib/useSignedUrl'
import { useI18n, LANGUAGES } from '@/lib/i18n'
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

// Small language switcher — cycles through the supported languages
function LanguageSwitcher() {
  const { lang, setLang } = useI18n()
  return (
    <div style={{ position: 'absolute', top: 20, right: 24, display: 'flex', gap: 6 }}>
      {LANGUAGES.map(l => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-label={`Switch to ${l.label}`}
          aria-pressed={lang === l.code}
          style={{
            padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            cursor: 'pointer', transition: 'all 0.15s ease',
            border: lang === l.code ? '1.5px solid var(--brand-color)' : '1.5px solid rgba(0,0,0,0.08)',
            background: lang === l.code ? 'rgba(var(--brand-rgb),0.08)' : '#fff',
            color: lang === l.code ? 'var(--brand-color)' : '#78716C',
          }}
        >
          {l.native}
        </button>
      ))}
    </div>
  )
}

// Flip-clock — each digit rolls when it changes
function FlipClock({ time }: { time: string }) {
  return (
    <div style={{ display: 'inline-flex', gap: 5, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
      {time.split('').map((ch, i) => ch === ':' ? (
        <span key={'c' + i} style={{ fontSize: 26, fontWeight: 800, color: 'var(--brand-color)', opacity: 0.55, margin: '0 1px' }}>:</span>
      ) : (
        <div style={{ position: 'relative', width: 42, height: 56, borderRadius: 11, background: 'linear-gradient(160deg,rgba(255,255,255,0.55) 0%,rgba(236,235,233,0.45) 100%)', backdropFilter: 'blur(10px) saturate(1.3)', WebkitBackdropFilter: 'blur(10px) saturate(1.3)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.7), inset 0 -2px 4px rgba(0,0,0,0.05), 0 3px 8px rgba(0,0,0,0.08)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }} key={i}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={ch + '-' + i}
              initial={{ y: '-110%', opacity: 0 }}
              animate={{ y: '0%', opacity: 1 }}
              exit={{ y: '110%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              style={{ position: 'absolute', fontSize: 24, fontWeight: 800, fontFamily: 'ui-monospace,monospace', color: '#1C1917', fontVariantNumeric: 'tabular-nums' }}
            >
              {ch}
            </motion.span>
          </AnimatePresence>
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(0,0,0,0.07)' }} />
        </div>
      ))}
    </div>
  )
}

export function WelcomeScreen() {
  const { startBookingLookup, startVisitingFlow } = useKiosk()
  const { t } = useI18n()
  const tenant = useTenantInfo()
  const logoSrc = useSignedUrl(tenant?.logoUrl)
  const [time,       setTime]       = useState('')
  const [todayHours, setTodayHours] = useState<{ open: boolean; open_: string; close: string } | null>(null)

  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID).then(row => {
      const wh = row?.working_hours as Record<string, { open: string; close: string; enabled: boolean }> | null
      if (!wh) return
      const key = DAY_KEYS[new Date().getDay()]
      const day = wh[key]
      if (!day) return
      setTodayHours(day.enabled ? { open: true, open_: day.open, close: day.close } : { open: false, open_: '', close: '' })
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const update = () => setTime(
      new Date().toLocaleTimeString('en-AU', {
        hour:     '2-digit',
        minute:   '2-digit',
        second:   '2-digit',
        hour12:   false,
        timeZone: 'Australia/Sydney',
      })
    )
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 32px', position: 'relative' }}>
      <LanguageSwitcher />
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          {tenant?.logoUrl
            ? <img src={logoSrc} alt={tenant.name || 'Logo'} style={{ maxHeight: 56, objectFit: 'contain', display: 'block' }} />
            : <GlidoLogo height={56} />
          }
        </div>
        <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: 8, color: '#1C1917' }}>{tenant?.name || 'Sydney CFS'}</h1>
        <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)' }}>{t('cfs')}</p>
        {time && <FlipClock time={time} />}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 448 }}>
        <button className="kiosk-btn kiosk-btn-primary" style={{ width: '100%', borderRadius: 'var(--r-lg)' }} onClick={startBookingLookup}>
          <Icon name={ICONS.qrCode} size={28} />
          {t('haveBooking')}
        </button>
        <button className="kiosk-btn kiosk-btn-secondary" style={{ width: '100%', borderRadius: 'var(--r-lg)' }} onClick={startVisitingFlow}>
          <Icon name={ICONS.walkIn} size={28} />
          {t('visiting')}
        </button>
      </div>

      {todayHours && (
        <div style={{ marginTop: 40, borderRadius: 'var(--r-lg)', padding: '12px 24px', textAlign: 'center', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.07)' }}>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {todayHours.open ? t('openToday', { hours: `${todayHours.open_} – ${todayHours.close}` }) : t('closedToday')}
          </p>
        </div>
      )}
      <p style={{ marginTop: 24, fontSize: 15, color: 'var(--text-tertiary)' }}>{t('needHelp')}</p>
    </div>
  )
}
