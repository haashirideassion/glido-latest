import { Icon, ICONS } from '../../lib/Icon'

const inputStyle = 'width:100%; padding:12px 16px; height:48px; font-size:16px; color:#1C1917; background:#F7F6F5; border:1px solid rgba(0,0,0,0.10); border-radius:10px; outline:none; transition:border-color 0.15s ease, box-shadow 0.15s ease; box-sizing:border-box; font-family:inherit;'
const labelStyle = 'display:block; font-size:15px; font-weight:700; color:#374151; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:8px;'

interface Props {
  savedFlash?: boolean
  error?: string
}

export const ManualBookingForm = ({ savedFlash, error }: Props) => {
  const today = new Date().toISOString().split('T')[0]

  return (
    <div style="max-width:720px;">

      {savedFlash && (
        <div style="display:flex; align-items:center; gap:10px; padding:14px 18px; background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.22); border-radius:12px; margin-bottom:20px;">
          <Icon name={ICONS.check} size={18} style="color:#22C55E; flex-shrink:0;" />
          <p style="font-size:15px; font-weight:600; color:#16A34A; margin:0;">Booking created successfully.</p>
        </div>
      )}
      {error && (
        <div style="display:flex; align-items:center; gap:10px; padding:14px 18px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.22); border-radius:12px; margin-bottom:20px;">
          <Icon name={ICONS.warning} size={18} style="color:#EF4444; flex-shrink:0;" />
          <p style="font-size:15px; font-weight:600; color:#DC2626; margin:0;">{error}</p>
        </div>
      )}

      <form
        method="post"
        action="/reception/bookings/new"
        style="display:flex; flex-direction:column; gap:16px;"
      >
        {/* ── Service + Load ── */}
        <div style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06);">
          <p style="font-size:16px; font-weight:700; color:#4B5563; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:16px;">Service Type</p>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style={labelStyle}>Service</label>
              <select name="serviceType" required style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'">
                <option value="">Select…</option>
                <option value="pickup">Pick Up</option>
                <option value="dropoff">Drop Off</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Load Type</label>
              <select name="loadType" required style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'">
                <option value="">Select…</option>
                <option value="lcl">LCL</option>
                <option value="fcl">FCL</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Slot ── */}
        <div style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06);">
          <p style="font-size:16px; font-weight:700; color:#4B5563; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:16px;">Slot</p>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" name="slotDate" required value={today} min={today} style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'" />
            </div>
            <div>
              <label style={labelStyle}>Start Time</label>
              <input type="time" name="slotStartTime" required defaultValue="09:00" style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'" />
            </div>
            <div>
              <label style={labelStyle}>End Time</label>
              <input type="time" name="slotEndTime" required defaultValue="10:00" style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'" />
            </div>
          </div>
        </div>

        {/* ── Driver / Guest ── */}
        <div style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06);">
          <p style="font-size:16px; font-weight:700; color:#4B5563; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:16px;">Driver / Visitor</p>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style={labelStyle}>Driver Name <span style="color:#EF4444;">*</span></label>
              <input type="text" name="driverName" required placeholder="Full name" style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'" />
            </div>
            <div>
              <label style={labelStyle}>Driver Phone</label>
              <input type="tel" name="driverPhone" placeholder="04xx xxx xxx" style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'" />
            </div>
            <div>
              <label style={labelStyle}>Guest / Company Name</label>
              <input type="text" name="guestName" placeholder="Forwarding agent or company" style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'" />
            </div>
            <div>
              <label style={labelStyle}>Guest Phone</label>
              <input type="tel" name="guestPhone" placeholder="Optional" style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'" />
            </div>
          </div>
        </div>

        {/* ── Shipment ── */}
        <div style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06);">
          <p style="font-size:16px; font-weight:700; color:#4B5563; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:4px;">Shipment</p>
          <p style="font-size:14px; color:#4B5563; margin-bottom:16px;">Enter an HBL or container number and click <strong>Look Up</strong> to auto-fill cargo details from CFS records.</p>

          {/* HBL with live lookup */}
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
            <div>
              <label style={labelStyle}>House Bill Number</label>
              <p style="font-size:12px; color:#9CA3AF; margin:0 0 6px;">Enter the lowest house bill number</p>
              <div style="display:flex; gap:8px; align-items:stretch;">
                <input
                  type="text"
                  id="mbf-hbl"
                  name="houseBillNumber"
                  placeholder="ABCD12345678"
                  style={`${inputStyle} font-family:ui-monospace,monospace; text-transform:uppercase; flex:1; min-width:0;`}
                  onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'"
                  onblur="this.style.borderColor='rgba(0,0,0,0.10)'"
                />
                <button
                  type="button"
                  id="mbf-lookup-btn"
                  onclick="mbfLookup()"
                  style="flex-shrink:0; padding:0 20px; background:linear-gradient(180deg,#FF7A2A 0%,#E85A0A 100%); color:#fff; border:none; border-radius:10px; font-size:14px; font-weight:700; cursor:pointer; white-space:nowrap; box-shadow:0 2px 8px rgba(var(--brand-rgb),0.35);"
                  title="Look up shipment from CFS records"
                >
                  Look Up
                </button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Container Number</label>
              <input
                type="text"
                id="mbf-container"
                name="containerNumber"
                placeholder="ABCU1234567"
                style={`${inputStyle} font-family:ui-monospace,monospace; text-transform:uppercase;`}
                onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'"
                onblur="this.style.borderColor='rgba(0,0,0,0.10)'"
              />
            </div>
          </div>

          {/* ICS status badge — shown after lookup */}
          <div id="mbf-ics-badge" style="display:none; margin-bottom:14px;">
            <span id="mbf-ics-text" style="display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:600; padding:4px 12px; border-radius:9999px; border:1px solid transparent;"></span>
          </div>

          {/* Auto-filled cargo fields */}
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
            <div>
              <label style={labelStyle}>Weight (kg)</label>
              <input type="number" id="mbf-weight" name="weightKg" placeholder="0" min="0" step="0.1"
                style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'" />
            </div>
            <div>
              <label style={labelStyle}>Volume (CBM)</label>
              <input type="number" id="mbf-volume" name="volumeCbm" placeholder="0.0" min="0" step="0.1"
                style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'" />
            </div>
            <div>
              <label style={labelStyle}>Packages</label>
              <input type="number" id="mbf-packages" name="packageCount" placeholder="0" min="0"
                style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'" />
            </div>
            <div>
              <label style={labelStyle}>Pallets</label>
              <input type="number" id="mbf-pallets" name="palletCount" placeholder="0" min="0"
                style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'" />
            </div>
            <div>
              <label style={labelStyle}>Pallet Type</label>
              <select id="mbf-pallet-type" name="palletType" style={inputStyle}
                onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'">
                <option value="">None / unknown</option>
                <option value="chep">CHEP</option>
                <option value="plain">Plain</option>
                <option value="other">Other</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Storage Start</label>
              <input type="date" id="mbf-storage-start" name="storageStartDate"
                style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'" />
            </div>
          </div>
        </div>

        {/* ── Payment ── */}
        <div style="background:#FFFFFF; border:1px solid rgba(0,0,0,0.07); border-radius:16px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06);">
          <p style="font-size:16px; font-weight:700; color:#4B5563; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:16px;">Payment</p>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style={labelStyle}>Method</label>
              <select name="paymentMethod" style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'">
                <option value="">Not specified</option>
                <option value="eft">EFT / Bank Transfer</option>
                <option value="card">Card (on arrival)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select name="paymentStatus" style={inputStyle} onfocus="this.style.borderColor='rgba(var(--brand-rgb),0.50)'" onblur="this.style.borderColor='rgba(0,0,0,0.10)'">
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="pending_eft">EFT Pending</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Submit ── */}
        <div style="display:flex; gap:12px; align-items:center; padding-top:4px;">
          <button
            type="submit"
            style="display:inline-flex; align-items:center; gap:10px; padding:0 32px; height:48px; background:linear-gradient(180deg,#FF7A2A 0%,#E85A0A 100%); color:#fff; border:none; border-radius:11px; font-size:15px; font-weight:700; cursor:pointer; box-shadow:inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 14px rgba(var(--brand-rgb),0.40), 0 1px 3px rgba(0,0,0,0.30); transition:box-shadow 0.15s ease;"
            onmouseover="this.style.boxShadow='inset 0 1px 0 rgba(255,255,255,0.22), 0 6px 20px rgba(var(--brand-rgb),0.50), 0 1px 4px rgba(0,0,0,0.35)'"
            onmouseout="this.style.boxShadow='inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 14px rgba(var(--brand-rgb),0.40), 0 1px 3px rgba(0,0,0,0.30)'"
          >
            <Icon name={ICONS.check} size={15} />
            Create Booking
          </button>
          <a href="/reception/bookings" style="font-size:15px; color:#4B5563; text-decoration:none; font-weight:600; transition:color 0.15s ease;"
            onmouseover="this.style.color='#1C1917'" onmouseout="this.style.color='#4B5563'"
          >
            Cancel
          </a>
        </div>
      </form>

      {/* ── HBL lookup script ── */}
      <script dangerouslySetInnerHTML={{ __html: `
        var _mbfFetching = false;
        function mbfLookup() {
          var hbl = (document.getElementById('mbf-hbl').value || '').trim().toUpperCase();
          var cont = (document.getElementById('mbf-container').value || '').trim().toUpperCase();
          if (!hbl && !cont) { alert('Enter an HBL or container number first.'); return; }
          if (_mbfFetching) return;
          _mbfFetching = true;
          var btn = document.getElementById('mbf-lookup-btn');
          btn.textContent = 'Looking…';
          btn.disabled = true;
          var slotDate    = (document.querySelector('input[name="slotDate"]')     || {}).value || '';
          var serviceType = (document.querySelector('select[name="serviceType"]') || {}).value || 'pickup';
          var loadType    = (document.querySelector('select[name="loadType"]')    || {}).value || 'lcl';
          fetch('/reception/api/hbl-lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hbl: hbl, container: cont, slotDate: slotDate, serviceType: serviceType, loadType: loadType }),
          })
          .then(function(r) { return r.json(); })
          .then(function(d) {
            _mbfFetching = false; btn.textContent = 'Look Up'; btn.disabled = false;
            if (!d.found) {
              mbfShowIcs('unavailable');
              alert('No matching shipment found in CFS records for "' + (hbl || cont) + '".');
              return;
            }
            if (d.containerNumber) document.getElementById('mbf-container').value      = d.containerNumber;
            if (d.weightKg        != null) document.getElementById('mbf-weight').value   = d.weightKg;
            if (d.volumeCbm       != null) document.getElementById('mbf-volume').value   = d.volumeCbm;
            if (d.packageCount    != null) document.getElementById('mbf-packages').value = d.packageCount;
            if (d.palletCount     != null) document.getElementById('mbf-pallets').value  = d.palletCount;
            if (d.palletType) {
              var pt = document.getElementById('mbf-pallet-type');
              for (var i = 0; i < pt.options.length; i++) { if (pt.options[i].value === d.palletType) { pt.selectedIndex = i; break; } }
            }
            if (d.storageStartDate) document.getElementById('mbf-storage-start').value = d.storageStartDate;
            mbfShowIcs(d.icsStatus || 'unavailable');
          })
          .catch(function(err) {
            _mbfFetching = false; btn.textContent = 'Look Up'; btn.disabled = false;
            console.error('[mbf] lookup failed', err);
            alert('Lookup failed. Check your connection and try again.');
          });
        }
        function mbfShowIcs(status) {
          var badge = document.getElementById('mbf-ics-badge');
          var text  = document.getElementById('mbf-ics-text');
          var cfg = {
            cleared:     { label: 'ICS Cleared',      bg: 'rgba(34,197,94,0.12)',  color: '#16A34A', border: 'rgba(34,197,94,0.25)' },
            held:        { label: 'ICS Hold',          bg: 'rgba(239,68,68,0.12)',  color: '#DC2626', border: 'rgba(239,68,68,0.25)' },
            examination: { label: 'Under Examination', bg: 'rgba(251,191,36,0.12)', color: '#B45309', border: 'rgba(251,191,36,0.35)' },
            pending:     { label: 'ICS Pending',       bg: 'rgba(148,163,184,0.12)',color: '#64748B', border: 'rgba(148,163,184,0.25)' },
            unavailable: { label: 'ICS Not Checked',   bg: 'rgba(0,0,0,0.04)',      color: 'var(--text-secondary)', border: 'rgba(0,0,0,0.10)' },
          };
          var c = cfg[status] || cfg.unavailable;
          text.textContent = c.label;
          text.style.background  = c.bg;
          text.style.color       = c.color;
          text.style.borderColor = c.border;
          badge.style.display = 'block';
        }
        document.addEventListener('DOMContentLoaded', function() {
          var hblInput = document.getElementById('mbf-hbl');
          if (hblInput) { hblInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); mbfLookup(); } }); }
        });
      `}} />
    </div>
  )
}
