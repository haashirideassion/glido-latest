import { useState } from 'react'
import { useWizard } from '@/contexts/WizardContext'
import { Icon, ICONS } from '@/lib/Icon'
import { validators, sanitize } from '@/lib/validation'

export function ReceptionStep1ServiceType() {
  const { state, dispatch } = useWizard()
  const [editing, setEditing] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [guestNameErr,  setGuestNameErr]  = useState('')
  const [guestPhoneErr, setGuestPhoneErr] = useState('')

  const set = (f: 'guestName' | 'guestEmail' | 'guestPhone' | 'companyName', v: string) =>
    dispatch({ type: 'SET', field: f, value: v })

  const touch = (f: string) => setTouched(p => ({ ...p, [f]: true }))

  const nameErr  = touched.guestName  && !state.guestName.trim()
  const emailErr = touched.guestEmail && !!validators.email(state.guestEmail)

  const commitEdit = (raw: string) => {
    const n = parseInt(raw, 10)
    if (!isNaN(n)) {
      dispatch({ type: 'SET', field: 'slotCount', value: Math.min(10, Math.max(1, n)) })
    }
    setEditing(false)
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 6 }}>New Booking</h2>
        <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>
          Creating booking on behalf of a visitor or driver.
        </p>
      </div>

      {/* Slot counter */}
      <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 'var(--r-md)', padding: '28px 24px', marginBottom: 28, background: '#fff' }}>
        {/* Big counter display */}
        <div style={{ textAlign: 'center', paddingBottom: 24 }}>
          <p style={{ fontSize: 15, color: '#9CA3AF', marginBottom: 16, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>How many slots?</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET', field: 'slotCount', value: Math.max(1, state.slotCount - 1) })}
              disabled={state.slotCount <= 1}
              style={{ width: 48, height: 48, borderRadius: 'var(--r-md)', border: '1.5px solid rgba(0,0,0,0.10)', background: '#fff', fontSize: 24, cursor: state.slotCount <= 1 ? 'not-allowed' : 'pointer', opacity: state.slotCount <= 1 ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'opacity 0.15s' }}
            >−</button>

            {editing ? (
              <input
                type="number" min={1} max={10} defaultValue={state.slotCount}
                autoFocus
                onFocus={e => e.target.select()}
                onBlur={e => commitEdit(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit((e.target as HTMLInputElement).value)
                  if (e.key === 'Escape') setEditing(false)
                }}
                style={{
                  fontSize: 64, fontWeight: 800, color: 'var(--brand-color)', lineHeight: 1,
                  width: 96, textAlign: 'center', border: '2px solid rgba(var(--brand-rgb),0.40)',
                  borderRadius: 'var(--r-sm)', outline: 'none', background: 'rgba(var(--brand-rgb),0.04)',
                  fontFamily: 'inherit', padding: '0 8px', boxSizing: 'border-box',
                }}
              />
            ) : (
              <span
                title="Click to type a number"
                onClick={() => setEditing(true)}
                style={{ fontSize: 64, fontWeight: 800, color: '#1C1917', lineHeight: 1, cursor: 'text', display: 'block', minWidth: 64, textAlign: 'center', fontFamily: 'inherit' }}
              >
                {state.slotCount}
              </span>
            )}

            <button
              type="button"
              onClick={() => dispatch({ type: 'SET', field: 'slotCount', value: Math.min(10, state.slotCount + 1) })}
              disabled={state.slotCount >= 10}
              style={{ width: 48, height: 48, borderRadius: 'var(--r-md)', border: '1.5px solid rgba(0,0,0,0.10)', background: '#fff', fontSize: 24, cursor: state.slotCount >= 10 ? 'not-allowed' : 'pointer', opacity: state.slotCount >= 10 ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'opacity 0.15s' }}
            >+</button>
          </div>
          <p style={{ fontSize: 15, color: '#9CA3AF', marginTop: 8 }}>slot{state.slotCount !== 1 ? 's' : ''}</p>
        </div>

        {/* Quick-select pills */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[1, 2, 3, 5, 10].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => dispatch({ type: 'SET', field: 'slotCount', value: n })}
              style={{
                padding: '8px 20px', fontSize: 15, fontWeight: 600, borderRadius: 'var(--r-full)',
                border: state.slotCount === n ? '1.5px solid var(--brand-color, #FC6514)' : '1.5px solid rgba(0,0,0,0.10)',
                background: state.slotCount === n ? 'rgba(var(--brand-rgb),0.08)' : '#fff',
                color: state.slotCount === n ? 'var(--brand-color, #FC6514)' : '#6B7280',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}
            >{n}</button>
          ))}
        </div>


      </div>

      {/* Booking For — always visible, staff enters visitor/driver details */}
      <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 'var(--r-md)', padding: '20px 24px', background: '#fff' }}>
        <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 16, display: 'block', letterSpacing: '-0.01em' }}>
          Booking on Behalf of
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
              Name <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              type="text"
              className="wizard-field"
              value={state.guestName}
              onChange={e => { set('guestName', sanitize.nameChars(e.target.value)); if (guestNameErr) setGuestNameErr('') }}
              onBlur={() => { touch('guestName'); setGuestNameErr(validators.name(state.guestName)) }}
              placeholder="e.g. John Smith"
              style={nameErr || guestNameErr ? { borderColor: '#EF4444', boxShadow: '0 0 0 2px rgba(239,68,68,0.15)' } : {}}
            />
            {nameErr && !guestNameErr && <p style={{ fontSize: 13, color: '#EF4444', marginTop: 4 }}>Name is required</p>}
            {guestNameErr && <p style={{ fontSize: 13, color: '#EF4444', marginTop: 4 }}>{guestNameErr}</p>}
          </div>
          <div>
            <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
              Email Address <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              type="email"
              className="wizard-field"
              value={state.guestEmail}
              onChange={e => set('guestEmail', e.target.value)}
              onBlur={() => touch('guestEmail')}
              placeholder="e.g. john@example.com"
              style={emailErr ? { borderColor: '#EF4444', boxShadow: '0 0 0 2px rgba(239,68,68,0.15)' } : {}}
            />
            {emailErr && <p style={{ fontSize: 13, color: '#EF4444', marginTop: 4 }}>A valid email address is required</p>}
          </div>
          <div>
            <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
              Phone Number <span style={{ fontWeight: 400, marginLeft: 6, color: '#9ca3af', fontSize: 13 }}>(optional)</span>
            </label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              className="wizard-field"
              value={state.guestPhone}
              onChange={e => { set('guestPhone', sanitize.digitsOnly(e.target.value)); if (guestPhoneErr) setGuestPhoneErr('') }}
              onBlur={() => setGuestPhoneErr(validators.phoneAU(state.guestPhone))}
              placeholder="04XX XXX XXX"
            />
            {guestPhoneErr && <p style={{ fontSize: 13, color: '#EF4444', marginTop: 4 }}>{guestPhoneErr}</p>}
          </div>
          <div>
            <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>
              Company Name <span style={{ fontWeight: 400, marginLeft: 6, color: '#9ca3af', fontSize: 13 }}>(optional)</span>
            </label>
            <input
              type="text"
              className="wizard-field"
              value={state.companyName}
              onChange={e => set('companyName', e.target.value)}
              placeholder="Your company or organisation (optional)"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
