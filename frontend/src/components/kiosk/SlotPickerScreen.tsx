import { useState } from 'react'
import { useKiosk } from '@/contexts/KioskContext'
import type { Booking } from '@/data/types'

function getStatusBlockMessage(status: string): string | null {
  switch (status) {
    case 'checked_in': return "You're already checked in. Please proceed to the reception area."
    case 'completed':  return 'This booking has already been completed.'
    case 'cancelled':  return 'This booking has been cancelled. Please contact reception for assistance.'
    default:           return null
  }
}

export function SlotPickerScreen() {
  const { state, dispatch, goTo } = useKiosk()
  const [selected,     setSelected]     = useState<Set<string>>(new Set())
  const [blockMessage, setBlockMessage] = useState<string | null>(null)

  if (state.currentScreen !== 'slot-picker') return null

  const slots = state.slotPickerBookings

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(slots.map(s => s.id)))

  const proceed = () => {
    if (selected.size === 0) return
    const primary = slots.find(s => selected.has(s.id))!
    const block = getStatusBlockMessage(primary.status)
    if (block) { setBlockMessage(block); return }
    setBlockMessage(null)
    dispatch({
      type: 'SET_LOOKUP',
      loading: false, error: false,
      result: {
        found: true,
        bookingId: primary.id,
        ref: primary.referenceNumber,
        name: primary.driverName,
        driverName: primary.driverName,
        slot: `${primary.slotDate} ${primary.slotStartTime} – ${primary.slotEndTime}`,
        service: primary.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off',
        loadType: primary.loadType.toUpperCase(),
        status: primary.status,
      },
    })
    goTo('confirm')
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* Header */}
        <div style={{ width: 64, height: 64, background: 'rgba(var(--brand-rgb),0.09)', borderRadius: 'var(--r-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--brand-color,#FC6514)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: 8, color: '#1C1917', textAlign: 'center' }}>Select Your Slot</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 28, textAlign: 'center' }}>
          This booking has {slots.length} scheduled slots. Select the one{slots.length > 1 ? 's' : ''} you are checking in for today.
        </p>

        {/* Select All */}
        {slots.length > 1 && (
          <button type="button" onClick={selectAll}
            style={{ width: '100%', marginBottom: 12, padding: '10px', fontSize: 15, fontWeight: 600, color: 'var(--brand-color,#FC6514)', background: 'rgba(var(--brand-rgb),0.07)', border: '1.5px solid rgba(var(--brand-rgb),0.25)', borderRadius: 'var(--r-md)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Select All {slots.length} Slots
          </button>
        )}

        {/* Slot cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {slots.map((slot: Booking) => {
            const sel = selected.has(slot.id)
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => toggle(slot.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '16px 18px', borderRadius: 'var(--r-lg)',
                  border: `2px solid ${sel ? 'var(--brand-color,#FC6514)' : '#C2C2C2'}`,
                  background: sel ? 'rgba(var(--brand-rgb),0.06)' : '#fff',
                  cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                  boxShadow: sel ? '0 0 0 3px rgba(var(--brand-rgb),0.12)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', marginBottom: 4 }}>
                      {slot.slotStartTime} – {slot.slotEndTime}
                      <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>{slot.slotDate}</span>
                    </p>
                    <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 2 }}>
                      {slot.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'} · {slot.loadType.toUpperCase()}
                    </p>
                    {(slot.containerNumber || slot.houseBillNumber) && (
                      <p style={{ fontSize: 14, fontFamily: 'ui-monospace,monospace', color: 'var(--text-tertiary)' }}>
                        {slot.containerNumber ?? slot.houseBillNumber}
                      </p>
                    )}
                  </div>
                  <div style={{
                    width: 22, height: 22, borderRadius: 'var(--r-full)', flexShrink: 0,
                    border: `2px solid ${sel ? 'var(--brand-color,#FC6514)' : '#C2C2C2'}`,
                    background: sel ? 'var(--brand-color,#FC6514)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    {sel && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {blockMessage && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: 'var(--r-md)', fontSize: 15, color: '#92400E', lineHeight: 1.5 }}>
            {blockMessage}
          </div>
        )}

        {/* Proceed button */}
        <button
          className="kiosk-btn kiosk-btn-primary"
          style={{ width: '100%', borderRadius: 'var(--r-lg)', opacity: selected.size > 0 ? 1 : 0.4, cursor: selected.size > 0 ? 'pointer' : 'not-allowed' }}
          onClick={proceed}
          disabled={selected.size === 0}
        >
          Check In{selected.size > 1 ? ` ${selected.size} Slots` : selected.size === 1 ? ' Selected Slot' : ''}
        </button>


      </div>
    </div>
  )
}
