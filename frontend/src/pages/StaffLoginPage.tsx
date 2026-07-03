import { useState } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, ICONS } from '@/lib/Icon'
import { useAuth } from '@/contexts/AuthContext'
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

function GridSvg({ side }: { side: 'left' | 'right' }) {
  return (
    <svg width="497" height="418" viewBox="0 0 497 418" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', [side]: 0, top: '50%', transform: 'translateY(-50%)' }}>
      <g opacity="0.22">
        <line x1="495.384" y1="0.5"        x2="-157" y2="0.499964"    stroke="black"/>
        <line x1="495.384" y1="84.1426"    x2="-157" y2="84.1425"     stroke="black"/>
        <line x1="29.8955"  y1="2.18557e-08" x2="29.8955"  y2="417"   stroke="black"/>
        <line x1="495.384" y1="167.785"    x2="-157" y2="167.785"     stroke="black"/>
        <line x1="123.093"  y1="2.18557e-08" x2="123.093"  y2="417"   stroke="black"/>
        <line x1="495.384" y1="251.427"    x2="-157" y2="251.427"     stroke="black"/>
        <line x1="216.291"  y1="2.18557e-08" x2="216.291"  y2="417"   stroke="black"/>
        <line x1="495.384" y1="333.858"    x2="-157" y2="333.858"     stroke="black"/>
        <line x1="309.489"  y1="2.18557e-08" x2="309.489"  y2="417"   stroke="black"/>
        <line x1="495.384" y1="417.5"      x2="-157" y2="417.5"       stroke="black"/>
        <line x1="402.686"  y1="2.18557e-08" x2="402.686"  y2="417"   stroke="black"/>
        <line x1="495.884"  y1="2.18557e-08" x2="495.884"  y2="417"   stroke="black"/>
      </g>
    </svg>
  )
}

export default function StaffLoginPage() {
  usePageTitle('Glido | Staff Login')
  const navigate = useNavigate()
  const { login } = useAuth()

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
      const { success, error } = await login(email, password)
      if (!success) {
        toast(error ?? 'Sign in failed. Please try again.', 'error')
        return
      }
      navigate('/reception')
    } catch (err: any) {
      toast(err?.message ?? 'Sign in failed. Please try again.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 56px - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', background: 'linear-gradient(120deg, rgba(var(--brand-rgb),0.06) 0%, rgba(var(--brand-rgb),0.02) 35%, rgba(255,255,255,0) 70%), #fff', position: 'relative', overflow: 'hidden' }}>

      {/* Grid patterns */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 380, pointerEvents: 'none', zIndex: 0, WebkitMaskImage: 'linear-gradient(to right,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)', maskImage: 'linear-gradient(to right,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)' }}>
        <GridSvg side="left" />
      </div>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 380, pointerEvents: 'none', zIndex: 0, WebkitMaskImage: 'linear-gradient(to left,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)', maskImage: 'linear-gradient(to left,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)' }}>
        <GridSvg side="right" />
      </div>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 400 }}>

        {/* Card */}
        <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-xl)', padding: '44px 40px', boxShadow: '0 2px 8px rgba(0,0,0,0.04),0 16px 48px rgba(0,0,0,0.09)' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'var(--brand-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 4px 14px rgba(var(--brand-rgb),0.38)' }}>
              <Icon name={ICONS.users} size={24} style={{ color: 'var(--brand-text)' }} />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', marginBottom: 6 }}>
              Reception Staff Login
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Enter your credentials to access the reception dashboard. Contact your admin if you don't have access.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={LABEL}>Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@cfs.com.au" required
                style={FIELD} onFocus={focus} onBlur={blur}
              />
            </div>
            <div>
              <label style={LABEL}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required
                  style={{ ...FIELD, paddingRight: 44 }} onFocus={focus} onBlur={blur}
                />
                <button type="button" onClick={() => setShowPassword(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                  <Icon name={showPassword ? ICONS.eye : ICONS.eyeOff} size={18} />
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{ width: '100%', padding: '13px 20px', fontSize: 15, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.35)', opacity: isSubmitting ? 0.7 : 1, transition: 'opacity 0.15s' }}
            >
              {isSubmitting ? 'Signing in…' : 'Sign in to Reception →'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-tertiary)', marginTop: 16 }}>
            <span style={{ color: 'var(--brand-color)', fontWeight: 500, cursor: 'pointer' }}>Forgot your password?</span>
          </p>
        </div>

        {/* Visitor link */}
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--text-tertiary)' }}>
          Visitor? Book your slot at the{' '}
          <Link to="/visitor-login" style={{ color: 'var(--text-secondary)', textDecoration: 'underline', fontWeight: 500, transition: 'color 0.15s ease' }}
            onMouseOver={e => (e.currentTarget.style.color = '#1C1917')}
            onMouseOut={e  => (e.currentTarget.style.color = '#78716C')}
          >visitor portal</Link>
        </p>
      </div>
    </div>
  )
}
