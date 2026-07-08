import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { usePageTitle } from '@/lib/usePageTitle'
import { fetcher, patchFetcher, postFetcher } from '@/lib/fetcher'
import { Icon, ICONS } from '@/lib/Icon'
import { validators, sanitize } from '@/lib/validation'

// ── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onDone }: { message: string; type: 'success' | 'error'; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 20px', borderRadius: 'var(--r-md)',
      background: type === 'success' ? '#F0FDF4' : '#FEF2F2',
      border: `1px solid ${type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      fontSize: 15, fontWeight: 500,
      color: type === 'success' ? '#15803D' : '#DC2626',
      whiteSpace: 'nowrap',
    }}>
      {type === 'success'
        ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7.5" stroke="#22C55E"/><path d="M4.5 8L7 10.5L11.5 5.5" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7.5" stroke="#EF4444"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/></svg>
      }
      {message}
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid rgba(var(--brand-rgb),0.10)',
  borderRadius: 'var(--r-lg)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  padding: '28px 28px 24px',
  marginBottom: 20,
}

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  fontSize: 15,
  border: '1.5px solid rgba(0,0,0,0.10)',
  borderRadius: 'var(--r-sm)',
  outline: 'none',
  background: '#fff',
  color: '#1C1917',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s',
}

const INPUT_READONLY: React.CSSProperties = {
  ...INPUT,
  background: 'rgba(0,0,0,0.025)',
  color: 'var(--text-secondary)',
  cursor: 'default',
}

const LABEL: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 6,
  display: 'block',
}

const ERR: React.CSSProperties = {
  fontSize: 13,
  color: '#EF4444',
  marginTop: 4,
}

const HINT: React.CSSProperties = {
  fontSize: 13,
  color: '#9CA3AF',
  marginTop: 4,
}


// ── Section A — Personal Details ──────────────────────────────────────────────
function PersonalSection({ email, meta, onSaved }: {
  email: string
  meta: Record<string, string>
  onSaved: (msg: string) => void
}) {
  const [editing, setEditing]     = useState(false)
  const [saving,  setSaving]      = useState(false)
  const [firstName, setFirstName] = useState(meta.first_name ?? '')
  const [lastName,  setLastName]  = useState(meta.last_name ?? '')
  const [phone,     setPhone]     = useState(meta.phone ?? '')
  const [errors,    setErrors]    = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (firstName.trim().length < 2) e.firstName = 'First name must be at least 2 characters'
    if (phone.trim() && validators.phoneAU(phone.trim())) e.phone = validators.phoneAU(phone.trim())
    return e
  }

  const handleSave = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      await patchFetcher('/api/auth/me', {
        name: [firstName.trim(), lastName.trim()].filter(Boolean).join(' '),
        phone: phone.trim() || null,
      })
      setEditing(false)
      setErrors({})
      onSaved('Personal details saved')
    } catch {
      onSaved('Error: Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0 }}>Personal Details</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '3px 0 0' }}>Your name and contact information</p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{ fontSize: 15, fontWeight: 600, color: '#000000', background: 'rgba(var(--brand-rgb),0.07)', border: '1px solid rgba(var(--brand-rgb),0.18)', borderRadius: 'var(--r-sm)', padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Edit
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={LABEL}>
            First Name <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <input
            type="text"
            value={firstName}
            readOnly={!editing}
            onChange={e => { setFirstName(e.target.value); setErrors(er => ({ ...er, firstName: '' })) }}
            style={editing ? { ...INPUT, borderColor: errors.firstName ? '#EF4444' : undefined } : INPUT_READONLY}
            onFocus={e => { if (editing) e.target.style.borderColor = 'rgba(var(--brand-rgb),0.5)' }}
            onBlur={e  => { if (editing) e.target.style.borderColor = errors.firstName ? '#EF4444' : 'rgba(0,0,0,0.10)' }}
          />
          {errors.firstName && <p style={ERR}>{errors.firstName}</p>}
        </div>

        <div>
          <label style={LABEL}>Last Name</label>
          <input
            type="text"
            value={lastName}
            readOnly={!editing}
            onChange={e => setLastName(e.target.value)}
            style={editing ? INPUT : INPUT_READONLY}
            onFocus={e => { if (editing) e.target.style.borderColor = 'rgba(var(--brand-rgb),0.5)' }}
            onBlur={e  => { if (editing) e.target.style.borderColor = 'rgba(0,0,0,0.10)' }}
          />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={LABEL}>
          Email Address <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: 13, marginLeft: 4 }}>(read-only)</span>
        </label>
        <input type="email" value={email} readOnly style={INPUT_READONLY} />
        <p style={HINT}>Managed by your account — contact support to change</p>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={LABEL}>
          Phone Number <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: 13, marginLeft: 4 }}>(optional)</span>
        </label>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={phone}
          readOnly={!editing}
          onChange={e => { setPhone(sanitize.digitsOnly(e.target.value)); setErrors(er => ({ ...er, phone: '' })) }}
          placeholder="04XX XXX XXX"
          style={editing ? { ...INPUT, borderColor: errors.phone ? '#EF4444' : undefined } : INPUT_READONLY}
          onFocus={e => { if (editing) e.target.style.borderColor = 'rgba(var(--brand-rgb),0.5)' }}
          onBlur={e  => { if (editing) e.target.style.borderColor = errors.phone ? '#EF4444' : 'rgba(0,0,0,0.10)' }}
        />
        {errors.phone
          ? <p style={ERR}>{errors.phone}</p>
          : editing && <p style={HINT}>Must be a valid Australian number (e.g. 0412 345 678)</p>
        }
      </div>

      {editing && (
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            type="button"
            onClick={() => { setEditing(false); setErrors({}); setFirstName(meta.first_name ?? ''); setLastName(meta.last_name ?? ''); setPhone(meta.phone ?? '') }}
            style={{ padding: '10px 20px', fontSize: 15, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '10px 22px', fontSize: 15, fontWeight: 700, color: 'var(--brand-text)', background: saving ? '#D1D5DB' : 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Section B — Company Information ──────────────────────────────────────────
function CompanySection({ meta, onSaved }: { meta: Record<string, string>; onSaved: (msg: string) => void }) {
  const [editing,     setEditing]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [companyName, setCompanyName] = useState(meta.company_name ?? '')

  const handleSave = async () => {
    setSaving(true)
    try {
      await patchFetcher('/api/auth/me', { company_name: companyName.trim() })
      setEditing(false)
      onSaved('Company information saved')
    } catch {
      onSaved('Error: Failed to save company info')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0 }}>Company Information</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '3px 0 0' }}>Your organisation or employer</p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{ fontSize: 15, fontWeight: 600, color: '#000000', background: 'rgba(var(--brand-rgb),0.07)', border: '1px solid rgba(var(--brand-rgb),0.18)', borderRadius: 'var(--r-sm)', padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Edit
          </button>
        )}
      </div>

      <div>
        <label style={LABEL}>
          Company Name <span style={{ fontWeight: 400, color: '#9CA3AF', fontSize: 13, marginLeft: 4 }}>(optional)</span>
        </label>
        <input
          type="text"
          value={companyName}
          readOnly={!editing}
          onChange={e => setCompanyName(e.target.value)}
          placeholder={editing ? 'Your company or organisation' : '—'}
          style={editing ? INPUT : INPUT_READONLY}
          onFocus={e => { if (editing) e.target.style.borderColor = 'rgba(var(--brand-rgb),0.5)' }}
          onBlur={e  => { if (editing) e.target.style.borderColor = 'rgba(0,0,0,0.10)' }}
        />
      </div>

      {editing && (
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            type="button"
            onClick={() => { setEditing(false); setCompanyName(meta.company_name ?? '') }}
            style={{ padding: '10px 20px', fontSize: 15, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '10px 22px', fontSize: 15, fontWeight: 700, color: 'var(--brand-text)', background: saving ? '#D1D5DB' : 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Section C — Change Password ───────────────────────────────────────────────
function PasswordSection({ onSaved, onError }: { onSaved: (msg: string) => void; onError: (msg: string) => void }) {
  const [newPw,     setNewPw]     = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showNew,   setShowNew]   = useState(false)
  const [showConf,  setShowConf]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [errors,    setErrors]    = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (newPw.length < 8)           e.newPw     = 'Password must be at least 8 characters'
    if (newPw !== confirmPw)        e.confirmPw = 'Passwords do not match'
    return e
  }

  const handleUpdate = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      await postFetcher('/api/auth/change-password', { password: newPw })
      setNewPw('')
      setConfirmPw('')
      setErrors({})
      onSaved('Password updated successfully')
    } catch {
      onError('Error: Failed to update password')
    } finally {
      setSaving(false)
    }
  }

  const EyeIcon = ({ show }: { show: boolean }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {show
        ? <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
        : <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
      }
    </svg>
  )

  return (
    <div style={CARD}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0 }}>Change Password</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '3px 0 0' }}>Update your account password</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={LABEL}>
            New Password <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showNew ? 'text' : 'password'}
              value={newPw}
              onChange={e => { setNewPw(e.target.value); setErrors(er => ({ ...er, newPw: '' })) }}
              placeholder="Min. 8 characters"
              style={{ ...INPUT, paddingRight: 44, ...(errors.newPw ? { border: '1.5px solid #EF4444' } : {}) }}
              onFocus={e => { e.target.style.border = errors.newPw ? '1.5px solid #EF4444' : '1.5px solid rgba(var(--brand-rgb),0.5)' }}
              onBlur={e  => { e.target.style.border = errors.newPw ? '1.5px solid #EF4444' : '1.5px solid rgba(0,0,0,0.10)' }}
            />
            <button
              type="button"
              onClick={() => setShowNew(v => !v)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0, display: 'flex', alignItems: 'center' }}
            >
              <EyeIcon show={showNew} />
            </button>
          </div>
          {errors.newPw && <p style={ERR}>{errors.newPw}</p>}
        </div>

        <div>
          <label style={LABEL}>
            Confirm New Password <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showConf ? 'text' : 'password'}
              value={confirmPw}
              onChange={e => { setConfirmPw(e.target.value); setErrors(er => ({ ...er, confirmPw: '' })) }}
              placeholder="Re-enter your new password"
              style={{ ...INPUT, paddingRight: 44, ...(errors.confirmPw ? { border: '1.5px solid #EF4444' } : {}) }}
              onFocus={e => { e.target.style.border = errors.confirmPw ? '1.5px solid #EF4444' : '1.5px solid rgba(var(--brand-rgb),0.5)' }}
              onBlur={e  => { e.target.style.border = errors.confirmPw ? '1.5px solid #EF4444' : '1.5px solid rgba(0,0,0,0.10)' }}
            />
            <button
              type="button"
              onClick={() => setShowConf(v => !v)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0, display: 'flex', alignItems: 'center' }}
            >
              <EyeIcon show={showConf} />
            </button>
          </div>
          {errors.confirmPw && <p style={ERR}>{errors.confirmPw}</p>}
        </div>
      </div>

      <button
        type="button"
        onClick={handleUpdate}
        disabled={saving || (!newPw && !confirmPw)}
        style={{ marginTop: 20, padding: '10px 22px', fontSize: 15, fontWeight: 700, color: 'var(--brand-text)', background: saving || (!newPw && !confirmPw) ? '#D1D5DB' : 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: saving || (!newPw && !confirmPw) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}
      >
        {saving ? 'Updating…' : 'Update Password'}
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  usePageTitle('Glido | My Profile')
  const { user, isLoading } = useAuth()

  const [meta, setMeta]       = useState<Record<string, string>>({})
  const [metaLoading, setMetaLoading] = useState(true)
  const [toast, setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Redirect if not logged in
  if (!isLoading && !user) return <Navigate to="/visitor-login?redirect=/profile" replace />

  useEffect(() => {
    if (!user) return
    // The JWT only carries id/email/name/role — phone and company_name are set after login,
    // so fetch the full account record rather than deriving everything from the token.
    let cancelled = false
    fetcher('/api/auth/me').then(res => {
      if (cancelled) return
      const data = res?.data ?? {}
      const parts = (data.name ?? user.name ?? '').split(' ')
      setMeta({
        first_name: parts[0] ?? '',
        last_name: parts.slice(1).join(' '),
        phone: data.phone ?? '',
        company_name: data.company_name ?? '',
      })
      setMetaLoading(false)
    }).catch(() => {
      if (cancelled) return
      // Fall back to whatever the JWT has so the page still renders
      const parts = (user.name ?? '').split(' ')
      setMeta({ first_name: parts[0] ?? '', last_name: parts.slice(1).join(' ') })
      setMetaLoading(false)
    })
    return () => { cancelled = true }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (message: string) => {
    const type = message.startsWith('Error:') ? 'error' : 'success'
    setToast({ message, type })
  }

  if (isLoading || metaLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)', fontSize: 15, color: 'var(--text-secondary)' }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ padding: '48px 24px 80px', minHeight: '100vh', background: 'color-mix(in srgb, var(--brand-color) 4%, #ffffff)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
            <div style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', background: 'rgba(var(--brand-rgb),0.09)', border: '1px solid rgba(var(--brand-rgb),0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={ICONS.user} size={20} style={{ color: 'var(--brand-color)' }} />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', margin: 0 }}>My Profile</h1>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '2px 0 0' }}>View and manage your account information</p>
            </div>
          </div>
        </div>

        {/* Sections */}
        <PersonalSection email={user!.email} meta={meta} onSaved={showToast} />
        <CompanySection  meta={meta} onSaved={showToast} />
        <PasswordSection onSaved={showToast} onError={showToast} />

      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  )
}
