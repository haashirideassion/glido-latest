const TABS = ['General', 'Working Hours', 'Slot Configuration', 'Pricing & Charges', 'Payment', 'Integrations', 'Users', 'Staff Permissions']

// 30-min increments 05:00 → 23:00
const TIME_OPTIONS: string[] = Array.from({ length: 37 }, (_, i) => {
  const total = 5 * 60 + i * 30
  const h = String(Math.floor(total / 60)).padStart(2, '0')
  const m = String(total % 60).padStart(2, '0')
  return `${h}:${m}`
})

const labelStyle = 'display:block; font-size:10px; font-weight:700; color:#78716C; letter-spacing:0.09em; text-transform:uppercase; margin-bottom:8px;'
const inputStyle = 'width:100%; padding:11px 14px; font-size:14px; color:#1C1917; background:#EBEBEA; border:1px solid rgba(0,0,0,0.10); border-radius:10px; outline:none; transition:border-color 0.15s ease, box-shadow 0.15s ease; box-sizing:border-box;'
const inputFocus = `onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'; this.style.boxShadow='0 0 0 3px rgba(var(--brand-rgb),0.12)';" onblur="this.style.borderColor='rgba(0,0,0,0.10)'; this.style.boxShadow='none';"`
const cardStyle = 'background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.07); margin-bottom:20px;'
const saveBtn = 'display:inline-flex; align-items:center; gap:8px; padding:11px 24px; background:linear-gradient(180deg,#FF7A2A 0%,#E85A0A 100%); color:white; border:none; border-radius:10px; font-size:13px; font-weight:600; cursor:pointer; box-shadow:inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 14px rgba(var(--brand-rgb),0.40), 0 1px 3px rgba(0,0,0,0.40); margin-top:20px; transition:box-shadow 0.15s ease;'

export const SettingsView = ({ activeTab = 'General', tenant, users }: { activeTab?: string; tenant?: any; users?: any[] }) => (
  <div x-data={`{ tab: '${activeTab}' }`}>

    {/* ── Tab switcher ── CSS classes toggled by x-bind:class, no x-bind:style conflicts ── */}
    <style>{`
      .stab-track {
        display: flex;
        gap: 2px;
        background: #EBEBEA;
        border-radius: 12px;
        padding: 4px;
        margin-bottom: 28px;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .stab-track::-webkit-scrollbar { display: none; }
      .stab-btn {
        flex: 1;
        padding: 9px 8px;
        font-size: 13px;
        font-weight: 500;
        color: #78716C;
        background: transparent;
        border: none;
        border-radius: 8px;
        white-space: nowrap;
        cursor: pointer;
        text-align: center;
        transition: color 0.15s ease;
      }
      .stab-btn:hover { color: #1C1917; }
      .stab-btn.is-active {
        background: #FFFFFF;
        color: #1C1917;
        font-weight: 600;
        box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
      }

    `}</style>

    <div class="stab-track">
      {TABS.map((t) => (
        <button
          key={t}
          type="button"
          class="stab-btn"
          x-bind:class={`tab === '${t}' ? 'is-active' : ''`}
          x-on:click={`tab = '${t}'`}
        >
          {t}
        </button>
      ))}
    </div>

    {/* ── General ── */}
    <div x-show={`tab === 'General'`} style="max-width:884px; margin:0 auto;">
      <form method="post" action="/reception/settings">
        <input type="hidden" name="tab" value="General" />
        <div style={cardStyle}>
          <p style="font-size:15px; font-weight:600; color:#1C1917; margin-bottom:18px; letter-spacing:-0.01em;">General Settings</p>
          <div style="display:flex; flex-direction:column; gap:16px;">
            <div>
              <label style={labelStyle}>Name</label>
              <input type="text" name="name" value={tenant?.name ?? ''} style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'; this.style.boxShadow='0 0 0 3px rgba(var(--brand-rgb),0.12)';" onblur="this.style.borderColor='rgba(0,0,0,0.10)'; this.style.boxShadow='none';" />
            </div>
            <div>
              <label style={labelStyle}>Address</label>
              <textarea name="address" rows={3} style={`${inputStyle} resize:vertical;`} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'; this.style.boxShadow='0 0 0 3px rgba(var(--brand-rgb),0.12)';" onblur="this.style.borderColor='rgba(0,0,0,0.10)'; this.style.boxShadow='none';">{tenant?.address ?? ''}</textarea>
            </div>
            <div>
              <label style={labelStyle}>Contact Email</label>
              <input type="email" name="contact_email" value={tenant?.contact_email ?? ''} style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'; this.style.boxShadow='0 0 0 3px rgba(var(--brand-rgb),0.12)';" onblur="this.style.borderColor='rgba(0,0,0,0.10)'; this.style.boxShadow='none';" />
            </div>
            <div>
              <label style={labelStyle}>Contact Phone</label>
              <input type="tel" name="contact_phone" value={tenant?.contact_phone ?? ''} style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'; this.style.boxShadow='0 0 0 3px rgba(var(--brand-rgb),0.12)';" onblur="this.style.borderColor='rgba(0,0,0,0.10)'; this.style.boxShadow='none';" />
            </div>
            <div>
              <label style={labelStyle}>Timezone</label>
              <select name="timezone" style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'; this.style.boxShadow='0 0 0 3px rgba(var(--brand-rgb),0.12)';" onblur="this.style.borderColor='rgba(0,0,0,0.10)'; this.style.boxShadow='none';">
                {['Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth', 'Asia/Kolkata'].map((tz) => (
                  <option key={tz} value={tz} selected={tenant?.timezone === tz}>{tz}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Currency</label>
              <select name="currency" style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'; this.style.boxShadow='0 0 0 3px rgba(var(--brand-rgb),0.12)';" onblur="this.style.borderColor='rgba(0,0,0,0.10)'; this.style.boxShadow='none';">
                {['AUD', 'INR'].map((c) => (
                  <option key={c} value={c} selected={tenant?.currency === c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" style={saveBtn}>Save Changes</button>
        </div>
      </form>
    </div>

    {/* ── Slot Configuration ── */}
    <div x-show={`tab === 'Slot Configuration'`} style="max-width:884px; margin:0 auto;">
      <form method="post" action="/reception/settings">
        <input type="hidden" name="tab" value="Slot Configuration" />
        <div style={cardStyle}>
          <p style="font-size:15px; font-weight:600; color:#1C1917; margin-bottom:18px; letter-spacing:-0.01em;">Slot Configuration</p>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            {[
              { label: 'Slot Duration (min)',      name: 'slot_duration_min',       val: tenant?.slot_duration_min      ?? 60,    type: 'number' },
              { label: 'Max Bookings per Slot',    name: 'max_bookings_per_slot',   val: tenant?.max_bookings_per_slot  ?? 5,     type: 'number' },
              { label: 'Advance Booking Days',     name: 'advance_booking_days',    val: tenant?.advance_booking_days   ?? 7,     type: 'number' },
              { label: 'Slot Hold Duration (min)', name: 'slot_hold_duration_min',  val: tenant?.slot_hold_duration_min ?? 10,    type: 'number' },
              { label: 'Same-Day Cutoff Time',     name: 'same_day_cutoff_time',    val: tenant?.same_day_cutoff_time   ?? '09:00', type: 'time' },
            ].map((f) => (
              <div key={f.name}>
                <label style={labelStyle}>{f.label}</label>
                <input type={f.type} name={f.name} value={f.val} style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'; this.style.boxShadow='0 0 0 3px rgba(var(--brand-rgb),0.12)';" onblur="this.style.borderColor='rgba(0,0,0,0.10)'; this.style.boxShadow='none';" />
              </div>
            ))}
          </div>
          <button type="submit" style={saveBtn}>Save Changes</button>
        </div>
      </form>
    </div>

    {/* ── Pricing & Charges ── */}
    <div x-show={`tab === 'Pricing & Charges'`} style="max-width:884px; margin:0 auto;" x-data="{ gstEnabled: false }">
      <form method="post" action="/reception/settings">
        <input type="hidden" name="tab" value="Pricing & Charges" />
        <div style={cardStyle}>
          <p style="font-size:15px; font-weight:600; color:#1C1917; margin-bottom:18px; letter-spacing:-0.01em;">Pricing & Charges</p>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            {[
              { label: 'Storage Rate per CBM',       name: 'storage_rate_per_cbm',           val: tenant?.storage_rate_per_cbm,           step: '0.01' },
              { label: 'Storage Free Days',           name: 'storage_free_days',               val: tenant?.storage_free_days },
              { label: 'Shrink Wrap Rate / Pallet',  name: 'shrink_wrap_rate_per_pallet',     val: tenant?.shrink_wrap_rate_per_pallet,    step: '0.01' },
              { label: 'Slot Fee — Pick Up',          name: 'slot_fee_pickup',                 val: tenant?.slot_fee_pickup,                step: '0.01' },
              { label: 'Slot Fee — Drop Off',         name: 'slot_fee_dropoff',                val: tenant?.slot_fee_dropoff,               step: '0.01' },
            ].map((f) => (
              <div key={f.name}>
                <label style={labelStyle}>{f.label}</label>
                <input type="number" name={f.name} value={f.val ?? ''} step={f.step} style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'; this.style.boxShadow='0 0 0 3px rgba(var(--brand-rgb),0.12)';" onblur="this.style.borderColor='rgba(0,0,0,0.10)'; this.style.boxShadow='none';" />
              </div>
            ))}
          </div>
          <div style="margin-top:16px; display:flex; align-items:center; gap:10px;">
            <input type="checkbox" id="gst_enabled" name="gst_enabled" checked={tenant?.gst_enabled} x-model="gstEnabled" x-init={`gstEnabled = ${tenant?.gst_enabled ? 'true' : 'false'}`} style="accent-color:var(--brand-color); width:16px; height:16px;" />
            <label for="gst_enabled" style="font-size:13px; font-weight:500; color:#1C1917; cursor:pointer;">GST Enabled</label>
          </div>
          <div style="margin-top:14px;" x-show="gstEnabled">
            <label style={labelStyle}>GST Rate (%)</label>
            <input type="number" name="gst_rate" value={tenant?.gst_rate ?? 10} style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'; this.style.boxShadow='0 0 0 3px rgba(var(--brand-rgb),0.12)';" onblur="this.style.borderColor='rgba(0,0,0,0.10)'; this.style.boxShadow='none';" />
          </div>
          <button type="submit" style={saveBtn}>Save Changes</button>
        </div>
      </form>
    </div>

    {/* ── Payment ── */}
    <div x-show={`tab === 'Payment'`} style="max-width:884px; margin:0 auto;">
      <form method="post" action="/reception/settings">
        <input type="hidden" name="tab" value="Payment" />
        <div style={cardStyle}>
          <p style="font-size:15px; font-weight:600; color:#1C1917; margin-bottom:18px; letter-spacing:-0.01em;">Payment Settings</p>
          <div style="display:flex; flex-direction:column; gap:16px;">
            {[
              { label: 'Stripe Public Key',  name: 'stripe_public_key',         val: tenant?.stripe_public_key,  ph: 'pk_live_…',  type: 'text' },
              { label: 'EFT Bank Name',      name: 'eft_bank_name',             val: tenant?.eft_bank_name,      ph: '',           type: 'text' },
              { label: 'EFT BSB',            name: 'eft_bsb',                   val: tenant?.eft_bsb,            ph: '000-000',    type: 'text' },
              { label: 'EFT Account Number', name: 'eft_account_number',        val: tenant?.eft_account_number, ph: '',           type: 'text' },
              { label: 'EFT Account Name',   name: 'eft_account_name',          val: tenant?.eft_account_name,   ph: '',           type: 'text' },
            ].map((f) => (
              <div key={f.name}>
                <label style={labelStyle}>{f.label}</label>
                <input type={f.type} name={f.name} value={f.val ?? ''} placeholder={f.ph} style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'; this.style.boxShadow='0 0 0 3px rgba(var(--brand-rgb),0.12)';" onblur="this.style.borderColor='rgba(0,0,0,0.10)'; this.style.boxShadow='none';" />
              </div>
            ))}
            <div style="display:flex; align-items:center; gap:10px;">
              <input type="checkbox" id="require_payment_to_confirm" name="require_payment_to_confirm" checked={tenant?.require_payment_to_confirm} style="accent-color:var(--brand-color); width:16px; height:16px;" />
              <label for="require_payment_to_confirm" style="font-size:13px; font-weight:500; color:#1C1917; cursor:pointer;">Require payment to confirm booking</label>
            </div>
          </div>
          <button type="submit" style={saveBtn}>Save Changes</button>
        </div>
      </form>
    </div>

    {/* ── Working Hours ── */}
    <div x-show={`tab === 'Working Hours'`} style="max-width:884px; margin:0 auto;">
      <form method="post" action="/reception/settings">
        <input type="hidden" name="tab" value="Working Hours" />
        <div style={cardStyle}>
          <p style="font-size:15px; font-weight:600; color:#1C1917; margin-bottom:4px; letter-spacing:-0.01em;">Working Hours</p>
          <p style="font-size:12px;c3F3D; margin-bottom:20px;">Visitors can only book slots within these hours. Changes take effect immediately.</p>
          <div style="display:flex; flex-direction:column; gap:0;">
            {([
              { label: 'Monday',    name: 'mon' },
              { label: 'Tuesday',   name: 'tue' },
              { label: 'Wednesday', name: 'wed' },
              { label: 'Thursday',  name: 'thu' },
              { label: 'Friday',    name: 'fri' },
              { label: 'Saturday',  name: 'sat' },
              { label: 'Sunday',    name: 'sun' },
            ] as { label: string; name: string }[]).map((day, i) => {
              const wh = (tenant?.working_hours as any)?.[day.name]
              const isWeekday = ['mon','tue','wed','thu','fri'].includes(day.name)
              const savedEnabled = wh ? wh.enabled : isWeekday
              const savedOpen    = wh?.open  || (isWeekday ? '06:00' : '08:00')
              const savedClose   = wh?.close || '18:00'
              return (
              <div key={day.name}
                style={`display:grid; grid-template-columns:110px 1fr 1fr auto; align-items:center; gap:16px; padding:12px 0; ${i < 6 ? 'border-bottom:1px solid rgba(0,0,0,0.06);' : ''}`}
                x-data={`{ enabled_${day.name}: ${savedEnabled ? 'true' : 'false'} }`}
              >
                <div style="display:flex; align-items:center; gap:9px;">
                  <label style="position:relative; display:inline-flex; align-items:center; cursor:pointer;">
                    <input type="checkbox" name={`${day.name}_enabled`}
                      x-model={`enabled_${day.name}`}
                      style="position:absolute; opacity:0; width:0; height:0;"
                      checked={savedEnabled}
                    />
                    <div
                      style="width:34px; height:20px; border-radius:9999px; transition:background 0.2s ease; cursor:pointer; position:relative;"
                      x-bind:style={`enabled_${day.name} ? 'background:var(--brand-color);' : 'background:rgba(0,0,0,0.14);'`}
                      x-on:click={`enabled_${day.name} = !enabled_${day.name}`}
                    >
                      <div
                        style="position:absolute; top:3px; width:14px; height:14px; border-radius:9999px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.2); transition:left 0.2s ease;"
                        x-bind:style={`enabled_${day.name} ? 'left:17px;' : 'left:3px;'`}
                      />
                    </div>
                  </label>
                  <span style="font-size:13px; font-weight:500; color:#1C1917;">{day.label}</span>
                </div>
                <div x-show={`enabled_${day.name}`}>
                  <label style={labelStyle}>Open</label>
                  <select name={`${day.name}_open`}
                    style={`${inputStyle} padding:8px 12px; cursor:pointer;`}
                    onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'; this.style.boxShadow='0 0 0 3px rgba(var(--brand-rgb),0.12)';"
                    onblur="this.style.borderColor='rgba(0,0,0,0.10)'; this.style.boxShadow='none';"
                  >
                    {TIME_OPTIONS.map(t => (
                      <option key={t} value={t} selected={t === savedOpen}>{t}</option>
                    ))}
                  </select>
                </div>
                <div x-show={`enabled_${day.name}`}>
                  <label style={labelStyle}>Close</label>
                  <select name={`${day.name}_close`}
                    style={`${inputStyle} padding:8px 12px; cursor:pointer;`}
                    onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'; this.style.boxShadow='0 0 0 3px rgba(var(--brand-rgb),0.12)';"
                    onblur="this.style.borderColor='rgba(0,0,0,0.10)'; this.style.boxShadow='none';"
                  >
                    {TIME_OPTIONS.map(t => (
                      <option key={t} value={t} selected={t === savedClose}>{t}</option>
                    ))}
                  </select>
                </div>
                <div x-show={`!enabled_${day.name}`} style="grid-column:span 2; padding-top:18px;">
                  <span style="font-size:12px;c3F3D; font-style:italic;">Closed</span>
                </div>
              </div>
              )
            })}
          </div>
          <button type="submit" style={saveBtn}>Save Working Hours</button>
        </div>
      </form>
    </div>

    {/* ── Users ── */}
    <div x-show={`tab === 'Users'`} style="max-width:884px; margin:0 auto;">
      <div style={cardStyle}>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:18px;">
          <p style="font-size:15px; font-weight:600; color:#1C1917; letter-spacing:-0.01em;">Team Members</p>
          <button
            type="button"
            class="btn-ghost"
            style="font-size:12px; padding:7px 14px; cursor:pointer;"
          >
            + Invite
          </button>
        </div>
        <table style="width:100%; font-size:13px; border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid rgba(0,0,0,0.07);">
              {['Name','Email','Role','Status',''].map((h) => (
                <th key={h} style="text-align:left; padding:8px 0; font-size:10px; font-weight:700;c3F3D; letter-spacing:0.07em; text-transform:uppercase;">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u: any) => (
              <tr key={u.email} style="border-bottom:1px solid rgba(0,0,0,0.06);">
                <td style="padding:12px 0; color:#1C1917; font-weight:500;">{u.name}</td>
                <td style="padding:12px 0; color:#78716C;">{u.email}</td>
                <td style="padding:12px 0;">
                  <span style="background:rgba(0,0,0,0.04); border:1px solid rgba(0,0,0,0.09); border-radius:6px; padding:3px 8px; font-size:11px; color:#78716C; font-weight:500;">{u.role}</span>
                </td>
                <td style="padding:12px 0;">
                  <span style={`border-radius:6px; padding:3px 8px; font-size:11px; font-weight:500; ${u.status === 'Active' ? 'background:rgba(34,197,94,0.12); color:#22C55E; border:1px solid rgba(34,197,94,0.22);' : 'background:rgba(0,0,0,0.04); color:#78716C; border:1px solid rgba(0,0,0,0.09);'}`}>{u.status}</span>
                </td>
                <td style="padding:12px 0; text-align:right;">
                  <button type="button" style="font-size:12px; color:#78716C; background:none; border:none; cursor:pointer; transition:color 0.15s ease;" onmouseover="this.style.color='#1C1917'" onmouseout="this.style.color='#78716C'">Edit</button>
                </td>
              </tr>
            ))}
            {(users ?? []).length === 0 && (
              <tr>
                <td colspan={5} style="padding:40px 0; text-align:center;c3F3D; font-size:13px;">No users found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>

    {/* ── Staff Permissions ── */}
    <div x-show={`tab === 'Staff Permissions'`} style="max-width:884px; margin:0 auto;"
      x-data="{ editing: false, dirty: false }">
      <div style={cardStyle}>
        <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:6px; flex-wrap:wrap; gap:8px;">
          <div>
            <p style="font-size:15px; font-weight:600; color:#1C1917; letter-spacing:-0.01em; margin-bottom:2px;">Reception Staff Permissions</p>
            <p style="font-size:12px;c3F3D;">Control what your front-desk staff can see and do. Changes apply on next staff login.</p>
          </div>
          <button type="button" x-show="!editing"
            style="padding:8px 16px; font-size:12px; font-weight:600; color:var(--brand-color); background:rgba(var(--brand-rgb),0.08); border:1px solid rgba(var(--brand-rgb),0.18); border-radius:8px; cursor:pointer; transition:all 0.15s ease; white-space:nowrap;"
            x-on:click="editing = true"
            onmouseover="this.style.background='rgba(var(--brand-rgb),0.14)'"
            onmouseout="this.style.background='rgba(var(--brand-rgb),0.08)'"
          >
            Edit Permissions
          </button>
        </div>

        {/* Dirty state banner */}
        <div x-show="dirty && editing" x-cloak
          style="display:flex; align-items:center; gap:8px; padding:10px 14px; background:rgba(251,191,36,0.08); border:1px solid rgba(251,191,36,0.22); border-radius:9px; margin-bottom:16px; font-size:12px; font-weight:500; color:#B45309;">
          <span>⚠</span>
          <span>You have unsaved changes.</span>
        </div>

        <form method="post" action="/reception/settings/staff-permissions" x-on:submit="editing = false; dirty = false;">
          <input type="hidden" name="tab" value="Staff Permissions" />

          {[
            { group: 'Bookings', perms: [
              { key: 'perm_mark_complete',      label: 'Mark job complete',         sub: 'Allow staff to mark bookings as completed',           def: true  },
              { key: 'perm_override_status',    label: 'Override booking status',   sub: 'Manually set status with a note (admin-only by default)', def: false },
              { key: 'perm_create_manual',      label: 'Create manual booking',     sub: 'Book a slot on behalf of a walk-in or phone caller',   def: false },
            ]},
            { group: 'ICS & Documents', perms: [
              { key: 'perm_refresh_ics',        label: 'Manual ICS refresh',        sub: 'Re-fetch customs status from the booking detail panel', def: true  },
              { key: 'perm_view_ics',           label: 'View ICS status',           sub: 'See ICS badge and status in the booking list and detail', def: true },
            ]},
            { group: 'Reports & Exports', perms: [
              { key: 'perm_export_csv',         label: 'Export CSV / PDF',          sub: 'Download booking list and report exports',             def: true  },
              { key: 'perm_view_charges',       label: 'View charge details',       sub: 'See full charge breakdown in the booking detail panel', def: true  },
            ]},
            { group: 'Visitor Data', perms: [
              { key: 'perm_view_id_scan',       label: 'View ID scan data',         sub: 'See licence name, DOB, and licence number after check-in', def: false },
              { key: 'perm_confirm_eft',        label: 'Confirm EFT payment',       sub: 'Mark bank-transfer bookings as paid',                  def: false },
            ]},
          ].map((section) => (
            <div key={section.group} style="margin-bottom:24px;">
              <p style="font-size:10px; font-weight:700;c3F3D; letter-spacing:0.10em; text-transform:uppercase; margin-bottom:12px;">{section.group}</p>
              <div style="display:flex; flex-direction:column; gap:0;">
                {section.perms.map((p, pi) => (
                  <div key={p.key}
                    style={`display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 0; ${pi < section.perms.length - 1 ? 'border-bottom:1px solid rgba(0,0,0,0.06);' : ''}`}
                    x-data={`{ val_${p.key}: ${p.def} }`}
                  >
                    <div>
                      <p style="font-size:13px; font-weight:500; color:#1C1917; margin-bottom:2px;">{p.label}</p>
                      <p style="font-size:11.5px;c3F3D; line-height:1.5;">{p.sub}</p>
                    </div>
                    <label style="position:relative; display:inline-flex; align-items:center; cursor:pointer; flex-shrink:0;">
                      <input type="checkbox" name={p.key}
                        x-model={`val_${p.key}`}
                        x-bind:disabled="!editing"
                        x-on:change="dirty = true"
                        style="position:absolute; opacity:0; width:0; height:0;"
                      />
                      <div
                        style="width:40px; height:22px; border-radius:9999px; transition:background 0.2s ease; position:relative;"
                        x-bind:style={`(val_${p.key} ? 'background:var(--brand-color);' : 'background:rgba(0,0,0,0.14);') + (!editing ? 'opacity:0.5; cursor:not-allowed;' : 'cursor:pointer;')`}
                        x-on:click="if(editing){ $data['val_' + '${p.key}'] = !$data['val_' + '${p.key}']; dirty = true; }"
                      >
                        <div
                          style="position:absolute; top:4px; width:14px; height:14px; border-radius:9999px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.2); transition:left 0.2s ease;"
                          x-bind:style={`val_${p.key} ? 'left:22px;' : 'left:4px;'`}
                        />
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Save / Cancel row */}
          <div x-show="editing" style="display:flex; gap:10px; margin-top:4px; padding-top:20px; border-top:1px solid rgba(0,0,0,0.07); flex-wrap:wrap;">
            <button type="submit" style={saveBtn + ' margin-top:0;'}>Save Permissions</button>
            <button type="button"
              style="padding:11px 20px; font-size:13px; font-weight:600; color:#78716C; background:transparent; border:1px solid rgba(0,0,0,0.12); border-radius:10px; cursor:pointer; transition:all 0.15s ease;"
              x-on:click="editing = false; dirty = false;"
              onmouseover="this.style.borderColor='rgba(0,0,0,0.22)'"
              onmouseout="this.style.borderColor='rgba(0,0,0,0.12)'"
            >
              Cancel
            </button>
            <button type="button"
              style="padding:11px 20px; font-size:13px; font-weight:500; color:#EF4444; background:transparent; border:1px solid rgba(239,68,68,0.20); border-radius:10px; cursor:pointer; margin-left:auto; transition:all 0.15s ease;"
              x-on:click="if(confirm('Reset all permissions to system defaults? This cannot be undone.')){ editing = false; dirty = false; }"
              onmouseover="this.style.background='rgba(239,68,68,0.06)'"
              onmouseout="this.style.background='transparent'"
            >
              Reset to defaults
            </button>
          </div>
        </form>
      </div>
    </div>

    {/* ── Integrations tab ── */}
    <div x-show={`tab === 'Integrations'`} style="max-width:884px; margin:0 auto;">
      <form method="post" action="/reception/settings">
        <input type="hidden" name="tab" value="Integrations" />

        {/* CargoWise */}
        <div style={cardStyle}>
          <p style="font-size:13px; font-weight:700; color:#1C1917; margin-bottom:4px;">ICS API Integration</p>
          <p style="font-size:12.5px; color:#78716C; line-height:1.5; margin-bottom:20px;">
            Connect your ICS API account to enable live HBL lookups and automatic ICS clearance status checks when creating bookings. Leave blank to use cached values from CFS records only.
          </p>

          <div style="display:flex; flex-direction:column; gap:16px;">
            <div>
              <label style={labelStyle}>ICS API URL</label>
              <input
                type="url"
                name="cargowise_api_url"
                placeholder="https://your-tenant.cargowise.com"
                value={(tenant as any)?.cargowise_api_url ?? ''}
                style={inputStyle}
                {...{[inputFocus.split('=')[0].replace('on', 'on')]: true}}
                onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'; this.style.boxShadow='0 0 0 3px rgba(var(--brand-rgb),0.12)';"
                onblur="this.style.borderColor='rgba(0,0,0,0.10)'; this.style.boxShadow='none';"
              />
              <p style="font-size:11.5px;c3F3D; margin-top:5px;">The base URL of your ICS REST endpoint</p>
            </div>
            <div>
              <label style={labelStyle}>API Key / Bearer Token</label>
              <input
                type="password"
                name="cargowise_api_key"
                placeholder={(tenant as any)?.cargowise_api_key ? '••••••••' : 'Paste your API key'}
                style={inputStyle}
                onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'; this.style.boxShadow='0 0 0 3px rgba(var(--brand-rgb),0.12)';"
                onblur="this.style.borderColor='rgba(0,0,0,0.10)'; this.style.boxShadow='none';"
              />
              <p style="font-size:11.5px;c3F3D; margin-top:5px;">Leave blank to keep the existing key. Stored encrypted at rest.</p>
            </div>
          </div>

          {/* Status indicator */}
          {(tenant as any)?.cargowise_api_key ? (
            <div style="display:flex; align-items:center; gap:8px; margin-top:16px; padding:10px 14px; background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.22); border-radius:10px;">
              <span style="width:8px; height:8px; border-radius:50%; background:#22C55E; flex-shrink:0;"></span>
              <span style="font-size:12.5px; color:#16A34A; font-weight:500;">API key configured — live ICS checks enabled</span>
            </div>
          ) : (
            <div style="display:flex; align-items:center; gap:8px; margin-top:16px; padding:10px 14px; background:rgba(0,0,0,0.03); border:1px solid rgba(0,0,0,0.08); border-radius:10px;">
              <span style="width:8px; height:8px; border-radius:50%; background:#A8A29E; flex-shrink:0;"></span>
              <span style="font-size:12.5px; color:#78716C;">No API key — using cached CFS records only</span>
            </div>
          )}
        </div>

        {/* ICS info box */}
        <div style="background:rgba(var(--brand-rgb),0.04); border:1px solid rgba(var(--brand-rgb),0.14); border-radius:14px; padding:18px 20px; margin-bottom:20px;">
          <p style="font-size:12.5px; font-weight:600; color:#C2410C; margin-bottom:6px;">About ICS Status</p>
          <p style="font-size:12px; color:#78716C; line-height:1.6; margin:0;">
            ICS (Integrated Cargo System) status is provided by Australian Border Force and indicates whether a shipment has been cleared for collection. When ICS API is connected, status is fetched live on each HBL lookup and cached to the shipment record. Without a connection, status shows as <em>Not Checked</em> unless manually updated in the CFS records.
          </p>
        </div>

        <button type="submit" style={saveBtn}>Save Integration Settings</button>
      </form>
    </div>

  </div>
)
