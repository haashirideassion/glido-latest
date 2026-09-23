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

export default function CustomerLoginPage() {
  usePageTitle('Glido | Customer Portal Login')
  const [params]  = useSearchParams()
  const navigate  = useNavigate()
  const redirect  = params.get('redirect') ?? '/customer'

  const { login } = useAuth()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast('Please enter your email and password.', 'error')
      return
    }
    setIsSubmitting(true)
    try {
      const { success, error, role } = await login(email, password)
      if (!success) {
        toast(error ?? 'Sign in failed. Please try again.', 'error')
        return
      }
      toast('Welcome back!', 'success')
      navigate(role === 'customer' ? '/customer' : redirect)
    } catch (err: any) {
      toast(err?.message ?? 'Sign in failed. Please try again.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const reduce = useReducedMotion()

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', position: 'relative', overflowY: 'auto', overflowX: 'hidden', background: '#0B0A0F' }}>

      {/* ── Full-screen photo background ── */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${loginBgImg})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,10,14,0.75) 0%, rgba(8,10,14,0.55) 45%, rgba(8,10,14,0.80) 100%)' }} />
        <div style={{ position: 'absolute', top: '-12%', left: '50%', transform: 'translateX(-50%)', width: '70%', height: '45%', background: 'radial-gradient(ellipse, rgba(var(--brand-rgb),0.22), transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none' }} />
      </div>

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

          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h1 style={{ fontSize: 21, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', marginBottom: 5 }}>
              Customer Portal Login
            </h1>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
              Access your service requests and reports
            </p>
          </div>

          <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={LABEL}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required style={FIELD} onFocus={focus} onBlur={blur} />
            </div>
            <div>
              <label style={LABEL}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={{ ...FIELD, paddingRight: 44 }} onFocus={focus} onBlur={blur} />
                <button type="button" onClick={() => setShowPassword(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                  <Icon name={showPassword ? ICONS.eye : ICONS.eyeOff} size={18} />
                </button>
              </div>
            </div>
            <SubmitBtn loading={isSubmitting}>Sign In →</SubmitBtn>

            <div style={{ textAlign: 'center', marginTop: 6 }}>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.40)' }}>Forgot your password?</span>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.40)', textAlign: 'center', marginTop: 4 }}>
              Don't have a customer account? Contact your CFS depot to get set up.
            </p>
          </form>

          <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.35)', marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            Visitor?{' '}
            <Link to="/visitor-login" style={{ color: 'rgba(255,255,255,0.65)', textDecoration: 'underline', fontWeight: 500 }}>Sign in here</Link>
            {' '}·{' '}
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
