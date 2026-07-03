import { useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { Icon, ICONS } from '@/lib/Icon'
import { fmtTime } from '@/lib/time'
import { cancelBooking } from '@/lib/db/bookings'
import { toast } from '@/lib/toast'
import type { Booking } from '@/data/types'

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled', checked_in: 'Checked In', completed: 'Completed', cancelled: 'Cancelled',
}

const SOURCE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  self_booking:      { label: 'Self Booking',      bg: 'rgba(37,99,235,0.08)', color: '#2563EB' },
  guest:             { label: 'Guest',              bg: 'rgba(0,0,0,0.05)',     color: 'var(--text-secondary)' },
  reception_booking: { label: 'Reception Booking', bg: 'rgba(234,179,8,0.10)', color: '#A16207' },
}

function SourceBadge({ source }: { source?: string | null }) {
  if (!source) return null
  const s = SOURCE_BADGE[source] ?? SOURCE_BADGE.guest
  return (
    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  scheduled:  { background: 'rgba(37,99,235,0.07)',   color: '#2563EB', border: '1px solid rgba(37,99,235,0.20)'  },
  checked_in: { background: 'rgba(var(--brand-rgb),0.08)',  color: 'var(--brand-color)', border: '1px solid rgba(var(--brand-rgb),0.25)' },
  completed:  { background: 'rgba(0,0,0,0.05)',       color: 'var(--text-secondary)', border: '1px solid rgba(0,0,0,0.10)'      },
  cancelled:  { background: 'rgba(239,68,68,0.07)',   color: '#DC2626', border: '1px solid rgba(239,68,68,0.20)'  },
}

interface Props {
  bookings: Booking[]
  query?: string
  onCancelled?: () => void
}

// ── QR PNG download ────────────────────────────────────────────────────────────
async function downloadQR(b: Booking) {
  const qrUrl = await QRCode.toDataURL(b.referenceNumber, {
    width: 300, margin: 1, color: { dark: '#1C1917', light: '#ffffff' },
  })
  const img = new Image()
  img.onload = () => {
    const qCanvas = document.createElement('canvas')
    qCanvas.width = img.width; qCanvas.height = img.height
    qCanvas.getContext('2d')!.drawImage(img, 0, 0)

    const out = document.createElement('canvas')
    out.width = qCanvas.width; out.height = qCanvas.height + 80
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(qCanvas, 0, 0)

    const cx = out.width / 2
    const svcLabel = b.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'
    const ltLabel  = (b.loadType ?? '').toUpperCase()
    ctx.fillStyle = '#1C1917'; ctx.textAlign = 'center'
    ctx.font = 'bold 14px system-ui, sans-serif'
    ctx.fillText(b.referenceNumber, cx, qCanvas.height + 22)
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#6B7280'
    ctx.fillText(`${svcLabel} · ${ltLabel}`, cx, qCanvas.height + 42)

    const a = document.createElement('a')
    a.href = out.toDataURL('image/png')
    a.download = `booking-${b.referenceNumber}.png`
    a.click()
  }
  img.src = qrUrl
}

// ── PDF download ───────────────────────────────────────────────────────────────
async function downloadPDF(b: Booking) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw  = doc.internal.pageSize.getWidth()
  const ph  = doc.internal.pageSize.getHeight()

  const pRow = (label: string, val: string, y: number) => {
    doc.setTextColor(120, 113, 108); doc.text(label, 20, y)
    doc.setTextColor(28, 25, 23);   doc.text(val, pw - 20, y, { align: 'right' })
  }
  const sec = (title: string, curY: number): number => {
    curY += 4; doc.setDrawColor(220, 215, 210); doc.line(20, curY, pw - 20, curY); curY += 7
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(28, 25, 23)
    doc.text(title, 20, curY); curY += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
    return curY
  }

  let y = 18

  // Header
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 113, 108)
  doc.text('BOOKING CONFIRMATION', pw / 2, y, { align: 'center' }); y += 8

  doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(28, 25, 23)
  doc.text('Booking Confirmation', pw / 2, y, { align: 'center' }); y += 9

  doc.setFontSize(13); doc.setFont('courier', 'bold'); doc.setTextColor(100, 92, 80)
  doc.text(b.referenceNumber, pw / 2, y, { align: 'center' }); y += 10

  // QR code
  const qrUrl = await QRCode.toDataURL(b.referenceNumber, {
    width: 200, margin: 1, color: { dark: '#1C1917', light: '#ffffff' },
  })
  const sz = 56
  doc.addImage(qrUrl, 'PNG', (pw - sz) / 2, y, sz, sz); y += sz + 6
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139)
  doc.text('Present this QR code at the gate for check-in', pw / 2, y, { align: 'center' }); y += 10

  // Contact & Driver
  y = sec('Contact & Driver', y)
  const contactRows: [string, string][] = [
    ...(b.guestName && b.guestName !== b.guestEmail ? [['Guest Name',   b.guestName]           as [string,string]] : []),
    ...(b.guestPhone          ? [['Guest Phone',  b.guestPhone]          as [string,string]] : []),
    ...(b.driverName          ? [['Driver Name',  b.driverName]          as [string,string]] : []),
    ...(b.vehicleRegistration ? [['Vehicle Rego', b.vehicleRegistration] as [string,string]] : []),
  ]
  for (const [label, val] of contactRows) { pRow(label, val, y); y += 5.5 }

  // Slot details
  const isPickup  = b.serviceType === 'pickup'
  const isDropoff = b.serviceType === 'dropoff'
  const isFCL     = b.loadType === 'fcl'
  const isLCL     = b.loadType === 'lcl'
  y = sec('Slot Details', y)
  const slotRows: [string, string][] = [
    ['Service Type', isPickup ? 'Pick Up' : 'Drop Off'],
    ['Load Type',    (b.loadType ?? '—').toUpperCase()],
    ['Date',         b.slotDate || '—'],
    ['Time Slot',    `${b.slotStartTime} – ${b.slotEndTime}`],
    ...(isPickup  && isLCL && b.houseBillNumber  ? [['HBL Number',       b.houseBillNumber]  as [string,string]] : []),
    ...(isFCL              && b.containerNumber   ? [['Container Number', b.containerNumber]  as [string,string]] : []),
    ...(isFCL              && b.containerSize     ? [['Container Size',   b.containerSize]    as [string,string]] : []),
    ...(isDropoff          && b.entryNumber       ? [['Entry Number',     b.entryNumber]      as [string,string]] : []),
    ...(isDropoff          && b.purpose           ? [['Purpose',          b.purpose]          as [string,string]] : []),
    ...(isDropoff && isLCL && b.bookingReference  ? [['Booking Confirmation #',b.bookingReference] as [string,string]] : []),
    ...(isDropoff && isLCL && b.consolidator      ? [['Consolidator',     b.consolidator]     as [string,string]] : []),
  ]
  for (const [label, val] of slotRows) { pRow(label, val, y); y += 5.5 }

  // Payment
  if ((b.totalAmount ?? 0) > 0) {
    y = sec('Payment', y)
    const payRows: [string, string][] = [
      ...(b.slotFee       ? [['Slot fee',    `$${b.slotFee.toFixed(2)}`]      as [string,string]] : []),
      ...(b.gstAmount     ? [['GST (10%)',   `$${b.gstAmount.toFixed(2)}`]    as [string,string]] : []),
      ...(b.totalAmount   ? [['Total Amount',`$${b.totalAmount.toFixed(2)} AUD`] as [string,string]] : []),
      ...(b.paymentMethod ? [['Payment',     b.paymentMethod.toUpperCase()]   as [string,string]] : []),
    ]
    for (const [label, val] of payRows) { pRow(label, val, y); y += 5.5 }
  }

  // Footer
  doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(156, 163, 175)
  doc.text(`Generated ${new Date().toLocaleDateString('en-AU')}`, pw / 2, ph - 9, { align: 'center' })

  doc.save(`booking-${b.referenceNumber}.pdf`)
}

export function MyBookingsList({ bookings, query, onCancelled }: Props) {
  const [cancelTarget,    setCancelTarget]    = useState<Booking | null>(null)
  const [cancellingId,    setCancellingId]    = useState<string | null>(null)
  const [detailBooking,   setDetailBooking]   = useState<Booking | null>(null)

  const confirmCancel = async () => {
    if (!cancelTarget) return
    setCancellingId(cancelTarget.id)
    try {
      await cancelBooking(cancelTarget.id)
      toast('Booking cancelled', 'success')
      setCancelTarget(null)
      onCancelled?.()
    } catch {
      toast('Failed to cancel booking. Please try again.', 'error')
    } finally {
      setCancellingId(null)
    }
  }

  if (bookings.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0 48px' }}>
        <div style={{ width: 48, height: 48, borderRadius: 'var(--r-sm)', background: '#EBEBEA', border: '1px solid rgba(0,0,0,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Icon name={ICONS.bookings} size={22} style={{ color: 'var(--text-tertiary)' }} />
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 6, letterSpacing: '-0.01em' }}>
          {query ? `No results for "${query}"` : 'No bookings yet'}
        </p>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 24 }}>
          {query ? 'Check the reference number and try again.' : 'Your booking history will appear here.'}
        </p>
        <Link to="/book" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontSize: 15, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', borderRadius: 'var(--r-full)', textDecoration: 'none', boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.35)' }}>
          <Icon name={ICONS.calendar} size={14} /> Book a Visit
        </Link>
      </div>
    )
  }

  return (
    <>
<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bookings.map(b => {
          const statusStyle = STATUS_STYLE[b.status] ?? STATUS_STYLE.scheduled
          const isPickup  = b.serviceType === 'pickup'
          const isDropoff = b.serviceType === 'dropoff'
          const isFCL     = b.loadType === 'fcl'
          const isLCL     = b.loadType === 'lcl'
          return (
            <div
              key={b.id}
              style={{ display: 'block', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', padding: '18px 20px', transition: 'border-color 0.15s ease,box-shadow 0.15s ease,transform 0.15s cubic-bezier(0.16,1,0.3,1)', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 4px 16px rgba(0,0,0,0.06)', cursor: 'default' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(var(--brand-rgb),0.30)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(var(--brand-rgb),0.08),0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseOut={e  => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04),0 4px 16px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              {/* Top row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div>
                  <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15.5, fontWeight: 700, color: '#1C1917', letterSpacing: '0.03em', marginBottom: 3 }}>
                    {b.referenceNumber}
                  </p>
                  <p style={{ fontSize: 14, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name={ICONS.calendar} size={12} style={{ color: '#C7C3BF' }} />
                    {b.slotDate} · {b.slotStartTime} – {b.slotEndTime}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <SourceBadge source={b.bookingSource} />
                  <span style={{ ...statusStyle, display: 'inline-block', padding: '4px 10px', borderRadius: 'var(--r-full)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {STATUS_LABEL[b.status] ?? b.status}
                  </span>
                </div>
              </div>

              {/* Info grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px 16px', paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <InfoCell label="Service Type" value={isPickup ? 'Pick Up' : 'Drop Off'} />
                <InfoCell label="Load Type" value={(b.loadType ?? '').toUpperCase()} />
                {isPickup  && isLCL && b.houseBillNumber  && <InfoCell label="HBL"       value={b.houseBillNumber}  mono />}
                {isFCL              && b.containerNumber   && <InfoCell label="Container" value={b.containerNumber}  mono />}
                <InfoCell label="Driver" icon={ICONS.user} value={b.driverName} />
                {b.weightKg && <InfoCell label="Weight" value={`${b.weightKg.toLocaleString()} kg`} />}
              </div>

              {/* Timeline */}
              {(b.checkedInAt || b.completedAt) && (
                <div style={{ display: 'flex', gap: 16, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  {b.checkedInAt && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-secondary)' }}>
                      <Icon name={ICONS.clock} size={11} style={{ color: 'var(--text-tertiary)' }} />
                      Checked in {fmtTime(b.checkedInAt)}
                    </span>
                  )}
                  {b.completedAt && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#16A34A', fontWeight: 500 }}>
                      <Icon name={ICONS.check} size={11} />
                      Completed {fmtTime(b.completedAt)}
                    </span>
                  )}
                </div>
              )}

              {/* Action row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <button
                  type="button"
                  onClick={() => setDetailBooking(b)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 'var(--r-sm)', border: '1.5px solid rgba(0,0,0,0.08)', background: '#fff', fontSize: 14, fontWeight: 600, color: '#1C1917', cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.18)'; e.currentTarget.style.background = '#FAFAFA' }}
                  onMouseOut={e  => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; e.currentTarget.style.background = '#fff' }}
                >
                  View Details
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Cancel confirmation modal */}
      {cancelTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setCancelTarget(null)}
        >
          <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: '28px 28px 24px', maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.20)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 10, letterSpacing: '-0.02em' }}>Cancel Booking</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
              Are you sure you want to cancel booking <strong style={{ fontFamily: 'ui-monospace,monospace', color: '#1C1917' }}>{cancelTarget.referenceNumber}</strong>? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setCancelTarget(null)}
                style={{ padding: '9px 18px', fontSize: 15, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Keep Booking
              </button>
              <button type="button" onClick={confirmCancel} disabled={!!cancellingId}
                style={{ padding: '9px 18px', fontSize: 15, fontWeight: 600, color: 'var(--brand-text)', background: cancellingId ? '#FCA5A5' : '#DC2626', border: 'none', borderRadius: 'var(--r-sm)', cursor: cancellingId ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.13s' }}>
                {cancellingId ? 'Cancelling…' : 'Cancel Booking'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail slide-over */}
      {detailBooking && (
        <BookingDetailPanel booking={detailBooking} onClose={() => setDetailBooking(null)} onCancelRequest={b => { setDetailBooking(null); setCancelTarget(b) }} />
      )}
    </>
  )
}

// ── Detail slide-over panel ───────────────────────────────────────────────────
function BookingDetailPanel({ booking: b, onClose, onCancelRequest }: { booking: Booking; onClose: () => void; onCancelRequest?: (b: Booking) => void }) {
  const isPickup  = b.serviceType === 'pickup'
  const isDropoff = b.serviceType === 'dropoff'
  const isFCL     = b.loadType === 'fcl'
  const isLCL     = b.loadType === 'lcl'
  const statusStyle = STATUS_STYLE[b.status] ?? STATUS_STYLE.scheduled

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 9010, background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(2px)' }}
      />
      {/* Panel */}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9011, width: '100%', maxWidth: 460, background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.07)', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Booking Details</p>
            <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: '#1C1917' }}>{b.referenceNumber}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ ...statusStyle, display: 'inline-block', padding: '4px 10px', borderRadius: 'var(--r-full)', fontSize: 13, fontWeight: 600 }}>
              {STATUS_LABEL[b.status] ?? b.status}
            </span>
            <button type="button" onClick={onClose} aria-label="Close"
              style={{ width: 34, height: 34, borderRadius: 'var(--r-full)', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: 'var(--text-secondary)', transition: 'background 0.15s ease, color 0.15s ease' }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = '#1C1917' }}
              onMouseOut={e  => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>

          {/* Contact & Driver */}
          <Section title="Contact & Driver">
            {b.guestName && b.guestName !== b.guestEmail && <DetailRow label="Guest Name"   value={b.guestName} />}
            <DetailRow label="Guest Phone"  value={b.guestPhone} />
            <DetailRow label="Driver Name"  value={b.driverName} />
            <DetailRow label="Vehicle Rego" value={b.vehicleRegistration} />
          </Section>

          {/* Slot details */}
          <Section title="Slot Details">
            <DetailRow label="Service Type" value={isPickup ? 'Pick Up' : 'Drop Off'} />
            <DetailRow label="Load Type"    value={(b.loadType ?? '').toUpperCase()} />
            <DetailRow label="Date"         value={b.slotDate} />
            <DetailRow label="Time Slot"    value={`${b.slotStartTime} – ${b.slotEndTime}`} />
            {isPickup  && isLCL && <DetailRow label="HBL Number"       value={b.houseBillNumber} mono />}
            {isFCL              && <DetailRow label="Container Number"  value={b.containerNumber} mono />}
            {isFCL              && <DetailRow label="Container Size"    value={b.containerSize} />}
            {isDropoff          && <DetailRow label="Entry Number"      value={b.entryNumber} mono />}
            {isDropoff          && <DetailRow label="Purpose"           value={b.purpose} />}
            {isDropoff && isLCL && <DetailRow label="Booking Confirmation #" value={b.bookingReference} />}
            {isDropoff && isLCL && <DetailRow label="Consolidator"      value={b.consolidator} />}
          </Section>

          {/* Payment */}
          {(b.totalAmount ?? 0) > 0 && (
            <Section title="Payment">
              {b.slotFee     && <DetailRow label="Slot fee"     value={`$${b.slotFee.toFixed(2)}`} />}
              {b.gstAmount   && <DetailRow label="GST (10%)"   value={`$${b.gstAmount.toFixed(2)}`} />}
              {b.totalAmount && <DetailRow label="Total Amount" value={`$${b.totalAmount.toFixed(2)} AUD`} bold />}
              {b.paymentMethod && <DetailRow label="Payment" value={b.paymentMethod.toUpperCase()} />}
            </Section>
          )}

          {/* Timeline */}
          {(b.checkedInAt || b.completedAt) && (
            <Section title="Timeline">
              {b.checkedInAt && <DetailRow label="Checked In"  value={fmtTime(b.checkedInAt)} />}
              {b.completedAt && <DetailRow label="Completed"   value={fmtTime(b.completedAt)} />}
            </Section>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(0,0,0,0.07)', display: 'flex', gap: 8, position: 'sticky', bottom: 0, background: '#fff' }}>
          {b.status === 'scheduled' && (
            <button type="button" onClick={() => onCancelRequest?.(b)}
              style={{ flex: 1, padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1.5px solid rgba(239,68,68,0.30)', background: 'rgba(239,68,68,0.05)', fontSize: 15, fontWeight: 600, color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
              <Icon name={ICONS.xCircle} size={15} /> Cancel Booking
            </button>
          )}
          <button type="button" onClick={() => downloadPDF(b)}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--brand-color)', color: 'var(--brand-text)', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.30)' }}>
            <Icon name={ICONS.download} size={15} /> Export PDF
          </button>
        </div>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  )
}

function DetailRow({ label, value, mono, bold }: { label: string; value?: string | null; mono?: boolean; bold?: boolean }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: 14, color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: bold ? 700 : 600, color: bold ? 'var(--brand-color)' : '#1C1917', fontFamily: mono ? 'ui-monospace,monospace' : undefined, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function InfoCell({ label, value, mono, icon }: { label: string; value: string; mono?: boolean; icon?: string }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 3 }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', fontFamily: mono ? 'ui-monospace,monospace' : undefined, display: 'flex', alignItems: 'center', gap: 5 }}>
        {icon && <Icon name={icon} size={12} style={{ color: '#C7C3BF', flexShrink: 0 }} />}
        {value}
      </p>
    </div>
  )
}
