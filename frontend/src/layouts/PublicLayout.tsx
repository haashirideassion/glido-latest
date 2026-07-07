import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { GlidoLogo } from '@/lib/GlidoLogo'
import { Icon, ICONS } from '@/lib/Icon'
import { useAuth } from '@/contexts/AuthContext'
import { useTenantInfo } from '@/lib/useTenantInfo'

const PAGE_EASE = [0.16, 1, 0.3, 1] as const

const NAV_LINKS = [
  { to: '/modules',  label: 'Modules',     icon: ICONS.home     },
  { to: '/book',     label: 'Book a Slot', icon: ICONS.calendar },
  { to: '/bookings', label: 'My Bookings', icon: ICONS.bookings },
]

const FOOTER_COLS = [
  { heading: 'Platform',   links: [{ label: 'Book a Visit', to: '/book' }, { label: 'My Bookings', to: '/bookings' }, { label: 'Kiosk', to: '/kiosk' }] },
  { heading: 'Operations', links: [{ label: 'Reception', to: '/reception' }, { label: 'Dashboard', to: '/reception' }, { label: 'Reports', to: '/reception/reports' }] },
  { heading: 'Company',    links: [{ label: 'Privacy', to: '#' }, { label: 'Terms', to: '#' }, { label: 'Contact', to: '#' }] },
]

export default function PublicLayout() {
  const { pathname } = useLocation()
  const isImmersive = false
  const isDarkPage  = pathname === '/visitor-login' || pathname === '/login'
  const navigate = useNavigate()
  const outlet = useOutlet()
  const reduceMotionPage = useReducedMotion()
  const tenant = useTenantInfo()
  const { user, logout } = useAuth()
  const navRef    = useRef<HTMLElement>(null)
  const pillRef   = useRef<HTMLDivElement>(null)
  const wrapRef   = useRef<HTMLElement>(null)
  const hlRef     = useRef<HTMLDivElement>(null)
  const loginRef  = useRef<HTMLAnchorElement>(null)

  // Visitor account dropdown
  const [visitorMenuOpen, setVisitorMenuOpen] = useState(false)
  const visitorMenuRef = useRef<HTMLDivElement>(null)

  // Responsive: below 860px the nav pill + account button collapse into a hamburger
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 860 : false))
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 860)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (visitorMenuRef.current && !visitorMenuRef.current.contains(e.target as Node)) {
        setVisitorMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSignOut = () => {
    setVisitorMenuOpen(false)
    logout()
  }

  // Inject tenant brand colour as CSS custom properties
  useEffect(() => {
    const color = tenant?.primaryColor
    if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) return
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    document.documentElement.style.setProperty('--brand-color', color)
    document.documentElement.style.setProperty('--brand-rgb', `${r},${g},${b}`)
    const luminance = (0.2126 * (r/255)**2.2 + 0.7152 * (g/255)**2.2 + 0.0722 * (b/255)**2.2)
    const contrastWithBlack = (luminance + 0.05) / 0.05
    const contrastWithWhite = 1.05 / (luminance + 0.05)
    const brandText = contrastWithBlack >= contrastWithWhite ? '#000000' : '#ffffff'
    document.documentElement.style.setProperty('--brand-text', brandText)
    try { localStorage.setItem('glido_brand_color', color) } catch(e) {}
  }, [tenant?.primaryColor])

  // Floating pill scroll effect + liquid nav highlight
  useEffect(() => {
    const nav  = navRef.current
    const pill = pillRef.current
    if (!nav || !pill) return

    let pinned = false
    const onScroll = () => {
      const s = window.scrollY > 28
      if (s === pinned) return
      pinned = s
      if (s) {
        nav.style.padding = '10px 20px'
        pill.style.maxWidth = '860px'
        pill.style.margin = '0 auto'
        pill.style.borderRadius = '9999px'
        pill.style.borderColor = 'rgba(255,255,255,0.28)'
        pill.style.boxShadow = '0 1px 0 rgba(255,255,255,0.9) inset,0 4px 8px rgba(0,0,0,0.04),0 14px 36px rgba(0,0,0,0.11),0 0 0 1px rgba(0,0,0,0.05)'
      } else {
        nav.style.padding = '0'
        pill.style.maxWidth = '100%'
        pill.style.margin = '0'
        pill.style.borderRadius = '0'
        pill.style.borderColor = 'rgba(0,0,0,0.07)'
        pill.style.boxShadow = 'none'
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    // Liquid highlight
    const wrap = wrapRef.current
    const hl   = hlRef.current
    const links = wrap?.querySelectorAll<HTMLElement>('.nav-link')
    if (wrap && hl && links) {
      const enter = (link: HTMLElement) => () => {
        const lr = link.getBoundingClientRect()
        const wr = wrap.getBoundingClientRect()
        hl.style.opacity = '1'
        hl.style.width  = lr.width  + 'px'
        hl.style.height = lr.height + 'px'
        hl.style.left   = (lr.left - wr.left) + 'px'
        hl.style.top    = (lr.top  - wr.top)  + 'px'
      }
      const leave = () => { hl.style.opacity = '0' }
      links.forEach(l => { l.addEventListener('mouseenter', enter(l)); l.addEventListener('mouseleave', leave) })
    }

    // Login button shadow depth
    const login = loginRef.current
    if (login) {
      login.addEventListener('mouseenter', () => { login.style.boxShadow = '0 2px 6px rgba(0,0,0,0.07),0 8px 22px rgba(0,0,0,0.11),inset 0 1px 0 rgba(255,255,255,0.95)' })
      login.addEventListener('mouseleave', () => { login.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06),inset 0 1px 0 rgba(255,255,255,0.85)' })
    }

    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      {/* ── Nav ── */}
      {!isImmersive && (
      <header
        ref={navRef}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, padding: 0, pointerEvents: 'none', transition: 'padding 0.5s cubic-bezier(0.16,1,0.3,1)' }}
      >
        <div
          ref={pillRef}
          style={{
            pointerEvents: 'all',
            maxWidth: '100%',
            margin: 0,
            background: isDarkPage ? 'rgba(8,10,14,0.45)' : 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: isDarkPage ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(0,0,0,0.07)',
            borderRadius: 0,
            boxShadow: 'none',
            transition: 'max-width 0.5s cubic-bezier(0.16,1,0.3,1),margin 0.5s cubic-bezier(0.16,1,0.3,1),border-radius 0.5s cubic-bezier(0.16,1,0.3,1),box-shadow 0.5s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

            <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0, opacity: 1, transition: 'opacity 0.15s ease' }}
              onMouseOver={e => (e.currentTarget.style.opacity = '0.75')}
              onMouseOut={e  => (e.currentTarget.style.opacity = '1')}
            >
              <GlidoLogo height={21} onDark={isDarkPage} />
            </Link>

            {!isMobile && (
            <nav
              ref={wrapRef}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2, padding: 4, background: isDarkPage ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)', borderRadius: 'var(--r-full)' }}
            >
              <div
                ref={hlRef}
                style={{
                  position: 'absolute', borderRadius: 'var(--r-full)', background: isDarkPage ? 'rgba(255,255,255,0.13)' : '#fff',
                  boxShadow: isDarkPage ? 'none' : '0 1px 3px rgba(0,0,0,0.10),0 0 0 1px rgba(0,0,0,0.06)',
                  opacity: 0, pointerEvents: 'none', zIndex: 0,
                  transition: 'opacity 0.2s ease,width 0.25s cubic-bezier(0.16,1,0.3,1),height 0.25s cubic-bezier(0.16,1,0.3,1),left 0.25s cubic-bezier(0.16,1,0.3,1),top 0.25s cubic-bezier(0.16,1,0.3,1)',
                }}
              />
              {NAV_LINKS.map(l => (
                <Link
                  key={l.to}
                  to={l.to === '/book' && !user ? '/visitor-login?redirect=/book' : l.to}
                  className="nav-link"
                  style={{
                    position: 'relative', zIndex: 1,
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 13px', borderRadius: 'var(--r-full)',
                    fontSize: 15, fontWeight: (pathname === l.to || (l.to === '/book' && pathname === '/visitor-login')) ? 700 : 500,
                    color: (pathname === l.to || (l.to === '/book' && pathname === '/visitor-login')) ? 'var(--brand-color)' : isDarkPage ? 'rgba(255,255,255,0.65)' : '#78716C',
                    textDecoration: 'none',
                    transition: 'color 0.15s ease,transform 0.22s cubic-bezier(0.16,1,0.3,1)',
                    userSelect: 'none',
                  }}
                >
                  <Icon name={l.icon} size={16} style={{ opacity: 0.9 }} />
                  {l.label}
                </Link>
              ))}
            </nav>
            )}


            {isMobile ? (
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
                style={{ width: 40, height: 40, borderRadius: 'var(--r-full)', border: isDarkPage ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.10)', background: isDarkPage ? 'rgba(255,255,255,0.10)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isDarkPage ? '#fff' : '#1C1917'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/>
                </svg>
              </button>
            ) : user && (user.role === 'reception_staff' || user.role === 'reception_admin') ? (
              // Reception staff landed on a public page — point them back
              <Link
                to="/reception"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', fontSize: 15, fontWeight: 600, color: 'var(--brand-color)', background: 'rgba(var(--brand-rgb),0.07)', border: '1px solid rgba(var(--brand-rgb),0.22)', borderRadius: 'var(--r-full)', textDecoration: 'none', flexShrink: 0, transition: 'all 0.14s ease' }}
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(var(--brand-rgb),0.13)'; e.currentTarget.style.borderColor = 'rgba(var(--brand-rgb),0.38)' }}
                onMouseOut={e  => { e.currentTarget.style.background = 'rgba(var(--brand-rgb),0.07)'; e.currentTarget.style.borderColor = 'rgba(var(--brand-rgb),0.22)' }}
              >
                Go to Reception →
              </Link>
            ) : user ? (
              // Logged-in visitor — dropdown
              <div ref={visitorMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setVisitorMenuOpen(v => !v)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', fontSize: 15, fontWeight: 600, color: isDarkPage ? 'rgba(255,255,255,0.85)' : '#1C1917', background: isDarkPage ? 'rgba(255,255,255,0.10)' : 'linear-gradient(160deg,#F9F8F7 0%,#EEEDEC 100%)', border: isDarkPage ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-full)', cursor: 'pointer', boxShadow: isDarkPage ? 'none' : '0 1px 3px rgba(0,0,0,0.06),inset 0 1px 0 rgba(255,255,255,0.85)', fontFamily: 'inherit' }}
                >
                  <Icon name={ICONS.user} size={16} style={{ opacity: 0.7 }} />
                  {user.firstName ?? 'My Account'}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: isDarkPage ? 0.60 : 0.40, transition: 'transform 0.15s ease', transform: visitorMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {visitorMenuOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200, minWidth: 160, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 28px rgba(0,0,0,0.11),0 2px 6px rgba(0,0,0,0.06)', padding: 5 }}>
                    <Link
                      to="/profile"
                      onClick={() => setVisitorMenuOpen(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 'var(--r-sm)', fontSize: 15, fontWeight: 500, color: '#1C1917', textDecoration: 'none', transition: 'background 0.12s ease' }}
                      onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                      onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Icon name={ICONS.user} size={14} style={{ opacity: 0.55, flexShrink: 0 }} />
                      Profile
                    </Link>
                    <Link
                      to="/bookings"
                      onClick={() => setVisitorMenuOpen(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 'var(--r-sm)', fontSize: 15, fontWeight: 500, color: '#1C1917', textDecoration: 'none', transition: 'background 0.12s ease' }}
                      onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                      onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Icon name={ICONS.bookings} size={14} style={{ opacity: 0.55, flexShrink: 0 }} />
                      My Bookings
                    </Link>
                    <Link
                      to="/drivers"
                      onClick={() => setVisitorMenuOpen(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 'var(--r-sm)', fontSize: 15, fontWeight: 500, color: '#1C1917', textDecoration: 'none', transition: 'background 0.12s ease' }}
                      onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                      onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Icon name={ICONS.userCheck} size={14} style={{ opacity: 0.55, flexShrink: 0 }} />
                      Saved Drivers
                    </Link>
                    <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '4px 6px' }} />
                    <button
                      type="button"
                      onClick={handleSignOut}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 10px', borderRadius: 'var(--r-sm)', fontSize: 15, fontWeight: 500, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'background 0.12s ease' }}
                      onMouseOver={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.07)')}
                      onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Icon name={ICONS.arrowLeft} size={14} style={{ opacity: 0.70, flexShrink: 0 }} />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              // Not logged in
              <Link
                ref={loginRef}
                to="/visitor-login"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', fontSize: 15, fontWeight: 600, color: isDarkPage ? 'rgba(255,255,255,0.85)' : '#1C1917', background: isDarkPage ? 'rgba(255,255,255,0.10)' : 'linear-gradient(160deg,#F9F8F7 0%,#EEEDEC 100%)', border: isDarkPage ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-full)', textDecoration: 'none', boxShadow: isDarkPage ? 'none' : '0 1px 3px rgba(0,0,0,0.06),inset 0 1px 0 rgba(255,255,255,0.85)', flexShrink: 0, overflow: 'hidden', position: 'relative' }}
              >
                <Icon name={ICONS.users} size={13} style={{ opacity: isDarkPage ? 0.75 : 0.55 }} />
                Login
              </Link>
            )}
          </div>
        </div>
      </header>
      )}

      {/* ── Full-screen mobile menu ── */}
      {!isImmersive && isMobile && mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(250,250,249,0.94)', backdropFilter: 'blur(28px) saturate(140%)', WebkitBackdropFilter: 'blur(28px) saturate(140%)', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', animation: 'menuFadeIn 0.2s ease' }}>
          <button onClick={() => setMobileOpen(false)} aria-label="Close menu"
            style={{ position: 'fixed', top: 16, right: 16, width: 44, height: 44, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.10)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', zIndex: 1 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1C1917" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>

          <div style={{ marginTop: 80, marginBottom: 40, flexShrink: 0 }}>
            <GlidoLogo height={26} onDark={false} />
          </div>

          <nav style={{ width: '100%', maxWidth: 360, padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {NAV_LINKS.map(l => {
              const active = pathname === l.to || (l.to === '/book' && pathname === '/visitor-login')
              return (
                <Link
                  key={l.to}
                  to={l.to === '/book' && !user ? '/visitor-login?redirect=/book' : l.to}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '15px 18px', borderRadius: 14, textDecoration: 'none', fontSize: 17, fontWeight: 600, color: active ? 'var(--brand-color)' : '#1C1917', background: active ? 'rgba(var(--brand-rgb),0.12)' : 'transparent' }}
                >
                  <Icon name={l.icon} size={21} style={{ color: active ? 'var(--brand-color)' : '#57534E' }} />
                  <span>{l.label}</span>
                </Link>
              )
            })}
          </nav>

          <div style={{ width: '100%', maxWidth: 360, padding: '24px 22px 40px', marginTop: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {user && (user.role === 'reception_staff' || user.role === 'reception_admin') ? (
              <Link to="/reception" style={{ textAlign: 'center', padding: '14px', borderRadius: 999, background: 'rgba(var(--brand-rgb),0.10)', color: 'var(--brand-color)', textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>Go to Reception →</Link>
            ) : user ? (
              <>
                <Link to="/profile" style={{ textAlign: 'center', padding: '13px', borderRadius: 999, background: '#fff', border: '1px solid rgba(0,0,0,0.10)', color: '#1C1917', textDecoration: 'none', fontWeight: 600, fontSize: 15 }}>Profile</Link>
                <Link to="/drivers" style={{ textAlign: 'center', padding: '13px', borderRadius: 999, background: '#fff', border: '1px solid rgba(0,0,0,0.10)', color: '#1C1917', textDecoration: 'none', fontWeight: 600, fontSize: 15 }}>Saved Drivers</Link>
                <button type="button" onClick={handleSignOut} style={{ padding: '13px', borderRadius: 999, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)', color: '#DC2626', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>Sign Out</button>
              </>
            ) : (
              <Link to="/visitor-login" style={{ textAlign: 'center', padding: '14px', borderRadius: 999, background: 'var(--brand-color)', color: 'var(--brand-text)', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 8px 24px rgba(var(--brand-rgb),0.35)' }}>Login</Link>
            )}
          </div>
        </div>
      )}

      {/* ── Page content ── */}
      <main style={{ paddingTop: isImmersive ? 0 : 60, position: 'relative' }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={reduceMotionPage ? undefined : { opacity: 0, y: 14, scale: 0.99 }}
            animate={reduceMotionPage ? undefined : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotionPage ? undefined : { opacity: 0, y: -10, scale: 0.99 }}
            transition={{ duration: 0.38, ease: PAGE_EASE }}
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Footer ── */}
      {!isImmersive && (
      <footer style={{ borderTop: '1px solid #f0f0f0', background: '#fff', padding: '64px 24px 32px' }}>
        <div className="max-w-6xl mx-auto">
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 48, marginBottom: 48 }} className="footer-grid">

            <div>
              <div className="flex items-center mb-4">
                <GlidoLogo height={20} onDark={false} />
              </div>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 220 }}>
                Streamlining container freight station operations from booking to bay door.
              </p>
              <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                {[ICONS.email, ICONS.ship].map(icon => (
                  <a
                    key={icon}
                    href="#"
                    style={{ width: 32, height: 32, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s ease' }}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(var(--brand-rgb),0.12)')}
                    onMouseOut={e  => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
                  >
                    <Icon name={icon} size={14} style={{ color: 'var(--text-secondary)' }} />
                  </a>
                ))}
              </div>
            </div>

            {FOOTER_COLS.map(col => (
              <div key={col.heading}>
                <p style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 16 }}>{col.heading}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {col.links.map(l => (
                    <li key={l.label}>
                      <Link
                        to={l.to}
                        style={{ fontSize: 15, color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.15s ease' }}
                        onMouseOver={e => (e.currentTarget.style.color = '#1C1917')}
                        onMouseOut={e  => (e.currentTarget.style.color = '#78716C')}
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div style={{ paddingTop: 24, borderTop: '1px solid rgba(0,0,0,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>© 2026 {tenant?.name || 'Glido CFS'}. All rights reserved.</span>
            <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{tenant?.name || 'Sydney Container Freight Station'} · Mon–Fri 06:00–18:00</span>
          </div>
        </div>
      </footer>
      )}

      <style>{`
        @media (max-width:768px) { .footer-grid { grid-template-columns:1fr 1fr!important; gap:32px!important; } }
        @media (max-width:480px) { .footer-grid { grid-template-columns:1fr!important; } }
        @keyframes menuFadeIn { from { opacity:0 } to { opacity:1 } }
        .nav-link:hover { color:var(--brand-color)!important; transform:translateY(-1.5px); }
        .nav-link:active { color:var(--brand-color)!important; transform:translateY(0) scale(0.96); }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </>
  )
}
