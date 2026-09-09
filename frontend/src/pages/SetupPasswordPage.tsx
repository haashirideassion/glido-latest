import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { postFetcher } from '@/lib/fetcher'
import { GlidoLogo } from '@/lib/GlidoLogo'

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

export default function SetupPasswordPage() {
  usePageTitle('Glido | Set Up Your Account')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [password,    setPassword]    = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState('')
  const [done,        setDone]        = useState(false)

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Red Hat Display', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 17, color: '#EF4444', fontWeight: 600 }}>Invalid or missing setup link.</p>
          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginTop: 8 }}>Please ask your admin to resend the invite.</p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSubmitting(true)
    try {
      await postFetcher('/api/auth/reset-password', { token, password })
      setDone(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (err: any) {
      setError(err?.message ?? 'Setup failed. The link may have expired — ask your admin to resend.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9F9F9', fontFamily: "'Red Hat Display', ui-sans-serif, system-ui, sans-serif", padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <GlidoLogo height={20} onDark={false} />
        </div>

        <div style={{ background: '#fff', borderRadius: 'var(--r-xl)', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '36px 32px' }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(22,163,74,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1C1917', marginBottom: 8 }}>Password set!</h2>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Redirecting you to login…</p>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', marginBottom: 6, letterSpacing: '-0.02em' }}>Set up your account</h1>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.5 }}>
                Choose a password to complete your account setup.
              </p>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 18 }}>
                  <label style={LABEL}>New Password</label>
                  <input
                    type="password"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={focus} onBlur={blur}
                    style={FIELD}
                    autoFocus
                  />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={LABEL}>Confirm Password</label>
                  <input
                    type="password"
                    placeholder="Repeat password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    onFocus={focus} onBlur={blur}
                    style={FIELD}
                  />
                </div>

                {error && (
                  <div style={{ marginBottom: 18, padding: '10px 14px', borderRadius: 'var(--r-sm)', background: '#FEF2F2', border: '1px solid rgba(239,68,68,0.25)', fontSize: 14, color: '#DC2626' }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !password || !confirm}
                  style={{ width: '100%', padding: '12px', fontSize: 15, fontWeight: 700, color: '#fff', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting || !password || !confirm ? 0.65 : 1 }}
                >
                  {submitting ? 'Setting password…' : 'Set Password & Continue'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
