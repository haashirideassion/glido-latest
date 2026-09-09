import { useState } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import type { SlotConfig } from '@/contexts/WizardContext'

const svc = (s: string | null) => s === 'pickup' ? 'Pick Up' : s === 'dropoff' ? 'Drop Off' : null

const ICS_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  cleared:     { bg: 'rgba(34,197,94,0.12)',  color: '#16A34A', border: 'rgba(34,197,94,0.22)',  label: 'Cleared'  },
  held:        { bg: 'rgba(239,68,68,0.12)',  color: '#DC2626', border: 'rgba(239,68,68,0.22)',  label: 'Held'     },
  examination: { bg: 'rgba(251,191,36,0.10)', color: '#B45309', border: 'rgba(251,191,36,0.22)', label: 'Examination' },
  pending:     { bg: 'rgba(234,179,8,0.12)',  color: '#854D0E', border: 'rgba(234,179,8,0.30)',  label: 'Pending'  },
  unavailable: { bg: 'rgba(0,0,0,0.05)',      color: '#9CA3AF', border: 'rgba(0,0,0,0.10)',      label: 'N/A'      },
}

function IcsBadge({ status, small }: { status: string; small?: boolean }) {
  const s = ICS_STYLE[status] ?? ICS_STYLE.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: small ? 10 : 11, fontWeight: 600,
      padding: small ? '2px 6px' : '2px 7px',
      borderRadius: 'var(--r-full)',
      border: `1px solid ${s.border}`,
      background: s.bg, color: s.color,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

export function SlotSummaryPanel({ slots, inline }: { slots: SlotConfig[]; inline?: boolean }) {
  const [open, setOpen] = useState(true)

  // ICS summary for floating collapsed header
  const icsStatuses = slots.map(c => c.icsStatus).filter(Boolean)
  const hasHeld = icsStatuses.some(s => s === 'held' || s === 'examination')
  const summaryIcs = hasHeld
    ? (icsStatuses.find(s => s === 'held') ?? icsStatuses.find(s => s === 'examination'))
    : icsStatuses.find(s => s === 'cleared')

  // ─── Inline card ──────────────────────────────────────────────────────────
  if (inline) {
    return (
      <div style={{
        background: '#FFFFFF',
        border: '1px solid rgba(0,0,0,0.07)',
        borderRadius: 'var(--r-lg)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)',
        overflow: 'hidden',
      }}>
        {/* Card header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '14px 18px',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          background: 'rgba(var(--brand-rgb),0.03)',
        }}>
          <Icon name={ICONS.calendar} size={15} style={{ color: 'var(--brand-color)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1917', letterSpacing: '0.01em' }}>Your Slots</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 19, height: 19, borderRadius: 'var(--r-full)',
            background: 'rgba(var(--brand-rgb),0.12)',
            fontSize: 10, fontWeight: 700, color: 'var(--brand-color)',
          }}>{slots.length}</span>
        </div>

        {/* Slot rows */}
        <div>
          {slots.map((c, i) => {
            const service = svc(c.serviceType)
            const load = c.loadType ? c.loadType.toUpperCase() : null
            const done = !!(service && load && c.selectedSlotLabel)
            return (
              <div key={i} style={{
                display: 'flex', gap: 12, padding: '14px 18px',
                borderTop: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.05)',
              }}>
                {/* Number bubble */}
                <span style={{
                  flexShrink: 0, width: 26, height: 26,
                  borderRadius: 'var(--r-full)',
                  background: done ? 'rgba(var(--brand-rgb),0.10)' : 'rgba(0,0,0,0.05)',
                  color: done ? 'var(--brand-color)' : '#9CA3AF',
                  fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {i + 1}
                </span>

                <div style={{ minWidth: 0, flex: 1 }}>
                  {/* Service · Load type */}
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: '#1C1917', margin: 0, lineHeight: 1.3 }}>
                    {service && load
                      ? `${service} · ${load}`
                      : service
                      ? service
                      : <span style={{ color: '#9CA3AF', fontWeight: 500 }}>Not configured</span>
                    }
                  </p>

                  {/* Date · Time slot */}
                  {c.selectedSlotLabel && (
                    <p style={{
                      fontSize: 12, color: 'var(--text-secondary)', margin: '5px 0 0',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/>
                      </svg>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.selectedDate} · {c.selectedSlotLabel}
                      </span>
                    </p>
                  )}

                  {/* ICS status */}
                  {c.icsStatus && (
                    <div style={{ marginTop: 7 }}>
                      <IcsBadge status={c.icsStatus} />
                    </div>
                  )}

                  {/* Not yet started hint */}
                  {!service && (
                    <p style={{ fontSize: 11.5, color: '#9CA3AF', margin: '4px 0 0', fontStyle: 'italic' }}>
                      Complete the steps to configure
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── Floating variant (legacy) ────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', right: 20, bottom: 142, zIndex: 40, width: 280, maxWidth: 'calc(100vw - 40px)', animation: 'slot-panel-in 0.28s cubic-bezier(0.16,1,0.3,1)' }}>
      <style>{`@keyframes slot-panel-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', boxShadow: '0 4px 20px rgba(0,0,0,0.08),0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
        <button type="button" onClick={() => setOpen(v => !v)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '11px 14px', background: 'rgba(var(--brand-rgb),0.04)', border: 'none', borderBottom: open ? '1px solid rgba(0,0,0,0.06)' : 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Icon name={ICONS.calendar} size={15} style={{ color: 'var(--brand-color)', flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1C1917' }}>Your Slots</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)' }}>{slots.length}</span>
            {!open && summaryIcs && <IcsBadge status={summaryIcs} small />}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        {open && (
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {slots.map((c, i) => {
              const service = svc(c.serviceType)
              const load = c.loadType ? c.loadType.toUpperCase() : null
              const done = !!(service && load && c.selectedSlotLabel)
              return (
                <div key={i} style={{ display: 'flex', gap: 11, padding: '13px 14px', borderTop: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.06)' }}>
                  <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 'var(--r-full)', background: done ? 'rgba(var(--brand-rgb),0.10)' : 'rgba(0,0,0,0.05)', color: done ? 'var(--brand-color)' : 'var(--text-tertiary)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {i + 1}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: '#1C1917', margin: 0 }}>
                      {service && load ? `${service} · ${load}` : service ? service : <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>Not set yet</span>}
                    </p>
                    {c.selectedSlotLabel && (
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>
                        {c.selectedDate} · {c.selectedSlotLabel}
                      </p>
                    )}
                    {c.icsStatus && <div style={{ marginTop: 6 }}><IcsBadge status={c.icsStatus} /></div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
