import { useState, useEffect } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Icon, ICONS } from '@/lib/Icon'
import { fmtDateTime, fmtTime } from '@/lib/time'
import { toast } from '@/lib/toast'
import { fetcher } from '@/lib/fetcher'
import { useStaffPermissions } from '@/lib/useStaffPermissions'

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'
import { completeBooking } from '@/lib/db/bookings'

// ── Shared style constants (mirrors BookingDetailPage) ────────────────────────
const CARD: React.CSSProperties  = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)', marginBottom: 16 }
const SL: React.CSSProperties   = { fontSize: 15, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 12 }
const RL: React.CSSProperties   = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, color: 'var(--text-muted)' }
const RV: React.CSSProperties   = { fontSize: 16, fontWeight: 600, color: '#1C1917' }
const FIELD: React.CSSProperties = { width: '100%', padding: '10px 14px', fontSize: 15, color: '#1C1917', background: '#EBEBEA', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box' }

const SOURCE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  self_booking:      { label: 'Self Booking',      bg: 'rgba(37,99,235,0.08)', color: '#2563EB' },
  guest:             { label: 'Guest',              bg: 'rgba(0,0,0,0.05)',     color: 'var(--text-secondary)' },
  reception_booking: { label: 'Reception Booking', bg: 'rgba(234,179,8,0.10)', color: '#A16207' },
}

function SourceBadge({ source }: { source?: string | null }) {
  if (!source) return null
  const s = SOURCE_BADGE[source] ?? SOURCE_BADGE.guest
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 600, padding: '3px 8px', borderRadius: 'var(--r-full)', background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

const BOOKING_STATUS_BADGE: Record<string, React.CSSProperties> = {
  scheduled:  { background: '#F5F5F4', color: '#57534E', border: '1px solid rgba(0,0,0,0.10)' },
  checked_in: { background: 'rgba(34,197,94,0.12)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.25)' },
  completed:  { background: '#F5F5F4', color: 'var(--text-secondary)', border: '1px solid rgba(0,0,0,0.08)' },
  cancelled:  { background: 'transparent', color: 'var(--text-tertiary)', border: '1px solid rgba(0,0,0,0.15)' },
}
const BOOKING_STATUS_LABEL: Record<string, string> = { scheduled: 'Scheduled', checked_in: 'Checked In', completed: 'Completed', cancelled: 'Cancelled' }

// ── Focus / blur helpers for textarea ────────────────────────────────────────
const fFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => { e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)' }
const fBlur  = (e: React.FocusEvent<HTMLTextAreaElement>) => { e.target.style.borderColor = 'rgba(0,0,0,0.10)' }

export default function VisitorDetailPage() {
  usePageTitle('Glido | Visitor')
  const perms = useStaffPermissions()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  const [loading,       setLoading]       = useState(true)
  const [booking,       setBooking]       = useState<any | null>(null)
  const [walkIn,        setWalkIn]        = useState<any | null>(null)
  const [checkinRecord, setCheckinRecord] = useState<any | null>(null)
  const [visitorType,   setVisitorType]   = useState<'booking' | 'walkin' | null>(null)

  const [documents,       setDocuments]       = useState<any[]>([])

  // Mark Complete modal
  const [confirmModal,    setConfirmModal]    = useState(false)
  const [completionNotes, setCompletionNotes] = useState('')
  const [completing,      setCompleting]      = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)

    const load = async () => {
      // Try booking and walk_in in parallel — 404s must not kill the other
      const [bookingRes, walkInRes] = await Promise.all([
        fetcher(`/api/bookings/${id}`).catch(() => null),
        fetcher(`/api/walk-ins/${id}`).catch(() => null),
      ])

      if (bookingRes?.data) {
        // Normalize camelCase booking from the db layer
        const bk = bookingRes.data
        setBooking({
          id:                   bk.id,
          driver_name:          bk.driver_name          ?? bk.driverName,
          driver_phone:         bk.driver_phone         ?? bk.driverPhone,
          guest_name:           bk.guest_name           ?? bk.guestName,
          guest_phone:          bk.guest_phone          ?? bk.guestPhone,
          company_name:         bk.company_name         ?? bk.companyName,
          service_type:         bk.service_type         ?? bk.serviceType,
          load_type:            bk.load_type            ?? bk.loadType,
          slot_date:            bk.slot_date            ?? bk.slotDate,
          slot_start_time:      bk.slot_start_time      ?? bk.slotStartTime,
          slot_end_time:        bk.slot_end_time        ?? bk.slotEndTime,
          vehicle_registration: bk.vehicle_registration ?? bk.vehicleRegistration,
          container_number:     bk.container_number     ?? bk.containerNumber,
          container_size:       bk.container_size       ?? bk.containerSize,
          house_bill_number:    bk.house_bill_number    ?? bk.houseBillNumber,
          entry_number:         bk.entry_number         ?? bk.entryNumber,
          purpose:              bk.purpose,
          booking_reference:    bk.booking_reference    ?? bk.bookingReference,
          consolidator:         bk.consolidator,
          status:               bk.status,
          checked_in_at:        bk.checked_in_at        ?? bk.checkedInAt,
          completed_at:         bk.completed_at         ?? bk.completedAt,
          completion_notes:     bk.completion_notes     ?? bk.completionNotes,
          created_at:           bk.created_at           ?? bk.createdAt,
          reference_number:     bk.reference_number     ?? bk.referenceNumber,
          booking_source:       bk.booking_source       ?? bk.bookingSource,
        })
        setVisitorType('booking')
        const [crRes, docsRes] = await Promise.all([
          fetcher(`/api/checkin-records?bookingId=${encodeURIComponent(id)}`).catch(() => null),
          fetcher(`/api/booking-documents?bookingId=${encodeURIComponent(id)}`).catch(() => null),
        ])
        setCheckinRecord((crRes?.data ?? [])[0] ?? null)
        setDocuments(docsRes?.data ?? [])
      } else if (walkInRes?.data) {
        const wi = walkInRes.data
        setWalkIn({
          id:                   wi.id,
          visitor_name:         wi.visitor_name         ?? wi.visitorName,
          contact_number:       wi.contact_number       ?? wi.contactNumber,
          purpose:              wi.purpose,
          person_being_visited: wi.person_being_visited ?? wi.personBeingVisited,
          reason:               wi.reason,
          arrived_at:           wi.arrived_at           ?? wi.arrivedAt,
          dismissed:            wi.dismissed,
          dismissed_at:         wi.dismissed_at         ?? wi.dismissedAt,
        })
        setVisitorType('walkin')
        // Fetch checkin_record by walk_in_id (precise match)
        const crRes = await fetcher(`/api/checkin-records?walkInId=${encodeURIComponent(wi.id)}&isWalkIn=true`)
        if (crRes?.data?.length > 0) {
          setCheckinRecord(crRes.data[0])
        }
      }
    }

    load().finally(() => setLoading(false))
  }, [id])

  const handleComplete = async () => {
    if (!booking) return
    setCompleting(true)
    try {
      await completeBooking(booking.id, completionNotes || undefined)
      setBooking((prev: any) => prev ? { ...prev, status: 'completed' } : prev)
      toast('Visit marked as complete', 'success')
      setConfirmModal(false)
      setCompletionNotes('')
    } catch (err: any) {
      toast(err?.message ?? 'Failed to mark complete', 'error')
    } finally {
      setCompleting(false)
    }
  }

  if (loading) return (
    <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 15 }}>Loading…</div>
  )

  if (!visitorType) return (
    <div style={{ padding: '48px 0', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: '#1C1917', marginBottom: 8 }}>Visitor not found</p>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--brand-color)', fontSize: 15, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>← Back</button>
    </div>
  )

  // ── Derived display values ─────────────────────────────────────────────────
  const isBooking = visitorType === 'booking'
  const cr = checkinRecord

  const name = isBooking
    ? (booking.driver_name || booking.guest_name || '—')
    : (walkIn.visitor_name || '—')
  const phone = isBooking
    ? (booking.driver_phone || booking.guest_phone || null)
    : (walkIn.contact_number || null)
  const company = isBooking ? (booking.company_name || null) : null
  const purpose = isBooking
    ? (booking.service_type === 'pickup' ? 'Pick Up' : 'Drop Off')
    : walkIn.purpose === 'walk_in_pickup'  ? 'Pick Up'
    : walkIn.purpose === 'walk_in_dropoff' ? 'Drop Off'
    : walkIn.purpose === 'visit_office'    ? 'Visiting Office'
    : walkIn.purpose === 'visit_yard'      ? 'Visiting Yard'
    : 'Visiting Person'

  const arrivedAt    = isBooking ? (booking.checked_in_at || booking.created_at) : walkIn.arrived_at
  const checkedOutAt = isBooking
    ? (booking.completed_at || null)
    : (walkIn.dismissed_at || cr?.dismissed_at || null)
  const ref = isBooking ? booking.reference_number : null

  const status      = isBooking ? booking.status : (walkIn.dismissed ? 'dismissed' : 'on_site')
  const statusStyle = isBooking
    ? (BOOKING_STATUS_BADGE[booking.status] ?? BOOKING_STATUS_BADGE.scheduled)
    : (walkIn.dismissed
      ? { background: '#F5F5F4', color: 'var(--text-secondary)', border: '1px solid rgba(0,0,0,0.08)' }
      : { background: 'rgba(34,197,94,0.12)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.25)' })
  const statusLabel = isBooking
    ? (BOOKING_STATUS_LABEL[booking.status] ?? booking.status)
    : (walkIn.dismissed ? 'Dismissed' : 'On Site')

  const hasLicence = !!(cr?.licence_number)

  return (
    <div>
      {/* ── Breadcrumb + title ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link
            to="/reception/visitors"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 15, fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.14s ease' }}
            onMouseOver={e => (e.currentTarget.style.color = '#1C1917')}
            onMouseOut={e  => (e.currentTarget.style.color = '#4B5563')}
          >
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
              <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Visitors
          </Link>
          <span style={{ color: 'rgba(0,0,0,0.15)', fontSize: 15 }}>/</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#1C1917' }}>{name}</span>
          <span style={{ ...statusStyle, fontSize: 14, fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--r-full)', whiteSpace: 'nowrap' }}>
            {statusLabel}
          </span>
          {isBooking && <SourceBadge source={booking.booking_source} />}
        </div>
        <p style={{ fontSize: 15, color: 'var(--text-muted)' }}>Arrived {fmtTime(arrivedAt)}</p>
      </div>

      {/* ── 2-col layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'flex-start' }}>

        {/* ── LEFT ── */}
        <div>

          {/* Visitor Details */}
          <div style={CARD}>
            <p style={SL}>Visitor Details</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {name  && <InfoRow label="Full Name" value={name}    icon={ICONS.user}     />}
              {phone && <InfoRow label="Phone"     value={phone}   icon={ICONS.phone}    />}
              {company && <InfoRow label="Company" value={company} icon={ICONS.building} />}
              {!name && !phone && !company && (
                <p style={{ fontSize: 15, color: 'var(--text-tertiary)' }}>No visitor details recorded</p>
              )}
            </div>
          </div>

          {/* Booking / Visit Details */}
          <div style={CARD}>
            <p style={SL}>Visit Details</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ref && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={RL}>Reference</span>
                  <span
                    style={{ ...RV, fontFamily: 'ui-monospace,monospace', color: 'var(--brand-color)', cursor: 'pointer' }}
                    title="Click to copy"
                    onClick={() => navigator.clipboard.writeText(ref).then(() => toast('Copied', 'info')).catch(() => {})}
                  >
                    {ref}
                  </span>
                </div>
              )}
              <InfoRow label="Purpose" value={purpose} />
              {(cr?.walk_in_reason || walkIn?.reason) && (
                <InfoRow label="Reason" value={cr?.walk_in_reason ?? walkIn?.reason} />
              )}
              {(cr?.visit_person_name || walkIn?.person_being_visited) && (
                <InfoRow label="Visiting" value={cr?.visit_person_name ?? walkIn?.person_being_visited} />
              )}
              <InfoRow label="Arrived"     value={fmtTime(arrivedAt)}   icon={ICONS.clock} />
              {checkedOutAt && <InfoRow label="Checked Out" value={fmtTime(checkedOutAt)} icon={ICONS.clock} />}
            </div>
          </div>

          {/* Slot & Driver — booking type only */}
          {isBooking && (
            <div style={CARD}>
              <p style={SL}>Slot &amp; Driver</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FieldBlock label="Service Type" value={booking.service_type === 'pickup' ? 'Pick Up' : 'Drop Off'} />
                <FieldBlock label="Load Type"    value={(booking.load_type ?? '').toUpperCase()} />
                {booking.slot_date            && <FieldBlock label="Date"            value={booking.slot_date}                                             icon={ICONS.calendar}  />}
                {booking.slot_start_time      && <FieldBlock label="Time"            value={`${booking.slot_start_time} – ${booking.slot_end_time}`}      icon={ICONS.clock}     />}
                {booking.driver_name          && <FieldBlock label="Driver Name"     value={booking.driver_name}                                           icon={ICONS.user}      />}
                {booking.driver_phone         && <FieldBlock label="Driver Phone"    value={booking.driver_phone}                                          icon={ICONS.phone}     />}
                {booking.vehicle_registration && <FieldBlock label="Vehicle Rego"    value={booking.vehicle_registration}    mono icon={ICONS.truck}      />}
                {booking.container_number     && <FieldBlock label="Container No."   value={booking.container_number}        mono icon={ICONS.container}  />}
                {booking.container_size       && <FieldBlock label="Container Size"  value={booking.container_size}               icon={ICONS.container}  />}
                {booking.house_bill_number    && <FieldBlock label="HBL"             value={booking.house_bill_number}       mono                         />}
                {booking.entry_number         && <FieldBlock label="Entry Number"    value={booking.entry_number}            mono                         />}
                {booking.purpose             && <FieldBlock label="Purpose"          value={booking.purpose}                                              />}
                {booking.booking_reference   && <FieldBlock label="Booking Confirmation #" value={booking.booking_reference}  mono                         />}
                {booking.consolidator        && <FieldBlock label="Consolidator"     value={booking.consolidator}                                         />}
              </div>
            </div>
          )}

          {/* Documents — booking type only */}
          {isBooking && documents.length > 0 && (
            <div style={CARD}>
              <p style={SL}>Documents</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {documents.map((doc: any) => {
                  const publicUrl = `/api/uploads/booking-documents/${doc.storage_path}`
                  return (
                    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#F7F6F5', borderRadius: 'var(--r-sm)', padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <Icon name={ICONS.document} size={19} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: 0 }}>
                            {fmtDocType(doc.document_type, doc.filename)}
                          </p>
                          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        {doc.file_size_bytes ? (
                          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{(doc.file_size_bytes / 1024).toFixed(0)} KB</span>
                        ) : null}
                        <a href={publicUrl} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none' }}>
                          View
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Identity Check */}
          {(hasLicence || cr?.licence_scan_method) && perms.can_view_id_scan && (
            <div style={CARD}>
              <p style={SL}>Identity Check</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cr?.licence_scan_method && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={RL}>Scan Method</span>
                    <span style={{ fontSize: 14, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-full)', background: 'rgba(0,0,0,0.05)', color: '#374151' }}>
                      {cr.licence_scan_method}
                    </span>
                  </div>
                )}
                {cr?.licence_number  && <InfoRow label="Licence No."      value={cr.licence_number}  />}
                {cr?.licence_name    && <InfoRow label="Name on Licence"  value={cr.licence_name}    />}
                {cr?.licence_dob     && <InfoRow label="Date of Birth"    value={cr.licence_dob}     />}
                {cr?.licence_expiry  && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={RL}>Expiry</span>
                    <span style={{ ...RV, color: cr.expiry_valid === false ? '#EF4444' : '#1C1917' }}>
                      {cr.licence_expiry}{cr.expiry_valid === false ? ' · Expired' : ''}
                    </span>
                  </div>
                )}
                {cr?.licence_address && <InfoRow label="Address"          value={cr.licence_address} />}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div style={CARD}>
            <p style={SL}>Timeline</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 15 }}>
              <TRow icon={ICONS.clock}       iconColor="#A8A29E" label="Arrived"     value={fmtTime(arrivedAt)} />
              {isBooking && booking.checked_in_at && (
                <TRow icon={ICONS.completed}  iconColor="#FBBF24" label="Checked In"  value={fmtDateTime(booking.checked_in_at)} />
              )}
              {isBooking && booking.completed_at && (
                <TRow icon={ICONS.checkSquare} iconColor="#22C55E" label="Completed"  value={fmtDateTime(booking.completed_at)} />
              )}
              {!isBooking && walkIn?.dismissed_at && (
                <TRow icon={ICONS.check}       iconColor="#22C55E" label="Dismissed"  value={fmtTime(walkIn.dismissed_at)} />
              )}
              {!isBooking && !walkIn?.dismissed_at && cr?.dismissed_at && (
                <TRow icon={ICONS.check}       iconColor="#22C55E" label="Dismissed"  value={fmtTime(cr.dismissed_at)} />
              )}
              {isBooking && booking.completion_notes && (
                <div style={{ marginTop: 4, padding: '10px 12px', background: '#F7F6F5', borderRadius: 'var(--r-sm)', borderLeft: '3px solid #22C55E' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Completion Notes</p>
                  <p style={{ fontSize: 15, color: '#1C1917', lineHeight: 1.5, margin: 0 }}>{booking.completion_notes}</p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ── RIGHT — Actions sidebar ── */}
        <div>
          {isBooking && booking.status === 'checked_in' && (
            <div style={CARD}>
              <p style={SL}>Actions</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => setConfirmModal(true)}
                  style={{ width: '100%', padding: '11px 16px', borderRadius: 'var(--r-full)', border: 'none', background: 'var(--brand-color, #FC6514)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', transition: 'opacity 0.15s' }}
                  onMouseOver={e => { e.currentTarget.style.opacity = '0.88' }}
                  onMouseOut={e  => { e.currentTarget.style.opacity = '1' }}
                >
                  <Icon name={ICONS.checkSquare} size={19} /> Log Out User
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Mark Complete modal ── */}
      {confirmModal && (
        <ModalWrap onClose={() => setConfirmModal(false)}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', marginBottom: 6 }}>Log out {name}?</h3>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
            Confirm the driver has collected their cargo and is cleared to leave. The visit will be marked complete and locked.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {['Driver identity verified', 'Documents checked', 'Cargo released'].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: '#1C1917' }}>
                <span style={{ width: 20, height: 20, borderRadius: 'var(--r-full)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.22)' }}>
                  <Icon name={ICONS.check} size={12} style={{ color: '#22C55E' }} />
                </span>
                {item}
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Handover Notes (optional)
            </label>
            <textarea
              rows={3}
              value={completionNotes}
              onChange={e => setCompletionNotes(e.target.value)}
              placeholder="e.g. short-shipped 2 pallets, seal number noted…"
              style={{ width: '100%', padding: '10px 14px', fontSize: 15, color: '#1C1917', background: '#EBEBEA', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
              onFocus={e => { e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)' }}
              onBlur={e  => { e.target.style.borderColor = 'rgba(0,0,0,0.10)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn color="ghost" onClick={() => setConfirmModal(false)}>Cancel</Btn>
            <Btn color="brand" loading={completing} onClick={handleComplete}>
              <Icon name={ICONS.check} size={19} /> Confirm Log Out
            </Btn>
          </div>
        </ModalWrap>
      )}
    </div>
  )
}

/* ── Helpers (same as BookingDetailPage) ─────────────────────────────────── */

function fmtDocType(docType: string | number | null | undefined, filename?: string): string {
  const s = docType != null ? String(docType).trim() : ''
  if (!s || /^\d+$/.test(s)) {
    if (filename) {
      const part = filename.split('-')[0].replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim()
      if (part) return part.replace(/\b\w/g, c => c.toUpperCase())
    }
    return 'Document'
  }
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
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

function TRow({ icon, iconColor, label, value }: { icon: string; iconColor: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
        <Icon name={icon} size={19} style={{ color: iconColor }} />{label}
      </span>
      <span style={{ color: '#1C1917', fontWeight: 500 }}>{value}</span>
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

function Btn({ color, onClick, loading, children }: { color: 'brand' | 'ghost'; onClick: () => void; loading?: boolean; children: React.ReactNode }) {
  const s: Record<string, React.CSSProperties> = {
    brand: { background: 'var(--brand-color, #FC6514)', color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.30)' },
    ghost: { background: '#fff', color: '#374151', border: '1.5px solid #e5e7eb' },
  }
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', fontSize: 15, fontWeight: 600, borderRadius: 'var(--r-full)', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, transition: 'all 0.15s', fontFamily: 'inherit', ...s[color] }}
    >
      {children}
    </button>
  )
}
