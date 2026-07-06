import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/reception/EmptyState'
import { todaySydney } from '@/lib/time'
import { toast } from '@/lib/toast'
import type { Booking } from '@/data/types'

const ICS_BAR_COLOR: Record<string, string> = {
  cleared:     '#16A34A',
  held:        '#DC2626',
  examination: '#F59E0B',
  pending:     '#94A3B8',
  unavailable: '#E5E7EB',
}

const ICS_LEGEND = [
  { key: 'cleared',     label: 'Cleared'     },
  { key: 'held',        label: 'Held'        },
  { key: 'examination', label: 'Examination' },
  { key: 'pending',     label: 'Pending'     },
  { key: 'unavailable', label: 'N/A'         },
]

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string; icon: string }> = {
  scheduled:  { label: 'Scheduled',  bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE', icon: 'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  checked_in: { label: 'Checked In', bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0', icon: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  completed:  { label: 'Completed',  bg: '#F9FAFB', color: '#374151', border: '#E5E7EB', icon: 'M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12' },
  cancelled:  { label: 'Cancelled',  bg: '#FEF2F2', color: '#DC2626', border: '#FECACA', icon: 'M9.75 9.75l4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
}

interface Props {
  bookings: Booking[]
  slotCounts?: Record<string, number>
  groupSlots?: Record<string, Booking[]>
  currentDate?: string
  loading?: boolean
  /** When provided, row clicks open a split-view pane instead of navigating away. */
  onSelect?: (b: Booking) => void
  selectedId?: string
}

export function BookingTable({ bookings, slotCounts, groupSlots, currentDate, loading, onSelect, selectedId }: Props) {
  const today = todaySydney()
  const displayDate = currentDate ?? today
  const navigate = useNavigate()

  const [openPopover,   setOpenPopover]   = useState<string | null>(null)
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = (key: string, e: React.MouseEvent<HTMLElement>) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    const rect = e.currentTarget.getBoundingClientRect()
    setPopoverCoords({ top: rect.bottom + 4, left: rect.left })
    setOpenPopover(key)
  }
  const handleMouseLeave = () => {
    hoverTimeout.current = setTimeout(() => setOpenPopover(null), 300)
  }

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)', marginBottom: 20 }}>
      {/* Table header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0, letterSpacing: '-0.01em' }}>
            {displayDate === today ? "Today's Bookings" : `Bookings · ${displayDate}`}
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>{bookings.length} records</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {ICS_LEGEND.map(l => (
              <span key={l.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#94A3B8', whiteSpace: 'nowrap' }}>
                <span style={{ width: 8, height: 8, borderRadius: 'var(--r-full)', background: ICS_BAR_COLOR[l.key], flexShrink: 0, display: 'inline-block' }} />
                {l.label}
              </span>
            ))}
          </div>
          <Link
            to="/reception/bookings?filter=today"
            style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            View all →
          </Link>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 15 }}>Loading…</div>
      ) : bookings.length === 0 ? (
        <EmptyState compact title="No bookings for today" subtitle="Scheduled visits will appear here as they come in." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 10px' }}>
          {bookings.map(b => {
            const ics        = b.icsStatus ?? 'unavailable'
            const displayRef = b.groupReference ?? b.referenceNumber
            const navTarget  = b.groupReference
              ? `/reception/bookings/group/${b.groupReference}`
              : `/reception/bookings/${b.id}`
            const groupKey  = b.groupReference ?? b.id
            const slotCount = slotCounts?.[groupKey] ?? 1
            const slots     = groupSlots?.[groupKey] ?? []
            const statusCfg = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.scheduled

            return (
              <div
                key={b.id}
                onClick={() => (onSelect ? onSelect(b) : navigate(navTarget))}
                style={{ display: 'flex', cursor: 'pointer', border: `1px solid ${selectedId === b.id ? 'rgba(var(--brand-rgb),0.35)' : 'rgba(0,0,0,0.08)'}`, borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden', background: selectedId === b.id ? 'rgba(var(--brand-rgb),0.05)' : '#fff', transition: 'box-shadow 0.15s, background 0.12s, border-color 0.12s' }}
                onMouseOver={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)')}
                onMouseOut={e  => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)')}
              >
                {/* ICS colour bar */}
                <div style={{ width: 5, flexShrink: 0, background: ICS_BAR_COLOR[ics] ?? ICS_BAR_COLOR.unavailable }} />

                <div style={{ flex: 1, minWidth: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Top row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {/* Reference */}
                    <span
                      style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, fontWeight: 700, color: '#1C1917', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      title="Click to copy"
                      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(displayRef).then(() => toast('Reference copied', 'info')).catch(() => {}) }}
                    >
                      {displayRef}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                    </span>

                    {slotCount > 1 && (
                      <>
                        <button
                          onMouseEnter={e => { e.stopPropagation(); handleMouseEnter(groupKey, e) }}
                          onMouseLeave={handleMouseLeave}
                          onClick={e => { e.stopPropagation(); navigate(navTarget) }}
                          style={{ padding: '1px 7px', borderRadius: 'var(--r-full)', background: 'rgba(var(--brand-rgb),0.10)', border: '1px solid rgba(var(--brand-rgb),0.22)', color: 'var(--brand-color)', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}
                        >
                          {slotCount} slots
                        </button>
                        {openPopover === groupKey && (
                          <div
                            onMouseEnter={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); setOpenPopover(groupKey) }}
                            onMouseLeave={handleMouseLeave}
                            style={{ position: 'fixed', top: popoverCoords.top, left: popoverCoords.left, background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-md)', padding: '10px 12px', zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 240 }}
                          >
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>All Slot References</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {slots.map(slot => (
                                <div
                                  key={slot.id}
                                  onClick={e => { e.stopPropagation(); navigate(navTarget) }}
                                  onMouseOver={e => (e.currentTarget.style.background = '#F9FAFB')}
                                  onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', padding: '4px 6px', borderRadius: 'var(--r-full)', transition: 'background 0.1s', background: 'transparent' }}
                                >
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <span style={{ fontSize: 14, fontFamily: 'ui-monospace,monospace', color: '#44403C', fontWeight: 600 }}>{slot.referenceNumber}</span>
                                    <span style={{ fontSize: 13, color: '#9CA3AF', marginLeft: 6 }}>{slot.slotStartTime} – {slot.slotEndTime}</span>
                                  </div>
                                  <button
                                    onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(slot.referenceNumber).then(() => toast('Reference copied', 'info')).catch(() => {}) }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2, flexShrink: 0 }}
                                    title="Copy"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                    </svg>
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Service · Load */}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {b.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'} · {(b.loadType ?? '').toUpperCase()}
                    </span>

                    {/* Slot time */}
                    <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                      {b.slotStartTime}{b.slotEndTime ? ` – ${b.slotEndTime}` : ''}
                    </span>

                    <div style={{ flex: 1 }} />

                    {/* Status badge */}
                    <span style={{ background: statusCfg.bg, color: statusCfg.color, border: `1px solid ${statusCfg.border}`, borderRadius: 'var(--r-xl)', padding: '3px 9px 3px 7px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d={statusCfg.icon} />
                      </svg>
                      {statusCfg.label}
                    </span>
                  </div>

                  {/* Bottom row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1C1917' }}>{b.driverName}</span>
                    {b.vehicleRegistration && (
                      <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.04)', padding: '1px 7px', borderRadius: 'var(--r-sm)' }}>
                        {b.vehicleRegistration}
                      </span>
                    )}
                    {(b.houseBillNumber ?? b.containerNumber) && (
                      <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {b.houseBillNumber ?? b.containerNumber}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
