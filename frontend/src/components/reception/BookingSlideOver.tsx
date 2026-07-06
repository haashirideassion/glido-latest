import { useState } from 'react'
import { motion } from 'motion/react'
import { Icon, ICONS } from '@/lib/Icon'
import { fmtDateTime } from '@/lib/time'
import { toast } from '@/lib/toast'
import {
  checkInBooking, completeBooking, cancelBooking,
  rescheduleBooking, refreshIcsStatus,
} from '@/lib/db/bookings'
import type { Booking } from '@/data/types'
import { useStaffPermissions } from '@/lib/useStaffPermissions'

const ICS_BADGE: Record<string, string> = {
  cleared:     'background:rgba(34,197,94,0.10);color:#16A34A;border:1px solid rgba(34,197,94,0.22);',
  held:        'background:rgba(239,68,68,0.10);color:#EF4444;border:1px solid rgba(239,68,68,0.22);',
  examination: 'background:rgba(251,191,36,0.10);color:#B45309;border:1px solid rgba(251,191,36,0.22);',
  pending:     'background:rgba(0,0,0,0.04);color:#78716C;border:1px solid rgba(0,0,0,0.10);',
  unavailable: 'background:rgba(0,0,0,0.04);color:#78716C;border:1px solid rgba(0,0,0,0.10);',
}
const ICS_LABEL: Record<string, string> = { cleared: 'Cleared', held: 'Held', examination: 'Examination', pending: 'Pending', unavailable: 'N/A' }

const STATUS_BADGE: Record<string, React.CSSProperties> = {
  scheduled:  { background: '#F5F5F4', color: '#57534E', border: '1px solid rgba(0,0,0,0.10)' },
  checked_in: { background: 'rgba(34,197,94,0.12)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.25)' },
  completed:  { background: '#F5F5F4', color: 'var(--text-secondary)', border: '1px solid rgba(0,0,0,0.08)' },
  cancelled:  { background: 'transparent', color: 'var(--text-tertiary)', border: '1px solid rgba(0,0,0,0.15)' },
}
const STATUS_LABEL: Record<string, string> = { scheduled: 'Scheduled', checked_in: 'Checked In', completed: 'Completed', cancelled: 'Cancelled' }

const SL: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }
const PANEL: React.CSSProperties = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-sm)', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }
const RL: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-secondary)' }
const RV: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#1C1917' }

interface Props {
  booking: Booking
  onClose: () => void
  onUpdated: (b: Booking) => void
  /** When true, render inline as a docked split-pane (no fixed positioning, no backdrop). */
  docked?: boolean
}

export function BookingSlideOver({ booking: initial, onClose, onUpdated, docked = false }: Props) {
  const [b, setB] = useState<Booking>(initial)
  const [loading, setLoading] = useState('')
  const perms = useStaffPermissions()

  // Modal state
  const [confirmModal,    setConfirmModal]    = useState(false)
  const [cancelModal,     setCancelModal]     = useState(false)
  const [rescheduleModal, setRescheduleModal] = useState(false)

  // Form fields
  const [completionNotes, setCompletionNotes] = useState('')
  const [newDate,  setNewDate]  = useState(b.slotDate)
  const [newStart, setNewStart] = useState(b.slotStartTime)

  const act = async (
    label: string,
    fn: () => Promise<Booking | undefined>,
    successMsg?: string,
    toastType: 'success' | 'info' | 'error' = 'success',
  ) => {
    setLoading(label)
    try {
      const updated = await fn()
      if (updated) { setB(updated); onUpdated(updated) }
      if (successMsg) toast(successMsg, toastType)
    } catch (err: any) {
      toast(err?.message ?? 'Action failed', 'error')
    } finally {
      setLoading('')
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', fontSize: 15, color: '#1C1917',
    background: '#EBEBEA', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)',
    outline: 'none', boxSizing: 'border-box',
  }
  const focus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)' }
  const blur  = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.target.style.borderColor = 'rgba(0,0,0,0.10)' }

  const icsStyle = ICS_BADGE[b.icsStatus ?? ''] ?? ICS_BADGE.unavailable

  const panelStyle: React.CSSProperties = docked
    ? { position: 'relative', height: '100%', width: '100%', zIndex: 1, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 6px 24px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { position: 'fixed', right: 0, top: 0, height: '100%', width: 'min(480px, 100vw)', zIndex: 50, background: '#FFFFFF', borderLeft: '1px solid rgba(0,0,0,0.08)', boxShadow: '-8px 0 40px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }

  return (
    <>
      {/* Backdrop — overlay mode only */}
      {!docked && (
        <motion.div
          onClick={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(4px)' }}
        />
      )}

      {/* Panel */}
      <motion.div
        style={panelStyle}
        initial={docked ? { opacity: 0, x: 16 } : { x: '100%' }}
        animate={docked ? { opacity: 1, x: 0 } : { x: 0 }}
        transition={docked ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] } : { type: 'spring', stiffness: 400, damping: 40 }}
      >

        {/* ── Sticky header ── */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 10px 20px', borderBottom: '1px solid rgba(0,0,0,0.07)', background: '#FFFFFF', flexShrink: 0, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span
              style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: 'var(--brand-color)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0 }}
              title="Click to copy"
              onClick={() => navigator.clipboard.writeText(b.referenceNumber).then(() => toast('Reference copied', 'info')).catch(() => {})}
            >
              {b.referenceNumber}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.45 }}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </span>
            <span style={{ ...STATUS_BADGE[b.status] ?? STATUS_BADGE.scheduled, fontSize: 13, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)', whiteSpace: 'nowrap' }}>
              {STATUS_LABEL[b.status] ?? b.status}
            </span>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 'var(--r-full)', border: 'none', background: 'rgba(0,0,0,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.10)')}
            onMouseOut={e  => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
          >
            <Icon name={ICONS.close} size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20, background: '#F5F4F3' }}>

          {/* Driver */}
          <section>
            <p style={SL}>Driver / Visitor</p>
            <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Driver', value: b.driverName,             icon: ICONS.user  },
                { label: 'Phone',  value: b.driverPhone || '—',     icon: ICONS.phone },
                { label: 'Guest',  value: b.guestName || b.driverName, icon: ICONS.users },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={RL}><Icon name={row.icon} size={13} style={{ color: 'var(--text-secondary)' }} />{row.label}</span>
                  <span style={RV}>{row.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Slot */}
          <section>
            <p style={SL}>Slot</p>
            <div style={{ ...PANEL, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Date',      value: b.slotDate,           icon: ICONS.calendar },
                { label: 'Time',      value: `${b.slotStartTime} – ${b.slotEndTime}`, icon: ICONS.clock },
                { label: 'Service',   value: b.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off', icon: null },
                { label: 'Load Type', value: (b.loadType ?? '').toUpperCase(), icon: null },
              ].map(row => (
                <div key={row.label}>
                  <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3 }}>{row.label}</p>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {row.icon && <Icon name={row.icon} size={13} style={{ color: 'var(--text-secondary)' }} />}
                    {row.value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Shipment */}
          {(b.houseBillNumber || b.containerNumber || b.weightKg || b.volumeCbm) && (
            <section>
              <p style={SL}>Shipment</p>
              <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {b.houseBillNumber  && <Row label="HBL"       value={b.houseBillNumber}  icon={ICONS.document}  mono />}
                {b.containerNumber  && <Row label="Container" value={b.containerNumber}   icon={ICONS.container} mono />}
                {b.weightKg         && <Row label="Weight"    value={`${b.weightKg.toLocaleString()} kg`} icon={ICONS.cargo} />}
                {b.volumeCbm        && <Row label="Volume"    value={`${b.volumeCbm} CBM`} icon={ICONS.layers} />}
                {b.packageCount     && <Row label="Packages"  value={`${b.packageCount} pkgs`} />}
                {(b.palletCount ?? 0) > 0 && <Row label="Pallets" value={`${b.palletCount} × ${b.palletType}`} />}
              </div>
            </section>
          )}

          {/* CHEP warning */}
          {b.palletType === 'chep' && (
            <div style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.20)', borderRadius: 'var(--r-sm)', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Icon name={ICONS.warning} size={16} style={{ color: '#FBBF24', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#B45309', marginBottom: 2 }}>CHEP Pallet Exchange</p>
                <p style={{ fontSize: 14, color: 'rgba(180,83,9,0.75)' }}>{b.palletCount} CHEP pallet{(b.palletCount ?? 0) > 1 ? 's' : ''} must be exchanged at collection.</p>
              </div>
            </div>
          )}

          {/* ICS */}
          {b.icsStatus && (
            <section>
              <p style={SL}>ICS Status</p>
              <div style={{ ...PANEL, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--r-full)', ...Object.fromEntries(icsStyle.split(';').filter(Boolean).map(s => { const [k, ...v] = s.split(':'); return [k.trim().replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase()), v.join(':').trim()] })) } as any}>
                  {ICS_LABEL[b.icsStatus] ?? b.icsStatus}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={() => act('ics', () => refreshIcsStatus(b.id), 'ICS status refreshed', 'info')}
                    disabled={loading === 'ics'}
                    style={{ fontSize: 13, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Icon name={ICONS.refresh} size={12} />
                    {loading === 'ics' ? 'Refreshing…' : 'Refresh ICS'}
                  </button>
                  <span style={{ color: 'rgba(0,0,0,0.12)' }}>|</span>
                  <a href="https://ics.abf.gov.au" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--brand-color)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                    Open in ICS portal <Icon name={ICONS.arrowRight} size={12} />
                  </a>
                </div>
              </div>
              {b.icsLastCheckedAt && (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 5 }}>Last checked: {fmtDateTime(b.icsLastCheckedAt)}</p>
              )}
            </section>
          )}

          {/* Charges */}
          {b.totalAmount && perms.can_view_charge_details && (
            <section>
              <p style={SL}>Charges</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 15 }}>
                {(b.storageCharge ?? 0) > 0     && <ChargeRow label={`Storage (${b.storageDays} days)`} val={b.storageCharge!} />}
                {(b.shrinkWrapCharge ?? 0) > 0  && <ChargeRow label="Shrink wrap" val={b.shrinkWrapCharge!} />}
                {b.slotFee !== undefined          && <ChargeRow label="Slot fee"    val={b.slotFee} />}
                {b.gstAmount !== undefined && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--text-tertiary)', paddingTop: 6, borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                    <span>GST (10%)</span><span>${b.gstAmount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1C1917', paddingTop: 6, borderTop: '1px solid rgba(0,0,0,0.09)' }}>
                  <span>Total</span><span style={{ color: 'var(--brand-color)' }}>${b.totalAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--text-tertiary)' }}>
                  <span>{(b.paymentMethod ?? '—').toUpperCase()}</span>
                  <span style={{ color: b.paymentStatus === 'paid' ? '#22C55E' : '#FBBF24', fontWeight: 500 }}>
                    {b.paymentStatus === 'paid' ? 'Paid' : b.paymentStatus === 'pending_eft' ? 'EFT Pending' : b.paymentStatus}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* Timeline */}
          <section>
            <p style={SL}>Timeline</p>
            <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={RL}><Icon name={ICONS.document} size={13} style={{ color: 'var(--text-secondary)' }} />Created</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{fmtDateTime(b.createdAt)}</span>
              </div>
              {b.checkedInAt && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={RL}><Icon name={ICONS.userCheck} size={13} style={{ color: '#FBBF24' }} />Checked In</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{fmtDateTime(b.checkedInAt)}</span>
                </div>
              )}
              {b.completedAt && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={RL}><Icon name={ICONS.checkSquare} size={13} style={{ color: '#22C55E' }} />Completed</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{fmtDateTime(b.completedAt)}</span>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── Action footer ── */}
        <div style={{ flexShrink: 0, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(0,0,0,0.07)', background: '#FFFFFF' }}>
          {b.status === 'scheduled' && (
            <ActionBtn color="green" loading={loading === 'checkin'} onClick={() => act('checkin', () => checkInBooking(b.id), `✓ ${b.driverName} checked in`, 'success')}>
              <Icon name={ICONS.userCheck} size={16} /> Check In Visitor
            </ActionBtn>
          )}
          {b.status === 'checked_in' && (
            <ActionBtn color="orange" loading={loading === 'complete'} onClick={() => setConfirmModal(true)}>
              <Icon name={ICONS.checkSquare} size={16} /> Mark Complete
            </ActionBtn>
          )}
          {(b.status === 'scheduled') && (
            <ActionBtn color="ghost" onClick={() => setRescheduleModal(true)}>
              <Icon name={ICONS.calendar} size={15} /> Reschedule
            </ActionBtn>
          )}
          {b.status === 'scheduled' && (
            <ActionBtn color="danger" onClick={() => setCancelModal(true)}>
              <Icon name={ICONS.close} size={15} /> Cancel Booking
            </ActionBtn>
          )}
        </div>
      </motion.div>

      {/* ── Reschedule modal ── */}
      {rescheduleModal && (
        <Modal onClose={() => setRescheduleModal(false)}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', marginBottom: 6 }}>Reschedule Booking</h3>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
            Change the slot for <strong style={{ color: '#1C1917', fontFamily: 'ui-monospace,monospace' }}>{b.referenceNumber}</strong>.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>New Date</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={fieldStyle} onFocus={focus} onBlur={blur} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>New Start Time</label>
              <input type="time" value={newStart} onChange={e => setNewStart(e.target.value)} style={fieldStyle} onFocus={focus} onBlur={blur} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <ActionBtn color="ghost" onClick={() => setRescheduleModal(false)}>Cancel</ActionBtn>
            <ActionBtn color="orange" loading={loading === 'reschedule'} onClick={async () => {
              if (!newDate || !newStart) return
              const endH = String(parseInt(newStart.split(':')[0]) + 1).padStart(2, '0')
              const newEnd = `${endH}:${newStart.split(':')[1]}`
              await act('reschedule', () => rescheduleBooking(b.id, newDate, newStart, newEnd), `Rescheduled to ${newDate} at ${newStart}`, 'success')
              setRescheduleModal(false)
            }}>
              <Icon name={ICONS.calendar} size={14} /> Confirm Reschedule
            </ActionBtn>
          </div>
        </Modal>
      )}

      {/* ── Cancel modal ── */}
      {cancelModal && (
        <Modal onClose={() => setCancelModal(false)}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', marginBottom: 6 }}>Cancel this booking?</h3>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
            Cancelling <strong style={{ fontFamily: 'ui-monospace,monospace', color: '#1C1917' }}>{b.referenceNumber}</strong> for <strong style={{ color: '#1C1917' }}>{b.driverName}</strong>. This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <ActionBtn color="ghost" onClick={() => setCancelModal(false)}>Keep Booking</ActionBtn>
            <ActionBtn color="danger" loading={loading === 'cancel'} onClick={async () => {
              await act('cancel', () => cancelBooking(b.id), `Booking ${b.referenceNumber} cancelled`, 'info')
              setCancelModal(false)
            }}>
              <Icon name={ICONS.close} size={14} /> Confirm Cancel
            </ActionBtn>
          </div>
        </Modal>
      )}

      {/* ── Complete modal ── */}
      {confirmModal && (
        <Modal onClose={() => setConfirmModal(false)}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', marginBottom: 6 }}>Complete this job?</h3>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
            Marking <strong style={{ color: '#1C1917' }}>{b.driverName}</strong>'s visit as complete. This action is final.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {['Driver identity verified', 'Documents checked', 'Cargo released'].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: '#1C1917' }}>
                <span style={{ width: 20, height: 20, borderRadius: 'var(--r-full)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.22)' }}>
                  <Icon name={ICONS.check} size={11} style={{ color: '#22C55E' }} />
                </span>
                {item}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.40)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>Completion Notes (optional)</label>
              <textarea rows={2} value={completionNotes} onChange={e => setCompletionNotes(e.target.value)} placeholder="Any notes for records..." style={{ ...fieldStyle, resize: 'none' }} onFocus={focus} onBlur={blur} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <ActionBtn color="ghost" onClick={() => setConfirmModal(false)}>Cancel</ActionBtn>
            <ActionBtn color="orange" loading={loading === 'complete'} onClick={async () => {
              await act('complete', () => completeBooking(b.id, completionNotes || undefined), `✓ ${b.driverName}'s visit completed`, 'success')
              setConfirmModal(false)
            }}>
              <Icon name={ICONS.check} size={16} /> Confirm Complete
            </ActionBtn>
          </div>
        </Modal>
      )}
    </>
  )
}

/* ── Small helper components ── */

function Row({ label, value, icon, mono }: { label: string; value: string; icon?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-secondary)' }}>
        {icon && <Icon name={icon} size={13} style={{ color: 'var(--text-secondary)' }} />}
        {label}
      </span>
      <span style={{ fontFamily: mono ? 'ui-monospace,monospace' : undefined, fontSize: 14, fontWeight: 600, color: mono ? '#78716C' : '#1C1917' }}>{value}</span>
    </div>
  )
}

function ChargeRow({ label, val }: { label: string; val: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
      <span>{label}</span><span>${val.toFixed(2)}</span>
    </div>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#FFFFFF', borderRadius: 'var(--r-lg)', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', maxWidth: 420, width: '100%', padding: 24 }}>
        {children}
      </div>
    </div>
  )
}

function ActionBtn({ color, onClick, loading, children }: { color: 'orange' | 'green' | 'ghost' | 'danger'; onClick: () => void; loading?: boolean; children: React.ReactNode }) {
  const styles: Record<string, React.CSSProperties> = {
    orange: { background: 'linear-gradient(135deg,#FF7A2A,#E85A0A)', color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.30)' },
    green:  { background: 'linear-gradient(135deg,#22C55E,#16A34A)', color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(34,197,94,0.30)' },
    ghost:  { background: '#fff', color: '#374151', border: '1.5px solid #e5e7eb' },
    danger: { background: 'rgba(239,68,68,0.08)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.25)' },
  }
  return (
    <motion.button
      onClick={onClick}
      disabled={loading}
      whileTap={loading ? undefined : { scale: 0.95 }}
      whileHover={loading ? undefined : { scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.6 }}
      style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', fontSize: 15, fontWeight: 600, borderRadius: 'var(--r-full)', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, fontFamily: 'inherit', ...styles[color] }}
    >
      {children}
    </motion.button>
  )
}
