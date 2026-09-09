import { useState } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import type { ManualCheckInDetails } from '@/lib/db/bookings'

const FIELD: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: 15, color: '#1C1917', background: '#FFFFFF', border: '1px solid #E2E0DD', borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const LABEL: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }

interface Props {
  driverName?: string | null
  onConfirm: (details: ManualCheckInDetails) => void
  onClose: () => void
  submitting?: boolean
}

// Mirrors the kiosk's simulated licence-scan fields (KioskContext's LicenceData) so
// Reception's manual check-in captures the same shape of ID data a real scan would.
export function CheckInModal({ driverName, onConfirm, onClose, submitting }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [licenceName, setLicenceName] = useState(driverName ?? '')
  const [licenceNumber, setLicenceNumber] = useState('')
  const [licenceDob, setLicenceDob] = useState('')
  const [licenceExpiry, setLicenceExpiry] = useState('')
  const [licenceAddress, setLicenceAddress] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    onConfirm({
      licenceName:    licenceName.trim()    || undefined,
      licenceNumber:  licenceNumber.trim()  || undefined,
      licenceDob:     licenceDob.trim()     || undefined,
      licenceExpiry:  licenceExpiry.trim()  || undefined,
      licenceAddress: licenceAddress.trim() || undefined,
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <form onSubmit={submit} style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: '28px 28px 24px', maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.20)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Icon name={ICONS.userCheck} size={19} style={{ color: 'var(--brand-color)' }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', margin: 0 }}>Confirm Check-In</h2>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
          Enter the driver's ID details as you would from a licence scan.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
          <div>
            <label style={LABEL}>Full Name</label>
            <input style={FIELD} value={licenceName} onChange={e => setLicenceName(e.target.value)} placeholder="As shown on licence" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={LABEL}>Licence Number</label>
              <input style={FIELD} value={licenceNumber} onChange={e => setLicenceNumber(e.target.value)} placeholder="e.g. NSW8832145" />
            </div>
            <div>
              <label style={LABEL}>Date of Birth</label>
              <input type="date" style={FIELD} value={licenceDob} onChange={e => setLicenceDob(e.target.value)} max={today} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={LABEL}>Licence Expiry</label>
              <input type="date" style={FIELD} value={licenceExpiry} onChange={e => setLicenceExpiry(e.target.value)} min={today} />
            </div>
            <div>
              <label style={LABEL}>Address</label>
              <input style={FIELD} value={licenceAddress} onChange={e => setLicenceAddress(e.target.value)} placeholder="Street, Suburb, State" />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '9px 18px', fontSize: 15, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            style={{ padding: '9px 18px', fontSize: 15, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Checking in…' : 'Confirm Check-In'}
          </button>
        </div>
      </form>
    </div>
  )
}
