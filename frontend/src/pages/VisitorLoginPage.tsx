import { useState } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon, ICONS } from '@/lib/Icon'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'

const FIELD: React.CSSProperties = {
  width: '100%', padding: '11px 14px', fontSize: 15, color: '#1C1917',
  background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)',
  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
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

function GridSvg({ side }: { side: 'left' | 'right' }) {
  return (
    <svg width="497" height="418" viewBox="0 0 497 418" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', [side]: 0, top: '50%', transform: 'translateY(-50%)' }}>
      <g opacity="0.22">
        <line x1="495.384" y1="0.5" x2="-157" y2="0.499964" stroke="black"/>
        <line x1="495.384" y1="84.1426" x2="-157" y2="84.1425" stroke="black"/>
        <line x1="29.8955" y1="2.18557e-08" x2="29.8955" y2="417" stroke="black"/>
        <line x1="495.384" y1="167.785" x2="-157" y2="167.785" stroke="black"/>
        <line x1="123.093" y1="2.18557e-08" x2="123.093" y2="417" stroke="black"/>
        <line x1="495.384" y1="251.427" x2="-157" y2="251.427" stroke="black"/>
        <line x1="216.291" y1="2.18557e-08" x2="216.291" y2="417" stroke="black"/>
        <line x1="495.384" y1="333.858" x2="-157" y2="333.858" stroke="black"/>
        <line x1="309.489" y1="2.18557e-08" x2="309.489" y2="417" stroke="black"/>
        <line x1="495.384" y1="417.5" x2="-157" y2="417.5" stroke="black"/>
        <line x1="402.686" y1="2.18557e-08" x2="402.686" y2="417" stroke="black"/>
        <line x1="495.884" y1="2.18557e-08" x2="495.884" y2="417" stroke="black"/>
      </g>
    </svg>
  )
}

export default function VisitorLoginPage() {
  usePageTitle('Glido | Sign In')
  const [params]  = useSearchParams()
  const navigate  = useNavigate()
  const redirect  = params.get('redirect') ?? '/'

  const { login } = useAuth()

  const [tab, setTab] = useState<'signin' | 'signup'>(
    params.get('tab') === 'signup' ? 'signup' : 'signin'
  )

  // Single submitting flag shared across both forms
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Sign-in fields
  const [siEmail,    setSiEmail]    = useState('')
  const [siPassword, setSiPassword] = useState('')

  // Sign-up fields
  const [suFirst,   setSuFirst]   = useState('')
  const [suLast,    setSuLast]    = useState('')
  const [suEmail,   setSuEmail]   = useState('')
  const [suPhone,   setSuPhone]   = useState('')
  const [suPass,    setSuPass]    = useState('')
  const [suConfirm, setSuConfirm] = useState('')
  const [showSiPassword,  setShowSiPassword]  = useState(false)
  const [showSuPass,      setShowSuPass]      = useState(false)
  const [showSuConfirm,   setShowSuConfirm]   = useState(false)
  const [suCompany, setSuCompany] = useState('')

  // ── Sign In ──────────────────────────────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!siEmail || !siPassword) {
      toast('Please enter your email and password.', 'error')
      return
    }
    setIsSubmitting(true)
    try {
      const { success, error } = await login(siEmail, siPassword)
      if (!success) {
        toast(error ?? 'Sign in failed. Please try again.', 'error')
        return
      }
      toast('Welcome back!', 'success')
      navigate(redirect)
    } catch (err: any) {
      toast(err?.message ?? 'Sign in failed. Please try again.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Sign Up ──────────────────────────────────────────────────────────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!suFirst || !suLast || !suEmail || !suPass) {
      toast('Please fill in all required fields.', 'error')
      return
    }
    if (suPass !== suConfirm) {
      toast('Passwords do not match.', 'error')
      return
    }
    if (suPass.length < 8) {
      toast('Password must be at least 8 characters.', 'error')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: suFirst, lastName: suLast, email: suEmail, password: suPass }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast(data?.error?.message ?? 'Registration failed. Please try again.', 'error')
        return
      }
      // Auto sign-in with the returned token
      const { success, error } = await login(suEmail, suPass)
      if (!success) {
        toast(error ?? 'Account created. Please sign in.', 'error')
        setTab('signin')
        return
      }
      toast('Account created! Welcome to Glido.', 'success')
      navigate(redirect)
    } catch {
      toast('Registration failed. Please try again.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const PILL_BTN = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '9px 16px', fontSize: 15, fontWeight: 600, border: 'none',
    cursor: 'pointer', transition: 'all 0.18s ease', borderRadius: 'var(--r-full)',
    background: active ? '#fff' : 'transparent',
    color: active ? '#1C1917' : '#78716C',
    boxShadow: active ? '0 1px 5px rgba(0,0,0,0.12)' : 'none',
  })

  return (
    <div style={{ minHeight: 'calc(100vh - 56px - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', background: 'linear-gradient(120deg, rgba(var(--brand-rgb),0.06) 0%, rgba(var(--brand-rgb),0.02) 35%, rgba(255,255,255,0) 70%), #fff', position: 'relative', overflow: 'hidden' }}>

      {/* Grid patterns */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 380, pointerEvents: 'none', zIndex: 0, WebkitMaskImage: 'linear-gradient(to right,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)', maskImage: 'linear-gradient(to right,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)' }}>
        <GridSvg side="left" />
      </div>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 380, pointerEvents: 'none', zIndex: 0, WebkitMaskImage: 'linear-gradient(to left,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)', maskImage: 'linear-gradient(to left,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)' }}>
        <GridSvg side="right" />
      </div>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-xl)', padding: '28px 36px', boxShadow: '0 2px 8px rgba(0,0,0,0.04),0 16px 48px rgba(0,0,0,0.09)' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'var(--brand-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', boxShadow: '0 4px 14px rgba(var(--brand-rgb),0.38)' }}>
              <Icon name={ICONS.users} size={24} style={{ color: 'var(--brand-text)' }} />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', marginBottom: 5 }}>Sign in to Glido</h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Book and manage your visits</p>
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 3, background: '#ECEAE8', borderRadius: 'var(--r-full)', padding: 3, marginBottom: 20 }}>
            <button type="button" onClick={() => setTab('signin')} style={PILL_BTN(tab === 'signin')}>Sign In</button>
            <button type="button" onClick={() => setTab('signup')} style={PILL_BTN(tab === 'signup')}>Create Account</button>
          </div>

          {/* ── Sign In ── */}
          {tab === 'signin' && (
            <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={LABEL}>Email</label>
                <input type="email" value={siEmail} onChange={e => setSiEmail(e.target.value)} placeholder="you@example.com" required style={FIELD} onFocus={focus} onBlur={blur} />
              </div>
              <div>
                <label style={LABEL}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showSiPassword ? 'text' : 'password'} value={siPassword} onChange={e => setSiPassword(e.target.value)} placeholder="••••••••" required style={{ ...FIELD, paddingRight: 44 }} onFocus={focus} onBlur={blur} />
                  <button type="button" onClick={() => setShowSiPassword(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                    <Icon name={showSiPassword ? ICONS.eye : ICONS.eyeOff} size={18} />
                  </button>
                </div>
              </div>
              <SubmitBtn loading={isSubmitting}>Sign In →</SubmitBtn>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Forgot your password?</span>
                <button type="button" onClick={() => setTab('signup')} style={{ fontSize: 14, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Create an account instead
                </button>
              </div>
            </form>
          )}

          {/* ── Sign Up ── */}
          {tab === 'signup' && (
            <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LABEL}>First Name *</label>
                  <input type="text" value={suFirst} onChange={e => setSuFirst(e.target.value)} placeholder="Raj" required style={FIELD} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={LABEL}>Last Name *</label>
                  <input type="text" value={suLast} onChange={e => setSuLast(e.target.value)} placeholder="Sharma" required style={FIELD} onFocus={focus} onBlur={blur} />
                </div>
              </div>

              <div>
                <label style={LABEL}>Email *</label>
                <input type="email" value={suEmail} onChange={e => setSuEmail(e.target.value)} placeholder="you@example.com" required style={FIELD} onFocus={focus} onBlur={blur} />
              </div>

              <div>
                <label style={LABEL}>Phone <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10, color: 'var(--text-tertiary)' }}>(optional)</span></label>
                <input type="tel" value={suPhone} onChange={e => setSuPhone(e.target.value)} placeholder="+61 4XX XXX XXX" style={FIELD} onFocus={focus} onBlur={blur} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={LABEL}>Password *</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showSuPass ? 'text' : 'password'} value={suPass} onChange={e => setSuPass(e.target.value)} placeholder="Min 8 chars" required style={{ ...FIELD, paddingRight: 44 }} onFocus={focus} onBlur={blur} />
                    <button type="button" onClick={() => setShowSuPass(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                      <Icon name={showSuPass ? ICONS.eye : ICONS.eyeOff} size={18} />
                    </button>
                  </div>
                </div>
                <div>
                  <label style={LABEL}>Confirm *</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showSuConfirm ? 'text' : 'password'} value={suConfirm} onChange={e => setSuConfirm(e.target.value)} placeholder="••••••••" required style={{ ...FIELD, paddingRight: 44 }} onFocus={focus} onBlur={blur} />
                    <button type="button" onClick={() => setShowSuConfirm(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                      <Icon name={showSuConfirm ? ICONS.eye : ICONS.eyeOff} size={18} />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label style={LABEL}>Company <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10, color: 'var(--text-tertiary)' }}>(optional)</span></label>
                <input type="text" value={suCompany} onChange={e => setSuCompany(e.target.value)} placeholder="Transport Co., Freight Forwarders…" style={FIELD} onFocus={focus} onBlur={blur} />
              </div>

              <SubmitBtn loading={isSubmitting}>Create Account →</SubmitBtn>
            </form>
          )}

          {/* Divider + Guest */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
            <span style={{ fontSize: 14, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
          </div>
          <Link to={redirect} style={{ display: 'block', marginTop: 12, width: '100%', padding: 12, fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', background: '#fff', border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-md)', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s ease,color 0.15s ease' }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.28)'; e.currentTarget.style.color = '#1C1917' }}
            onMouseOut={e  => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.color = '#78716C' }}
          >Continue as Guest</Link>

          <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-tertiary)', marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.07)' }}>
            Reception staff?{' '}
            <Link to="/login" style={{ color: 'var(--text-secondary)', textDecoration: 'underline', fontWeight: 500 }}>Sign in here</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function SubmitBtn({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={loading} style={{ width: '100%', padding: '13px 20px', fontSize: 15, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.35)', marginTop: 2, opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s' }}>
      {loading ? (
        <>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: 'spin 0.7s linear infinite', flexShrink: 0 }}>
            <circle cx="7" cy="7" r="5" stroke="rgba(255,255,255,0.35)" strokeWidth="2"/>
            <path d="M7 2a5 5 0 0 1 5 5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Please wait…
        </>
      ) : children}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  )
}
