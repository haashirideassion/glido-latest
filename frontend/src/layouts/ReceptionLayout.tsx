import { useState, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import { NavLink, Outlet, useLocation, Link, useNavigate } from 'react-router-dom'
import { GlidoLogo } from '@/lib/GlidoLogo'
import { Icon, ICONS } from '@/lib/Icon'
import { initToast, toast } from '@/lib/toast'
import { useAuth } from '@/contexts/AuthContext'
import { useReceptionAuth } from '@/contexts/ReceptionAuthContext'
import { fetcher, patchFetcher } from '@/lib/fetcher'
import { useSignedUrl } from '@/lib/useSignedUrl'
import { useTenantInfo } from '@/lib/useTenantInfo'
import { useStaffPermissions } from '@/lib/useStaffPermissions'

const NAV = [
  { to: '/reception',           label: 'Dashboard', icon: ICONS.home,     badge: false },
  { to: '/reception/bookings',  label: 'Bookings',  icon: ICONS.bookings, badge: false },
  { to: '/reception/visitors',  label: 'Visitors',  icon: ICONS.walkIn,   badge: true  },
  { to: '/reception/reports',   label: 'Reports & Analytics',   icon: ICONS.reports,  badge: false, children: [
    { to: '/reception/reports/analytics',    label: 'Analytics',         icon: ICONS.chartBar },
    { to: '/reception/reports/visitor-log',  label: 'ABF Visitor Log',   icon: ICONS.document },
    { to: '/reception/reports/configure',    label: 'Configure Reports', icon: ICONS.settings },
  ]},
  { to: '/reception/carriers',   label: 'Carriers',   icon: ICONS.truck,    badge: false },
  { to: '/reception/broadcast',  label: 'Broadcast',  icon: ICONS.email,    badge: false },
  { to: '/reception/settings',   label: 'Settings',   icon: ICONS.settings, badge: false, children: [
    { to: '/reception/settings#general',          label: 'General',        icon: ICONS.info },
    { to: '/reception/settings#working-hours',    label: 'Working Hours',  icon: ICONS.clock },
    { to: '/reception/settings#slot-config',      label: 'Slot Config',    icon: ICONS.calendar },
    { to: '/reception/settings#pricing',          label: 'Pricing',        icon: ICONS.percent },
    { to: '/reception/settings#payment',          label: 'Payment',        icon: ICONS.walletMoney },
    { to: '/reception/settings#doc-requirements', label: 'Documents',      icon: ICONS.document },
    { to: '/reception/settings#integrations',     label: 'Integrations',   icon: ICONS.transshipment },
    { to: '/reception/settings#user-management',  label: 'Team',           icon: ICONS.users },
  ]},
] as const

declare global { interface Window { __echarts?: any } }

export default function ReceptionLayout() {
  const routerLocation = useLocation()
  const { pathname } = routerLocation
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { isStaff, role: staffRole } = useReceptionAuth()
  const perms = useStaffPermissions()

  // Block reception_staff from accessing Settings — redirect with toast
  useEffect(() => {
    if (isStaff && pathname.startsWith('/reception/settings')) {
      toast('You do not have permission to access Settings.', 'error')
      navigate('/reception', { replace: true })
    }
  }, [isStaff, pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignOut = () => logout()
  const [open, setOpen] = useState(() => localStorage.getItem('glido-sidebar') !== '0')
  // Responsive: below 900px the sidebar becomes an off-canvas drawer
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 900 : false))
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => { if (!isMobile) setMobileOpen(false) }, [isMobile])
  useEffect(() => { setMobileOpen(false) }, [pathname])
  const [walkInCount, setWalkInCount] = useState(0)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [logoErr, setLogoErr] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifs, setNotifs] = useState<any[]>([])
  const [sidebarExtra, setSidebarExtra] = useState<React.ReactNode>(null)
  const setSidebarExtraStable = useCallback((node: React.ReactNode) => setSidebarExtra(node), [])
  const [density, setDensity] = useState<'comfortable' | 'compact'>(
    () => (localStorage.getItem('glido-density') === 'compact' ? 'compact' : 'comfortable')
  )

  // Apply density preference to <html> so the CSS density-scale vars cascade everywhere
  useEffect(() => {
    document.documentElement.setAttribute('data-density', density)
    localStorage.setItem('glido-density', density)
  }, [density])

  // Staff name from JWT — no network call needed
  const staffName = user?.name ?? null
  const tenant = useTenantInfo()
  const logoSrc = useSignedUrl(tenant?.logoUrl)
  const profileLoading = false

  // Apply tenant brand colour to CSS variables whenever it loads
  useEffect(() => {
    const color = tenant?.primaryColor
    if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) return  // skip if no valid hex
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

  // Page title from current nav
  const activeNav = NAV.find(n => pathname === n.to || (n.to !== '/reception' && pathname.startsWith(n.to)))
  // Some routes use a shorter nav label but need a longer page heading
  const PAGE_TITLE_OVERRIDE: Record<string, string> = {
    '/reception/visitors': 'Visitor Management',
    '/reception/carriers':  'External Carriers',
    '/reception/broadcast': 'Broadcast Center',
  }
  const title = PAGE_TITLE_OVERRIDE[pathname] ?? activeNav?.label ?? 'Dashboard'

  const PAGE_SUBTITLE: Record<string, string> = {
    '/reception/bookings':  'Manage and track all depot bookings',
    '/reception/visitors':  'Visitor check-ins and walk-ins',
    '/reception/reports':   'Analytics, exports and ABF logs',
    '/reception/settings':  'Configure your facility',
    '/reception/carriers':  'Manage transport companies and freight forwarders',
    '/reception/broadcast': 'Send messages and notifications to external carriers',
  }
  // Dashboard shows the live date instead of a static description
  const todayLabel = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Australia/Sydney',
  })
  const subtitle = pathname === '/reception'
    ? todayLabel
    : (PAGE_SUBTITLE[pathname] ?? '')

  useEffect(() => { initToast() }, [])

  useEffect(() => {
    localStorage.setItem('glido-sidebar', open ? '1' : '0')
  }, [open])

  // Visitors badge — poll every 30s: undismissed walk-ins + checked-in bookings
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [wiRes, bkRes] = await Promise.all([
          fetcher('/api/walk-ins?active=true').catch(() => null),
          fetcher('/api/bookings?status=checked_in').catch(() => null),
        ])
        if (!cancelled) {
          const wiCount = Array.isArray(wiRes?.data) ? wiRes.data.length : 0
          const bkCount = Array.isArray(bkRes?.data) ? bkRes.data.length : 0
          setWalkInCount(wiCount + bkCount)
        }
      } catch { /* ignore */ }
    }
    load()
    const interval = setInterval(load, 15_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  // Notifications — poll unread count every 15s
  useEffect(() => {
    let cancelled = false
    const loadCount = async () => {
      try {
        const res = await fetcher('/api/notifications/unread-count')
        if (!cancelled) setUnreadCount(res?.unread ?? 0)
      } catch { /* ignore */ }
    }
    loadCount()
    const interval = setInterval(loadCount, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const openNotifications = async () => {
    setNotifOpen(v => {
      if (v) return false  // toggle off
      return true
    })
    // Always refresh list on open
    try {
      const res = await fetcher('/api/notifications')
      setNotifs(res?.data ?? [])
      setUnreadCount(0)
      // Mark all read in background
      patchFetcher('/api/notifications/read-all', {}).catch(() => {})
    } catch { /* ignore */ }
  }

  const initials   = staffName ? staffName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'
  const fullName   = staffName ?? 'Reception Agent'
  const tenantLine = tenant?.name ?? 'CFS'

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Red Hat Display', ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        *, *::before, *::after { font-family: 'Red Hat Display', ui-sans-serif, system-ui, sans-serif; }
        .sidebar-col { position: sticky; top: 0; height: 100vh; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; padding: 20px 12px; gap: 12px; width: 72px; transition: width 0.28s cubic-bezier(0.16,1,0.3,1); background: #f9f9f9; }
        .sidebar-col.is-open { width: 232px; }
        .nav-pill { position: relative; background: linear-gradient(168deg, #2a2622 0%, #1b1714 58%, #131110 100%); border-radius: 28px; padding: 6px; display: flex; flex-direction: column; gap: 2px; box-shadow: 0 10px 34px rgba(0,0,0,0.32), 0 2px 8px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.03); width: 52px; transition: width 0.28s cubic-bezier(0.16,1,0.3,1), border-radius 0.28s ease; }
        .nav-pill::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: radial-gradient(135% 52% at 50% 0%, rgba(var(--brand-rgb),0.20), transparent 66%); pointer-events: none; z-index: 0; }
        .nav-pill::after { content: ''; position: absolute; left: 14%; right: 14%; bottom: 0; height: 1px; border-radius: 1px; background: linear-gradient(90deg, transparent, rgba(var(--brand-rgb),0.35), transparent); pointer-events: none; z-index: 0; opacity: 0.6; }
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
        /* ── Expand hint caret (parents with sub-pages) ── */
        .nav-caret { display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 8px; color: rgba(255,255,255,0.45); opacity: 0; max-width: 0; overflow: hidden; transform: rotate(0deg); transition: opacity 0.16s ease, max-width 0.28s cubic-bezier(0.16,1,0.3,1), transform 0.24s cubic-bezier(0.16,1,0.3,1), color 0.15s ease; }
        .sidebar-col.is-open .nav-item .nav-caret { opacity: 1; max-width: 18px; }
        .nav-item:hover .nav-caret { color: rgba(255,255,255,0.75); }
        .nav-item.active .nav-caret { transform: rotate(90deg); color: var(--brand-color); }
        /* ── Sub-pages (clean indented items, no rail/dots) ── */
        .nav-subgroup { margin: 3px 0 5px 0; padding-left: 24px; display: flex; flex-direction: column; gap: 2px; animation: navSubIn 0.22s cubic-bezier(0.16,1,0.3,1); }
        .nav-subitem { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.58); border-radius: 8px; padding: 7px 11px; text-decoration: none; line-height: 1.2; white-space: nowrap; transition: background 0.15s ease, color 0.15s ease; }
        .nav-subitem-icon { display: flex; align-items: center; flex-shrink: 0; color: rgba(255,255,255,0.4); transition: color 0.15s ease; }
        .nav-subitem:hover { color: #ffffff; background: rgba(255,255,255,0.055); }
        .nav-subitem:hover .nav-subitem-icon { color: rgba(255,255,255,0.72); }
        .nav-subitem.active { color: #ffffff; font-weight: 600; background: rgba(var(--brand-rgb),0.20); }
        .nav-subitem.active .nav-subitem-icon { color: var(--brand-color); }
        @keyframes navSubIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .sidebar-col.is-open .nav-item:not(.active):hover { background: rgba(255,255,255,0.05); }
        .nav-item:not(.active):hover .nav-item-label { color: #ffffff; }
        /* Tooltip for collapsed sidebar */
        .sidebar-col:not(.is-open) .nav-item:hover::after {
          content: attr(data-label);
          position: absolute;
          left: calc(100% + 10px);
          top: 50%;
          transform: translateY(-50%);
          background: #1C1917;
          color: #FFFFFF;
          font-size: 13px;
          font-weight: 500;
          padding: 5px 10px;
          border-radius: 6px;
          white-space: nowrap;
          pointer-events: none;
          z-index: 2147483647;
          box-shadow: 0 4px 12px rgba(0,0,0,0.18);
        }
        .sidebar-col:not(.is-open) .nav-item:hover::before {
          content: '';
          position: absolute;
          left: calc(100% + 6px);
          top: 50%;
          transform: translateY(-50%);
          border: 4px solid transparent;
          border-right-color: #1C1917;
          pointer-events: none;
          z-index: 2147483647;
        }
        .action-btn { width: 48px; height: 48px; border-radius: 999px; background: var(--brand-color); color: var(--brand-text); display: flex; align-items: center; justify-content: center; gap: 0; border: none; cursor: pointer; flex-shrink: 0; transition: width 0.28s cubic-bezier(0.16,1,0.3,1), gap 0.28s ease, box-shadow 0.15s ease; box-shadow: 0 4px 16px rgba(var(--brand-rgb),0.38), 0 1px 4px rgba(var(--brand-rgb),0.20); text-decoration: none; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; position: relative; }
        .sidebar-col:not(.is-open) .action-btn { overflow: visible; }
        .sidebar-col.is-open .action-btn { width: 176px; gap: 8px; padding: 0 18px; justify-content: center; }
        .action-btn:hover { box-shadow: 0 6px 24px rgba(var(--brand-rgb),0.48), 0 2px 8px rgba(var(--brand-rgb),0.24); }
        .action-btn-label { opacity: 0; max-width: 0; overflow: hidden; pointer-events: none; transition: opacity 0.14s ease, max-width 0.28s cubic-bezier(0.16,1,0.3,1); }
        .sidebar-col.is-open .action-btn-label { opacity: 1; max-width: 140px; pointer-events: auto; transition: opacity 0.2s ease 0.14s, max-width 0.28s cubic-bezier(0.16,1,0.3,1); }
        .sidebar-toggle-btn { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; border: 1px solid rgba(0,0,0,0.09); background: #FFFFFF; color: #78716C; cursor: pointer; flex-shrink: 0; transition: background 0.13s ease, border-color 0.13s ease, color 0.13s ease; }
        .sidebar-toggle-btn:hover { background: #F3F2F1; border-color: rgba(0,0,0,0.14); color: #1C1917; }
        .sidebar-badge { flex-shrink: 0; opacity: 0; max-width: 0; overflow: hidden; pointer-events: none; transition: opacity 0.14s ease, max-width 0.28s cubic-bezier(0.16,1,0.3,1); }
        .sidebar-col.is-open .sidebar-badge { opacity: 1; max-width: 36px; pointer-events: auto; }
        .user-menu-item { display: flex; align-items: center; gap: 9px; padding: 9px 12px; border-radius: 9px; font-size: 13px; font-weight: 500; color: #374151; cursor: pointer; text-decoration: none; transition: background 0.12s ease; }
        .user-menu-item:hover { background: rgba(0,0,0,0.04); }
        .user-menu-item.danger { color: #EF4444; }
        .user-menu-item.danger:hover { background: rgba(239,68,68,0.07); }
        /* ── Responsive: hide desktop sidebar on mobile (full-screen menu instead) ── */
        @media (max-width: 900px) {
          .sidebar-col { display: none; }
        }
        @keyframes menuFade { from { opacity: 0; } to { opacity: 1; } }
        .mobile-menu-item { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 15px 18px; border-radius: 14px; text-decoration: none; font-size: 17px; font-weight: 600; color: #1C1917; transition: background 0.15s ease; }
        .mobile-menu-item:active { background: rgba(0,0,0,0.05); }
      `}</style>

      {/* Full-screen mobile menu — blurred white overlay, centered */}
      {isMobile && mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(250,250,249,0.94)', backdropFilter: 'blur(28px) saturate(140%)', WebkitBackdropFilter: 'blur(28px) saturate(140%)', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', animation: 'menuFade 0.2s ease' }}>
          {/* Close */}
          <button onClick={() => setMobileOpen(false)} aria-label="Close menu"
            style={{ position: 'fixed', top: 16, right: 16, width: 44, height: 44, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.10)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', zIndex: 1 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1C1917" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>

          {/* Big logo, centered */}
          <div style={{ marginTop: 80, marginBottom: 40, flexShrink: 0 }}>
            <GlidoLogo height={40} onDark={false} />
          </div>

          {/* Centered nav */}
          <nav style={{ width: '100%', maxWidth: 360, padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {NAV.filter(item => !(item.to === '/reception/settings' && isStaff)).map(item => {
              const isActive = item.to === '/reception'
                ? pathname === '/reception'
                : pathname.startsWith(item.to) && pathname !== '/reception/bookings/new'
              const hasChildren = 'children' in item && item.children
              return (
                <div key={item.to} style={{ display: 'flex', flexDirection: 'column' }}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/reception'}
                    onClick={() => setMobileOpen(false)}
                    className="mobile-menu-item"
                    style={{ color: isActive ? 'var(--brand-color)' : '#1C1917', background: isActive ? 'rgba(var(--brand-rgb),0.12)' : 'transparent' }}
                  >
                    <Icon name={item.icon} size={21} style={{ color: isActive ? 'var(--brand-color)' : '#57534E' }} />
                    <span>{item.label}</span>
                    {'badge' in item && item.badge && walkInCount > 0 && (
                      <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: '#EF4444', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{walkInCount}</span>
                    )}
                  </NavLink>
                  {hasChildren && isActive && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '2px 0 6px' }}>
                      {(item as any).children.map((sub: { to: string; label: string; icon?: string }) => (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          onClick={() => setMobileOpen(false)}
                          style={({ isActive: a }) => ({ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: '11px 16px', borderRadius: 11, textDecoration: 'none', fontSize: 15, fontWeight: 500, color: a ? 'var(--brand-color)' : '#57534E', background: a ? 'rgba(var(--brand-rgb),0.10)' : 'transparent' })}
                        >
                          {sub.icon && <Icon name={sub.icon} size={17} />}
                          <span>{sub.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>

          {/* New Booking */}
          {perms.can_create_manual_booking && (
            <div style={{ width: '100%', maxWidth: 360, padding: '24px 22px 40px', marginTop: 'auto', flexShrink: 0 }}>
              <button type="button" onClick={() => { setMobileOpen(false); navigate('/reception/bookings/new') }}
                style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '15px', borderRadius: 999, background: 'var(--brand-color)', color: 'var(--brand-text)', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700, boxShadow: '0 8px 24px rgba(var(--brand-rgb),0.35)' }}>
                <Icon name={ICONS.add} size={19} style={{ color: 'var(--brand-text)' }} /> New Booking
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`sidebar-col${(open || isMobile) ? ' is-open' : ''}${mobileOpen ? ' mobile-open' : ''}`}
        onClick={() => { if (isMobile) setMobileOpen(false) }}
      >

        {/* Logo */}
        <Link to="/reception" style={{ display: 'flex', alignItems: 'center', width: 40, justifyContent: 'center', transition: 'width 0.28s cubic-bezier(0.16,1,0.3,1)', ...(open ? { width: '100%' } : {}) }}>
          <GlidoLogo height={open ? 17 : 11} onDark={false} />
        </Link>

        {/* Nav pill */}
        <nav className="nav-pill">
          {NAV.filter(item => !(item.to === '/reception/settings' && isStaff)).map(item => {
            const isActive = item.to === '/reception'
              ? pathname === '/reception'
              : pathname.startsWith(item.to) && pathname !== '/reception/bookings/new'
            const hasChildren = 'children' in item && item.children
            return (
              <div key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/reception'}
                  className={() => `nav-item${isActive ? ' active' : ''}`}
                  data-label={item.label}
                >
                  <div className="nav-item-icon">
                    <Icon name={item.icon} size={18} style={{ color: isActive ? 'var(--brand-text)' : '#C7C7C6' }} />
                  </div>
                  <span className="nav-item-label">{item.label}</span>
                  {'badge' in item && item.badge && walkInCount > 0 && (
                    <span className="sidebar-badge" style={{ width: 20, height: 20, borderRadius: 'var(--r-full)', background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 4 }}>
                      {walkInCount}
                    </span>
                  )}
                  {hasChildren && (
                    <span className="nav-caret" aria-hidden="true">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                    </span>
                  )}
                </NavLink>

                {/* Sub-items — segmented tree group, visible when sidebar is open and parent is active */}
                {hasChildren && isActive && open && (
                  <div className="nav-subgroup">
                    {(item as any).children.map((sub: { to: string; label: string; icon?: string }) => {
                      const hashIdx = sub.to.indexOf('#')
                      const subHash = hashIdx >= 0 ? sub.to.slice(hashIdx) : ''
                      const subActive = subHash
                        ? (pathname.startsWith('/reception/settings') && (routerLocation.hash || '#general') === subHash)
                        : undefined
                      return (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          className={({ isActive: a }) => ((subActive ?? a) ? 'nav-subitem active' : 'nav-subitem')}
                        >
                          {sub.icon && <span className="nav-subitem-icon"><Icon name={sub.icon} size={15} /></span>}
                          <span>{sub.label}</span>
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {perms.can_create_manual_booking && (
          <motion.button type="button" className="action-btn" onClick={() => navigate('/reception/bookings/new')} whileTap={{ scale: 0.95 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
            <Icon name={ICONS.add} size={18} style={{ color: 'var(--brand-text)', flexShrink: 0 }} />
            <span className="action-btn-label">New Booking</span>
          </motion.button>
        )}

        {/* Page-injected sidebar slot */}
        {sidebarExtra && (
          open ? (
            <div style={{ width: 176 }}>
              {sidebarExtra}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              data-label="Filters"
              aria-label="Filters"
              className="nav-item"
              style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
            >
              <div className="nav-item-icon" style={{ background: '#1C1917', borderRadius: 'var(--r-full)', width: 48, height: 48 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 4h18l-7 8v6l-4 2v-8z"/>
                </svg>
              </div>
            </button>
          )
        )}

      </aside>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#f9f9f9' }}>
        {/* Header */}
        <header style={{ height: 'var(--dash-header-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 var(--dash-main-pad-x)', background: '#f9f9f9', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
            <button className="sidebar-toggle-btn" type="button" onClick={() => (isMobile ? setMobileOpen(v => !v) : setOpen(v => !v))} title="Toggle sidebar">
              {isMobile ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/>
                </svg>
              ) : open ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M9 3v18"/>
                  <path d="M15 9l-3 3 3 3"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M9 3v18"/>
                  <path d="M12 9l3 3-3 3"/>
                </svg>
              )}
            </button>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
              {subtitle && (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '1px 0 0', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</p>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {logoSrc && !isMobile && !logoErr && (
              <>
                <img src={logoSrc} alt="Company logo" onError={() => setLogoErr(true)} style={{ height: 30, objectFit: 'contain', maxWidth: 100 }} />
                <span style={{ width: 1, height: 26, background: 'rgba(0,0,0,0.10)', flexShrink: 0 }} />
              </>
            )}

            {/* Bell + notifications */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={openNotifications}
                title="Notifications"
                aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                style={{ width: 36, height: 36, borderRadius: 'var(--r-full)', border: '1px solid rgba(0,0,0,0.09)', background: notifOpen ? 'rgba(var(--brand-rgb),0.07)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.13s' }}
              >
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
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1917' }}>Notifications</span>
                      {notifs.length > 0 && (
                        <button onClick={() => { patchFetcher('/api/notifications/read-all', {}).catch(() => {}); setNotifs(prev => prev.map(n => ({ ...n, read: true }))) }} style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                          Mark all read
                        </button>
                      )}
                    </div>

                    {/* List */}
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                      {notifs.length === 0 ? (
                        <div style={{ padding: '40px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                          <Icon name={ICONS.bell} size={32} style={{ color: 'rgba(0,0,0,0.12)' }} />
                          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>No notifications yet</p>
                        </div>
                      ) : notifs.map(n => {
                        const icon = n.type === 'checkin' ? ICONS.checkSquare : n.type === 'walkin' ? ICONS.walkIn : n.type === 'booking_cancelled' ? ICONS.cancelled : n.type === 'new_booking' ? ICONS.bookings : ICONS.bell
                        const iconColor = n.type === 'checkin' ? '#16A34A' : n.type === 'walkin' ? '#7C3AED' : n.type === 'booking_cancelled' ? '#EF4444' : n.type === 'new_booking' ? '#0EA5E9' : '#6B7280'
                        const age = (() => {
                          const s = Math.floor((Date.now() - new Date(n.created_at).getTime()) / 1000)
                          if (s < 60) return 'Just now'
                          if (s < 3600) return `${Math.floor(s / 60)}m ago`
                          if (s < 86400) return `${Math.floor(s / 3600)}h ago`
                          return `${Math.floor(s / 86400)}d ago`
                        })()
                        // Destination route — specific ID > parsed ref > list fallback
                        const dest = (() => {
                          if (n.type === 'new_booking' || n.type === 'booking_cancelled') {
                            if (n.reference_id) return `/reception/bookings?select=${n.reference_id}`
                            // Parse ref from body: "... · Ref GLD-2026-XXXXX"
                            const m = (n.body ?? '').match(/Ref (GLD-[A-Z0-9-]+)/)
                            return m ? `/reception/bookings?select=${m[1]}` : '/reception/bookings'
                          }
                          if (n.type === 'checkin' || n.type === 'walkin')
                            return n.reference_id ? `/reception/visitors?select=${n.reference_id}` : '/reception/visitors'
                          return null
                        })()
                        // Parse booking body into { ref, detail } for prominent ref display
                        const bookingParsed = (() => {
                          if (n.type !== 'new_booking') return null
                          const b = n.body ?? ''
                          const parts = b.split(' · ')
                          if (parts.length < 4) return null
                          const [name, service, dateTime, refPart] = parts
                          const refStr = refPart?.replace(/^Ref /, '') ?? ''
                          const m = dateTime.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):\d{2}[–\-](\d{2}:\d{2})/)
                          const when = m
                            ? (() => {
                                const d = new Date(m[1] + 'T00:00:00')
                                const day = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
                                return `${day}, ${m[2]}–${m[3]}`
                              })()
                            : dateTime
                          return { ref: refStr, detail: `${name} · ${service} · ${when}` }
                        })()
                        const handleClick = async () => {
                          if (dest) { setNotifOpen(false); navigate(dest); return }
                          // Walk-in without reference_id: look up by visitor name from body
                          if (n.type === 'walkin' || n.type === 'checkin') {
                            const nameMatch = (n.body ?? '').match(/^(.+?) is (?:at the kiosk|here) requesting/)
                            if (nameMatch) {
                              try {
                                const res = await fetcher(`/api/walk-ins?visitorName=${encodeURIComponent(nameMatch[1])}`)
                                const wi = (res?.data ?? [])[0]
                                if (wi?.id) { setNotifOpen(false); navigate(`/reception/visitors/${wi.id}`); return }
                              } catch { /* fall through */ }
                            }
                            setNotifOpen(false); navigate('/reception/visitors')
                          }
                        }
                        return (
                          <div
                            key={n.id}
                            onClick={handleClick}
                            style={{
                              display: 'flex', gap: 12, padding: '13px 16px',
                              borderBottom: '1px solid rgba(0,0,0,0.05)',
                              background: n.read ? 'transparent' : 'rgba(0,0,0,0.018)',
                              cursor: dest ? 'pointer' : 'default',
                              transition: 'background 0.12s',
                            }}
                            onMouseOver={e => { e.currentTarget.style.background = dest ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.02)' }}
                            onMouseOut={e  => { e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(0,0,0,0.018)' }}
                          >
                            {/* Icon badge */}
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${iconColor}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                              <Icon name={icon} size={16} style={{ color: iconColor }} />
                            </div>
                            {/* Content */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: bookingParsed ? 5 : 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                  {!n.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-color)', flexShrink: 0, display: 'inline-block' }} />}
                                  <p style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', margin: 0, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</p>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#1C1917', whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{age}</span>
                              </div>
                              {bookingParsed ? (
                                <>
                                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1C1917', fontFamily: 'ui-monospace,monospace', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {bookingParsed.ref}
                                  </p>
                                  <p style={{ fontSize: 12, color: '#6B7280', margin: 0, lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {bookingParsed.detail}
                                  </p>
                                </>
                              ) : n.body ? (
                                <p style={{ fontSize: 12.5, color: '#374151', margin: 0, lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {n.body}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
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
                    {/* Density preference */}
                    <div style={{ padding: '10px 12px 6px' }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 7px' }}>Density</p>
                      <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.04)', borderRadius: 'var(--r-md)', padding: 3 }}>
                        {(['comfortable', 'compact'] as const).map(mode => {
                          const active = density === mode
                          return (
                            <button
                              key={mode}
                              onClick={() => setDensity(mode)}
                              style={{
                                flex: 1, padding: '6px 8px', borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer',
                                fontSize: 12, fontWeight: 600, fontFamily: 'inherit', textTransform: 'capitalize',
                                background: active ? '#FFFFFF' : 'transparent',
                                color: active ? '#1C1917' : 'var(--text-tertiary)',
                                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                                transition: 'background 0.13s ease, color 0.13s ease',
                              }}
                            >
                              {mode}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '2px 0' }} />
                    <div style={{ padding: 6 }}>
                      <button onClick={handleSignOut} className="user-menu-item danger" style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                        <Icon name={ICONS.logout} size={15} style={{ flexShrink: 0 }} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={() => setUserMenuOpen(v => !v)}
                title="Account menu"
                aria-label="Account menu"
                aria-haspopup="true"
                aria-expanded={userMenuOpen}
                style={{ width: 36, height: 36, borderRadius: 'var(--r-full)', border: 'none', background: 'var(--brand-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--brand-text)', flexShrink: 0, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {profileLoading ? '·' : initials}
              </button>
            </div>

          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 'var(--dash-main-pad-y) var(--dash-main-pad-x) var(--dash-main-pad-x)' }}>
          <Outlet context={{ setSidebarExtra: setSidebarExtraStable }} />
        </main>
      </div>
    </div>
  )
}
