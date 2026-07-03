import { useEffect, useState } from 'react'
import { GlidoLogo } from '@/lib/GlidoLogo'
import { Icon, ICONS } from '@/lib/Icon'
import { useKiosk } from '@/contexts/KioskContext'
import { useTenantInfo } from '@/lib/useTenantInfo'
import { getTenant } from '@/lib/db/tenants'
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

export function WelcomeScreen() {
  const { state, startBookingLookup, startVisitingFlow } = useKiosk()
  const tenant = useTenantInfo()
  const [time,       setTime]       = useState('')
  const [todayHours, setTodayHours] = useState('')

  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID).then(t => {
      const wh = t?.working_hours as Record<string, { open: string; close: string; enabled: boolean }> | null
      if (!wh) return
      const key = DAY_KEYS[new Date().getDay()]
      const day = wh[key]
      if (!day) return
      setTodayHours(day.enabled ? `Open today: ${day.open} – ${day.close}` : 'Closed today')
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

  if (state.currentScreen !== 'welcome') return null

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 32px' }}>
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          {tenant?.logoUrl
            ? <img src={tenant.logoUrl} alt={tenant.name || 'Logo'} style={{ maxHeight: 56, objectFit: 'contain', display: 'block' }} />
            : <GlidoLogo height={56} />
          }
        </div>
        <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: 8, color: '#1C1917' }}>{tenant?.name || 'Sydney CFS'}</h1>
        <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)' }}>Container Freight Station</p>
        <p style={{ fontSize: '1.5rem', fontFamily: 'ui-monospace,monospace', fontWeight: 600, marginTop: 12, color: '#1C1917', fontVariantNumeric: 'tabular-nums' }}>{time}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 448 }}>
        <button className="kiosk-btn kiosk-btn-primary" style={{ width: '100%', borderRadius: 'var(--r-lg)' }} onClick={startBookingLookup}>
          <Icon name={ICONS.qrCode} size={28} />
          I have a booking — Pick Up or Drop Off
        </button>
        <button className="kiosk-btn kiosk-btn-secondary" style={{ width: '100%', borderRadius: 'var(--r-lg)' }} onClick={startVisitingFlow}>
          <Icon name={ICONS.walkIn} size={28} />
          I'm visiting someone
        </button>
      </div>

      {todayHours && (
        <div style={{ marginTop: 40, borderRadius: 'var(--r-lg)', padding: '12px 24px', textAlign: 'center', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.07)' }}>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', fontWeight: 600 }}>{todayHours}</p>
        </div>
      )}
      <p style={{ marginTop: 24, fontSize: 15, color: 'var(--text-tertiary)' }}>Need help? Speak to our reception team.</p>
    </div>
  )
}
