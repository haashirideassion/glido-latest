import { useState } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Icon, ICONS } from '@/lib/Icon'
import { GlidoLogo } from '@/lib/GlidoLogo'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import loginBgImg from '@/assets/login-bg.webp'

const FIELD: React.CSSProperties = {
  width: '100%', padding: '11px 14px', fontSize: 15, color: '#fff',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 'var(--r-sm)',
  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
}
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)',
  letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 8,
}
const focus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = 'rgba(var(--brand-rgb),0.55)'
  e.target.style.boxShadow   = '0 0 0 3px rgba(var(--brand-rgb),0.18)'
}
const blur = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = 'rgba(255,255,255,0.14)'
  e.target.style.boxShadow   = 'none'
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
        body: JSON.stringify({ firstName: suFirst, lastName: suLast, email: suEmail, password: suPass, companyName: suCompany.trim() || undefined }),
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
    background: active ? 'rgba(255,255,255,0.14)' : 'transparent',
    color: active ? '#fff' : 'rgba(255,255,255,0.45)',
    boxShadow: active ? '0 1px 5px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)' : 'none',
  })

  const reduce = useReducedMotion()

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', position: 'relative', overflowY: 'auto', overflowX: 'hidden', background: '#0B0A0F' }}>

      {/* ── Full-screen photo background ── */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${loginBgImg})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,10,14,0.75) 0%, rgba(8,10,14,0.55) 45%, rgba(8,10,14,0.80) 100%)' }} />
        {/* Ambient brand glow, top-centre — anchors the logo */}
        <div style={{ position: 'absolute', top: '-12%', left: '50%', transform: 'translateX(-50%)', width: '70%', height: '45%', background: 'radial-gradient(ellipse, rgba(var(--brand-rgb),0.22), transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none' }} />
      </div>

      {/* Floating brand mark, top-centre — flows above the card so a taller signup form pushes it up together, never overlaps */}
      <motion.div
        initial={reduce ? undefined : { opacity: 0, y: -16 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'relative', zIndex: 1, marginBottom: 32, flexShrink: 0 }}
      >
        <GlidoLogo height={22} onDark />
      </motion.div>

      <motion.div
        initial={reduce ? undefined : { opacity: 0, y: 24, scale: 0.98 }}
        animate={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, flexShrink: 0 }}
      >
        <div style={{
          background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(28px) saturate(160%)', WebkitBackdropFilter: 'blur(28px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 'var(--r-xl)', padding: '28px 36px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.20), 0 24px 70px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.10)',
        }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h1 style={{ fontSize: 21, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', marginBottom: 5 }}>Sign in to Glido</h1>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>Book and manage your visits</p>
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--r-full)', padding: 3, marginBottom: 20 }}>
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
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.40)' }}>Forgot your password?</span>
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
                <label style={LABEL}>Phone <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>(optional)</span></label>
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
                <label style={LABEL}>Company <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>(optional)</span></label>
                <input type="text" value={suCompany} onChange={e => setSuCompany(e.target.value)} placeholder="Transport Co., Freight Forwarders…" style={FIELD} onFocus={focus} onBlur={blur} />
              </div>

              <SubmitBtn loading={isSubmitting}>Create Account →</SubmitBtn>
            </form>
          )}

          {/* Divider + Guest */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.10)' }} />
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.40)', whiteSpace: 'nowrap' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.10)' }} />
          </div>
          <Link to={redirect} style={{ display: 'block', marginTop: 12, width: '100%', padding: 12, fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.65)', background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.14)', borderRadius: 'var(--r-md)', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s ease,color 0.15s ease,background 0.15s ease' }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.30)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.09)' }}
            onMouseOut={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
          >Continue as Guest</Link>

          <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.35)', marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            Reception staff?{' '}
            <Link to="/login" style={{ color: 'rgba(255,255,255,0.65)', textDecoration: 'underline', fontWeight: 500 }}>Sign in here</Link>
          </p>
        </div>
      </motion.div>
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
