import { useState } from 'react'
import { useKiosk } from '@/contexts/KioskContext'
import { Icon, ICONS } from '@/lib/Icon'
import { getBookingByRego } from '@/lib/db/bookings'

function getStatusBlockMessage(status: string): string | null {
  switch (status) {
    case 'checked_in': return "You're already checked in. Please proceed to the reception area."
    case 'completed':  return 'This booking has already been completed.'
    case 'cancelled':  return 'This booking has been cancelled. Please contact reception for assistance.'
    default:           return null
  }
}

type Tab = 'ref' | 'rego'

export function LookupScreen() {
  const { state, dispatch, goTo, performLookup } = useKiosk()

  const [tab,              setTab]              = useState<Tab>('ref')
  const [regoInput,        setRegoInput]        = useState('')
  const [regoLoading,      setRegoLoading]      = useState(false)
  const [regoError,        setRegoError]        = useState(false)
  const [regoBlockMessage, setRegoBlockMessage] = useState<string | null>(null)

  if (state.currentScreen !== 'lookup') return null

  const formatRef = (raw: string) => {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const parts: string[] = []
    if (clean.length > 0)  parts.push(clean.slice(0, 3))
    if (clean.length > 3)  parts.push(clean.slice(3, 7))
    if (clean.length > 7)  parts.push(clean.slice(7, 12))
    if (clean.length > 12) parts.push(clean.slice(12, 14))
    if (clean.length > 14) parts.push(clean.slice(14, 16))
    return parts.join('-')
  }

  const handleRefInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatRef(e.target.value)
    dispatch({ type: 'SET_REF_INPUT', value: formatted })
  }

  const borderColor     = state.lookupError ? '#EF4444' : '#C2C2C2'
  const bg              = state.lookupError ? '#FEF2F2' : '#F7F6F5'
  const regoBorderColor = regoError ? '#EF4444' : '#C2C2C2'
  const regoBg          = regoError ? '#FEF2F2' : '#F7F6F5'

  const handleRegoLookup = async () => {
    const rego = regoInput.trim().toUpperCase()
    if (!rego) return
    setRegoLoading(true)
    setRegoError(false)
    setRegoBlockMessage(null)
    dispatch({ type: 'SET_LOOKUP', result: null, error: false, loading: true })
    try {
      const booking = await getBookingByRego(rego)
      if (!booking) {
        dispatch({ type: 'SET_LOOKUP', result: null, error: true, loading: false })
        setRegoError(true)
        return
      }

      // Block already-processed bookings
      const blockMsg = getStatusBlockMessage(booking.status)
      if (blockMsg) {
        dispatch({ type: 'SET_LOOKUP', result: null, error: false, loading: false })
        setRegoBlockMessage(blockMsg)
        return
      }

      dispatch({
        type: 'SET_LOOKUP',
        loading: false, error: false,
        result: {
          found:      true,
          bookingId:  booking.id,
          ref:        booking.referenceNumber,
          name:       booking.driverName,
          driverName: booking.driverName,
          slot:       `${booking.slotDate} ${booking.slotStartTime} – ${booking.slotEndTime}`,
          service:    booking.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off',
          loadType:   booking.loadType.toUpperCase(),
          status:     booking.status,
        },
      })
      dispatch({ type: 'GO_TO', screen: 'confirm' })
    } catch {
      dispatch({ type: 'SET_LOOKUP', result: null, error: true, loading: false })
      setRegoError(true)
    } finally {
      setRegoLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px' }}>
      <div style={{ width: '100%', maxWidth: 448, textAlign: 'center' }}>

        {/* Header */}
        <div style={{ width: 64, height: 64, background: 'rgba(var(--brand-rgb),0.09)', borderRadius: 'var(--r-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Icon name={ICONS.search} size={36} style={{ color: 'var(--brand-color)' }} />
        </div>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: 8, color: '#1C1917' }}>Find Your Booking</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 28 }}>Select how you'd like to look up your booking</p>

        {/* Tab switcher — same pattern as ScanScreen */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28, background: 'rgba(0,0,0,0.04)', borderRadius: 'var(--r-md)', padding: 4 }}>
          {(['ref', 'rego'] as Tab[]).map(t => {
            const active = tab === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                style={{
                  flex: 1, height: 50, borderRadius: 'var(--r-sm)',
                  fontWeight: 700, fontSize: 15, cursor: 'pointer',
                  border: 'none',
                  background: active ? 'var(--brand-color)' : 'transparent',
                  color: active ? '#fff' : '#78716C',
                  boxShadow: active ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                  transition: 'all 0.15s',
                  fontFamily: 'inherit',
                }}
              >
                {t === 'ref' ? 'Booking Reference' : 'Vehicle Registration'}
              </button>
            )
          })}
        </div>

        {/* ── Booking Reference tab ── */}
        {tab === 'ref' && (
          <>
            <input
              type="text"
              placeholder="GLD-2026-XXXXX"
              className="kiosk-input"
              style={{ width: '100%', borderRadius: 'var(--r-lg)', marginBottom: 12, border: `2px solid ${borderColor}`, background: bg, color: '#1C1917', padding: '14px 24px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
              value={state.referenceInput}
              maxLength={20}
              onChange={handleRefInput}
              onKeyDown={e => e.key === 'Enter' && performLookup()}
              onFocus={e => { e.target.style.borderColor = 'var(--brand-color)'; e.target.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.12)' }}
              onBlur={e  => { e.target.style.borderColor = borderColor; e.target.style.boxShadow = 'none' }}
            />
            {state.lookupBlockMessage && (
              <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: 'var(--r-md)', fontSize: 15, color: '#92400E', lineHeight: 1.5 }}>
                {state.lookupBlockMessage}
              </div>
            )}
            {state.lookupError && !state.lookupBlockMessage && (
              <p style={{ fontSize: 15, color: '#EF4444', marginBottom: 16 }}>Reference not found. Please check and try again.</p>
            )}
            {state.lookupLoading && (
              <p style={{ fontSize: 15, color: 'var(--brand-color)', marginBottom: 16 }}>Looking up booking…</p>
            )}
            <button
              className="kiosk-btn kiosk-btn-primary"
              style={{ width: '100%', borderRadius: 'var(--r-lg)', opacity: state.referenceInput.trim() ? 1 : 0.4, cursor: state.referenceInput.trim() ? 'pointer' : 'not-allowed' }}
              onClick={performLookup}
              disabled={!state.referenceInput.trim() || state.lookupLoading}
            >
              Find Booking
            </button>
          </>
        )}

        {/* ── Vehicle Registration tab ── */}
        {tab === 'rego' && (
          <>
            <input
              type="text"
              placeholder="e.g. ABC123"
              className="kiosk-input"
              style={{ width: '100%', borderRadius: 'var(--r-lg)', marginBottom: 12, border: `2px solid ${regoBorderColor}`, background: regoBg, color: '#1C1917', padding: '14px 24px', textTransform: 'uppercase', letterSpacing: '0.12em' }}
              value={regoInput}
              onChange={e => { setRegoInput(e.target.value.toUpperCase()); setRegoError(false); setRegoBlockMessage(null) }}
              onKeyDown={e => e.key === 'Enter' && handleRegoLookup()}
              onFocus={e => { e.target.style.borderColor = 'var(--brand-color)'; e.target.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.12)' }}
              onBlur={e  => { e.target.style.borderColor = regoBorderColor; e.target.style.boxShadow = 'none' }}
            />
            {regoBlockMessage && (
              <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: 'var(--r-md)', fontSize: 15, color: '#92400E', lineHeight: 1.5 }}>
                {regoBlockMessage}
              </div>
            )}
            {regoError && !regoBlockMessage && (
              <p style={{ fontSize: 15, color: '#EF4444', marginBottom: 16 }}>No booking found for that registration. Please try again.</p>
            )}
            {regoLoading && (
              <p style={{ fontSize: 15, color: 'var(--brand-color)', marginBottom: 16 }}>Looking up booking…</p>
            )}
            <button
              className="kiosk-btn kiosk-btn-primary"
              style={{ width: '100%', borderRadius: 'var(--r-lg)', opacity: regoInput.trim() ? 1 : 0.4, cursor: regoInput.trim() ? 'pointer' : 'not-allowed' }}
              onClick={handleRegoLookup}
              disabled={!regoInput.trim() || regoLoading}
            >
              Find by Rego
            </button>
          </>
        )}

        {/* QR scanner — visible on both tabs */}
        <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          <p style={{ fontSize: 15, color: 'var(--text-tertiary)', marginBottom: 12 }}>Or scan your QR code</p>
          <button
            onClick={() => goTo('scan')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Icon name={ICONS.qrCode} size={18} />
            Use QR Scanner
          </button>
        </div>

      </div>
    </div>
  )
}
