import { useEffect, useRef } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Link } from 'react-router-dom'
import { Icon, ICONS } from '@/lib/Icon'
import { useTenantInfo } from '@/lib/useTenantInfo'

const WARP_BEAMS = [
  { l: '6%',  dur: '3.1s', del: '0.0s', c: 'rgba(var(--brand-rgb),0.45)', h: '120px' },
  { l: '18%', dur: '4.4s', del: '1.2s', c: 'rgba(99,130,255,0.35)',  h: '140px' },
  { l: '31%', dur: '2.9s', del: '0.5s', c: 'rgba(52,211,153,0.35)',  h: '100px' },
  { l: '47%', dur: '3.7s', del: '1.9s', c: 'rgba(var(--brand-rgb),0.30)',  h: '130px' },
  { l: '62%', dur: '2.6s', del: '0.3s', c: 'rgba(168,85,247,0.38)',  h: '110px' },
  { l: '76%', dur: '4.0s', del: '1.5s', c: 'rgba(251,191,36,0.38)',  h: '125px' },
  { l: '90%', dur: '3.4s', del: '0.8s', c: 'rgba(236,72,153,0.34)',  h: '105px' },
]

const HOW_STEPS = [
  { num: '01', icon: ICONS.users,    title: 'Your details',  desc: 'Name, service type, cargo category. Under 60 seconds.' },
  { num: '02', icon: ICONS.calendar, title: 'Pick a slot',   desc: 'Choose a window — held 10 min while you finish booking.' },
  { num: '03', icon: ICONS.document, title: 'Add shipment',  desc: 'Enter HBL or container. ICS clearance is auto-checked.' },
  { num: '04', icon: ICONS.qrCode,   title: 'Scan & enter',  desc: 'Scan your QR at the kiosk. No counter. No wait.' },
]

const KPI_TILES = [
  { label: 'Scheduled', val: '24', c: '#1C1917' },
  { label: 'On Site',   val: '7',  c: '#22C55E' },
  { label: 'Completed', val: '11', c: '#78716C' },
  { label: 'ICS Held',  val: '2',  c: '#EF4444' },
]

const DASHBOARD_ROWS = [
  { name: 'A. Rahman',   ref: 'MSCU·184', time: '08:30', status: 'On Site',   sc: 'rgba(34,197,94,0.10)',  tc: '#16A34A' },
  { name: 'T. Nguyen',   ref: 'COSU·456', time: '09:00', status: 'Confirmed', sc: 'rgba(251,191,36,0.10)', tc: '#B45309' },
  { name: 'J. Smith',    ref: 'OOLU·789', time: '09:30', status: 'Confirmed', sc: 'rgba(251,191,36,0.10)', tc: '#B45309' },
  { name: 'M. Al-Farsi', ref: 'MSCU·321', time: '10:00', status: 'ICS Hold',  sc: 'rgba(239,68,68,0.10)',  tc: '#DC2626' },
]

const OPS_FEATURES = [
  { icon: ICONS.userCheck, label: 'Live check-in feed',  sub: 'See who is on site right now' },
  { icon: ICONS.warning,   label: 'ICS hold alerts',     sub: 'Flagged before they reach the gate' },
  { icon: ICONS.reports,   label: 'End-of-day reports',  sub: 'PDF export in one click' },
]

const PERSONAS = [
  {
    bg: '#192640', icon: ICONS.bookings, title: 'Freight Forwarders',
    desc: 'Book slots on behalf of multiple clients, attach documents, track ICS status — all from one portal.',
    bullets: ['Multi-shipment booking', 'HBL & container lookup', 'Document upload', 'Email confirmation'],
  },
  {
    bg: '#0d3835', icon: ICONS.walkIn, title: 'Truck Drivers',
    desc: 'Arrive at your confirmed window, scan your QR at the kiosk, and go straight to the bay. No queue, no counter.',
    bullets: ['QR code check-in', 'Confirmed arrival window', 'No account needed', 'Walk-in fallback'],
  },
  {
    bg: '#260c03', icon: ICONS.home, title: 'Depot Managers',
    desc: 'See every booking, walk-in, and ICS flag in a live dashboard. Run end-of-day reports with one click.',
    bullets: ['Real-time live view', 'ICS hold alerts', 'Walk-in registration', 'PDF reports'],
  },
]

const ICS_ROWS = [
  { ref: 'MSCU·184729', status: 'Cleared',  sc: 'rgba(34,197,94,0.12)',  tc: '#16A34A' },
  { ref: 'COSU·037614', status: 'Pending',  sc: 'rgba(251,191,36,0.12)', tc: '#B45309' },
  { ref: 'OOLU·295183', status: 'ICS Held', sc: 'rgba(239,68,68,0.10)',  tc: '#DC2626' },
]

const BENTO_2 = [
  { icon: ICONS.clock,  title: '10-min slot holds',  desc: 'Your preferred time is reserved while you complete the booking — zero double-bookings.' },
  { icon: ICONS.qrCode, title: 'QR check-in kiosk',  desc: 'Scan at arrival. Skip the counter queue entirely. Works on any smartphone.' },
]

const BENTO_3 = [
  { icon: ICONS.warning, title: 'CHEP pallet alerts',  desc: 'Pallet exchange flagged before you leave for the depot.' },
  { icon: ICONS.users,   title: 'Agent bookings',      desc: 'Freight forwarders book for drivers — no extra account.' },
  { icon: ICONS.reports, title: 'Live reception view', desc: 'Staff see bookings, walk-ins, and holds in one screen.' },
]

export default function LandingPage() {
  usePageTitle('Glido | Home')
  const tenant = useTenantInfo()
  const heroSectionRef = useRef<HTMLElement>(null)
  const heroCardRef    = useRef<HTMLDivElement>(null)
  const heroBgRef      = useRef<HTMLDivElement>(null)
  const heroSpecRef    = useRef<HTMLDivElement>(null)
  const heroContentRef = useRef<HTMLDivElement>(null)
  const rotatingWordRef = useRef<HTMLSpanElement>(null)

  // Hero parallax
  useEffect(() => {
    const section = heroSectionRef.current
    const card    = heroCardRef.current
    const bg      = heroBgRef.current
    const spec    = heroSpecRef.current
    const content = heroContentRef.current
    if (!section || !card || !bg) return

    let tCardRx = 0, tCardRy = 0, tBgX = 0, tBgY = 0, tCtX = 0, tCtY = 0
    let tSpecX = 50, tSpecY = 50, tScale = 1.0
    let cCardRx = 0, cCardRy = 0, cBgX = 0, cBgY = 0, cCtX = 0, cCtY = 0
    let cSpecX = 50, cSpecY = 50, cScale = 1.0
    let inside = false, rafId = 0

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    const tick = () => {
      const e = inside ? 0.07 : 0.05
      cCardRx = lerp(cCardRx, tCardRx, e); cCardRy = lerp(cCardRy, tCardRy, e)
      cBgX = lerp(cBgX, tBgX, e); cBgY = lerp(cBgY, tBgY, e)
      cCtX = lerp(cCtX, tCtX, e); cCtY = lerp(cCtY, tCtY, e)
      cSpecX = lerp(cSpecX, tSpecX, e); cSpecY = lerp(cSpecY, tSpecY, e)
      cScale = lerp(cScale, tScale, e)
      card.style.transform = `perspective(900px) rotateX(${cCardRx}deg) rotateY(${cCardRy}deg) scale(${cScale})`
      bg.style.transform = `translate(${cBgX}px,${cBgY}px)`
      if (content) content.style.transform = `translate(${cCtX}px,${cCtY}px)`
      if (spec) {
        const mag = Math.sqrt(cCardRx * cCardRx + cCardRy * cCardRy)
        const op  = Math.min(mag / 4, 1) * 0.18
        spec.style.background = `radial-gradient(ellipse 70% 60% at ${cSpecX}% ${cSpecY}%,rgba(255,255,255,${op}) 0%,transparent 70%)`
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    const onMove = (ev: MouseEvent) => {
      inside = true
      const r = section.getBoundingClientRect()
      const mx = (ev.clientX - r.left) / r.width
      const my = (ev.clientY - r.top)  / r.height
      tCardRx = (my - 0.5) * -10; tCardRy = (mx - 0.5) * 16
      tBgX = (mx - 0.5) * -28;   tBgY    = (my - 0.5) * -20
      tCtX = (mx - 0.5) * 10;    tCtY    = (my - 0.5) * 7
      tSpecX = 20 + mx * 30;     tSpecY  = 10 + my * 25
      tScale = 1.012
    }
    const onLeave = () => {
      inside = false
      tCardRx = 0; tCardRy = 0; tBgX = 0; tBgY = 0
      tCtX = 0; tCtY = 0; tSpecX = 50; tSpecY = 50; tScale = 1.0
    }
    section.addEventListener('mousemove', onMove, { passive: true })
    section.addEventListener('mouseleave', onLeave)
    return () => {
      cancelAnimationFrame(rafId)
      section.removeEventListener('mousemove', onMove)
      section.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // Rotating word
  useEffect(() => {
    const el = rotatingWordRef.current
    if (!el) return
    const words = ['Collection', 'Delivery', 'Drop Off', 'Pick Up', 'Clearance']
    let i = 0
    const id = setInterval(() => {
      el.style.opacity = '0'
      el.style.transform = 'translateY(-10px)'
      setTimeout(() => {
        i = (i + 1) % words.length
        el.textContent = words[i]
        el.style.opacity = '1'
        el.style.transform = 'translateY(0)'
      }, 320)
    }, 2800)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      <style>{`
        @keyframes warp-beam-fly {
          0%   { transform:translateY(620px); opacity:0; }
          8%   { opacity:1; }
          92%  { opacity:1; }
          100% { transform:translateY(-420px); opacity:0; }
        }
        .warp-beam { position:absolute; top:0; width:2px; border-radius:9999px; pointer-events:none; animation:warp-beam-fly linear infinite; }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .btn-primary { display:inline-flex; align-items:center; gap:8px; padding:12px 24px; font-size:14px; font-weight:600; color:var(--brand-text); background:var(--brand-color); border-radius:9999px; text-decoration:none; box-shadow:0 2px 8px rgba(var(--brand-rgb),0.35); transition:all 0.18s ease; }
        .btn-primary:hover { transform:translateY(-2px); box-shadow:0 6px 18px rgba(var(--brand-rgb),0.42); }
        .btn-primary:active { transform:translateY(0) scale(0.97); }
        .btn-ghost { display:inline-flex; align-items:center; gap:8px; padding:12px 24px; font-size:14px; font-weight:600; color:#78716C; background:rgba(0,0,0,0.04); border:1px solid rgba(0,0,0,0.10); border-radius:9999px; text-decoration:none; transition:all 0.18s ease; }
        .btn-ghost:hover { background:rgba(0,0,0,0.07); color:#1C1917; }
        @media (max-width:960px) {
          .preview-grid { grid-template-columns:1fr!important; }
          .steps-grid   { grid-template-columns:repeat(2,1fr)!important; }
          .bento-row,.persona-grid,.bento-hero { grid-template-columns:1fr!important; }
        }
        @media (max-width:640px) { .steps-grid { grid-template-columns:1fr!important; } }
      `}</style>

      {/* §1 Hero */}
      <section
        ref={heroSectionRef}
        style={{ padding: '56px 40px 72px', background: '#F7F6F5', position: 'relative', overflow: 'hidden' }}
      >
        {/* Warp background */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: '-70%', right: '-70%', bottom: 0, height: '80%', transform: 'perspective(280px) rotateX(72deg)', transformOrigin: 'center bottom', backgroundImage: 'linear-gradient(rgba(0,0,0,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.06) 1px,transparent 1px)', backgroundSize: '80px 80px', maskImage: 'linear-gradient(to top,black 0%,black 20%,transparent 100%)', WebkitMaskImage: 'linear-gradient(to top,black 0%,black 20%,transparent 100%)' }} />
          {WARP_BEAMS.map((b, i) => (
            <div key={i} className="warp-beam" style={{ left: b.l, height: b.h, background: `linear-gradient(to top,${b.c},transparent)`, animationDuration: b.dur, animationDelay: b.del, mixBlendMode: 'multiply' }} />
          ))}
        </div>

        {/* Hero card */}
        <div
          ref={heroCardRef}
          style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1, borderRadius: 'var(--r-xl)', overflow: 'hidden', minHeight: 520, display: 'flex', alignItems: 'center', willChange: 'transform', transformOrigin: 'center center' }}
        >
          <div
            ref={heroBgRef}
            style={{ position: 'absolute', inset: '-8%', background: 'linear-gradient(135deg, #0f1720 0%, #1a2535 40%, #0d1f2d 100%)', willChange: 'transform' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg,rgba(8,10,14,0.88) 0%,rgba(8,10,14,0.75) 45%,rgba(8,10,14,0.45) 70%,rgba(8,10,14,0.25) 100%)', zIndex: 1 }} />
          <div ref={heroSpecRef} style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', borderRadius: 'var(--r-xl)', transition: 'background 0.1s ease' }} />

          <div
            ref={heroContentRef}
            style={{ position: 'relative', zIndex: 3, padding: '64px 72px', maxWidth: 640, willChange: 'transform' }}
            className="hero-content"
          >
            <h1 style={{ fontSize: 'clamp(2rem,3.8vw,3.6rem)', fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1.0, color: '#fff', marginBottom: 14 }}>
              Book your CFS slot.<br />
              <span style={{ color: 'var(--brand-color)' }}>Skip the queue.</span>
            </h1>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255)', lineHeight: 1.78, marginBottom: 36, maxWidth: 420 }}>
              Instant booking for drivers, forwarders, and depot teams. Scan your QR at the kiosk, straight to the bay.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to="/book" className="btn-primary" style={{ padding: '13px 28px', fontSize: 15 }}>
                <Icon name={ICONS.calendar} size={15} />
                Book a Visit
                <Icon name={ICONS.arrowRight} size={14} />
              </Link>
              <Link to="/bookings" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 24px', fontSize: 15, fontWeight: 600, color: '#1C1917', background: 'rgba(255,255,255,0.90)', border: '1.5px solid rgba(255,255,255,0.30)', borderRadius: 'var(--r-full)', textDecoration: 'none', transition: 'all 0.15s ease' }}
                onMouseOver={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#fff' }}
                onMouseOut={e  => { e.currentTarget.style.background = 'rgba(255,255,255,0.90)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.30)' }}
              >
                <Icon name={ICONS.search} size={15} />
                Look Up Booking
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* §3 How it works */}
      <section id="how-it-works" className="section-dots" style={{ padding: '96px 24px', backgroundColor: '#FFFFFF' }}>
        <div className="max-w-5xl mx-auto">
          <div className="reveal" style={{ marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--brand-color)', marginBottom: 10 }}>How it works</p>
            <h2 style={{ fontSize: 'clamp(1.8rem,3.2vw,2.5rem)', fontWeight: 800, color: '#1C1917', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 12, maxWidth: 500 }}>
              From browser to bay door in four steps
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75, maxWidth: 400 }}>No spreadsheets. No radio calls. The whole process is online.</p>
          </div>

          <div className="steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 2, background: 'rgba(0,0,0,0.06)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
            {HOW_STEPS.map((step, i) => (
              <div key={step.num} className="reveal" data-reveal-delay={String(i * 80)}
                style={{ background: '#FFFFFF', padding: '32px 26px', transition: 'background 0.15s ease' }}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(var(--brand-rgb),0.04)')}
                onMouseOut={e  => (e.currentTarget.style.background = '#FFFFFF')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#1C1917', letterSpacing: '0.04em' }}>{step.num}</span>
                  <div style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', background: 'rgba(var(--brand-rgb),0.08)', border: '1px solid rgba(var(--brand-rgb),0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={step.icon} size={18} style={{ color: 'var(--brand-color)' }} />
                  </div>
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', marginBottom: 7, letterSpacing: '-0.02em' }}>{step.title}</p>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* §4 Platform preview */}
      <section style={{ padding: '96px 24px', background: '#F7F6F5', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="preview-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.7fr', gap: 56, alignItems: 'center' }}>
            <div className="reveal-left">
              <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--brand-color)', marginBottom: 10 }}>Operations centre</p>
              <h2 style={{ fontSize: 'clamp(1.6rem,2.8vw,2.2rem)', fontWeight: 800, color: '#1C1917', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 14 }}>
                Everything reception needs in one view
              </h2>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75, marginBottom: 28 }}>
                Live bookings, walk-in queue, ICS hold flags, and gate activity — all updated in real time.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                {OPS_FEATURES.map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.09)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <Icon name={item.icon} size={15} style={{ color: 'var(--brand-color)' }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 1 }}>{item.label}</p>
                      <p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{item.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link to="/reception" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none', transition: 'opacity 0.15s ease' }}
                onMouseOver={e => (e.currentTarget.style.opacity = '0.75')}
                onMouseOut={e  => (e.currentTarget.style.opacity = '1')}
              >
                View Reception Dashboard <Icon name={ICONS.arrowRight} size={13} />
              </Link>
            </div>

            {/* Dashboard mockup */}
            <div className="reveal-right" style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06),0 16px 48px rgba(0,0,0,0.10)', border: '1px solid rgba(0,0,0,0.08)' }}>
              <div style={{ background: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.07)', padding: '11px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {[0.08, 0.06, 0.04].map((o, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: 'var(--r-full)', background: `rgba(0,0,0,${o})` }} />)}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)', marginLeft: 4 }}>Reception · Dashboard</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 'var(--r-full)', background: '#22C55E', animation: 'pulse-dot 2s ease-in-out infinite', display: 'inline-block' }} />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 }}>Live</span>
                </div>
              </div>
              <div style={{ background: '#F7F6F5', padding: 10, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                {KPI_TILES.map(k => (
                  <div key={k.label} style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-sm)', padding: '10px 12px' }}>
                    <p style={{ fontSize: 22, fontWeight: 800, color: k.c, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 2 }}>{k.val}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 }}>{k.label}</p>
                  </div>
                ))}
              </div>
              <div style={{ background: '#FFFFFF' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 80px 28px', padding: '8px 14px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#F7F6F5' }}>
                  {['Visitor', 'Slot', 'Status', ''].map(h => (
                    <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{h}</span>
                  ))}
                </div>
                {DASHBOARD_ROWS.map((row, ri) => (
                  <div key={ri} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 80px 28px', padding: '9px 14px', borderBottom: '1px solid rgba(0,0,0,0.05)', background: ri === 3 ? 'rgba(239,68,68,0.025)' : undefined }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: '#1C1917' }}>{row.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'ui-monospace,monospace' }}>{row.ref}</p>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.time}</span>
                    <div style={{ alignSelf: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 'var(--r-full)', background: row.sc, color: row.tc }}>{row.status}</span>
                    </div>
                    <div style={{ alignSelf: 'center', display: 'flex', justifyContent: 'flex-end' }}>
                      <Icon name={ICONS.arrowRight} size={11} style={{ color: 'rgba(0,0,0,0.25)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* §5 Personas */}
      <section className="section-dots" style={{ padding: '96px 24px', backgroundColor: '#FFFFFF', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--brand-color)', marginBottom: 10 }}>Who uses Glido</p>
            <h2 style={{ fontSize: 'clamp(1.8rem,3.2vw,2.5rem)', fontWeight: 800, color: '#1C1917', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 12 }}>
              Built for everyone in the chain
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: 380, margin: '0 auto', lineHeight: 1.75 }}>
              From the freight forwarder booking a slot to the driver scanning in — everyone benefits.
            </p>
          </div>

          <div className="persona-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }} data-stagger data-stagger-ms="90">
            {PERSONAS.map(p => (
              <div key={p.title} className="tilt-card" style={{ background: p.bg, borderRadius: 'var(--r-xl)', padding: '34px 30px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', background: 'rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
                  <Icon name={p.icon} size={22} style={{ color: '#fff' }} />
                </div>
                <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', marginBottom: 10 }}>{p.title}</p>
                <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 22 }}>{p.desc}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {p.bullets.map((b, bi) => (
                    <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 14, color: 'rgba(255,255,255,0.70)' }}>
                      <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 'var(--r-sm)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace,monospace' }}>
                        {String(bi + 1).padStart(2, '0')}
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* §6 Bento features */}
      <section style={{ padding: '96px 24px', background: '#F7F6F5', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--brand-color)', marginBottom: 10 }}>Built for the floor</p>
            <h2 style={{ fontSize: 'clamp(1.8rem,3.2vw,2.5rem)', fontWeight: 800, color: '#1C1917', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 12 }}>
              Purpose-built for Container Freight Stations
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: 380, margin: '0 auto', lineHeight: 1.75 }}>Every feature solves a real operational headache.</p>
          </div>

          {/* ICS bento hero */}
          <div className="reveal bento-hero" style={{ background: '#FFFFFF', border: '1px solid rgba(var(--brand-rgb),0.20)', borderRadius: 'var(--r-xl)', padding: '40px 44px', marginBottom: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04),0 8px 32px rgba(0,0,0,0.06),0 0 0 1px rgba(var(--brand-rgb),0.06)' }}>
            <div>
              <div style={{ width: 50, height: 50, borderRadius: 'var(--r-md)', background: 'rgba(var(--brand-rgb),0.08)', border: '1px solid rgba(var(--brand-rgb),0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
                <Icon name={ICONS.shield} size={24} style={{ color: 'var(--brand-color)' }} />
              </div>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.025em', marginBottom: 10, lineHeight: 1.25 }}>Automatic ICS clearance check</p>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75, maxWidth: 320 }}>
                Customs status is fetched the moment you enter your shipment number — holds flagged before they reach the gate.
              </p>
            </div>
            <div style={{ background: '#F7F6F5', borderRadius: 'var(--r-md)', padding: '20px 24px', border: '1px solid rgba(0,0,0,0.07)' }}>
              {ICS_ROWS.map((row, ri) => (
                <div key={ri} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: ri < 2 ? '1px solid rgba(0,0,0,0.06)' : undefined }}>
                  <span style={{ fontSize: 14, fontFamily: 'ui-monospace,monospace', fontWeight: 600, color: '#57534E' }}>{row.ref}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-full)', background: row.sc, color: row.tc }}>{row.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 2-col bento */}
          <div className="bento-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }} data-stagger data-stagger-ms="80">
            {BENTO_2.map(feat => (
              <div key={feat.title}
                style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', padding: 30, transition: 'border-color 0.15s ease,box-shadow 0.15s ease,transform 0.2s cubic-bezier(0.16,1,0.3,1)' }}
                onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(var(--brand-rgb),0.25)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.07)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseOut={e  => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = '' }}
              >
                <div style={{ width: 42, height: 42, borderRadius: 'var(--r-sm)', background: 'rgba(var(--brand-rgb),0.08)', border: '1px solid rgba(var(--brand-rgb),0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                  <Icon name={feat.icon} size={19} style={{ color: 'var(--brand-color)' }} />
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', marginBottom: 7 }}>{feat.title}</p>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{feat.desc}</p>
              </div>
            ))}
          </div>

          {/* 3-col bento */}
          <div className="bento-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }} data-stagger data-stagger-ms="70">
            {BENTO_3.map(feat => (
              <div key={feat.title}
                style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', padding: 28, transition: 'border-color 0.15s ease,box-shadow 0.15s ease,transform 0.2s cubic-bezier(0.16,1,0.3,1)' }}
                onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(var(--brand-rgb),0.25)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.07)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseOut={e  => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = '' }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', background: 'rgba(var(--brand-rgb),0.08)', border: '1px solid rgba(var(--brand-rgb),0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Icon name={feat.icon} size={18} style={{ color: 'var(--brand-color)' }} />
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', marginBottom: 6 }}>{feat.title}</p>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* §8 CTA */}
      <section style={{ padding: '100px 24px', background: 'linear-gradient(180deg, color-mix(in srgb, var(--brand-color) 4%, #ffffff) 0%, color-mix(in srgb, var(--brand-color) 7%, #ffffff) 100%)', borderTop: '1px solid rgba(var(--brand-rgb),0.12)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(var(--brand-rgb),0.07) 1px,transparent 1px)', backgroundSize: '28px 28px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse,rgba(var(--brand-rgb),0.08) 0%,transparent 68%)', pointerEvents: 'none' }} />

        <div className="max-w-2xl mx-auto" style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div className="reveal" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 14px', borderRadius: 'var(--r-full)', background: 'rgba(34,197,94,0.09)', border: '1px solid rgba(34,197,94,0.22)', marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: 'var(--r-full)', background: '#22C55E', animation: 'pulse-dot 2s ease-in-out infinite', display: 'inline-block' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#16A34A' }}>Accepting bookings now</span>
          </div>

          <h2 className="reveal" data-reveal-delay="80" style={{ fontSize: 'clamp(2.2rem,4.8vw,3.5rem)', fontWeight: 800, color: '#1C1917', letterSpacing: '-0.045em', lineHeight: 1.05, marginBottom: 16 }}>
            Ready to skip<br />the queue?
          </h2>

          <p className="reveal" data-reveal-delay="130" style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 36, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
            Your first booking takes under 3 minutes. No account, no calls, no paper.
          </p>

          <div className="reveal" data-reveal-delay="180" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/book" className="btn-primary" style={{ padding: '14px 32px', fontSize: 15, color: 'var(--brand-text)' }}>
              <Icon name={ICONS.calendar} size={15} style={{ color: 'var(--brand-text)' }} />
              Book a Visit
              <Icon name={ICONS.arrowRight} size={14} style={{ color: 'var(--brand-text)' }} />
            </Link>
            <Link to="/bookings" className="btn-ghost" style={{ padding: '14px 26px', fontSize: 15 }}>
              <Icon name={ICONS.search} size={15} />
              Look Up Booking
            </Link>
          </div>

          <p className="reveal" data-reveal-delay="230" style={{ fontSize: 14, color: 'var(--text-tertiary)', marginTop: 28 }}>
            {tenant?.name || 'Sydney Container Freight Station'} · ABN 12 345 678 901
          </p>
        </div>
      </section>
    </>
  )
}
