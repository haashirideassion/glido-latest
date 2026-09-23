import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { NavLink, Outlet, useLocation, Link, useNavigate } from 'react-router-dom'
import { GlidoLogo } from '@/lib/GlidoLogo'
import { Icon, ICONS } from '@/lib/Icon'
import { initToast } from '@/lib/toast'
import { useAuth } from '@/contexts/AuthContext'
import { useSignedUrl } from '@/lib/useSignedUrl'
import { useTenantInfo } from '@/lib/useTenantInfo'

const NAV = [
  { to: '/customer',           label: 'Dashboard',   icon: ICONS.home },
  { to: '/customer/requests',  label: 'My Requests', icon: ICONS.bookings },
  { to: '/customer/reports',   label: 'Reports',     icon: ICONS.reports },
  { to: '/customer/settings',  label: 'Settings',    icon: ICONS.settings },
] as const

export default function CustomerPortalLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const handleSignOut = () => logout()
  const [open, setOpen] = useState(() => localStorage.getItem('glido-sidebar') !== '0')
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 900 : false))
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => { if (!isMobile) setMobileOpen(false) }, [isMobile])
  useEffect(() => { setMobileOpen(false) }, [pathname])
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [logoErr, setLogoErr] = useState(false)
  // Always empty — see the notifications note near openNotifications() below.
  const unreadCount = 0
  const notifs: any[] = []

  const customerName = user?.name ?? null
  const tenant = useTenantInfo()
  const logoSrc = useSignedUrl(tenant?.logoUrl)

  // Apply tenant brand colour to CSS variables whenever it loads (mirrors ReceptionLayout)
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
    document.documentElement.style.setProperty('--brand-text', contrastWithBlack >= contrastWithWhite ? '#000000' : '#ffffff')
  }, [tenant?.primaryColor])

  // '/customer/requests/new' (the wizard) is a sibling of My Requests, not a sub-page of it —
  // it's reached via the standalone action button, not a NAV item, so it must not highlight
  // "My Requests" just because the path happens to be prefixed with /customer/requests.
  const isNewRequestRoute = pathname.startsWith('/customer/requests/new')
  const activeNav = isNewRequestRoute ? undefined : NAV.find(n => pathname === n.to || (n.to !== '/customer' && pathname.startsWith(n.to)))
  const title = isNewRequestRoute ? 'New Service Request' : (activeNav?.label ?? 'Dashboard')
  const todayLabel = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney',
  })
  const PAGE_SUBTITLE: Record<string, string> = {
    '/customer/requests': 'View and manage your service requests',
    '/customer/reports':  'Analytics on your service requests',
    '/customer/settings': 'Manage your account and preferences',
  }
  const subtitle = pathname === '/customer' ? todayLabel
    : isNewRequestRoute ? 'Submit a new import or export service request'
    : (PAGE_SUBTITLE[pathname] ?? '')

  useEffect(() => { initToast() }, [])
  useEffect(() => { localStorage.setItem('glido-sidebar', open ? '1' : '0') }, [open])

  // NOTE: /api/notifications is Reception's tenant-wide feed (booking/walk-in events) — it is
  // NOT scoped per customer, so it must never be called from here. There is no customer-scoped
  // notification channel yet, so the bell stays present (per FRD dashboard requirement) but
  // always empty rather than leaking depot operations data into a customer account. Revisit once
  // a real per-customer notification source (e.g. service-request stage changes) exists.
  const openNotifications = () => setNotifOpen(v => !v)

  const initials = customerName ? customerName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'
  const fullName = customerName ?? 'Customer'
  const tenantLine = tenant?.name ?? 'CFS'

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Red Hat Display', ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        *, *::before, *::after { font-family: 'Red Hat Display', ui-sans-serif, system-ui, sans-serif; }
        .sidebar-col { position: sticky; top: 0; height: 100vh; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; padding: 20px 12px; gap: 12px; width: 72px; transition: width 0.28s cubic-bezier(0.16,1,0.3,1); background: #f9f9f9; }
        .sidebar-col.is-open { width: 232px; }
        .nav-pill { position: relative; background: linear-gradient(168deg, #2a2622 0%, #1b1714 58%, #131110 100%); border-radius: 28px; padding: 6px; display: flex; flex-direction: column; gap: 2px; box-shadow: 0 10px 34px rgba(0,0,0,0.32), 0 2px 8px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.03); width: 52px; transition: width 0.28s cubic-bezier(0.16,1,0.3,1), border-radius 0.28s ease; }
        .nav-pill::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: radial-gradient(135% 52% at 50% 0%, rgba(var(--brand-rgb),0.20), transparent 66%); pointer-events: none; z-index: 0; }
        .nav-pill > div { position: relative; z-index: 1; }
        .sidebar-col.is-open .nav-pill { width: 208px; border-radius: 20px; }
        .nav-item { display: flex; align-items: center; gap: 0; padding: 0; border-radius: 22px; text-decoration: none; transition: background 0.15s ease, border-radius 0.28s ease, gap 0.28s cubic-bezier(0.16,1,0.3,1); overflow: hidden; flex-shrink: 0; position: relative; }
        .sidebar-col:not(.is-open) .nav-item { overflow: visible; }
        .sidebar-col.is-open .nav-item { gap: 6px; border-radius: 14px; }
        .nav-item-icon { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 19px; transition: background 0.18s ease, transform 0.24s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s ease; }
        .nav-item:hover .nav-item-icon { filter: brightness(1.08); }
        .nav-item:active .nav-item-icon { transform: scale(0.94); transition: transform 0.08s ease; }
        .nav-item-label { font-size: 13px; font-weight: 500; white-space: nowrap; color: #ffffff; padding-right: 10px; flex: 1; opacity: 0; max-width: 0; overflow: hidden; pointer-events: none; transition: color 0.15s ease, opacity 0.14s ease, max-width 0.28s cubic-bezier(0.16,1,0.3,1); }
        .sidebar-col.is-open .nav-item-label { opacity: 1; max-width: 160px; pointer-events: auto; transition: color 0.15s ease, opacity 0.2s ease 0.14s, max-width 0.28s cubic-bezier(0.16,1,0.3,1); }
        .nav-item.active .nav-item-icon { background: linear-gradient(155deg, color-mix(in srgb, var(--brand-color) 78%, #ffffff), var(--brand-color) 55%, color-mix(in srgb, var(--brand-color) 82%, #000000)); box-shadow: 0 5px 16px rgba(var(--brand-rgb),0.50), 0 1px 3px rgba(var(--brand-rgb),0.40), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 4px rgba(0,0,0,0.22); }
        .sidebar-col.is-open .nav-item.active { background: rgba(255,255,255,0.05); }
        .nav-item.active .nav-item-label { color: #ffffff; font-weight: 600; }
        .nav-item:not(.active):hover .nav-item-icon { background: rgba(255,255,255,0.06); }
        .sidebar-col.is-open .nav-item:not(.active):hover { background: rgba(255,255,255,0.05); }
        .nav-item:not(.active):hover .nav-item-label { color: #ffffff; }
        .sidebar-col:not(.is-open) .nav-item:hover::after {
          content: attr(data-label); position: absolute; left: calc(100% + 10px); top: 50%; transform: translateY(-50%);
          background: #1C1917; color: #FFFFFF; font-size: 13px; font-weight: 500; padding: 5px 10px; border-radius: 6px;
          white-space: nowrap; pointer-events: none; z-index: 2147483647; box-shadow: 0 4px 12px rgba(0,0,0,0.18);
        }
        .sidebar-col:not(.is-open) .nav-item:hover::before {
          content: ''; position: absolute; left: calc(100% + 6px); top: 50%; transform: translateY(-50%);
          border: 4px solid transparent; border-right-color: #1C1917; pointer-events: none; z-index: 2147483647;
        }
        .action-btn { width: 48px; height: 48px; border-radius: 999px; background: var(--brand-color); color: var(--brand-text); display: flex; align-items: center; justify-content: center; gap: 0; border: none; cursor: pointer; flex-shrink: 0; transition: width 0.28s cubic-bezier(0.16,1,0.3,1), gap 0.28s ease, box-shadow 0.15s ease; box-shadow: 0 4px 16px rgba(var(--brand-rgb),0.38), 0 1px 4px rgba(var(--brand-rgb),0.20); text-decoration: none; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; position: relative; }
        .sidebar-col:not(.is-open) .action-btn { overflow: visible; }
        .sidebar-col.is-open .action-btn { width: 208px; gap: 6px; padding: 0 14px; justify-content: center; }
        .action-btn:hover { box-shadow: 0 6px 24px rgba(var(--brand-rgb),0.48), 0 2px 8px rgba(var(--brand-rgb),0.24); }
        .action-btn-label { opacity: 0; max-width: 0; overflow: hidden; pointer-events: none; font-size: 12.5px; transition: opacity 0.14s ease, max-width 0.28s cubic-bezier(0.16,1,0.3,1); }
        .sidebar-col.is-open .action-btn-label { opacity: 1; max-width: 160px; pointer-events: auto; transition: opacity 0.2s ease 0.14s, max-width 0.28s cubic-bezier(0.16,1,0.3,1); }
        .sidebar-toggle-btn { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; border: 1px solid rgba(0,0,0,0.09); background: #FFFFFF; color: #78716C; cursor: pointer; flex-shrink: 0; transition: background 0.13s ease, border-color 0.13s ease, color 0.13s ease; }
        .sidebar-toggle-btn:hover { background: #F3F2F1; border-color: rgba(0,0,0,0.14); color: #1C1917; }
        .user-menu-item { display: flex; align-items: center; gap: 9px; padding: 9px 12px; border-radius: 9px; font-size: 13px; font-weight: 500; color: #374151; cursor: pointer; text-decoration: none; transition: background 0.12s ease; }
        .user-menu-item:hover { background: rgba(0,0,0,0.04); }
        .user-menu-item.danger { color: #EF4444; }
        .user-menu-item.danger:hover { background: rgba(239,68,68,0.07); }
        @media (max-width: 900px) { .sidebar-col { display: none; } }
        @keyframes menuFade { from { opacity: 0; } to { opacity: 1; } }
        .mobile-menu-item { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 15px 18px; border-radius: 14px; text-decoration: none; font-size: 17px; font-weight: 600; color: #1C1917; transition: background 0.15s ease; }
        .mobile-menu-item:active { background: rgba(0,0,0,0.05); }
      `}</style>

      {/* Full-screen mobile menu */}
      {isMobile && mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(250,250,249,0.94)', backdropFilter: 'blur(28px) saturate(140%)', WebkitBackdropFilter: 'blur(28px) saturate(140%)', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', animation: 'menuFade 0.2s ease' }}>
          <button onClick={() => setMobileOpen(false)} aria-label="Close menu"
            style={{ position: 'fixed', top: 16, right: 16, width: 44, height: 44, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.10)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', zIndex: 1 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1C1917" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
          <div style={{ marginTop: 80, marginBottom: 40, flexShrink: 0 }}>
            <GlidoLogo height={40} onDark={false} />
          </div>
          <nav style={{ width: '100%', maxWidth: 360, padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {NAV.map(item => {
              const isActive = item.to === '/customer' ? pathname === '/customer'
                : item.to === '/customer/requests' ? (pathname.startsWith(item.to) && !isNewRequestRoute)
                : pathname.startsWith(item.to)
              return (
                <NavLink key={item.to} to={item.to} end={item.to === '/customer'} onClick={() => setMobileOpen(false)} className="mobile-menu-item"
                  style={{ color: isActive ? 'var(--brand-color)' : '#1C1917', background: isActive ? 'rgba(var(--brand-rgb),0.12)' : 'transparent' }}>
                  <Icon name={item.icon} size={21} style={{ color: isActive ? 'var(--brand-color)' : '#57534E' }} />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>
          <div style={{ width: '100%', maxWidth: 360, padding: '24px 22px 40px', marginTop: 'auto', flexShrink: 0 }}>
            <button type="button" onClick={() => { setMobileOpen(false); navigate('/customer/requests/new') }}
              style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '15px', borderRadius: 999, background: 'var(--brand-color)', color: 'var(--brand-text)', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700, boxShadow: '0 8px 24px rgba(var(--brand-rgb),0.35)' }}>
              <Icon name={ICONS.add} size={19} style={{ color: 'var(--brand-text)' }} /> New Service Request
            </button>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar-col${(open || isMobile) ? ' is-open' : ''}`} onClick={() => { if (isMobile) setMobileOpen(false) }}>
        <Link to="/customer" style={{ display: 'flex', alignItems: 'center', width: 40, justifyContent: 'center', transition: 'width 0.28s cubic-bezier(0.16,1,0.3,1)', ...(open ? { width: '100%' } : {}) }}>
          <GlidoLogo height={open ? 17 : 11} onDark={false} />
        </Link>

        <nav className="nav-pill">
          {NAV.map(item => {
            const isActive = item.to === '/customer' ? pathname === '/customer'
              : item.to === '/customer/requests' ? (pathname.startsWith(item.to) && !isNewRequestRoute)
              : pathname.startsWith(item.to)
            return (
              <NavLink key={item.to} to={item.to} end={item.to === '/customer'} className={() => `nav-item${isActive ? ' active' : ''}`} data-label={item.label}>
                <div className="nav-item-icon">
                  <Icon name={item.icon} size={18} style={{ color: isActive ? 'var(--brand-text)' : '#C7C7C6' }} />
                </div>
                <span className="nav-item-label">{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <motion.button type="button" className="action-btn" onClick={() => navigate('/customer/requests/new')} whileTap={{ scale: 0.95 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
          <Icon name={ICONS.add} size={18} style={{ color: 'var(--brand-text)', flexShrink: 0 }} />
          <span className="action-btn-label">New Service Request</span>
        </motion.button>
      </aside>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#f9f9f9' }}>
        <header style={{ height: 'var(--dash-header-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 var(--dash-main-pad-x)', background: '#f9f9f9', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
            <button className="sidebar-toggle-btn" type="button" onClick={() => (isMobile ? setMobileOpen(v => !v) : setOpen(v => !v))} title="Toggle sidebar">
              {isMobile ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></svg>
              ) : open ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 9l-3 3 3 3"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M12 9l3 3-3 3"/></svg>
              )}
            </button>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
              {subtitle && <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '1px 0 0', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</p>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {logoSrc && !isMobile && !logoErr && (
              <>
                <img src={logoSrc} alt="Company logo" onError={() => setLogoErr(true)} style={{ height: 30, objectFit: 'contain', maxWidth: 100 }} />
                <span style={{ width: 1, height: 26, background: 'rgba(0,0,0,0.10)', flexShrink: 0 }} />
              </>
            )}

            {/* Notifications */}
            <div style={{ position: 'relative' }}>
              <button type="button" onClick={openNotifications} title="Notifications"
                aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                style={{ width: 36, height: 36, borderRadius: 'var(--r-full)', border: '1px solid rgba(0,0,0,0.09)', background: notifOpen ? 'rgba(var(--brand-rgb),0.07)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.13s' }}>
                <Icon name={ICONS.bell} size={17} style={{ color: notifOpen ? 'var(--brand-color)' : '#6B7280' }} />
                {unreadCount > 0 && (
                  <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 999, background: '#EF4444', border: '2px solid #f9f9f9', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: '0 3px' }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 9100 }} onClick={() => setNotifOpen(false)} />
                  <div style={{ position: 'fixed', top: 56, right: 60, zIndex: 9101, width: 360, background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-lg)', boxShadow: '0 12px 40px rgba(0,0,0,0.15),0 3px 10px rgba(0,0,0,0.07)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 480 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1917' }}>Notifications</span>
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                      {notifs.length === 0 ? (
                        <div style={{ padding: '40px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                          <Icon name={ICONS.bell} size={32} style={{ color: 'rgba(0,0,0,0.12)' }} />
                          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>No notifications yet</p>
                        </div>
                      ) : notifs.map(n => (
                        <div key={n.id} style={{ display: 'flex', gap: 12, padding: '13px 16px', borderBottom: '1px solid rgba(0,0,0,0.05)', background: n.read ? 'transparent' : 'rgba(0,0,0,0.018)' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', margin: '0 0 4px' }}>{n.title}</p>
                            {n.body && <p style={{ fontSize: 12.5, color: '#374151', margin: 0, lineHeight: 1.45 }}>{n.body}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* User avatar + popover */}
            <div style={{ position: 'relative' }}>
              {userMenuOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 9100 }} onClick={() => setUserMenuOpen(false)} />
                  <div style={{ position: 'fixed', top: 56, right: 16, zIndex: 9101, width: 232, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-lg)', boxShadow: '0 12px 40px rgba(0,0,0,0.15),0 3px 10px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'rgba(var(--brand-rgb),0.025)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 'var(--r-full)', background: 'var(--brand-color)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--brand-text)', flexShrink: 0 }}>{initials}</div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName}</p>
                        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{tenantLine}</p>
                      </div>
                    </div>
                    <div style={{ padding: 6 }}>
                      <button onClick={handleSignOut} className="user-menu-item danger" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                        <Icon name={ICONS.logout} size={15} style={{ flexShrink: 0 }} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
              <button type="button" onClick={() => setUserMenuOpen(v => !v)} title="Account menu" aria-label="Account menu" aria-haspopup="true" aria-expanded={userMenuOpen}
                style={{ width: 36, height: 36, borderRadius: 'var(--r-full)', border: 'none', background: 'var(--brand-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--brand-text)', flexShrink: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                {initials}
              </button>
            </div>
          </div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', padding: 'var(--dash-main-pad-y) var(--dash-main-pad-x) var(--dash-main-pad-x)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
