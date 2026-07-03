import { Badge } from '../ui/badge'
import { Icon, ICONS } from '../../lib/Icon'
import { STATUS_LABEL, STATUS_BADGE_VARIANT, SERVICE_LABEL, LOAD_LABEL, ICS_BADGE_CLASS, ICS_LABEL } from '../../lib/constants'
import type { Booking } from '../../data/types'

interface Props {
  booking: Booking
}

type StatusVariant = 'warning' | 'default' | 'success' | 'secondary' | 'outline' | 'destructive'

const CARD  = 'background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.07); margin-bottom:16px;'
const SL    = 'font-size:14px; font-weight:700; color:#374151; text-transform:uppercase; letter-spacing:0.09em; margin-bottom:12px;'
const RL    = 'display:flex; align-items:center; gap:6px; font-size:15px; color:#4B5563;'
const RV    = 'font-size:16px; font-weight:600; color:#1C1917;'
const DIVIDER = 'border:none; border-top:1px solid rgba(0,0,0,0.06); margin:10px 0;'

export const BookingDetailPage = ({ booking: b }: Props) => (
  <div
    id="booking-detail-page"
    x-data="{ confirmModal: false, cancelModal: false, rescheduleModal: false, completionNotes: '', guestEmail: '' }"
  >
    {/* ── Breadcrumb + title ── */}
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; flex-wrap:wrap; gap:12px;">
      <div style="display:flex; align-items:center; gap:14px;">
        <a
          href="/reception/bookings"
          style="display:inline-flex; align-items:center; gap:5px; font-size:15px; font-weight:600; color:#4B5563; text-decoration:none; transition:color 0.14s ease;"
          onmouseover="this.style.color='#1C1917'"
          onmouseout="this.style.color='#4B5563'"
        >
          <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
            <path d="M9 11L5 7l4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Bookings
        </a>
        <span style="color:rgba(0,0,0,0.15); font-size:14px;">/</span>
        <span
          style="font-family:ui-monospace,monospace; font-size:16px; font-weight:700; color:var(--brand-color); cursor:pointer; display:inline-flex; align-items:center; gap:6px;"
          title="Click to copy"
          onclick={`navigator.clipboard.writeText('${b.referenceNumber}').then(function(){window.gToast&&window.gToast('Reference copied','info')});`}
        >
          {b.referenceNumber}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </span>
        <Badge variant={STATUS_BADGE_VARIANT[b.status] as StatusVariant}>
          {STATUS_LABEL[b.status]}
        </Badge>
      </div>
      <p style="font-size:14px; color:#4B5563;">
        Created {new Date(b.createdAt).toLocaleString('en-AU', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
      </p>
    </div>

    {/* ── 2-col layout ── */}
    <div style="display:grid; grid-template-columns:1fr 300px; gap:20px; align-items:flex-start;">

      {/* ── LEFT column ── */}
      <div>

        {/* Driver */}
        <div style={CARD}>
          <p style={SL}>Driver / Visitor</p>
          <div style="display:flex; flex-direction:column; gap:10px;">
            {[
              { label: 'Driver', value: b.driverName,                    icon: ICONS.user   },
              { label: 'Phone',  value: b.driverPhone || '—',            icon: ICONS.phone  },
              { label: 'Guest',  value: b.guestName  || b.driverName,    icon: ICONS.users  },
            ].map((row) => (
              <div key={row.label} style="display:flex; justify-content:space-between; align-items:center;">
                <span style={RL}><Icon name={row.icon} size={14} style="color:#433F3D;" />{row.label}</span>
                <span style={RV}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Slot */}
        <div style={CARD}>
          <p style={SL}>Slot</p>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <p style="font-size:13px; color:#4B5563; margin-bottom:4px; font-weight:500;">Date</p>
              <p style="font-size:16px; font-weight:600; color:#1C1917; display:flex; align-items:center; gap:6px;">
                <Icon name={ICONS.calendar} size={15} style="color:#433F3D;" />{b.slotDate}
              </p>
            </div>
            <div>
              <p style="font-size:13px; color:#4B5563; margin-bottom:4px; font-weight:500;">Time</p>
              <p style="font-size:16px; font-weight:600; color:#1C1917; display:flex; align-items:center; gap:6px;">
                <Icon name={ICONS.clock} size={15} style="color:#433F3D;" />{b.slotStartTime} – {b.slotEndTime}
              </p>
            </div>
            <div>
              <p style="font-size:13px; color:#4B5563; margin-bottom:4px; font-weight:500;">Service</p>
              <p style="font-size:16px; font-weight:600; color:#1C1917;">{SERVICE_LABEL[b.serviceType]}</p>
            </div>
            <div>
              <p style="font-size:13px; color:#4B5563; margin-bottom:4px; font-weight:500;">Load Type</p>
              <p style="font-size:16px; font-weight:600; color:#1C1917;">{LOAD_LABEL[b.loadType]}</p>
            </div>
          </div>
        </div>

        {/* Shipment */}
        <div style={CARD}>
          <p style={SL}>Shipment</p>
          <div style="display:flex; flex-direction:column; gap:10px;">
            {b.houseBillNumber && (
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style={RL}><Icon name={ICONS.document} size={15} style="color:#433F3D;" />HBL</span>
                <span style="font-family:ui-monospace,monospace; font-size:16px; font-weight:700; color:#4B5563;">{b.houseBillNumber}</span>
              </div>
            )}
            {b.containerNumber && (
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style={RL}><Icon name={ICONS.container} size={15} style="color:#433F3D;" />Container</span>
                <span style="font-family:ui-monospace,monospace; font-size:16px; font-weight:700; color:#4B5563;">{b.containerNumber}</span>
              </div>
            )}
            {b.weightKg && (
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style={RL}><Icon name={ICONS.cargo} size={14} style="color:#433F3D;" />Weight</span>
                <span style={RV}>{b.weightKg.toLocaleString()} kg</span>
              </div>
            )}
            {b.volumeCbm && (
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style={RL}><Icon name={ICONS.layers} size={14} style="color:#433F3D;" />Volume</span>
                <span style={RV}>{b.volumeCbm} CBM</span>
              </div>
            )}
            {b.packageCount && (
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style={RL + " padding-left:20px;"}>Packages</span>
                <span style={RV}>{b.packageCount} pkgs</span>
              </div>
            )}
            {b.palletCount !== undefined && b.palletCount > 0 && (
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style={RL + " padding-left:20px;"}>Pallets</span>
                <span style={RV}>{b.palletCount} × {b.palletType}</span>
              </div>
            )}
          </div>
          {b.palletType === 'chep' && (
            <div style="margin-top:14px; background:rgba(251,191,36,0.07); border:1px solid rgba(251,191,36,0.20); border-radius:10px; padding:12px 16px; display:flex; align-items:flex-start; gap:10px;">
              <Icon name={ICONS.warning} size={15} style="color:#FBBF24; flex-shrink:0; margin-top:1px;" />
              <div>
                <p style="font-size:13px; font-weight:600; color:#B45309; margin-bottom:2px;">CHEP Pallet Exchange</p>
                <p style="font-size:12px; color:#92400E;">{b.palletCount} CHEP pallet{(b.palletCount || 0) > 1 ? 's' : ''} must be exchanged at collection.</p>
              </div>
            </div>
          )}
        </div>

        {/* ICS */}
        {b.icsStatus && (
          <div style={CARD}>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
              <p style={SL + " margin-bottom:0;"}>ICS Status</p>
              <div style="display:flex; align-items:center; gap:12px;">
                <button
                  type="button"
                  style="font-size:12px; color:var(--brand-color); background:none; border:none; cursor:pointer; display:flex; align-items:center; gap:4px; font-weight:500;"
                  hx-post={`/reception/bookings/${b.id}/refresh-ics`}
                  hx-target="#booking-detail-page"
                  hx-swap="outerHTML"
                >
                  <Icon name={ICONS.refresh} size={12} />Refresh ICS
                </button>
                <a href="https://ics.abf.gov.au" target="_blank" style="font-size:12px; color:var(--brand-color); text-decoration:none; display:flex; align-items:center; gap:4px; font-weight:500;">
                  Open portal <Icon name={ICONS.arrowRight} size={12} />
                </a>
              </div>
            </div>
            <span class={`inline-flex items-center px-3 py-1 rounded-full border ${ICS_BADGE_CLASS[b.icsStatus]}`} style="font-size:13px; font-weight:600;">
              {ICS_LABEL[b.icsStatus]}
            </span>
            {b.icsLastCheckedAt && (
              <p style="font-size:11px;c3F3D; margin-top:8px;">
                Last checked: {new Date(b.icsLastCheckedAt).toLocaleString('en-AU')}
              </p>
            )}
          </div>
        )}

      </div>{/* end left */}

      {/* ── RIGHT column ── */}
      <div>

        {/* Charges */}
        {b.totalAmount && (
          <div style={CARD}>
            <p style={SL}>Charges</p>
            <div style="display:flex; flex-direction:column; gap:8px; font-size:13px;">
              {b.storageCharge !== undefined && b.storageCharge > 0 && (
                <div style="display:flex; justify-content:space-between; color:#78716C;">
                  <span>Storage ({b.storageDays} days)</span>
                  <span>${b.storageCharge.toFixed(2)}</span>
                </div>
              )}
              {b.shrinkWrapCharge !== undefined && b.shrinkWrapCharge > 0 && (
                <div style="display:flex; justify-content:space-between; color:#78716C;">
                  <span>Shrink wrap</span>
                  <span>${b.shrinkWrapCharge.toFixed(2)}</span>
                </div>
              )}
              {b.slotFee !== undefined && (
                <div style="display:flex; justify-content:space-between; color:#78716C;">
                  <span>Slot fee</span>
                  <span>${b.slotFee.toFixed(2)}</span>
                </div>
              )}
              {b.gstAmount !== undefined && (
                <div style="display:flex; justify-content:space-between; font-size:12px;c3F3D; padding-top:8px; border-top:1px solid rgba(0,0,0,0.07);">
                  <span>GST (10%)</span>
                  <span>${b.gstAmount.toFixed(2)}</span>
                </div>
              )}
              <div style="display:flex; justify-content:space-between; font-weight:700; color:#1C1917; padding-top:8px; border-top:1px solid rgba(0,0,0,0.09); font-size:14px;">
                <span>Total</span>
                <span style="color:var(--brand-color);">${b.totalAmount.toFixed(2)}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:12px;c3F3D; margin-top:2px;">
                <span>{b.paymentMethod?.toUpperCase() || '—'}</span>
                <span style={b.paymentStatus === 'paid' ? 'color:#22C55E; font-weight:600;' : 'color:#FBBF24; font-weight:600;'}>
                  {b.paymentStatus === 'paid' ? '✓ Paid' : b.paymentStatus === 'pending_eft' ? 'EFT Pending' : b.paymentStatus}
                </span>
              </div>
            </div>
            {b.paymentStatus === 'pending_eft' && (
              <button
                type="button"
                style="width:100%; margin-top:14px; background:rgba(var(--brand-rgb),0.10); color:var(--brand-color); border:1px solid rgba(var(--brand-rgb),0.25); border-radius:10px; padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer;"
                hx-post={`/reception/bookings/${b.id}/mark-eft-paid`}
                hx-target="#booking-detail-page"
                hx-swap="outerHTML"
              >
                Mark EFT as Paid
              </button>
            )}
          </div>
        )}

        {/* Timeline */}
        <div style={CARD}>
          <p style={SL}>Timeline</p>
          <div style="display:flex; flex-direction:column; gap:10px; font-size:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="display:flex; align-items:center; gap:6px; color:#78716C;"><Icon name={ICONS.document} size={13} style="color:#433F3D;" />Created</span>
              <span style="color:#1C1917; font-weight:500;">{new Date(b.createdAt).toLocaleString('en-AU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
            </div>
            {b.paymentStatus === 'paid' && (
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="display:flex; align-items:center; gap:6px; color:#78716C;"><Icon name={ICONS.check} size={13} style="color:#22C55E;" />Payment</span>
                <span style="color:#22C55E; font-weight:500;">Received</span>
              </div>
            )}
            {b.checkedInAt && (
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="display:flex; align-items:center; gap:6px; color:#78716C;"><Icon name={ICONS.userCheck} size={13} style="color:#FBBF24;" />Checked In</span>
                <span style="color:#1C1917; font-weight:500;">{new Date(b.checkedInAt).toLocaleString('en-AU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
              </div>
            )}
            {b.completedAt && (
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="display:flex; align-items:center; gap:6px; color:#78716C;"><Icon name={ICONS.checkSquare} size={13} style="color:#22C55E;" />Completed</span>
                <span style="color:#1C1917; font-weight:500;">{new Date(b.completedAt).toLocaleString('en-AU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {(b.status === 'scheduled' || b.status === 'checked_in') && (
          <div style={CARD}>
            <p style={SL}>Actions</p>
            <div style="display:flex; flex-direction:column; gap:8px;">
              {b.status === 'scheduled' && (
                <button
                  type="button"
                  class="btn-success"
                  style="width:100%; justify-content:center;"
                  hx-post={`/reception/bookings/${b.id}/check-in`}
                  hx-target="#booking-detail-page"
                  hx-swap="outerHTML"
                >
                  <Icon name={ICONS.userCheck} size={16} />Check In Visitor
                </button>
              )}
              {b.status === 'checked_in' && (
                <button
                  type="button"
                  class="btn-primary"
                  style="width:100%; justify-content:center;"
                  x-on:click="confirmModal = true"
                >
                  <Icon name={ICONS.checkSquare} size={16} />Mark Complete
                </button>
              )}
              {b.status === 'scheduled' && (
                <button
                  type="button"
                  class="btn-danger-outline"
                  style="width:100%; justify-content:center;"
                  x-on:click="rescheduleModal = true"
                >
                  <Icon name={ICONS.calendar} size={14} />Reschedule
                </button>
              )}
              <button
                type="button"
                class="btn-danger-outline"
                style="width:100%; justify-content:center;"
                x-on:click="cancelModal = true"
              >
                <Icon name={ICONS.close} size={14} />Cancel Booking
              </button>
            </div>
          </div>
        )}

      </div>{/* end right */}
    </div>

    {/* ── Modals — x-show on outer (block/none only), flex centering on inner child ── */}

    {/* Reschedule */}
    <template x-teleport="body">
      <div x-show="rescheduleModal" x-cloak style="position:fixed; inset:0; z-index:9999;">
        <div style="position:absolute; inset:0; background:rgba(0,0,0,0.65); backdrop-filter:blur(6px);"></div>
        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:16px;">
          <div style="background:#FFFFFF; border-radius:16px; box-shadow:0 24px 64px rgba(0,0,0,0.28); max-width:400px; width:100%; padding:24px; position:relative;">
            <h3 style="font-size:17px; font-weight:700; color:#1C1917; margin-bottom:6px;">Reschedule Booking</h3>
            <p style="font-size:13px; color:#78716C; margin-bottom:20px; line-height:1.5;">Change the slot for <strong style="color:#1C1917; font-family:ui-monospace,monospace;">{b.referenceNumber}</strong>.</p>
            <div style="display:flex; flex-direction:column; gap:14px; margin-bottom:20px;">
              <div>
                <label style="display:block; font-size:10px; font-weight:700; color:#78716C; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px;">New Date</label>
                <input type="date" id={`rs-date-${b.id}`} name="newDate" style="width:100%; padding:10px 14px; font-size:14px; color:#1C1917; background:#EBEBEA; border:1px solid rgba(0,0,0,0.10); border-radius:10px; outline:none; box-sizing:border-box;" onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'" />
              </div>
              <div>
                <label style="display:block; font-size:10px; font-weight:700; color:#78716C; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px;">New Start Time</label>
                <input type="time" id={`rs-time-${b.id}`} name="newStart" style="width:100%; padding:10px 14px; font-size:14px; color:#1C1917; background:#EBEBEA; border:1px solid rgba(0,0,0,0.10); border-radius:10px; outline:none; box-sizing:border-box;" onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'" />
              </div>
            </div>
            <div style="display:flex; gap:10px;">
              <button type="button" style="flex:1; padding:10px 16px; font-size:13px; font-weight:500; border:1px solid rgba(0,0,0,0.12); background:transparent; border-radius:10px; cursor:pointer; color:#78716C;" x-on:click="rescheduleModal = false">Cancel</button>
              <button type="button" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:10px 16px; font-size:13px; font-weight:600; border:none; cursor:pointer; background:linear-gradient(180deg,#FF7A2A 0%,#E85A0A 100%); color:#fff; border-radius:10px; box-shadow:0 4px 14px rgba(var(--brand-rgb),0.30);"
                hx-post={`/reception/bookings/${b.id}/reschedule`}
                hx-target="#booking-detail-page"
                hx-swap="outerHTML"
                hx-include={`#rs-date-${b.id},#rs-time-${b.id}`}
                x-on:click="rescheduleModal = false"
              >
                <Icon name={ICONS.calendar} size={14} />Confirm Reschedule
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    {/* Cancel */}
    <template x-teleport="body">
      <div x-show="cancelModal" x-cloak style="position:fixed; inset:0; z-index:9999;">
        <div style="position:absolute; inset:0; background:rgba(0,0,0,0.65); backdrop-filter:blur(6px);"></div>
        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:16px;">
          <div style="background:#FFFFFF; border-radius:16px; box-shadow:0 24px 64px rgba(0,0,0,0.28); max-width:380px; width:100%; padding:24px; position:relative;">
            <h3 style="font-size:17px; font-weight:700; color:#1C1917; margin-bottom:6px;">Cancel this booking?</h3>
            <p style="font-size:13px; color:#78716C; margin-bottom:20px; line-height:1.5;">You are cancelling <strong style="font-family:ui-monospace,monospace; color:#1C1917;">{b.referenceNumber}</strong> for <strong style="color:#1C1917;">{b.driverName}</strong>. This cannot be undone.</p>
            <div style="display:flex; gap:10px;">
              <button type="button" class="btn-primary-white" style="flex:1; justify-content:center;" x-on:click="cancelModal = false">Keep Booking</button>
              <button type="button" class="btn-danger" style="flex:1; justify-content:center;"
                hx-post={`/reception/bookings/${b.id}/cancel`}
                hx-target="#booking-detail-page"
                hx-swap="outerHTML"
                x-on:click="cancelModal = false"
              >
                <Icon name={ICONS.close} size={14} />Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    {/* Mark Complete */}
    <template x-teleport="body">
      <div x-show="confirmModal" x-cloak style="position:fixed; inset:0; z-index:9999;">
        <div style="position:absolute; inset:0; background:rgba(0,0,0,0.65); backdrop-filter:blur(6px);"></div>
        <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:16px;">
          <div style="background:#FFFFFF; border-radius:16px; box-shadow:0 24px 64px rgba(0,0,0,0.28); max-width:420px; width:100%; padding:24px; position:relative;">
            <h3 style="font-size:17px; font-weight:700; color:#1C1917; margin-bottom:6px;">Complete this job?</h3>
            <p style="font-size:13px; color:#78716C; margin-bottom:20px; line-height:1.5;">Marking <strong style="color:#1C1917;">{b.driverName}</strong>'s visit as complete. This action is final.</p>
            <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px;">
              {['Driver identity verified', 'Documents checked', 'Cargo released'].map((item) => (
                <div key={item} style="display:flex; align-items:center; gap:10px; font-size:13px; color:#1C1917;">
                  <span style="width:20px; height:20px; border-radius:9999px; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.22);">
                    <Icon name={ICONS.check} size={11} style="color:#22C55E;" />
                  </span>
                  {item}
                </div>
              ))}
            </div>
            <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
              <div>
                <label style="display:block; font-size:10px; font-weight:700;c3F3D; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px;">Completion Notes (optional)</label>
                <textarea id={`cn-notes-${b.id}`} name="completionNotes" rows={2} x-model="completionNotes" placeholder="Any notes for records..." style="width:100%; padding:10px 14px; font-size:13px; resize:none; box-sizing:border-box; background:#EBEBEA; border:1px solid rgba(0,0,0,0.10); border-radius:10px; outline:none;" onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'"></textarea>
              </div>
              <div>
                <label style="display:block; font-size:10px; font-weight:700;c3F3D; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px;">Notify Guest by Email (optional)</label>
                <input id={`cn-email-${b.id}`} name="guestEmail" type="email" x-model="guestEmail" placeholder="guest@example.com" style="width:100%; padding:10px 14px; font-size:13px; box-sizing:border-box; background:#EBEBEA; border:1px solid rgba(0,0,0,0.10); border-radius:10px; outline:none;" onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'" />
              </div>
            </div>
            <div style="display:flex; gap:10px;">
              <button type="button" class="btn-danger-outline" style="flex:1; justify-content:center;" x-on:click="confirmModal = false">Cancel</button>
              <button type="button"
                class="btn-primary"
                style="flex:1; justify-content:center;"
                hx-post={`/reception/bookings/${b.id}/complete`}
                hx-target="#booking-detail-page"
                hx-swap="outerHTML"
                hx-include={`#cn-notes-${b.id},#cn-email-${b.id}`}
                x-on:click="confirmModal = false"
              >
                <Icon name={ICONS.check} size={16} />Confirm Complete
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

  </div>
)
