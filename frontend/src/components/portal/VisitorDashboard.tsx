import { Icon, ICONS } from '../../lib/Icon'
import type { Booking } from '../../data/types'

interface Props {
  user: { id: string; email: string; firstName: string | null }
  upcoming: Booking[]
  past: Booking[]
}

const ICS_BADGE: Record<string, string> = {
  cleared:     'background:rgba(34,197,94,0.12); color:#16A34A; border:1px solid rgba(34,197,94,0.22);',
  held:        'background:rgba(239,68,68,0.10); color:#DC2626; border:1px solid rgba(239,68,68,0.22);',
  examination: 'background:rgba(251,191,36,0.12); color:#B45309; border:1px solid rgba(251,191,36,0.22);',
  pending:     'background:rgba(251,191,36,0.12); color:#B45309; border:1px solid rgba(251,191,36,0.22);',
  unavailable: 'background:rgba(0,0,0,0.04); color:#78716C; border:1px solid rgba(0,0,0,0.10);',
}

const STATUS_BADGE: Record<string, string> = {
  scheduled:  'background:rgba(59,130,246,0.10); color:#2563EB; border:1px solid rgba(59,130,246,0.22);',
  checked_in: 'background:rgba(34,197,94,0.12); color:#16A34A; border:1px solid rgba(34,197,94,0.22);',
  completed:  'background:rgba(0,0,0,0.04); color:#78716C; border:1px solid rgba(0,0,0,0.10);',
  cancelled:  'background:rgba(239,68,68,0.08); color:#DC2626; border:1px solid rgba(239,68,68,0.15);',
}

function IcsBadge({ status }: { status?: string }) {
  if (!status || status === 'unavailable') return null
  const style = ICS_BADGE[status] ?? ICS_BADGE.unavailable
  const label = status.toUpperCase()
  return (
    <span style={`font-size:10px; font-weight:700; padding:2px 8px; border-radius:9999px; ${style}`}>
      ICS {label}
    </span>
  )
}

function BookingCard({ b, compact = false }: { b: Booking; compact?: boolean }) {
  const statusStyle = STATUS_BADGE[b.status] ?? STATUS_BADGE.scheduled
  const isUpcoming = b.status === 'scheduled' || b.status === 'checked_in'
  const today = new Date().toISOString().split('T')[0]
  const canCancel = b.status === 'scheduled' && b.slotDate >= today

  return (
    <div
      x-data="{ cancelModal: false }"
      style={`background:#FFFFFF; border:1px solid ${isUpcoming ? 'rgba(var(--brand-rgb),0.16)' : 'rgba(0,0,0,0.07)'}; border-radius:16px; padding:${compact ? '16px 18px' : '20px 22px'}; transition:box-shadow 0.15s ease; position:relative;`}
      onmouseover="this.style.boxShadow='0 4px 20px rgba(0,0,0,0.07)'"
      onmouseout="this.style.boxShadow='none'"
    >
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
            <span
              style="cursor:pointer; font-size:11px; font-family:ui-monospace,monospace; font-weight:700; color:#78716C; letter-spacing:0.04em;"
              title="Click to copy reference"
              onclick="var t=this;navigator.clipboard.writeText(t.textContent.trim()).then(function(){t.style.color='#22C55E';setTimeout(function(){t.style.color='#78716C'},1200)});"
            >
              {b.referenceNumber}
            </span>
            <span style={`font-size:10px; font-weight:600; padding:2px 7px; border-radius:9999px; ${statusStyle}`}>{b.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
            {b.icsStatus && b.icsStatus !== 'unavailable' && <IcsBadge status={b.icsStatus} />}
          </div>
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:5px; font-size:12.5px; color:#1C1917; font-weight:500;">
              <Icon name={ICONS.calendar} size={13} style="color:var(--brand-color);" />
              {b.slotDate}
            </div>
            <div style="display:flex; align-items:center; gap:5px; font-size:12.5px; color:#57534E;">
              <Icon name={ICONS.clock} size={13} style="color:#78716C;" />
              {b.slotStartTime}–{b.slotEndTime}
            </div>
            <span style="font-size:12px; color:#A8A29E;">
              {b.serviceType === 'pickup' ? '↑ Pick Up' : '↓ Drop Off'} · {b.loadType.toUpperCase()}
            </span>
          </div>
          {!compact && b.houseBillNumber && (
            <p style="font-size:11px; font-family:ui-monospace,monospace; color:#A8A29E; margin:6px 0 0;">HBL: {b.houseBillNumber}</p>
          )}
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px; flex-shrink:0;">
          {b.totalAmount && (
            <span style="font-size:13px; font-weight:700; color:#1C1917;">${b.totalAmount.toFixed(2)}</span>
          )}
          <a href={`/bookings/${b.referenceNumber}`}
            style="display:inline-flex; align-items:center; gap:4px; font-size:11.5px; font-weight:600; color:var(--brand-color); text-decoration:none;"
            onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'"
          >
            View <Icon name={ICONS.arrowRight} size={11} />
          </a>
          {canCancel && (
            <button
              type="button"
              {...{"x-on:click.stop": "cancelModal = true"}}
              style="font-size:11px; font-weight:500; color:#DC2626; background:none; border:none; cursor:pointer; padding:0; opacity:0.75; transition:opacity 0.15s ease;"
              onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.75'"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Cancel confirm modal */}
      {canCancel && (
        <div
          x-show="cancelModal"
          x-cloak
          style="position:fixed; inset:0; z-index:999; display:flex; align-items:center; justify-content:center; padding:16px; background:rgba(0,0,0,0.50); backdrop-filter:blur(4px);"
        >
          <div style="background:#FFFFFF; border-radius:16px; padding:28px; max-width:380px; width:100%; box-shadow:0 16px 48px rgba(0,0,0,0.20);">
            <h3 style="font-size:16px; font-weight:700; color:#1C1917; margin-bottom:6px;">Cancel this booking?</h3>
            <p style="font-size:13px; color:#78716C; margin-bottom:6px; line-height:1.5;">
              You're cancelling booking <strong style="font-family:ui-monospace,monospace; color:#1C1917;">{b.referenceNumber}</strong> on {b.slotDate}.
            </p>
            <p style="font-size:12px; color:#A8A29E; margin-bottom:24px;">This cannot be undone.</p>
            <div style="display:flex; gap:10px;">
              <button type="button" x-on:click="cancelModal = false"
                style="flex:1; padding:10px 16px; font-size:13px; font-weight:500; background:#F5F4F3; border:1px solid rgba(0,0,0,0.10); border-radius:9px; cursor:pointer; color:#1C1917;">
                Keep Booking
              </button>
              <form method="post" action={`/bookings/${b.referenceNumber}/cancel`} style="flex:1;">
                <button type="submit"
                  style="width:100%; padding:10px 16px; font-size:13px; font-weight:600; background:rgba(239,68,68,0.10); border:1px solid rgba(239,68,68,0.28); border-radius:9px; cursor:pointer; color:#DC2626;">
                  Yes, Cancel
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* ICS held warning */}
      {b.icsStatus === 'held' && (
        <div style="display:flex; align-items:flex-start; gap:8px; margin-top:12px; padding:10px 12px; background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.16); border-radius:9px;">
          <Icon name={ICONS.warning} size={14} style="color:#EF4444; flex-shrink:0; margin-top:1px;" />
          <p style="font-size:11.5px; color:#DC2626; margin:0; line-height:1.5;">
            Your shipment is currently held by customs. Contact your freight forwarder to resolve. You may still proceed to the depot but cargo will not be released until cleared.
          </p>
        </div>
      )}
      {/* CHEP reminder */}
      {b.palletType === 'chep' && b.palletCount && isUpcoming && (
        <div style="display:flex; align-items:center; gap:8px; margin-top:10px; padding:8px 12px; background:rgba(251,191,36,0.08); border:1px solid rgba(251,191,36,0.20); border-radius:9px;">
          <Icon name={ICONS.warning} size={13} style="color:#FBBF24; flex-shrink:0;" />
          <p style="font-size:11.5px; color:#B45309; margin:0;">
            Remember: bring {b.palletCount} empty CHEP pallet{b.palletCount > 1 ? 's' : ''} on arrival.
          </p>
        </div>
      )}
    </div>
  )
}

export const VisitorDashboard = ({ user, upcoming, past }: Props) => {
  const firstName = user.firstName ?? user.email.split('@')[0]
  const heldCount = upcoming.filter(b => b.icsStatus === 'held').length
  const todayStr = new Date().toISOString().split('T')[0]
  const todayBooking = upcoming.find(b => b.slotDate === todayStr)

  return (
    <div style="min-height:calc(100vh - 56px - 64px); background:#F7F6F5; padding:32px 24px 64px;">
      <div style="max-width:860px; margin:0 auto;">

        {/* ── Welcome banner ── */}
        <div style="background:linear-gradient(135deg,#1C1917 0%,#292524 100%); border-radius:20px; padding:32px 36px; margin-bottom:24px; position:relative; overflow:hidden;">
          <div style="position:absolute; top:-20px; right:-20px; width:160px; height:160px; background:radial-gradient(circle,rgba(var(--brand-rgb),0.25) 0%,transparent 70%); pointer-events:none;" />
          <p style="font-size:11px; font-weight:700; letter-spacing:0.10em; text-transform:uppercase; color:rgba(var(--brand-rgb),0.70); margin:0 0 8px;">Welcome back</p>
          <h1 style="font-size:clamp(1.4rem,2.5vw,1.9rem); font-weight:800; color:#fff; letter-spacing:-0.04em; margin:0 0 6px;">{firstName}</h1>
          <p style="font-size:13px; color:rgba(255,255,255,0.45); margin:0 0 24px;">{user.email}</p>

          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <a href="/book" class="btn-primary" style="padding:10px 20px; font-size:13px; gap:6px;">
              <Icon name={ICONS.calendar} size={13} />
              Book a New Visit
              <Icon name={ICONS.arrowRight} size={13} />
            </a>
            <a href="/bookings" style="display:inline-flex; align-items:center; gap:6px; padding:10px 18px; font-size:13px; font-weight:600; color:rgba(255,255,255,); border:1.5px solid rgba(255,255,255,0.20); border-radius:9999px; text-decoration:none; transition:all 0.15s ease;"
              onmouseover="this.style.borderColor='rgba(255,255,255,0.50)'"
              onmouseout="this.style.borderColor='rgba(255,255,255)'"
            >
              <Icon name={ICONS.search} size={13} />
              Look Up Booking
            </a>
          </div>
        </div>

        {/* ── ICS held alert ── */}
        {heldCount > 0 && (
          <div style="display:flex; align-items:flex-start; gap:12px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.22); border-radius:14px; padding:16px 20px; margin-bottom:20px;">
            <Icon name={ICONS.warning} size={18} style="color:#EF4444; flex-shrink:0; margin-top:1px;" />
            <div>
              <p style="font-size:13px; font-weight:600; color:#DC2626; margin:0 0 3px;">
                {heldCount} shipment{heldCount > 1 ? 's' : ''} require{heldCount === 1 ? 's' : ''} your attention
              </p>
              <p style="font-size:12px; color:rgba(220,38,38,0.75); margin:0;">
                One or more upcoming bookings have a customs hold. Contact your freight forwarder to resolve before your visit.
              </p>
            </div>
          </div>
        )}

        {/* ── Today's booking (if any) ── */}
        {todayBooking && (
          <div style="margin-bottom:24px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
              <span style="width:6px; height:6px; border-radius:9999px; background:#22C55E; animation:pulse-dot 2s ease-in-out infinite;" />
              <p style="font-size:11px; font-weight:700; letter-spacing:0.10em; text-transform:uppercase; color:var(--brand-color); margin:0;">Today's Visit</p>
            </div>
            <BookingCard b={todayBooking} />
          </div>
        )}

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; align-items:start;" class="dashboard-grid">

          {/* ── Upcoming ── */}
          <div>
            <p style="font-size:11px; font-weight:700; letter-spacing:0.10em; text-transform:uppercase; color:#A8A29E; margin:0 0 12px;">Upcoming Bookings</p>
            {upcoming.filter(b => b.slotDate !== todayStr).length === 0 ? (
              <div style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; padding:32px 20px; text-align:center;">
                <div style="width:40px; height:40px; border-radius:11px; background:#FFF3EC; border:1px solid rgba(var(--brand-rgb),0.14); display:flex; align-items:center; justify-content:center; margin:0 auto 12px;">
                  <Icon name={ICONS.calendar} size={18} style="color:var(--brand-color);" />
                </div>
                <p style="font-size:13px; font-weight:500; color:#1C1917; margin:0 0 4px;">No upcoming visits</p>
                <p style="font-size:12px; color:#A8A29E; margin:0 0 16px;">Ready to book your next one?</p>
                <a href="/book" class="btn-primary" style="padding:9px 18px; font-size:12.5px; gap:6px;">
                  <Icon name={ICONS.calendar} size={12} />
                  Book a Visit
                </a>
              </div>
            ) : (
              <div style="display:flex; flex-direction:column; gap:10px;">
                {upcoming.filter(b => b.slotDate !== todayStr).map(b => (
                  <BookingCard key={b.id} b={b} compact />
                ))}
              </div>
            )}
          </div>

          {/* ── Past ── */}
          <div>
            <p style="font-size:11px; font-weight:700; letter-spacing:0.10em; text-transform:uppercase; color:#A8A29E; margin:0 0 12px;">Recent History</p>
            {past.length === 0 ? (
              <div style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; padding:28px 20px; text-align:center;">
                <p style="font-size:12px; color:#A8A29E; margin:0;">No past bookings yet.</p>
              </div>
            ) : (
              <div style="display:flex; flex-direction:column; gap:10px;">
                {past.slice(0, 5).map(b => (
                  <BookingCard key={b.id} b={b} compact />
                ))}
                {past.length > 5 && (
                  <a href="/bookings" style="text-align:center; font-size:12px; font-weight:600; color:var(--brand-color); text-decoration:none; padding:12px;"
                    onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'"
                  >
                    View all {past.length} bookings <Icon name={ICONS.arrowRight} size={12} />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Responsive */}
      <style>{`
        @media (max-width:640px) {
          .dashboard-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
