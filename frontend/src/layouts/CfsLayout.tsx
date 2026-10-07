import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { GlidoLogo } from '@/lib/GlidoLogo'
import { Icon, ICONS } from '@/lib/Icon'
import { initToast } from '@/lib/toast'
import { useAuth } from '@/contexts/AuthContext'
import { useSignedUrl } from '@/lib/useSignedUrl'
import { useTenantInfo } from '@/lib/useTenantInfo'
import { CfsContext } from '@/components/cfs/CfsContext'
import { CfsGlobalStyles } from '@/components/cfs/ui'
import {
  cfs, isMode, MODE_TO_DIRECTION, STAGE_ORDER, STAGE_TO_SLUG, stageLabel, stagePath, jobNoun,
  type Mode, type Stage, type StageSummary, type StageSlug, SLUG_TO_STAGE, isStageSlug,
} from '@/lib/cfs'

const MODE_KEY = 'glido-cfs-mode'

const STAGE_ICON: Record<Stage, string> = {
  new_request: ICONS.add, manifested: ICONS.document, planned: ICONS.calendar, result_validation: ICONS.checkSquare, completed: ICONS.container,
}

function stageCount(s: StageSummary | null, stage: Stage): number | null {
  if (!s) return null
  switch (stage) {
    case 'new_request':       return s.new_request.total
    case 'manifested':        return s.manifested
    case 'planned':           return s.planned.total
    case 'result_validation': return s.result_validation
    case 'completed':         return s.completed
  }
}

export default function CfsLayout() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const tenant = useTenantInfo()
  const logoSrc = useSignedUrl(tenant?.logoUrl)

  // Which module (Unpacking / Packing) is showing. The URL wins; screens without a mode in
  // the path (settings, create-request) fall back to ?mode= and then the last one used.
  const [sticky, setSticky] = useState<Mode>(() => {
    try { const m = localStorage.getItem(MODE_KEY); return isMode(m) ? m : 'unpacking' } catch { return 'unpacking' }
  })
  const seg = pathname.split('/').filter(Boolean)           // ['packing-unpacking', 'unpacking', 'planned']
  const urlMode = isMode(seg[1]) ? seg[1] : null
  const queryMode = new URLSearchParams(search).get('mode')
  const mode: Mode = urlMode ?? (isMode(queryMode) ? queryMode : sticky)
  const direction = MODE_TO_DIRECTION[mode]
  useEffect(() => {
    if (urlMode && urlMode !== sticky) { setSticky(urlMode); try { localStorage.setItem(MODE_KEY, urlMode) } catch { /* noop */ } }
  }, [urlMode, sticky])

  const urlStage: Stage | null = urlMode && isStageSlug(seg[2]) ? SLUG_TO_STAGE[seg[2] as StageSlug] : null
  const [focusStage, setFocusStage] = useState<Stage | null>(null)
  const activeStage: Stage | null = focusStage ?? urlStage

  // Sidebar counts — refreshed on a timer and after any action that moves a job.
  const [summary, setSummary] = useState<StageSummary | null>(null)
  const refreshSummary = useCallback(() => {
    cfs.summary(direction).then(setSummary).catch(() => { /* keep the last counts */ })
  }, [direction])
  useEffect(() => {
    setSummary(null)
    refreshSummary()
    const t = setInterval(() => { if (!document.hidden) refreshSummary() }, 30000)
    return () => clearInterval(t)
  }, [refreshSummary])

  useEffect(() => { initToast() }, [])
  useEffect(() => {
    const color = tenant?.primaryColor
    if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) return
    const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16)
    document.documentElement.style.setProperty('--brand-color', color)
    document.documentElement.style.setProperty('--brand-rgb', `${r},${g},${b}`)
    const lum = 0.2126 * (r / 255) ** 2.2 + 0.7152 * (g / 255) ** 2.2 + 0.0722 * (b / 255) ** 2.2
    document.documentElement.style.setProperty('--brand-text', (lum + 0.05) / 0.05 >= 1.05 / (lum + 0.05) ? '#000000' : '#ffffff')
  }, [tenant?.primaryColor])

  const [open, setOpen] = useState(() => { try { return localStorage.getItem('glido-sidebar') !== '0' } catch { return true } })
  useEffect(() => { try { localStorage.setItem('glido-sidebar', open ? '1' : '0') } catch { /* noop */ } }, [open])
  const [userMenu, setUserMenu] = useState(false)
  const [logoErr, setLogoErr] = useState(false)

  const isAdmin = user?.role === 'packing'
  const ctx = useMemo(() => ({ mode, direction, summary, refreshSummary, isAdmin, focusStage, setFocusStage }),
    [mode, direction, summary, refreshSummary, isAdmin, focusStage])

  const staffName = user?.name ?? ''
  const initials = staffName ? staffName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'

  const onSettings = pathname.startsWith('/packing-unpacking/settings')
  const onCreate = pathname.startsWith('/packing-unpacking/requests/new')
  const title = onSettings ? 'Settings' : onCreate ? 'New request' : `${jobNoun(direction)}${activeStage ? ' · ' + stageLabel(activeStage, direction) : ''}`
  const subtitle = onSettings ? 'Teams, locations, notifications and manifest rules'
    : onCreate ? 'Enter a request on behalf of a customer'
    : direction === 'import' ? 'Import containers: validate the manifest against ICS, plan and unpack'
    : 'Export containers: key in the data, push it to ICS, plan and pack'

  const switchMode = (m: Mode) => {
    if (m === mode) return
    try { localStorage.setItem(MODE_KEY, m) } catch { /* noop */ }
    setSticky(m)
    navigate(`/packing-unpacking/${m}/${urlStage ? STAGE_TO_SLUG[urlStage] : 'new'}`)
  }

  return (
    <CfsContext.Provider value={ctx}>
      <div style={{ display: 'flex', height: '100vh', fontFamily: "'Red Hat Display', ui-sans-serif, system-ui, sans-serif" }}>
        <CfsGlobalStyles />
        <style>{`
          .cfs-side { position: sticky; top: 0; height: 100vh; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; padding: 20px 12px; gap: 12px; width: 72px; transition: width 0.25s cubic-bezier(0.16,1,0.3,1); background: #f9f9f9; }
          .cfs-side.is-open { width: 244px; }
          .cfs-pill { background: linear-gradient(168deg, #2a2622 0%, #1b1714 58%, #131110 100%); border-radius: 28px; padding: 6px; display: flex; flex-direction: column; gap: 2px; width: 52px; box-shadow: 0 10px 34px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.10); transition: width 0.25s cubic-bezier(0.16,1,0.3,1), border-radius 0.25s ease; }
          .cfs-side.is-open .cfs-pill { width: 220px; border-radius: 20px; }
          .cfs-item { display: flex; align-items: center; gap: 0; border-radius: 22px; text-decoration: none; overflow: hidden; position: relative; }
          .cfs-side.is-open .cfs-item { gap: 6px; border-radius: 14px; }
          .cfs-item-icon { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 19px; }
          .cfs-item.active .cfs-item-icon { background: linear-gradient(155deg, color-mix(in srgb, var(--brand-color) 78%, #fff), var(--brand-color) 55%, color-mix(in srgb, var(--brand-color) 82%, #000)); box-shadow: 0 5px 16px rgba(var(--brand-rgb),0.45), inset 0 1px 0 rgba(255,255,255,0.5); }
          .cfs-item:not(.active):hover .cfs-item-icon { background: rgba(255,255,255,0.07); }
          .cfs-item-label { font-size: 13px; font-weight: 500; color: #fff; white-space: nowrap; flex: 1; opacity: 0; max-width: 0; overflow: hidden; transition: opacity 0.15s ease, max-width 0.25s ease; }
          .cfs-side.is-open .cfs-item-label { opacity: 1; max-width: 150px; }
          .cfs-item.active .cfs-item-label { font-weight: 700; }
          .cfs-count { font-size: 11px; font-weight: 700; min-width: 20px; text-align: center; padding: 1px 6px; margin-right: 8px; border-radius: 999px; background: rgba(255,255,255,0.14); color: #fff; opacity: 0; max-width: 0; overflow: hidden; }
          .cfs-side.is-open .cfs-count { opacity: 1; max-width: 48px; }
          .cfs-sep { height: 1px; background: rgba(255,255,255,0.10); margin: 4px 10px; }
          .cfs-side:not(.is-open) .cfs-item:hover::after { content: attr(data-label); position: absolute; left: calc(100% + 10px); top: 50%; transform: translateY(-50%); background: #1C1917; color: #fff; font-size: 13px; font-weight: 500; padding: 5px 10px; border-radius: 6px; white-space: nowrap; pointer-events: none; z-index: 2147483647; }
          .cfs-side:not(.is-open) .cfs-item { overflow: visible; }
          .cfs-seg { display: inline-flex; background: rgba(0,0,0,0.05); border-radius: 999px; padding: 3px; gap: 2px; }
          .cfs-seg button { border: none; background: transparent; padding: 6px 16px; border-radius: 999px; font-size: 13px; font-weight: 600; color: #78716C; cursor: pointer; font-family: inherit; }
          .cfs-seg button.on { background: #fff; color: #1C1917; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
          .cfs-toggle { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; border: 1px solid rgba(0,0,0,0.09); background: #fff; color: #78716C; cursor: pointer; }
          .cfs-toggle:hover { background: #F3F2F1; color: #1C1917; }
          .cfs-prog { display: flex; align-items: center; gap: 0; overflow-x: auto; padding: 2px 0 10px; scrollbar-width: none; }
          .cfs-prog::-webkit-scrollbar { display: none; }
          .cfs-step { display: flex; align-items: center; gap: 8px; text-decoration: none; padding: 6px 10px; border-radius: 999px; flex-shrink: 0; color: #78716C; font-size: 13px; font-weight: 600; }
          .cfs-step .dot { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; background: #E7E5E4; color: #57534E; }
          .cfs-step.past .dot { background: rgba(34,197,94,0.18); color: #15803D; }
          .cfs-step.now { color: #1C1917; background: rgba(var(--brand-rgb),0.10); }
          .cfs-step.now .dot { background: var(--brand-color); color: var(--brand-text); }
          .cfs-step .n { font-weight: 700; color: #1C1917; margin-left: 2px; }
          .cfs-bar { width: 22px; height: 2px; background: #E7E5E4; flex-shrink: 0; }
          .cfs-menu-item { display: flex; align-items: center; gap: 9px; padding: 9px 12px; border-radius: 9px; font-size: 13px; font-weight: 500; color: #374151; cursor: pointer; text-decoration: none; background: none; border: none; width: 100%; text-align: left; font-family: inherit; }
          .cfs-menu-item:hover { background: rgba(0,0,0,0.04); }
          @media (max-width: 900px) { .cfs-side { display: none; } .cfs-title-sub { display: none; } }
        `}</style>

        <aside className={`cfs-side${open ? ' is-open' : ''}`}>
          <Link to="/modules" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: open ? '100%' : 40 }} title="All modules">
            <GlidoLogo height={open ? 17 : 11} onDark={false} />
          </Link>
          <nav className="cfs-pill" aria-label="Job stages">
            {STAGE_ORDER.map(stage => {
              const n = stageCount(summary, stage)
              const label = stageLabel(stage, direction)
              return (
                <NavLink key={stage} to={stagePath(direction, stage)} data-label={label}
                  className={() => `cfs-item${activeStage === stage && !onSettings && !onCreate ? ' active' : ''}`}>
                  <div className="cfs-item-icon"><Icon name={STAGE_ICON[stage]} size={18} style={{ color: activeStage === stage && !onSettings && !onCreate ? 'var(--brand-text)' : '#C7C7C6' }} /></div>
                  <span className="cfs-item-label">{label}</span>
                  {n !== null && n > 0 && <span className="cfs-count">{n}</span>}
                </NavLink>
              )
            })}
            <div className="cfs-sep" />
            <NavLink to={`/packing-unpacking/requests/new?mode=${mode}`} data-label="New request" className={() => `cfs-item${onCreate ? ' active' : ''}`}>
              <div className="cfs-item-icon"><Icon name={ICONS.walkIn} size={18} style={{ color: onCreate ? 'var(--brand-text)' : '#C7C7C6' }} /></div>
              <span className="cfs-item-label">Create request</span>
            </NavLink>
            <NavLink to={`/packing-unpacking/settings?mode=${mode}`} data-label="Settings" className={() => `cfs-item${onSettings ? ' active' : ''}`}>
              <div className="cfs-item-icon"><Icon name={ICONS.settings} size={18} style={{ color: onSettings ? 'var(--brand-text)' : '#C7C7C6' }} /></div>
              <span className="cfs-item-label">Settings</span>
            </NavLink>
          </nav>
        </aside>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#f9f9f9' }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px var(--dash-main-pad-x, 28px) 6px', flexShrink: 0, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
              <button className="cfs-toggle" type="button" onClick={() => setOpen(v => !v)} title="Toggle sidebar" aria-label="Toggle sidebar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></svg>
              </button>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
                <p className="cfs-title-sub" style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '1px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="cfs-seg" role="tablist" aria-label="Module">
                <button type="button" role="tab" aria-selected={mode === 'unpacking'} className={mode === 'unpacking' ? 'on' : ''} onClick={() => switchMode('unpacking')}>Unpacking</button>
                <button type="button" role="tab" aria-selected={mode === 'packing'} className={mode === 'packing' ? 'on' : ''} onClick={() => switchMode('packing')}>Packing</button>
              </div>
              {logoSrc && !logoErr && <img src={logoSrc} alt="Company logo" onError={() => setLogoErr(true)} style={{ height: 28, objectFit: 'contain', maxWidth: 90 }} />}
              <div style={{ position: 'relative' }}>
                {userMenu && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9100 }} onClick={() => setUserMenu(false)} />
                    <div style={{ position: 'absolute', top: 44, right: 0, zIndex: 9101, width: 220, background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-lg)', boxShadow: '0 12px 40px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
                      <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', margin: 0 }}>{staffName || 'Staff'}</p>
                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>{isAdmin ? 'Admin' : 'Staff'}</p>
                      </div>
                      <div style={{ padding: 6 }}>
                        <Link to="/modules" className="cfs-menu-item" onClick={() => setUserMenu(false)}><Icon name={ICONS.layers} size={15} />All modules</Link>
                        <button type="button" className="cfs-menu-item" style={{ color: '#EF4444' }} onClick={() => logout()}><Icon name={ICONS.logout} size={15} />Sign out</button>
                      </div>
                    </div>
                  </>
                )}
                <button type="button" onClick={() => setUserMenu(v => !v)} aria-label="Account menu" title="Account menu"
                  style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'var(--brand-color)', color: 'var(--brand-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{initials}</button>
              </div>
            </div>
          </header>

          {/* Progress indicator — also the stage navigation on small screens. Only on stage / container screens; Settings and New request aren't part of the pipeline. */}
          {!onSettings && !onCreate && <div style={{ padding: '0 var(--dash-main-pad-x, 28px)', flexShrink: 0 }}>
            <nav className="cfs-prog" aria-label="Progress">
              {STAGE_ORDER.map((stage, i) => {
                const idx = activeStage ? STAGE_ORDER.indexOf(activeStage) : -1
                const cls = idx === i ? 'now' : idx > i ? 'past' : ''
                const n = stageCount(summary, stage)
                return (
                  <span key={stage} style={{ display: 'flex', alignItems: 'center' }}>
                    {i > 0 && <span className="cfs-bar" />}
                    <Link to={stagePath(direction, stage)} className={`cfs-step ${cls}`} aria-current={idx === i ? 'step' : undefined}>
                      <span className="dot">{idx > i ? '✓' : i + 1}</span>
                      {stageLabel(stage, direction)}{n !== null && <span className="n">{n}</span>}
                    </Link>
                  </span>
                )
              })}
            </nav>
          </div>}

          <main style={{ flex: 1, overflowY: 'auto', padding: '4px var(--dash-main-pad-x, 28px) 32px' }}>
            <Outlet />
          </main>
        </div>
      </div>
    </CfsContext.Provider>
  )
}
