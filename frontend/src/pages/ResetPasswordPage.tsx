import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { Icon, ICONS } from '@/lib/Icon'
import { postFetcher } from '@/lib/fetcher'
import { toast } from '@/lib/toast'

const FIELD: React.CSSProperties = {
  width: '100%', padding: '11px 14px', fontSize: 15, color: '#1C1917',
  background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)',
  outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
}
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)',
  letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 8,
}
const focus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)'
  e.target.style.boxShadow   = '0 0 0 3px rgba(var(--brand-rgb),0.12)'
}
const blur = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = 'rgba(0,0,0,0.10)'
  e.target.style.boxShadow   = 'none'
}

export default function ResetPasswordPage() {
  const [params]   = useSearchParams()
  const navigate   = useNavigate()
  const token      = params.get('token') ?? ''

  const [password,    setPassword]    = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [done,        setDone]        = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      toast('Password must be at least 8 characters.', 'error'); return
    }
    if (password !== confirm) {
      toast('Passwords do not match.', 'error'); return
    }
    setLoading(true)
    try {
      const res = await postFetcher('/api/auth/reset-password', { token, password })
      if (res?.success) {
        setDone(true)
        toast('Password updated! Redirecting to login…', 'success')
        setTimeout(() => navigate('/login'), 2000)
      } else {
        toast(res?.error?.message ?? 'Invalid or expired reset link.', 'error')
      }
    } catch {
      toast('Something went wrong. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 56px - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', background: 'linear-gradient(160deg,#FAFAF9 0%,#F7F6F5 100%)', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'radial-gradient(rgba(0,0,0,0.05) 1px,transparent 1px)', backgroundSize: '28px 28px', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 400 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-xl)', padding: '44px 40px', boxShadow: '0 2px 8px rgba(0,0,0,0.04),0 16px 48px rgba(0,0,0,0.09)' }}>

          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'var(--brand-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 4px 14px rgba(var(--brand-rgb),0.38)' }}>
              <Icon name={ICONS.users} size={24} style={{ color: 'var(--brand-text)' }} />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', marginBottom: 6 }}>Set a new password</h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Choose a strong password for your account.</p>
          </div>

          {!token ? (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 'var(--r-sm)', padding: '14px 16px', fontSize: 15, color: '#DC2626', textAlign: 'center', lineHeight: 1.5 }}>
              Invalid reset link. Please request a new one.
            </div>
          ) : done ? (
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.22)', borderRadius: 'var(--r-sm)', padding: '14px 16px', fontSize: 15, color: '#16A34A', textAlign: 'center', lineHeight: 1.5 }}>
              Password updated! Redirecting to login…
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={LABEL}>New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPass ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min 8 characters" required
                    style={{ ...FIELD, paddingRight: 44 }} onFocus={focus} onBlur={blur}
                  />
                  <button type="button" onClick={() => setShowPass(p => !p)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                    <Icon name={showPass ? ICONS.eye : ICONS.eyeOff} size={18} />
                  </button>
                </div>
              </div>
              <div>
                <label style={LABEL}>Confirm Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirm ? 'text' : 'password'} value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat your password" required
                    style={{ ...FIELD, paddingRight: 44 }} onFocus={focus} onBlur={blur}
                  />
                  <button type="button" onClick={() => setShowConfirm(p => !p)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                    <Icon name={showConfirm ? ICONS.eye : ICONS.eyeOff} size={18} />
                  </button>
                </div>
              </div>
              <button
                type="submit" disabled={loading}
                style={{ width: '100%', padding: '13px 20px', fontSize: 15, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.35)', opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s' }}
              >
                {loading ? 'Updating…' : 'Set New Password →'}
              </button>
            </form>
          )}

          <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-tertiary)', marginTop: 20 }}>
            <Link to="/login" style={{ color: 'var(--brand-color)', textDecoration: 'none', fontWeight: 500 }}>← Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
