import { useState, useEffect } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Icon, ICONS } from '@/lib/Icon'
import { fmtDateTime } from '@/lib/time'
import { toast } from '@/lib/toast'
import { fetcher } from '@/lib/fetcher'
import { openSignedUrl } from '@/lib/useSignedUrl'
import { generateQRDataURL } from '@/lib/qr'
import { useTenantInfo } from '@/lib/useTenantInfo'
import { loadLogoDataUrl, glidoLogoPng } from '@/lib/pdfBranding'
import { useStaffPermissions } from '@/lib/useStaffPermissions'
import {
  getBookingById, checkInBooking, completeBooking,
  cancelBooking, rescheduleBooking, refreshIcsStatus,
  getBookingsByGroupRef, overrideBookingStatus, confirmEftPayment,
} from '@/lib/db/bookings'
import { blockDriverByName } from '@/lib/useSavedDrivers'
import type { Booking } from '@/data/types'

const CARD: React.CSSProperties  = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)', marginBottom: 16 }

/** Format a document_type value into a human-readable label.
 *  Handles: snake_case strings, numeric legacy values, nulls. */
function fmtDocType(docType: string | number | null | undefined, filename?: string): string {
  const s = docType != null ? String(docType).trim() : ''
  // Numeric or empty — fall back to filename heuristic or generic label
  if (!s || /^\d+$/.test(s)) {
    if (filename) {
      const part = filename.split('-')[0].replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim()
      if (part) return part.replace(/\b\w/g, c => c.toUpperCase())
    }
    return 'Document'
  }
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
const SL: React.CSSProperties   = { fontSize: 15, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 12 }
const RL: React.CSSProperties   = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, color: 'var(--text-muted)' }
const RV: React.CSSProperties   = { fontSize: 16, fontWeight: 600, color: '#1C1917' }

const ICS_BADGE: Record<string, string> = {
  cleared:     'background:rgba(34,197,94,0.10);color:#16A34A;border:1px solid rgba(34,197,94,0.22);',
  held:        'background:rgba(239,68,68,0.10);color:#EF4444;border:1px solid rgba(239,68,68,0.22);',
  examination: 'background:rgba(251,191,36,0.10);color:#B45309;border:1px solid rgba(251,191,36,0.22);',
  pending:     'background:rgba(0,0,0,0.04);color:#78716C;border:1px solid rgba(0,0,0,0.10);',
}
const ICS_LABEL: Record<string, string> = { cleared: 'Cleared', held: 'Held', examination: 'Examination', pending: 'Pending', unavailable: 'N/A' }

const STATUS_BADGE: Record<string, React.CSSProperties> = {
  scheduled:  { background: '#F5F5F4', color: '#57534E', border: '1px solid rgba(0,0,0,0.10)' },
  checked_in: { background: 'rgba(34,197,94,0.12)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.25)' },
  completed:  { background: '#F5F5F4', color: 'var(--text-secondary)', border: '1px solid rgba(0,0,0,0.08)' },
  cancelled:  { background: 'transparent', color: 'var(--text-tertiary)', border: '1px solid rgba(0,0,0,0.15)' },
}
const STATUS_LABEL: Record<string, string> = { scheduled: 'Scheduled', checked_in: 'Checked In', completed: 'Completed', cancelled: 'Cancelled' }

const FIELD: React.CSSProperties = { width: '100%', padding: '10px 14px', fontSize: 15, color: '#1C1917', background: '#EBEBEA', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box' }

const SOURCE_BADGE: Record<string, { label: string; bg: string; color: string; border: string }> = {
  self_booking:      { label: 'Self Booking',      bg: 'rgba(37,99,235,0.08)', color: '#2563EB', border: '1px solid #BFDBFE' },
  guest:             { label: 'Guest',              bg: 'rgba(0,0,0,0.05)',     color: 'var(--text-secondary)', border: '1px solid rgba(0,0,0,0.12)' },
  reception_booking: { label: 'Reception Booking', bg: 'rgba(234,179,8,0.10)', color: '#A16207', border: '1px solid rgba(234,179,8,0.35)' },
}

function SourceBadge({ source }: { source?: string | null }) {
  if (!source) return null
  const s = SOURCE_BADGE[source] ?? SOURCE_BADGE.guest
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 14, fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--r-full)', background: s.bg, color: s.color, border: s.border, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}
const focus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)' }
const blur  = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.target.style.borderColor = 'rgba(0,0,0,0.10)' }

export default function BookingDetailPage() {
  usePageTitle('Glido | Booking')
  const tenant = useTenantInfo()
  const perms = useStaffPermissions()
  const { id, groupRef } = useParams<{ id: string; groupRef: string }>()
  const navigate = useNavigate()
  const [b, setB]         = useState<Booking | null>(null)
  const [groupSlots, setGroupSlots] = useState<Booking[]>([])  // all slots in a group
  const [openSlots, setOpenSlots] = useState<Set<number>>(new Set([0]))
  const [loading, setLoading] = useState(true)
  const [acting, setActing]   = useState('')

  // Checkin record and documents
  const [checkinRecord, setCheckinRecord] = useState<any>(null)
  const [bookingDocs,   setBookingDocs]   = useState<any[]>([])

  // Modal state — two-step: action selection → slot selection → action modal
  const [selectedAction, setSelectedAction] = useState<'checkin' | 'reschedule' | 'cancel' | null>(null)
  const [selectedSlot,   setSelectedSlot]   = useState<Booking | null>(null)

  // Block driver modal
  const [blockModalOpen,  setBlockModalOpen]  = useState(false)
  const [blockReason,     setBlockReason]     = useState('')
  const [blockingDriver,  setBlockingDriver]  = useState(false)

  // Override status modal
  const [overrideModalOpen,  setOverrideModalOpen]  = useState(false)
  const [overrideSlot,       setOverrideSlot]       = useState<Booking | null>(null)
  const [overrideStatus,     setOverrideStatus]     = useState('scheduled')
  const [overrideNote,       setOverrideNote]       = useState('')
  const [overriding,         setOverriding]         = useState(false)

  // Form fields
  const [cancelReason,    setCancelReason]    = useState('')
  const [newDate,  setNewDate]  = useState('')
  const [newStart, setNewStart] = useState('')

  // Open slot-select → action flow. Single-slot groups skip straight to action modal.
  const openAction = (action: 'checkin' | 'reschedule' | 'cancel') => {
    if (groupSlots.length <= 1) {
      const slot = groupSlots[0] ?? b
      if (slot) {
        setSelectedSlot(slot)
        setNewDate(slot.slotDate)
        setNewStart(slot.slotStartTime)
      }
    } else {
      setSelectedSlot(null)
    }
    setSelectedAction(action)
  }

  const closeActionModal = () => {
    setSelectedAction(null)
    setSelectedSlot(null)
    setCancelReason('')
  }

  const ACTION_LABEL: Record<string, string> = { checkin: 'Check In', reschedule: 'Reschedule', cancel: 'Cancel Slot' }

  useEffect(() => {
    if (!id && !groupRef) return
    setLoading(true)
    setBookingDocs([])
    setCheckinRecord(null)

    const loadBooking = groupRef
      // Group route: load all slots by group_reference
      ? getBookingsByGroupRef(groupRef).then(async slots => {
          const primary = slots[0] ?? null
          setB(primary)
          setGroupSlots(slots)
          if (primary) {
            setNewDate(primary.slotDate)
            setNewStart(primary.slotStartTime)
            const allBookingIds = slots.map(s => s.id)
            // Secondary fetches must not kill the booking display if they fail
            const [crRes, docsRes] = await Promise.all([
              fetcher(`/api/checkin-records?bookingId=${encodeURIComponent(primary.id)}`).catch(() => null),
              fetcher(`/api/booking-documents?bookingIds=${encodeURIComponent(allBookingIds.join(','))}`).catch(() => null),
            ])
            setCheckinRecord((crRes?.data ?? [])[0] ?? null)
            setBookingDocs(docsRes?.data ?? [])
          }
        })
      // Single booking route
      : getBookingById(id!).then(async booking => {
          setB(booking ?? null)
          if (booking) {
            setGroupSlots([booking])
            setNewDate(booking.slotDate)
            setNewStart(booking.slotStartTime)
            const [crRes, docsRes] = await Promise.all([
              fetcher(`/api/checkin-records?bookingId=${encodeURIComponent(booking.id)}`).catch(() => null),
              fetcher(`/api/booking-documents?bookingId=${encodeURIComponent(booking.id)}`).catch(() => null),
            ])
            setCheckinRecord((crRes?.data ?? [])[0] ?? null)
            setBookingDocs(docsRes?.data ?? [])
          }
        })

    loadBooking
      .catch((err) => { console.error('[BookingDetailPage] load failed:', err); setB(null) })
      .finally(() => setLoading(false))
  }, [id, groupRef])

  const act = async (label: string, fn: () => Promise<Booking | undefined>, msg: string, type: 'success' | 'info' | 'error' = 'success') => {
    setActing(label)
    try {
      const updated = await fn()
      if (updated) setB(updated)
      toast(msg, type)
    } catch (err: any) {
      toast(err?.message ?? 'Action failed', 'error')
    } finally {
      setActing('')
    }
  }

  if (loading) return (
    <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 15 }}>Loading…</div>
  )

  if (!b) return (
    <div style={{ padding: '48px 0', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: '#1C1917', marginBottom: 8 }}>Booking not found</p>
      <Link to="/reception/bookings" style={{ color: 'var(--brand-color)', textDecoration: 'none', fontSize: 15 }}>← Back to Bookings</Link>
    </div>
  )

  const icsStyle   = ICS_BADGE[b.icsStatus ?? ''] ?? ICS_BADGE.pending
  const statusStyle = STATUS_BADGE[b.status] ?? STATUS_BADGE.scheduled

  // ── Identity check helpers ────────────────────────────────────────────────
  const nameScore = checkinRecord?.name_match_score ?? 0
  const idBadge = nameScore >= 60
    ? { label: 'Warning',       bg: 'rgba(251,191,36,0.10)', color: '#B45309', border: 'rgba(251,191,36,0.22)' }
    : { label: 'Mismatch',      bg: 'rgba(239,68,68,0.10)',  color: '#EF4444', border: 'rgba(239,68,68,0.22)'  }

  const exportGroupPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pw = doc.internal.pageSize.getWidth()
    const ph = doc.internal.pageSize.getHeight()

    const logoSrc = tenant?.logoUrl
    const tenantName = tenant?.name || 'Container Freight Station'
    const glidoPng = await glidoLogoPng()

    for (let i = 0; i < groupSlots.length; i++) {
      const slot = groupSlots[i]
      if (i > 0) doc.addPage()

      let y = 18

      let placedLogo = false
      if (logoSrc) {
        const logo = await loadLogoDataUrl(logoSrc)
        if (logo) {
          const maxW = 40, maxH = 16
          const ratio = Math.min(maxW / logo.w, maxH / logo.h)
          const lw = logo.w * ratio, lh = logo.h * ratio
          const fmt = logo.dataUrl.includes('image/png') ? 'PNG' : 'JPEG'
          doc.addImage(logo.dataUrl, fmt, (pw - lw) / 2, y, lw, lh)
          y += lh + 6
          placedLogo = true
        }
      }
      if (!placedLogo) {
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 113, 108)
        doc.text(tenantName.toUpperCase(), pw / 2, y, { align: 'center' }); y += 8
      }

      doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(28, 25, 23)
      doc.text(`Slot ${i + 1} of ${groupSlots.length}`, pw / 2, y, { align: 'center' }); y += 8
      doc.setFontSize(13); doc.setFont('courier', 'bold'); doc.setTextColor(100, 92, 80)
      doc.text(slot.referenceNumber, pw / 2, y, { align: 'center' }); y += 10

      const qrUrl = await generateQRDataURL(slot.referenceNumber, 220)
      if (qrUrl) { const sz = 56; doc.addImage(qrUrl, 'PNG', (pw - sz) / 2, y, sz, sz); y += sz + 6 }
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139)
      doc.text('Present this QR code at the gate for check-in', pw / 2, y, { align: 'center' }); y += 10

      doc.setDrawColor(220, 215, 210); doc.line(20, y, pw - 20, y); y += 8

      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(28, 25, 23)
      doc.text('Booking Details', 20, y); y += 6
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)

      const serviceLabel = `${slot.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'} · ${slot.loadType?.toUpperCase()}`
      // Always use primary booking's contact info — all slots share the same guest/driver
      const slotDriver = b?.driverName || ''
      const slotDriverPhone = b?.driverPhone || ''
      const slotVehicle = b?.vehicleRegistration || ''

      const rows: [string, string][] = [
        ...(b?.guestName && b.guestName !== b.guestEmail ? [['Guest Name',      b.guestName]                                as [string,string]] : []),
        ...(b?.guestEmail        ? [['Guest Email',     b.guestEmail]                               as [string,string]] : []),
        ...(b?.guestPhone        ? [['Guest Phone',     b.guestPhone]                               as [string,string]] : []),
        ...(slotDriver           ? [['Driver',          slotDriver]                                 as [string,string]] : []),
        ...(slotDriverPhone      ? [['Driver Phone',    slotDriverPhone]                            as [string,string]] : []),
        ...(slotVehicle          ? [['Vehicle Rego',    slotVehicle]                                as [string,string]] : []),
        ['Service',   serviceLabel],
        ['Date',      slot.slotDate || '—'],
        ['Time',      `${slot.slotStartTime} – ${slot.slotEndTime}`],
        ...(slot.houseBillNumber  ? [['HBL',            slot.houseBillNumber]                       as [string,string]] : []),
        ...(slot.containerNumber  ? [['Container No.',  slot.containerNumber]                       as [string,string]] : []),
        ...(slot.containerSize    ? [['Container Size', slot.containerSize]                         as [string,string]] : []),
        ...(slot.entryNumber      ? [['Entry Number',   slot.entryNumber]                           as [string,string]] : []),
        ...(slot.purpose          ? [['Purpose',        slot.purpose]                               as [string,string]] : []),
        ...(slot.consolidator     ? [['Consolidator',   slot.consolidator]                          as [string,string]] : []),
        ...(slot.weightKg         ? [['Weight',         `${slot.weightKg.toLocaleString()} kg`]    as [string,string]] : []),
        ...(slot.volumeCbm        ? [['Volume',         `${slot.volumeCbm} CBM`]                   as [string,string]] : []),
        ...(slot.packageCount     ? [['Packages',       `${slot.packageCount}`]                     as [string,string]] : []),
        ...((slot.palletCount ?? 0) > 0 ? [['Pallets', `${slot.palletCount} × ${slot.palletType}`] as [string,string]] : []),
      ]

      for (const [label, val] of rows) {
        doc.setTextColor(120, 113, 108); doc.text(label, 20, y)
        doc.setTextColor(28, 25, 23);   doc.text(val, pw / 2, y)
        y += 5.5
      }

      if (glidoPng) {
        const gw = 22, gh = gw * (62 / 320)
        doc.addImage(glidoPng, 'PNG', (pw - gw) / 2, ph - 26, gw, gh)
      }
      doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(156, 163, 175)
      doc.text('Present this QR code at the gate for check-in', pw / 2, ph - 14, { align: 'center' })
      doc.text(`Generated ${new Date().toLocaleDateString('en-AU')}`, pw / 2, ph - 9, { align: 'center' })
    }

    const groupRef = b?.groupReference ?? b?.referenceNumber ?? 'booking'
    doc.save(`${groupRef}.pdf`)
  }

  return (
    <div>
      {/* ── Checked-in redirect banner ── */}
      {b.status === 'checked_in' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.22)', borderRadius: 'var(--r-md)', padding: '12px 16px', marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name={ICONS.check} size={16} style={{ color: '#16A34A', flexShrink: 0 }} />
            <p style={{ fontSize: 15, fontWeight: 500, color: '#15803D' }}>Driver checked in — use Mark as Complete below when the job is done.</p>
          </div>
          <Link to="/reception/visitors" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600, color: '#16A34A', textDecoration: 'none', whiteSpace: 'nowrap', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 'var(--r-sm)', padding: '6px 12px', background: '#fff' }}>
            View in Visitors →
          </Link>
        </div>
      )}

      {/* ── Breadcrumb + title ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link
            to="/reception/bookings"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 15, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.14s ease' }}
            onMouseOver={e => (e.currentTarget.style.color = '#1C1917')}
            onMouseOut={e  => (e.currentTarget.style.color = '#4B5563')}
          >
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
              <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Bookings
          </Link>
          <span style={{ color: 'rgba(0,0,0,0.15)', fontSize: 15 }}>/</span>
          <span
            style={{ fontFamily: 'ui-monospace,monospace', fontSize: 16, fontWeight: 700, color: 'var(--brand-color)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title="Click to copy"
            onClick={() => {
              const displayRef = groupSlots.length > 1 ? (b.groupReference ?? b.referenceNumber) : b.referenceNumber
              navigator.clipboard.writeText(displayRef).then(() => toast('Reference copied', 'info')).catch(() => {})
            }}
          >
            {groupSlots.length > 1 ? (b.groupReference ?? b.referenceNumber) : b.referenceNumber}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </span>
          <span style={{ ...statusStyle, fontSize: 14, fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--r-full)', whiteSpace: 'nowrap' }}>
            {STATUS_LABEL[b.status] ?? b.status}
          </span>
          <SourceBadge source={b.bookingSource} />
          {groupSlots.length > 1 && (
            <span style={{ fontSize: 14, fontWeight: 600, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 'var(--r-full)', padding: '4px 10px', whiteSpace: 'nowrap' }}>
              {groupSlots.length} slots
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {groupSlots.length > 1 && (
            <button
              type="button"
              onClick={exportGroupPdf}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', fontSize: 14, fontWeight: 600, color: '#fff', background: 'var(--brand-color, #FC6514)', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s' }}
              onMouseOver={e => { e.currentTarget.style.opacity = '0.88' }}
              onMouseOut={e  => { e.currentTarget.style.opacity = '1' }}
            >
              <Icon name={ICONS.document} size={16}/> Export All Slots PDF
            </button>
          )}
          {groupSlots.length > 1 && groupSlots.some(s => s.status === 'scheduled') && (
            <button
              type="button"
              disabled={acting === 'checkin-all'}
              onClick={async () => {
                setActing('checkin-all')
                try {
                  const scheduled = groupSlots.filter(s => s.status === 'scheduled')
                  await Promise.all(scheduled.map(s => checkInBooking(s.id)))
                  setGroupSlots(prev => prev.map(s =>
                    s.status === 'scheduled' ? { ...s, status: 'checked_in' as any } : s
                  ))
                  setB(prev => prev ? { ...prev, status: 'checked_in' as any } : prev)
                  toast('All slots checked in', 'success')
                } catch { toast('Failed to check in all slots', 'error') }
                finally { setActing('') }
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 15, fontWeight: 600, background: 'linear-gradient(135deg,#22C55E,#16A34A)', color: '#fff', border: 'none', borderRadius: 'var(--r-full)', boxShadow: '0 2px 8px rgba(34,197,94,0.30)', cursor: acting === 'checkin-all' ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: acting === 'checkin-all' ? 0.7 : 1, transition: 'all 0.15s' }}
            >
              {acting === 'checkin-all' ? 'Checking in…' : 'Check In All'}
            </button>
          )}
          <p style={{ fontSize: 15, color: 'var(--text-muted)' }}>Created {fmtDateTime(b.createdAt)}</p>
        </div>
      </div>

      {/* ── 2-col layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'flex-start' }}>

        {/* ── LEFT ── */}
        <div>

          {/* Visitor Details */}
          <div style={CARD}>
            <p style={SL}>Visitor Details</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {b.guestName && b.guestName !== b.guestEmail && <InfoRow label="Full Name"    value={b.guestName}   icon={ICONS.user}     />}
              {b.companyName && <InfoRow label="Company"      value={b.companyName} icon={ICONS.building} />}
              {b.guestPhone  && <InfoRow label="Phone Number" value={b.guestPhone}  icon={ICONS.phone}    />}
              {b.guestEmail  && <InfoRow label="Email"        value={b.guestEmail}  icon={ICONS.email}    />}
              {!b.guestName && !b.companyName && !b.guestPhone && !b.guestEmail && (
                <p style={{ fontSize: 15, color: 'var(--text-tertiary)' }}>No visitor details recorded</p>
              )}
            </div>
          </div>

          {/* Driver Details */}
          <div style={CARD}>
            <p style={SL}>Driver Details</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {b.driverName        && <InfoRow label="Driver Name"   value={b.driverName}           icon={ICONS.user}  />}
              {b.driverPhone       && <InfoRow label="Phone Number"  value={b.driverPhone}          icon={ICONS.phone} />}
              {b.vehicleRegistration && <InfoRow label="Vehicle Rego" value={b.vehicleRegistration} icon={ICONS.truck} mono />}
              {!b.driverName && !b.driverPhone && !b.vehicleRegistration && (
                <p style={{ fontSize: 15, color: 'var(--text-tertiary)' }}>No driver details recorded</p>
              )}
            </div>
          </div>

          {/* Slot & Shipment — accordion for multi-slot groups */}
          {groupSlots.length > 1 ? (
            <div style={{ marginBottom: 16 }}>
              <p style={SL}>SLOTS ({groupSlots.length})</p>
              <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
                {groupSlots.map((slot, i) => {
                  const slotStatusStyle = STATUS_BADGE[slot.status] ?? STATUS_BADGE.scheduled
                  const serviceLabel = `${slot.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'} · ${slot.loadType?.toUpperCase()}`
                  const isOpen = openSlots.has(i)

                  const exportSlotPdf = async () => {
                    const { jsPDF } = await import('jspdf')
                    const qrUrl = await generateQRDataURL(slot.referenceNumber, 220)
                    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
                    const pw = doc.internal.pageSize.getWidth()
                    const ph = doc.internal.pageSize.getHeight()
                    let y = 18
                    const logoSrc = tenant?.logoUrl
                    const tenantName = tenant?.name || 'Container Freight Station'
                    let placedLogo = false
                    if (logoSrc) {
                      const logo = await loadLogoDataUrl(logoSrc)
                      if (logo) {
                        const maxW = 40, maxH = 16
                        const ratio = Math.min(maxW / logo.w, maxH / logo.h)
                        const lw = logo.w * ratio, lh = logo.h * ratio
                        const fmt = logo.dataUrl.includes('image/png') ? 'PNG' : 'JPEG'
                        doc.addImage(logo.dataUrl, fmt, (pw - lw) / 2, y, lw, lh)
                        y += lh + 6
                        placedLogo = true
                      }
                    }
                    if (!placedLogo) {
                      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 113, 108)
                      doc.text(tenantName.toUpperCase(), pw / 2, y, { align: 'center' }); y += 8
                    }
                    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(28, 25, 23)
                    doc.text(`Slot ${i + 1} of ${groupSlots.length}`, pw / 2, y, { align: 'center' }); y += 8
                    doc.setFontSize(13); doc.setFont('courier', 'bold'); doc.setTextColor(100, 92, 80)
                    doc.text(slot.referenceNumber, pw / 2, y, { align: 'center' }); y += 10
                    if (qrUrl) { const sz = 56; doc.addImage(qrUrl, 'PNG', (pw - sz) / 2, y, sz, sz); y += sz + 6 }
                    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139)
                    doc.text('Present this QR code at the gate for check-in', pw / 2, y, { align: 'center' }); y += 10
                    doc.setDrawColor(220, 215, 210); doc.line(20, y, pw - 20, y); y += 8
                    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(28, 25, 23)
                    doc.text('Booking Details', 20, y); y += 6
                    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
                    const slotDriver = b?.driverName || ''
                    const slotDriverPhone = b?.driverPhone || ''
                    const slotVehicle = b?.vehicleRegistration || ''
                    const rows: [string, string][] = [
                      ...(b?.guestName && b.guestName !== b.guestEmail ? [['Guest Name',      b.guestName]                              as [string,string]] : []),
                      ...(b?.guestEmail        ? [['Guest Email',     b.guestEmail]                             as [string,string]] : []),
                      ...(b?.guestPhone        ? [['Guest Phone',     b.guestPhone]                             as [string,string]] : []),
                      ...(slotDriver           ? [['Driver',          slotDriver]                               as [string,string]] : []),
                      ...(slotDriverPhone      ? [['Driver Phone',    slotDriverPhone]                          as [string,string]] : []),
                      ...(slotVehicle          ? [['Vehicle Rego',    slotVehicle]                              as [string,string]] : []),
                      ['Service',   serviceLabel],
                      ['Date',      slot.slotDate || '—'],
                      ['Time',      `${slot.slotStartTime} – ${slot.slotEndTime}`],
                      ...(slot.houseBillNumber  ? [['HBL',            slot.houseBillNumber]                     as [string,string]] : []),
                      ...(slot.containerNumber  ? [['Container No.',  slot.containerNumber]                     as [string,string]] : []),
                      ...(slot.containerSize    ? [['Container Size', slot.containerSize]                       as [string,string]] : []),
                      ...(slot.entryNumber      ? [['Entry Number',   slot.entryNumber]                         as [string,string]] : []),
                      ...(slot.purpose          ? [['Purpose',        slot.purpose]                             as [string,string]] : []),
                      ...(slot.consolidator     ? [['Consolidator',   slot.consolidator]                        as [string,string]] : []),
                      ...(slot.weightKg         ? [['Weight',         `${slot.weightKg.toLocaleString()} kg`]  as [string,string]] : []),
                      ...(slot.volumeCbm        ? [['Volume',         `${slot.volumeCbm} CBM`]                 as [string,string]] : []),
                      ...(slot.packageCount     ? [['Packages',       `${slot.packageCount}`]                   as [string,string]] : []),
                      ...((slot.palletCount ?? 0) > 0 ? [['Pallets', `${slot.palletCount} × ${slot.palletType}`] as [string,string]] : []),
                    ]
                    for (const [label, val] of rows) {
                      doc.setTextColor(120, 113, 108); doc.text(label, 20, y)
                      doc.setTextColor(28, 25, 23);   doc.text(val, pw / 2, y)
                      y += 5.5
                    }
                    const glidoPng = await glidoLogoPng()
                    if (glidoPng) {
                      const gw = 22, gh = gw * (62 / 320)
                      doc.addImage(glidoPng, 'PNG', (pw - gw) / 2, ph - 26, gw, gh)
                    }
                    doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(156, 163, 175)
                    doc.text('Present this QR code at the gate for check-in', pw / 2, ph - 14, { align: 'center' })
                    doc.text(`Generated ${new Date().toLocaleDateString('en-AU')}`, pw / 2, ph - 9, { align: 'center' })
                    doc.save(`${slot.referenceNumber}.pdf`)
                  }

                  return (
                    <div key={slot.id}>
                      {/* Collapsed row — always visible */}
                      <div
                        onClick={() => setOpenSlots(prev => { const next = new Set(prev); isOpen ? next.delete(i) : next.add(i); return next })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '14px 20px', cursor: 'pointer',
                          borderBottom: '1px solid rgba(0,0,0,0.06)',
                          background: '#FFFFFF',
                          userSelect: 'none',
                        }}
                      >
                        <Icon name={isOpen ? ICONS.arrowDown : ICONS.arrowRight} size={16} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#9CA3AF', width: 52, flexShrink: 0 }}>SLOT {i + 1}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--brand-color, #FC6514)', fontFamily: 'ui-monospace,monospace', marginRight: 8 }}>{slot.referenceNumber}</span>
                        <span style={{ fontSize: 15, color: 'var(--text-mid)' }}>{slot.slotDate} · {slot.slotStartTime}–{slot.slotEndTime}</span>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: 14, padding: '3px 10px', borderRadius: 'var(--r-full)', background: 'rgba(var(--brand-rgb),0.10)', color: 'var(--brand-color, #FC6514)', fontWeight: 600, marginRight: 8 }}>{serviceLabel}</span>
                        <span style={{ ...slotStatusStyle, fontSize: 14, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-full)' }}>{STATUS_LABEL[slot.status] ?? slot.status}</span>
                      </div>

                      {/* Expanded panel */}
                      {isOpen && (
                        <div style={{ padding: '20px 24px 24px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#FFFFFF' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 32px', marginBottom: 20 }}>
                            <FieldBlock label="Date"           value={slot.slotDate}                                    icon={ICONS.calendar} />
                            <FieldBlock label="Time"           value={`${slot.slotStartTime} – ${slot.slotEndTime}`}   icon={ICONS.clock} />
                            {slot.containerNumber  && <FieldBlock label="Container No."  value={slot.containerNumber}  mono icon={ICONS.container} />}
                            {slot.containerSize    && <FieldBlock label="Container Size" value={slot.containerSize}        icon={ICONS.container} />}
                            {slot.houseBillNumber  && <FieldBlock label="HBL"            value={slot.houseBillNumber}  mono />}
                            {slot.entryNumber      && <FieldBlock label="Entry Number"   value={slot.entryNumber}      mono />}
                            {slot.purpose          && <FieldBlock label="Purpose"        value={slot.purpose} />}
                            {slot.consolidator     && <FieldBlock label="Consolidator"   value={slot.consolidator} />}
                          </div>

                          {/* Per-slot driver */}
                          {(slot.driverName || slot.driverPhone || slot.vehicleRegistration) && (
                            <div style={{ marginBottom: 20 }}>
                              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9CA3AF', marginBottom: 10 }}>Driver (this slot)</p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                {slot.driverName         && <InfoRow label="Driver Name"   value={slot.driverName}          icon={ICONS.user}  />}
                                {slot.driverPhone        && <InfoRow label="Phone"         value={slot.driverPhone}         icon={ICONS.phone} />}
                                {slot.vehicleRegistration && <InfoRow label="Vehicle Rego" value={slot.vehicleRegistration} icon={ICONS.truck} mono />}
                              </div>
                            </div>
                          )}

                          {/* Per-slot action + download row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {slot.status === 'scheduled' && (<>
                              <button type="button"
                                disabled={acting === slot.id + '-checkin'}
                                onClick={async () => { setActing(slot.id + '-checkin'); try { await checkInBooking(slot.id); setGroupSlots(prev => { const next = prev.map(s => s.id === slot.id ? { ...s, status: 'checked_in' as any } : s); const allChecked = next.every(s => s.status === 'checked_in' || s.status === 'completed' || s.status === 'cancelled'); if (allChecked) setB(p => p ? { ...p, status: 'checked_in' as any } : p); return next }); toast('Checked in', 'success') } catch { toast('Failed', 'error') } finally { setActing('') } }}
                                style={{ padding: '7px 14px', fontSize: 14, fontWeight: 600, background: 'rgba(34,197,94,0.10)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
                                {acting === slot.id + '-checkin' ? '…' : 'Check In'}
                              </button>
                              <button type="button"
                                disabled={acting === slot.id + '-cancel'}
                                onClick={async () => { setActing(slot.id + '-cancel'); try { await cancelBooking(slot.id); setGroupSlots(prev => prev.map(s => s.id === slot.id ? { ...s, status: 'cancelled' as any } : s)); if (slot.id === b?.id) setB(prev => prev ? { ...prev, status: 'cancelled' as any } : prev); toast('Cancelled', 'success') } catch { toast('Failed', 'error') } finally { setActing('') } }}
                                style={{ padding: '7px 14px', fontSize: 14, fontWeight: 600, background: 'rgba(239,68,68,0.08)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.20)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
                                {acting === slot.id + '-cancel' ? '…' : 'Cancel Slot'}
                              </button>
                            </>)}
                            {slot.status === 'checked_in' && perms.can_mark_complete && (
                              <button type="button"
                                disabled={acting === slot.id + '-complete'}
                                onClick={async () => { setActing(slot.id + '-complete'); try { await completeBooking(slot.id); setGroupSlots(prev => prev.map(s => s.id === slot.id ? { ...s, status: 'completed' as any } : s)); if (slot.id === b?.id) setB(prev => prev ? { ...prev, status: 'completed' as any } : prev); toast('Completed', 'success') } catch { toast('Failed', 'error') } finally { setActing('') } }}
                                style={{ padding: '7px 14px', fontSize: 14, fontWeight: 600, background: 'rgba(107,114,128,0.10)', color: '#374151', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
                                {acting === slot.id + '-complete' ? '…' : 'Mark as Complete'}
                              </button>
                            )}
                            {perms.can_override_status && slot.status !== 'cancelled' && (
                              <button type="button"
                                onClick={() => { setOverrideSlot(slot); setOverrideStatus(slot.status); setOverrideNote(''); setOverrideModalOpen(true) }}
                                style={{ padding: '7px 14px', fontSize: 14, fontWeight: 600, background: 'rgba(251,191,36,0.10)', color: '#B45309', border: '1px solid rgba(251,191,36,0.30)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
                                Override Status
                              </button>
                            )}
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                              <button type="button" onClick={exportSlotPdf}
                                style={{ height: 34, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 12px', fontSize: 14, fontWeight: 600, color: '#fff', background: 'var(--brand-color, #FC6514)', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}
                                onMouseOver={e => { e.currentTarget.style.opacity = '0.88' }}
                                onMouseOut={e  => { e.currentTarget.style.opacity = '1' }}>
                                <Icon name={ICONS.document} size={17}/> PDF
                              </button>
                            </div>
                          </div>
                          {(() => {
                            const slotDocs = bookingDocs.filter((d: any) => d.booking_id === slot.id)
                            if (slotDocs.length === 0) return null
                            return (
                              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Documents</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  {slotDocs.map((doc: any) => {
                                    const docKey = doc.storage_path
                                    return (
                                      <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#F7F6F5', borderRadius: 'var(--r-sm)', padding: '10px 14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                          <Icon name={ICONS.document} size={17} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                                          <div style={{ minWidth: 0 }}>
                                            <p style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', margin: 0 }}>{fmtDocType(doc.document_type, doc.filename)}</p>
                                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</p>
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                                          {doc.file_size_bytes ? <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{(doc.file_size_bytes / 1024).toFixed(0)} KB</span> : null}
                                          <button onClick={() => openSignedUrl(docKey)} style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View</button>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={CARD}>
              <p style={SL}>Slot &amp; Shipment</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FieldBlock label="Date"         value={b.slotDate}                                    icon={ICONS.calendar} />
                <FieldBlock label="Time"         value={`${b.slotStartTime} – ${b.slotEndTime}`}      icon={ICONS.clock} />
                <FieldBlock label="Service"      value={b.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'} />
                <FieldBlock label="Load Type"    value={b.loadType.toUpperCase()} />
                {b.containerNumber  && <FieldBlock label="Container No."   value={b.containerNumber}   mono icon={ICONS.container} />}
                {b.houseBillNumber  && <FieldBlock label="HBL"             value={b.houseBillNumber}   mono />}
                {b.containerSize    && <FieldBlock label="Container Size"  value={b.containerSize}          icon={ICONS.container} />}
                {b.entryNumber      && <FieldBlock label="Entry Number"    value={b.entryNumber}    mono />}
                {b.purpose          && <FieldBlock label="Purpose"         value={b.purpose} />}
                {b.consolidator     && <FieldBlock label="Consolidator"    value={b.consolidator} />}
                {b.bookingReference && <FieldBlock label="Booking Confirmation #" value={b.bookingReference} mono />}
                {b.weightKg         && <FieldBlock label="Weight"          value={`${b.weightKg.toLocaleString()} kg`} />}
                {b.volumeCbm        && <FieldBlock label="Volume"          value={`${b.volumeCbm} CBM`} />}
                {b.packageCount     && <FieldBlock label="Packages"        value={`${b.packageCount}`} />}
                {(b.palletCount ?? 0) > 0 && <FieldBlock label="Pallets"  value={`${b.palletCount} × ${b.palletType}`} />}
              </div>
              {b.palletType === 'chep' && (
                <div style={{ marginTop: 14, background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.20)', borderRadius: 'var(--r-sm)', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Icon name={ICONS.warning} size={18} style={{ color: '#FBBF24', flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#B45309', marginBottom: 2 }}>CHEP Pallet Exchange</p>
                    <p style={{ fontSize: 14, color: '#92400E' }}>{b.palletCount} CHEP pallet{(b.palletCount ?? 0) > 1 ? 's' : ''} must be exchanged at collection.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Documents */}
          <div style={CARD}>
            <p style={SL}>Documents</p>
            {bookingDocs.length === 0 ? (
              <p style={{ fontSize: 15, color: 'var(--text-tertiary)' }}>No documents uploaded</p>
            ) : groupSlots.length > 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {groupSlots.map((slot, i) => {
                  const slotDocs = bookingDocs.filter((d: any) => d.booking_id === slot.id)
                  if (slotDocs.length === 0) return null
                  return (
                    <div key={slot.id}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                        Slot {i + 1} — {slot.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'} · {(slot.loadType ?? '').toUpperCase()} · {slot.referenceNumber}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {slotDocs.map((doc: any) => {
                          const docKey = doc.storage_path
                          return (
                            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#F7F6F5', borderRadius: 'var(--r-sm)', padding: '10px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                <Icon name={ICONS.document} size={19} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                                <div style={{ minWidth: 0 }}>
                                  <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: 0 }}>{fmtDocType(doc.document_type, doc.filename)}</p>
                                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</p>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                                {doc.file_size_bytes ? <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{(doc.file_size_bytes / 1024).toFixed(0)} KB</span> : null}
                                <button onClick={() => openSignedUrl(docKey)} style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {bookingDocs.map((doc: any) => {
                  const docKey = doc.storage_path
                  return (
                    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#F7F6F5', borderRadius: 'var(--r-sm)', padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <Icon name={ICONS.document} size={19} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: 0 }}>{fmtDocType(doc.document_type, doc.filename)}</p>
                          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        {doc.file_size_bytes ? <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{(doc.file_size_bytes / 1024).toFixed(0)} KB</span> : null}
                        <button onClick={() => openSignedUrl(docKey)} style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ICS */}
          {b.icsStatus && (
            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ ...SL, marginBottom: 0 }}>ICS Status</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {perms.can_manual_ics_refresh && (
                    <button onClick={() => act('ics', () => refreshIcsStatus(b.id), 'ICS status refreshed', 'info')} disabled={acting === 'ics'}
                      style={{ fontSize: 14, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500, fontFamily: 'inherit' }}>
                      <Icon name={ICONS.refresh} size={17}/>{acting === 'ics' ? 'Refreshing…' : 'Refresh ICS'}
                    </button>
                  )}
                  <a href="https://ics.abf.gov.au" target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--brand-color)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                    Open portal <Icon name={ICONS.arrowRight} size={17}/>
                  </a>
                </div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 15, fontWeight: 600, padding: '5px 12px', borderRadius: 'var(--r-full)', ...cssToObj(icsStyle) } as any}>
                {ICS_LABEL[b.icsStatus] ?? b.icsStatus}
              </span>
              {b.icsLastCheckedAt && (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>Last checked: {fmtDateTime(b.icsLastCheckedAt)}</p>
              )}
            </div>
          )}

          {/* Identity check — only when checked_in or completed, and staff have permission */}
          {(b.status === 'checked_in' || b.status === 'completed') && perms.can_view_id_scan && (
            <div style={CARD}>
              <p style={SL}>Identity Check</p>
              {!checkinRecord ? (
                <p style={{ fontSize: 15, color: 'var(--text-tertiary)' }}>No ID scan data available</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    {nameScore < 85 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 600, padding: '5px 12px', borderRadius: 'var(--r-full)', background: idBadge.bg, color: idBadge.color, border: `1px solid ${idBadge.border}` }}>
                        <Icon name={ICONS.check} size={17}/>{idBadge.label}
                      </span>
                    )}
                    {checkinRecord.name_match_score != null && (
                      <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Score: {checkinRecord.name_match_score}%</span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {checkinRecord.licence_name    && <FieldBlock label="Name on Licence"   value={checkinRecord.licence_name} />}
                    {checkinRecord.licence_number  && <FieldBlock label="Licence Number"    value={checkinRecord.licence_number} mono />}
                    {checkinRecord.licence_dob     && <FieldBlock label="Date of Birth"     value={checkinRecord.licence_dob} />}
                    {checkinRecord.licence_expiry  && <FieldBlock label="Expiry"            value={checkinRecord.licence_expiry} />}
                    {checkinRecord.licence_address && <FieldBlock label="Address"           value={checkinRecord.licence_address} />}
                    {checkinRecord.licence_scan_method && <FieldBlock label="Scan Method"  value={checkinRecord.licence_scan_method} />}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT ── */}
        <div>

          {/* Charges */}
          {b.totalAmount && perms.can_view_charge_details && (
            <div style={CARD}>
              <p style={SL}>Charges</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15 }}>
                {(b.storageCharge ?? 0) > 0    && <CRow label={`Storage (${b.storageDays} days)`} val={`$${b.storageCharge!.toFixed(2)}`} />}
                {(b.shrinkWrapCharge ?? 0) > 0  && <CRow label="Shrink wrap" val={`$${b.shrinkWrapCharge!.toFixed(2)}`} />}
                {b.slotFee !== undefined          && <CRow label="Slot fee" val={`$${b.slotFee.toFixed(2)}`} />}
                {b.gstAmount !== undefined && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--text-tertiary)', paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                    <span>GST (10%)</span><span>${b.gstAmount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1C1917', paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.09)', fontSize: 15 }}>
                  <span>Total</span><span style={{ color: 'var(--brand-color)' }}>${b.totalAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  <span>{(b.paymentMethod ?? '—').toUpperCase()}</span>
                  <span style={{ color: b.paymentStatus === 'paid' ? '#22C55E' : '#FBBF24', fontWeight: 600 }}>
                    {b.paymentStatus === 'paid' ? '✓ Paid' : b.paymentStatus === 'pending_eft' ? 'EFT Pending' : b.paymentStatus}
                  </span>
                </div>
                {b.paymentStatus === 'pending_eft' && perms.can_confirm_eft && (
                  <button
                    type="button"
                    disabled={acting === 'confirm-eft'}
                    onClick={async () => {
                      setActing('confirm-eft')
                      try {
                        const updated = await confirmEftPayment(b.id)
                        if (updated) setB(updated)
                        toast('EFT payment confirmed', 'success')
                      } catch {
                        toast('Failed to confirm EFT', 'error')
                      } finally {
                        setActing('')
                      }
                    }}
                    style={{ marginTop: 12, width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 600, background: 'rgba(34,197,94,0.10)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 'var(--r-full)', cursor: acting === 'confirm-eft' ? 'not-allowed' : 'pointer', opacity: acting === 'confirm-eft' ? 0.6 : 1, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.14s' }}
                    onMouseOver={e => { if (acting !== 'confirm-eft') e.currentTarget.style.background = 'rgba(34,197,94,0.18)' }}
                    onMouseOut={e  => { e.currentTarget.style.background = 'rgba(34,197,94,0.10)' }}
                  >
                    <Icon name={ICONS.check} size={15} />
                    {acting === 'confirm-eft' ? 'Confirming…' : 'Confirm EFT Payment'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div style={CARD}>
            <p style={SL}>Timeline</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 15 }}>
              <TRow icon={ICONS.calendar}   iconColor="#A8A29E" label="Created"    value={fmtDateTime(b.createdAt)} />
              {b.paymentStatus === 'paid' && <TRow icon={ICONS.check} iconColor="#22C55E" label="Payment" value="Received" valueColor="#22C55E" />}
              {b.checkedInAt && <TRow icon={ICONS.completed}  iconColor="#FBBF24" label="Checked In" value={fmtDateTime(b.checkedInAt)} />}
              {b.completedAt && <TRow icon={ICONS.checkSquare} iconColor="#22C55E" label="Completed" value={fmtDateTime(b.completedAt)} />}
              {b.completionNotes && (
                <div style={{ marginTop: 4, padding: '10px 12px', background: '#F7F6F5', borderRadius: 'var(--r-sm)', borderLeft: '3px solid #22C55E' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Completion Notes</p>
                  <p style={{ fontSize: 15, color: '#1C1917', lineHeight: 1.5, margin: 0 }}>{b.completionNotes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions — derive visibility from per-slot statuses, not group-level b.status */}
          {(() => {
            const slots = groupSlots.length > 0 ? groupSlots : (b ? [b] : [])
            const hasActionable  = slots.some(s => s.status === 'scheduled')
            const hasCheckedIn   = slots.some(s => s.status === 'checked_in')
            const allDone        = slots.every(s => s.status === 'checked_in' || s.status === 'completed' || s.status === 'cancelled')
            if (!hasActionable && !hasCheckedIn) return null
            return (
              <div style={CARD}>
                <p style={SL}>Actions</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {hasActionable && (
                    <Btn color="green" onClick={() => openAction('checkin')}>
                      <Icon name={ICONS.userCheck} size={19} /> Check In Visitor
                    </Btn>
                  )}
                  {hasCheckedIn && allDone && (
                    <button
                      onClick={() => openAction('checkin')}
                      style={{ width: '100%', padding: '11px 16px', borderRadius: 'var(--r-full)', border: '1.5px solid rgba(0,0,0,0.12)', background: '#fff', color: '#1C1917', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Slot Actions
                    </button>
                  )}
                  {hasActionable && (
                    <Btn color="ghost" onClick={() => openAction('reschedule')}>
                      <Icon name={ICONS.calendar} size={17} /> Reschedule
                    </Btn>
                  )}
                  {hasActionable && (
                    <Btn color="danger" onClick={() => openAction('cancel')}>
                      <Icon name={ICONS.close} size={17} /> Cancel Booking
                    </Btn>
                  )}
                  {b.driverName && (
                    <button
                      type="button"
                      onClick={() => { setBlockReason(''); setBlockModalOpen(true) }}
                      style={{ width: '100%', padding: '11px 16px', borderRadius: 'var(--r-full)', border: '1.5px solid rgba(239,68,68,0.30)', background: 'rgba(239,68,68,0.06)', color: '#DC2626', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.14s' }}
                      onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.14)' }}
                      onMouseOut={e  => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)' }}
                    >
                      <Icon name={ICONS.close} size={17} /> Block Driver
                    </button>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── Step 1: Slot Selection Modal (multi-slot groups only) ── */}
      {selectedAction && !selectedSlot && groupSlots.length > 1 && (
        <ModalWrap onClose={closeActionModal}>
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--brand-color)', marginBottom: 6 }}>
              {ACTION_LABEL[selectedAction]}
            </p>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 4 }}>Select a slot</h3>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Choose which slot to {selectedAction === 'checkin' ? 'check in' : selectedAction}.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {groupSlots.map((slot, i) => {
              const slotSt = STATUS_BADGE[slot.status] ?? STATUS_BADGE.scheduled
              const comboLabel = `${slot.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'} · ${slot.loadType?.toUpperCase()}`
              const actionable = selectedAction === 'checkin'
                ? slot.status === 'scheduled'
                : selectedAction === 'reschedule'
                ? slot.status === 'scheduled'
                : slot.status !== 'cancelled'
              return (
                <button
                  key={slot.id}
                  type="button"
                  disabled={!actionable}
                  onClick={() => { setSelectedSlot(slot); setNewDate(slot.slotDate); setNewStart(slot.slotStartTime) }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '14px 16px',
                    background: actionable ? '#FAFAF9' : 'rgba(0,0,0,0.025)',
                    border: `1.5px solid ${actionable ? 'rgba(0,0,0,0.09)' : 'rgba(0,0,0,0.06)'}`,
                    borderRadius: 'var(--r-md)', cursor: actionable ? 'pointer' : 'not-allowed',
                    opacity: actionable ? 1 : 0.5,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    transition: 'border-color 0.14s, background 0.14s',
                    fontFamily: 'inherit',
                  }}
                  onMouseOver={e => { if (actionable) { e.currentTarget.style.borderColor = 'rgba(var(--brand-rgb),0.40)'; e.currentTarget.style.background = 'rgba(var(--brand-rgb),0.03)' } }}
                  onMouseOut={e  => { e.currentTarget.style.borderColor = actionable ? 'rgba(0,0,0,0.09)' : 'rgba(0,0,0,0.06)'; e.currentTarget.style.background = actionable ? '#FAFAF9' : 'rgba(0,0,0,0.025)' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Slot {i + 1}</span>
                      <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 14, fontWeight: 600, color: 'var(--brand-color)' }}>{slot.referenceNumber}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, color: '#1C1917', fontWeight: 500 }}>{slot.slotDate} · {slot.slotStartTime}–{slot.slotEndTime}</span>
                      <span style={{ background: 'rgba(var(--brand-rgb),0.09)', color: 'var(--brand-color)', fontWeight: 600, fontSize: 13, padding: '2px 8px', borderRadius: 'var(--r-full)' }}>
                        {comboLabel}
                      </span>
                      <span style={{ ...slotSt, fontSize: 13, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-full)' }}>
                        {STATUS_LABEL[slot.status] ?? slot.status}
                      </span>
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: 'var(--text-tertiary)' }}>
                    <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )
            })}
          </div>

          <Btn color="ghost" onClick={closeActionModal}>Cancel</Btn>
        </ModalWrap>
      )}

      {/* ── Block Driver Modal ── */}
      {blockModalOpen && b.driverName && (
        <ModalWrap onClose={() => setBlockModalOpen(false)}>
          <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: '#DC2626', textTransform: 'uppercase', margin: '0 0 6px' }}>
            Block Driver
          </p>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', margin: '0 0 20px' }}>
            Block this driver?
          </h2>

          {/* Driver info */}
          <div style={{ background: '#FAFAF9', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Driver</span>
              <span style={{ fontWeight: 700, color: '#1C1917' }}>{b.driverName}</span>
            </div>
            {b.vehicleRegistration && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Vehicle</span>
                <span style={{ fontWeight: 700, color: '#1C1917', fontFamily: 'ui-monospace,monospace' }}>{b.vehicleRegistration}</span>
              </div>
            )}
          </div>

          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px' }}>
            This driver will be blocked and cannot make future bookings.
          </p>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Reason for blocking (optional)
            </label>
            <textarea
              rows={3}
              value={blockReason}
              onChange={e => setBlockReason(e.target.value)}
              placeholder="e.g. Safety incident, repeated no-shows…"
              style={{ ...FIELD, resize: 'none' }}
              onFocus={focus}
              onBlur={blur}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Btn color="ghost" onClick={() => setBlockModalOpen(false)}>Cancel</Btn>
            <button
              type="button"
              disabled={blockingDriver}
              onClick={async () => {
                setBlockingDriver(true)
                try {
                  await blockDriverByName(b.driverName!, blockReason)
                  toast(`${b.driverName} has been blocked`, 'success')
                  setBlockModalOpen(false)
                } catch (err: any) {
                  toast(err?.message ?? 'Failed to block driver', 'error')
                } finally {
                  setBlockingDriver(false)
                }
              }}
              style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', fontSize: 15, fontWeight: 600, borderRadius: 'var(--r-full)', cursor: blockingDriver ? 'not-allowed' : 'pointer', opacity: blockingDriver ? 0.6 : 1, transition: 'all 0.15s', fontFamily: 'inherit', background: '#DC2626', color: '#fff', border: 'none' }}
            >
              <Icon name={ICONS.close} size={17} /> {blockingDriver ? 'Blocking…' : 'Block Driver'}
            </button>
          </div>
        </ModalWrap>
      )}

      {/* ── Override Status Modal ── */}
      {overrideModalOpen && overrideSlot && (
        <ModalWrap onClose={() => setOverrideModalOpen(false)}>
          <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: '#B45309', textTransform: 'uppercase', margin: '0 0 6px' }}>
            Override Status
          </p>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            Change booking status
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
            Ref <span style={{ fontFamily: 'ui-monospace,monospace', fontWeight: 700, color: 'var(--brand-color)' }}>{overrideSlot.referenceNumber}</span> · Current: <strong>{STATUS_LABEL[overrideSlot.status] ?? overrideSlot.status}</strong>
          </p>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>New Status</label>
            <select
              value={overrideStatus}
              onChange={e => setOverrideStatus(e.target.value)}
              style={{ ...FIELD, appearance: 'auto' }}
            >
              <option value="scheduled">Scheduled</option>
              <option value="checked_in">Checked In</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Reason / Note <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(required)</span>
            </label>
            <textarea
              value={overrideNote}
              onChange={e => setOverrideNote(e.target.value)}
              onFocus={focus as any}
              onBlur={blur as any}
              placeholder="e.g. Driver checked in manually — system failed to register"
              rows={3}
              style={{ ...FIELD, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Btn color="ghost" onClick={() => setOverrideModalOpen(false)}>Cancel</Btn>
            <button
              type="button"
              disabled={overriding || !overrideNote.trim()}
              onClick={async () => {
                setOverriding(true)
                try {
                  const updated = await overrideBookingStatus(overrideSlot.id, overrideStatus, overrideNote.trim())
                  if (updated) {
                    setGroupSlots(prev => prev.map(s => s.id === overrideSlot.id ? { ...s, status: overrideStatus as any } : s))
                    if (overrideSlot.id === b?.id) setB(prev => prev ? { ...prev, status: overrideStatus as any } : prev)
                  }
                  toast('Status updated', 'success')
                  setOverrideModalOpen(false)
                } catch {
                  toast('Failed to override status', 'error')
                } finally {
                  setOverriding(false)
                }
              }}
              style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', fontSize: 15, fontWeight: 600, borderRadius: 'var(--r-full)', cursor: (overriding || !overrideNote.trim()) ? 'not-allowed' : 'pointer', opacity: (overriding || !overrideNote.trim()) ? 0.5 : 1, transition: 'all 0.15s', fontFamily: 'inherit', background: 'rgba(251,191,36,0.15)', color: '#92400E', border: '1px solid rgba(251,191,36,0.40)' }}
            >
              {overriding ? 'Saving…' : 'Override Status'}
            </button>
          </div>
        </ModalWrap>
      )}

      {/* ── Step 2: Action Modal (per slot) ── */}
      {selectedAction && selectedSlot && (() => {
        const sl = selectedSlot
        const comboLabel = `${sl.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'} · ${sl.loadType?.toUpperCase()}`
        const slotSt = STATUS_BADGE[sl.status] ?? STATUS_BADGE.scheduled
        const isMulti = groupSlots.length > 1
        return (
          <ModalWrap onClose={closeActionModal}>
            {/* Back button — always shown; single-slot goes straight to close */}
            <button
              type="button"
              onClick={() => isMulti ? setSelectedSlot(null) : closeActionModal()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 18px', fontFamily: 'inherit' }}
            >
              <Icon name={ICONS.arrowLeft} size={19} /> Back
            </button>

            {/* Eyebrow + heading */}
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--brand-color, #FC6514)', textTransform: 'uppercase', margin: '0 0 6px' }}>
              {ACTION_LABEL[selectedAction]}
            </p>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', margin: '0 0 20px' }}>
              {selectedAction === 'checkin' ? 'Confirm Check In' : selectedAction === 'reschedule' ? 'Reschedule Slot' : 'Cancel Slot'}
            </h2>

            {/* Slot card */}
            <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 20 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--brand-color, #FC6514)', fontFamily: 'ui-monospace,monospace', letterSpacing: '0.01em', margin: '0 0 4px' }}>
                {sl.referenceNumber}
              </p>
              <p style={{ fontSize: 15, color: 'var(--text-mid)', margin: '0 0 10px' }}>
                {sl.slotDate} &nbsp;·&nbsp; {sl.slotStartTime} – {sl.slotEndTime}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ background: 'rgba(var(--brand-rgb),0.09)', color: 'var(--brand-color)', fontWeight: 600, fontSize: 13, padding: '2px 8px', borderRadius: 'var(--r-full)' }}>
                  {comboLabel}
                </span>
                <span style={{ ...slotSt, fontSize: 13, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-full)' }}>
                  {STATUS_LABEL[sl.status] ?? sl.status}
                </span>
              </div>
            </div>

            {/* ── Check In ── */}
            {selectedAction === 'checkin' && (
              <>
                {/* Verification details — confirm you're checking in the right person */}
                <div style={{ background: '#FAFAF9', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    ['Driver',   sl.driverName  || b.driverName  || '—'],
                    ['Rego',     sl.vehicleRegistration || b.vehicleRegistration || '—'],
                    ['Company',  sl.companyName || b.companyName || '—'],
                    ['HBL',      sl.houseBillNumber || b.houseBillNumber || '—'],
                    ['ICS',      sl.icsStatus   || b.icsStatus   || '—'],
                  ].filter(([, v]) => v !== '—').map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
                      <span style={{ fontWeight: 700, color: '#1C1917', fontFamily: label === 'Rego' || label === 'HBL' ? 'ui-monospace,monospace' : undefined }}>
                        {label === 'ICS'
                          ? (() => {
                              const icsColors: Record<string, [string, string]> = {
                                cleared: ['rgba(34,197,94,0.12)', '#16A34A'],
                                held: ['rgba(239,68,68,0.12)', '#EF4444'],
                                examination: ['rgba(251,191,36,0.10)', '#B45309'],
                              }
                              const [bg, color] = icsColors[val?.toLowerCase() ?? ''] ?? ['rgba(0,0,0,0.06)', '#6B7280']
                              return <span style={{ padding: '2px 10px', borderRadius: 'var(--r-full)', background: bg, color, fontSize: 13, fontWeight: 700 }}>{val}</span>
                            })()
                          : val}
                      </span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 4px' }}>
                  Confirming will mark this slot as arrived and record the exact time.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                  <button
                    disabled={acting === 'checkin-' + sl.id}
                    onClick={async () => {
                      setActing('checkin-' + sl.id)
                      try {
                        await checkInBooking(sl.id)
                        setGroupSlots(prev => {
                          const next = prev.map(s => s.id === sl.id ? { ...s, status: 'checked_in' as any } : s)
                          // Only promote group-level status to checked_in when every slot is now checked in or done
                          const allChecked = next.every(s => s.status === 'checked_in' || s.status === 'completed' || s.status === 'cancelled')
                          if (allChecked) setB(p => p ? { ...p, status: 'checked_in' as any } : p)
                          return next
                        })
                        toast(`✓ ${b.driverName} checked in`, 'success')
                        closeActionModal()
                      } catch (err: any) {
                        toast(err?.message ?? 'Check-in failed', 'error')
                      } finally {
                        setActing('')
                      }
                    }}
                    style={{ width: '100%', padding: '14px', borderRadius: 'var(--r-md)', border: 'none', background: 'var(--brand-color, #FC6514)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: acting === 'checkin-' + sl.id ? 'not-allowed' : 'pointer', opacity: acting === 'checkin-' + sl.id ? 0.6 : 1, fontFamily: 'inherit', transition: 'opacity 0.15s' }}
                  >
                    {acting === 'checkin-' + sl.id ? 'Checking in…' : 'Confirm Check In'}
                  </button>
                  <button
                    onClick={closeActionModal}
                    style={{ width: '100%', padding: '14px', borderRadius: 'var(--r-md)', border: '1.5px solid rgba(0,0,0,0.12)', background: '#fff', color: '#1C1917', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* ── Reschedule ── */}
            {selectedAction === 'reschedule' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>New Date</label>
                    <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={FIELD} onFocus={focus} onBlur={blur} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>New Start Time</label>
                    <input type="time" value={newStart} onChange={e => setNewStart(e.target.value)} style={FIELD} onFocus={focus} onBlur={blur} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn color="ghost" onClick={closeActionModal}>Cancel</Btn>
                  <Btn color="brand" loading={acting === 'reschedule-' + sl.id} onClick={async () => {
                    const endH = String(parseInt(newStart.split(':')[0]) + 1).padStart(2, '0')
                    const newEnd = `${endH}:${newStart.split(':')[1]}`
                    setActing('reschedule-' + sl.id)
                    try {
                      const updated = await rescheduleBooking(sl.id, newDate, newStart, newEnd)
                      if (updated) {
                        setGroupSlots(prev => prev.map(s => s.id === sl.id ? { ...s, slotDate: newDate, slotStartTime: newStart, slotEndTime: newEnd } : s))
                        if (sl.id === b?.id) setB(updated)
                      }
                      toast(`Rescheduled to ${newDate} at ${newStart}`, 'success')
                      closeActionModal()
                    } catch (err: any) {
                      toast(err?.message ?? 'Reschedule failed', 'error')
                    } finally {
                      setActing('')
                    }
                  }}>
                    <Icon name={ICONS.calendar} size={17} /> Confirm Reschedule
                  </Btn>
                </div>
              </>
            )}

            {/* ── Cancel ── */}
            {selectedAction === 'cancel' && (
              <>
                <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                  You are cancelling slot <strong style={{ fontFamily: 'ui-monospace,monospace', color: '#1C1917' }}>{sl.referenceNumber}</strong>. This cannot be undone.
                </p>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Reason (optional)</label>
                  <textarea
                    rows={3}
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    placeholder="e.g. Shipment delayed, driver unavailable…"
                    style={{ ...FIELD, resize: 'none' }}
                    onFocus={focus}
                    onBlur={blur}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn color="ghost" onClick={closeActionModal}>Keep Slot</Btn>
                  <Btn color="danger" loading={acting === 'cancel-' + sl.id} onClick={async () => {
                    setActing('cancel-' + sl.id)
                    try {
                      await cancelBooking(sl.id)
                      setGroupSlots(prev => prev.map(s => s.id === sl.id ? { ...s, status: 'cancelled' as any } : s))
                      if (sl.id === b?.id) setB(prev => prev ? { ...prev, status: 'cancelled' as Booking['status'] } : prev)
                      toast(`Slot ${sl.referenceNumber} cancelled`, 'info')
                      closeActionModal()
                    } catch (err: any) {
                      toast(err?.message ?? 'Cancel failed', 'error')
                    } finally {
                      setActing('')
                    }
                  }}>
                    <Icon name={ICONS.close} size={17} /> Cancel Slot
                  </Btn>
                </div>
              </>
            )}
          </ModalWrap>
        )
      })()}

    </div>
  )
}

/* ── Helpers ── */

function cssToObj(str: string): React.CSSProperties {
  return Object.fromEntries(str.split(';').filter(Boolean).map(s => {
    const [k, ...v] = s.split(':')
    return [k.trim().replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase()), v.join(':').trim()]
  }))
}

function InfoRow({ label, value, icon, mono }: { label: string; value: string; icon?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={RL}>{icon && <Icon name={icon} size={17} style={{ color: 'var(--text-tertiary)' }} />}{label}</span>
      <span style={{ ...RV, fontFamily: mono ? 'ui-monospace,monospace' : undefined }}>{value}</span>
    </div>
  )
}

function FieldBlock({ label, value, mono, icon }: { label: string; value: string; mono?: boolean; icon?: string }) {
  return (
    <div>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon && <Icon name={icon} size={19} style={{ color: '#9CA3AF', flexShrink: 0 }} />}
        {label}
      </p>
      <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', fontFamily: mono ? 'ui-monospace,monospace' : undefined, margin: 0 }}>{value}</p>
    </div>
  )
}

function CRow({ label, val }: { label: string; val: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
      <span>{label}</span><span>{val}</span>
    </div>
  )
}

function TRow({ icon, iconColor, label, value, valueColor }: { icon: string; iconColor: string; label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
        <Icon name={icon} size={19} style={{ color: iconColor }} />{label}
      </span>
      <span style={{ color: valueColor ?? '#1C1917', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function ModalWrap({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#FFFFFF', borderRadius: 'var(--r-xl)', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', maxWidth: 520, width: '100%', padding: 28 }}>
        {children}
      </div>
    </div>
  )
}

function Btn({ color, onClick, loading, children }: { color: 'brand' | 'green' | 'ghost' | 'danger'; onClick: () => void; loading?: boolean; children: React.ReactNode }) {
  const s: Record<string, React.CSSProperties> = {
    brand:  { background: 'var(--brand-color, #FC6514)', color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.30)' },
    green:  { background: 'linear-gradient(135deg,#22C55E,#16A34A)', color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(34,197,94,0.30)' },
    ghost:  { background: '#fff', color: '#374151', border: '1.5px solid #e5e7eb' },
    danger: { background: 'rgba(239,68,68,0.08)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.25)' },
  }
  return (
    <button onClick={onClick} disabled={loading} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', fontSize: 15, fontWeight: 600, borderRadius: 'var(--r-full)', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, transition: 'all 0.15s', fontFamily: 'inherit', ...s[color] }}>
      {children}
    </button>
  )
}
