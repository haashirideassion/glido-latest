import { useState } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Icon, ICONS } from '@/lib/Icon'
import { GlidoLogo } from '@/lib/GlidoLogo'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import staffLoginBgImg from '@/assets/staff-login-bg.jpg'

const FIELD: React.CSSProperties = {
  width: '100%', padding: '11px 14px', fontSize: 15, color: '#fff',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 'var(--r-sm)',
  outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
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

export interface ModuleLoginProps {
  /** Heading, e.g. "Billing Login" */
  title: string
  subtitle: string
  placeholder: string
  cta: string
  /** The ONLY role(s) this login accepts. Anyone else is signed straight back out and told to use their own login. */
  allowedRoles: string[]
  /** Where a successful sign-in lands when there is no valid ?redirect= */
  homePath: string
  /** A ?redirect= is honoured only when it points inside this module. */
  redirectPattern: RegExp
}

/**
 * A module's own sign-in screen. Used by Billing and by Packing & Unpacking — each mounts it on its own route
 * with its own copy and its own allowed role, so no module's login is shared with another's.
 */
export default function ModuleLogin({ title, subtitle, placeholder, cta, allowedRoles, homePath, redirectPattern }: ModuleLoginProps) {
  usePageTitle(`Glido | ${title}`)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { login, logout } = useAuth()
  const reduce = useReducedMotion()

  const [email,        setEmail]        = useState('')
  const [password,     setPassword]     = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const submit = async (e: React.FormEvent) => {
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
      if (!role || !allowedRoles.includes(role)) {
        // Valid account, wrong module — do not leave a session behind.
        logout({ redirect: false })
        toast('This account does not have access to this module. Please use the sign-in for your own module.', 'error')
        return
      }
      const wanted = searchParams.get('redirect')
      navigate(wanted && redirectPattern.test(wanted) ? wanted : homePath)
    } catch (err: any) {
      toast(err?.message ?? 'Sign in failed. Please try again.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', position: 'relative', overflowY: 'auto', overflowX: 'hidden', background: '#0B0A0F' }}>

      {/* ── Full-screen photo background ── */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${staffLoginBgImg})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
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
        style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 400, flexShrink: 0 }}
      >
        <div style={{
          background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(28px) saturate(160%)', WebkitBackdropFilter: 'blur(28px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 'var(--r-xl)', padding: '36px 40px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.20), 0 24px 70px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.10)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', marginBottom: 6 }}>{title}</h1>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{subtitle}</p>
          </div>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={LABEL}>Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={placeholder} required autoComplete="username"
                style={FIELD} onFocus={focus} onBlur={blur}
              />
            </div>
            <div>
              <label style={LABEL}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="current-password"
                  style={{ ...FIELD, paddingRight: 44 }} onFocus={focus} onBlur={blur}
                />
                <button type="button" onClick={() => setShowPassword(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center' }}>
                  <Icon name={showPassword ? ICONS.eye : ICONS.eyeOff} size={18} />
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{ width: '100%', padding: '13px 20px', fontSize: 15, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.35)', opacity: isSubmitting ? 0.7 : 1, transition: 'opacity 0.15s' }}
            >
              {isSubmitting ? 'Signing in…' : cta}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.40)', marginTop: 16 }}>
            <span style={{ color: 'var(--brand-color)', fontWeight: 500, cursor: 'pointer' }}>Forgot your password?</span>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
