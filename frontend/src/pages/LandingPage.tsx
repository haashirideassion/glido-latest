import { useEffect, useRef, useState } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Link } from 'react-router-dom'
import { Icon, ICONS } from '@/lib/Icon'
import { useTenantInfo } from '@/lib/useTenantInfo'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import heroDroneImg from '@/assets/hero-drone.jpg'
import ctaBgImg from '@/assets/cta-bg.jpg'

const EASE = [0.16, 1, 0.3, 1] as const
const RISE = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }
const WORD_RISE = { hidden: { opacity: 0, y: 22, rotateX: -50, filter: 'blur(5px)' }, show: { opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)' } }

/** Fades + rises into view once, the first time it's scrolled into the viewport. */
function Reveal({ children, delay = 0, x = 0, style, className }: { children: React.ReactNode; delay?: number; x?: number; style?: React.CSSProperties; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? undefined : { opacity: 0, y: 22, x }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay: delay / 1000, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/** Parent for a grid of children that should fade in with a staggered cascade. */
function StaggerGroup({ children, style, className, staggerMs = 80 }: { children: React.ReactNode; style?: React.CSSProperties; className?: string; staggerMs?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      style={style}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      variants={reduce ? undefined : { hidden: {}, show: { transition: { staggerChildren: staggerMs / 1000 } } }}
    >
      {children}
    </motion.div>
  )
}

function StaggerItem({ children, style, ...rest }: { children: React.ReactNode; style?: React.CSSProperties; [key: string]: any }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      style={style}
      variants={reduce ? undefined : { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.5, ease: EASE }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

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

const KPI_META = [
  { label: 'Scheduled', c: '#1C1917' },
  { label: 'On Site',   c: '#22C55E' },
  { label: 'Completed', c: '#78716C' },
  { label: 'ICS Held',  c: '#EF4444' },
]

// A tiny "live" script the dashboard preview plays on loop — real state transitions
// (a walk-in arriving, a hold clearing) rather than a static screenshot of the UI.
const DASHBOARD_FRAMES = [
  {
    kpi: [24, 7, 11, 2],
    rows: [
      { key: 'rahman',  name: 'A. Rahman',   ref: 'MSCU·184', time: '08:30', status: 'On Site',   sc: 'rgba(34,197,94,0.10)',  tc: '#16A34A' },
      { key: 'nguyen',  name: 'T. Nguyen',   ref: 'COSU·456', time: '09:00', status: 'Confirmed', sc: 'rgba(251,191,36,0.10)', tc: '#B45309' },
      { key: 'smith',   name: 'J. Smith',    ref: 'OOLU·789', time: '09:30', status: 'Confirmed', sc: 'rgba(251,191,36,0.10)', tc: '#B45309' },
      { key: 'alfarsi', name: 'M. Al-Farsi', ref: 'MSCU·321', time: '10:00', status: 'ICS Hold',  sc: 'rgba(239,68,68,0.10)',  tc: '#DC2626' },
    ],
  },
  {
    kpi: [23, 9, 12, 2],
    rows: [
      { key: 'chen',    name: 'R. Chen',     ref: 'TCLU·902', time: '09:12', status: 'Walk-in',   sc: 'rgba(56,189,248,0.12)', tc: '#0369A1' },
      { key: 'rahman',  name: 'A. Rahman',   ref: 'MSCU·184', time: '08:30', status: 'Completed', sc: 'rgba(120,113,108,0.10)', tc: '#78716C' },
      { key: 'nguyen',  name: 'T. Nguyen',   ref: 'COSU·456', time: '09:00', status: 'On Site',   sc: 'rgba(34,197,94,0.10)',  tc: '#16A34A' },
      { key: 'smith',   name: 'J. Smith',    ref: 'OOLU·789', time: '09:30', status: 'Confirmed', sc: 'rgba(251,191,36,0.10)', tc: '#B45309' },
    ],
  },
  {
    kpi: [22, 8, 13, 1],
    rows: [
      { key: 'chen',    name: 'R. Chen',     ref: 'TCLU·902', time: '09:12', status: 'On Site',  sc: 'rgba(34,197,94,0.10)', tc: '#16A34A' },
      { key: 'nguyen',  name: 'T. Nguyen',   ref: 'COSU·456', time: '09:00', status: 'On Site',  sc: 'rgba(34,197,94,0.10)', tc: '#16A34A' },
      { key: 'smith',   name: 'J. Smith',    ref: 'OOLU·789', time: '09:30', status: 'On Site',  sc: 'rgba(34,197,94,0.10)', tc: '#16A34A' },
      { key: 'alfarsi', name: 'M. Al-Farsi', ref: 'MSCU·321', time: '10:00', status: 'Cleared',  sc: 'rgba(34,197,94,0.10)', tc: '#16A34A' },
    ],
  },
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
  { icon: ICONS.clock,  title: '10-min slot holds',  desc: 'Your preferred time is reserved while you complete the booking — zero double-bookings.', hue: '99,102,241' },
  { icon: ICONS.qrCode, title: 'QR check-in kiosk',  desc: 'Scan at arrival. Skip the counter queue entirely. Works on any smartphone.', hue: '34,197,94' },
]

const BENTO_3 = [
  { icon: ICONS.warning, title: 'CHEP pallet alerts',  desc: 'Pallet exchange flagged before you leave for the depot.', hue: '251,146,60' },
  { icon: ICONS.users,   title: 'Agent bookings',      desc: 'Freight forwarders book for drivers — no extra account.', hue: '236,72,153' },
  { icon: ICONS.reports, title: 'Live reception view', desc: 'Staff see bookings, walk-ins, and holds in one screen.', hue: '56,189,248' },
]

/** A dashboard mockup that actually plays out — walk-ins arrive, holds clear, counters tick — instead of a frozen screenshot. */
function ReceptionDashboardMockup() {
  const reduce = useReducedMotion()
  const [frame, setFrame] = useState(0)
  const [hoverKey, setHoverKey] = useState<string | null>(null)

  useEffect(() => {
    if (reduce) return
    const id = setInterval(() => setFrame(f => (f + 1) % DASHBOARD_FRAMES.length), 3600)
    return () => clearInterval(id)
  }, [reduce])

  const data = DASHBOARD_FRAMES[frame]

  return (
    <div style={{ position: 'relative' }}>
      {/* Ambient brand glow behind the card */}
      <div style={{ position: 'absolute', inset: '-8%', background: 'radial-gradient(ellipse 60% 60% at 50% 40%, rgba(var(--brand-rgb),0.16), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none', zIndex: 0 }} />
      <motion.div
        initial={{ y: 0 }}
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        whileHover={{ scale: 1.015, transition: { duration: 0.3 } }}
        style={{ position: 'relative', zIndex: 1, borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.08),0 24px 64px rgba(0,0,0,0.14),0 0 0 1px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.08)' }}
      >
        <div style={{ background: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.07)', padding: '11px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {[0.08, 0.06, 0.04].map((o, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: 'var(--r-full)', background: `rgba(0,0,0,${o})` }} />)}
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)', marginLeft: 4 }}>Reception · Dashboard</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <motion.span
              key={frame}
              initial={{ scale: 1.8, opacity: 0.4 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              style={{ width: 5, height: 5, borderRadius: 'var(--r-full)', background: '#22C55E', display: 'inline-block' }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 }}>Live</span>
          </div>
        </div>

        <div style={{ background: '#F7F6F5', padding: 10, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
          {KPI_META.map((k, i) => (
            <div key={k.label} style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-sm)', padding: '10px 12px', overflow: 'hidden' }}>
              <div style={{ position: 'relative', height: 22, marginBottom: 2 }}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.p
                    key={data.kpi[i]}
                    initial={reduce ? undefined : { y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={reduce ? undefined : { y: -10, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    style={{ position: 'absolute', inset: 0, fontSize: 22, fontWeight: 800, color: k.c, letterSpacing: '-0.04em', lineHeight: '22px' }}
                  >
                    {data.kpi[i]}
                  </motion.p>
                </AnimatePresence>
              </div>
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
          <div style={{ position: 'relative' }}>
          <AnimatePresence mode="popLayout" initial={false}>
            {data.rows.map((row) => (
              <motion.div
                key={row.key}
                layout
                initial={reduce ? undefined : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto', backgroundColor: hoverKey === row.key ? 'rgba(var(--brand-rgb),0.045)' : row.status === 'ICS Hold' ? 'rgba(239,68,68,0.025)' : 'rgba(255,255,255,0)' }}
                exit={reduce ? undefined : { opacity: 0, height: 0 }}
                transition={{ layout: { duration: 0.45, ease: EASE }, backgroundColor: { duration: 0.2 } }}
                onMouseEnter={() => setHoverKey(row.key)}
                onMouseLeave={() => setHoverKey(null)}
                style={{ display: 'grid', gridTemplateColumns: '1fr 72px 80px 28px', padding: '9px 14px', borderBottom: '1px solid rgba(0,0,0,0.05)', cursor: 'pointer' }}
              >
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500, color: '#1C1917' }}>{row.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'ui-monospace,monospace' }}>{row.ref}</p>
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.time}</span>
                <div style={{ alignSelf: 'center', position: 'relative', overflow: 'hidden' }}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={row.status}
                      initial={reduce ? undefined : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? undefined : { opacity: 0, y: -6 }}
                      transition={{ duration: 0.25 }}
                      style={{ display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 'var(--r-full)', background: row.sc, color: row.tc }}
                    >
                      {row.status}
                    </motion.span>
                  </AnimatePresence>
                </div>
                <div style={{ alignSelf: 'center', display: 'flex', justifyContent: 'flex-end' }}>
                  <motion.div animate={{ x: hoverKey === row.key ? 2 : 0, opacity: hoverKey === row.key ? 0.7 : 0.25 }} transition={{ duration: 0.15 }}>
                    <Icon name={ICONS.arrowRight} size={11} style={{ color: 'inherit' }} />
                  </motion.div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default function LandingPage() {
  usePageTitle('Glido | Home')
  const tenant = useTenantInfo()
  const reduce = useReducedMotion()
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
      const e = inside ? 0.16 : 0.09
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
      tCardRx = (my - 0.5) * -2; tCardRy = (mx - 0.5) * 3   // whisper-subtle tilt so buttons stay put
      tBgX = (mx - 0.5) * -30;   tBgY    = (my - 0.5) * -22  // parallax lives in the background image
      tCtX = 0;                  tCtY    = 0   // keep the buttons stationary → reliable clicks
      tSpecX = 20 + mx * 30;     tSpecY  = 10 + my * 25
      tScale = 1.004
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
        @keyframes hero-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .hero-shimmer-text {
          background-image: linear-gradient(100deg, var(--brand-color) 42%, color-mix(in srgb, var(--brand-color) 45%, #fff) 50%, var(--brand-color) 58%);
          background-size: 240% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: hero-shimmer 4.5s ease-in-out infinite;
          text-shadow: 0 1px 2px rgba(0,0,0,0.55), 0 2px 16px rgba(0,0,0,0.4);
        }
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
            style={{ position: 'absolute', inset: '-8%', backgroundImage: `url(${heroDroneImg})`, backgroundSize: 'cover', backgroundPosition: 'center', willChange: 'transform' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg,rgba(8,10,14,0.88) 0%,rgba(8,10,14,0.75) 45%,rgba(8,10,14,0.45) 70%,rgba(8,10,14,0.25) 100%)', zIndex: 1 }} />
          <div ref={heroSpecRef} style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', borderRadius: 'var(--r-xl)', transition: 'background 0.1s ease' }} />

          <motion.div
            ref={heroContentRef}
            initial="hidden" animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } } }}
            style={{ position: 'relative', zIndex: 3, padding: '64px 72px', maxWidth: 660, willChange: 'transform' }}
            className="hero-content"
          >
            {/* eyebrow badge */}
            <motion.div variants={RISE} transition={{ duration: 0.6, ease: EASE }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', marginBottom: 22, borderRadius: 999, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)' }}>
              <motion.span
                animate={reduce ? undefined : { scale: [1, 1.35, 1], opacity: [1, 0.55, 1] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: 7, height: 7, borderRadius: 999, background: '#4ADE80', boxShadow: '0 0 8px #4ADE80', display: 'inline-block' }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)', letterSpacing: '0.01em' }}>Sydney CFS · accepting bookings</span>
            </motion.div>
            <motion.h1
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } } }}
              style={{ fontSize: 'clamp(2.2rem,4.2vw,4rem)', fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1.0, color: '#fff', marginBottom: 16, textShadow: '0 2px 30px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.4)', perspective: 400 }}>
              <span style={{ display: 'block' }}>
                {['Book', 'your', 'CFS', 'slot.'].map((w, i) => (
                  <motion.span key={i} variants={WORD_RISE} transition={{ duration: 0.5, ease: EASE }}
                    style={{ display: 'inline-block', marginRight: '0.28em' }}>{w}</motion.span>
                ))}
              </span>
              <span style={{ display: 'block' }}>
                {['Skip', 'the', 'queue.'].map((w, i) => (
                  <motion.span key={i} variants={WORD_RISE} transition={{ duration: 0.5, ease: EASE }}
                    className="hero-shimmer-text"
                    style={{ display: 'inline-block', marginRight: '0.28em' }}>{w}</motion.span>
                ))}
              </span>
            </motion.h1>
            <motion.p variants={RISE} transition={{ duration: 0.65, ease: EASE }}
              style={{ fontSize: 16, color: 'rgba(255,255,255,0.92)', lineHeight: 1.75, marginBottom: 34, maxWidth: 440, textShadow: '0 1px 12px rgba(0,0,0,0.5)' }}>
              Instant booking for drivers, forwarders, and depot teams. Scan your QR at the kiosk, straight to the bay.
            </motion.p>
            <motion.div variants={RISE} transition={{ duration: 0.65, ease: EASE }} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <motion.div whileHover={{ y: -2, scale: 1.015 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
                <Link to="/book" className="btn-primary" style={{ padding: '15px 30px', fontSize: 15.5, boxShadow: '0 2px 4px rgba(0,0,0,0.15), 0 10px 28px rgba(var(--brand-rgb),0.5), inset 0 1.5px 0 rgba(255,255,255,0.4), inset 0 -2px 4px rgba(0,0,0,0.14)' }}>
                  <Icon name={ICONS.calendar} size={16} />
                  Book a Visit
                  <Icon name={ICONS.arrowRight} size={14} />
                </Link>
              </motion.div>
              <motion.div whileHover={{ y: -2, scale: 1.015 }} whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
                <Link to="/bookings" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '15px 26px', fontSize: 15.5, fontWeight: 600, color: '#1C1917', background: 'linear-gradient(160deg, #FFFFFF 0%, #EDECEA 100%)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 'var(--r-full)', textDecoration: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.12), 0 8px 22px rgba(0,0,0,0.22), inset 0 1.5px 0 rgba(255,255,255,0.9)' }}>
                  <Icon name={ICONS.search} size={15} />
                  Look Up Booking
                </Link>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* §3 How it works */}
      <section id="how-it-works" className="section-dots" style={{ padding: '96px 24px', backgroundColor: '#FFFFFF' }}>
        <div className="max-w-5xl mx-auto">
          <Reveal style={{ marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--brand-color)', marginBottom: 10 }}>How it works</p>
            <h2 style={{ fontSize: 'clamp(1.8rem,3.2vw,2.5rem)', fontWeight: 800, color: '#1C1917', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 12, maxWidth: 500 }}>
              From browser to bay door in four steps
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75, maxWidth: 400 }}>No spreadsheets. No radio calls. The whole process is online.</p>
          </Reveal>

          <StaggerGroup className="steps-grid" staggerMs={90} style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 2, background: 'rgba(0,0,0,0.06)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
            {HOW_STEPS.map(step => (
              <StaggerItem key={step.num}
                style={{ background: '#FFFFFF', padding: '32px 26px', transition: 'background 0.15s ease', position: 'relative', overflow: 'hidden' }}
                whileHover={{ background: 'rgba(var(--brand-rgb),0.04)', y: -2 }}
              >
                <span style={{ position: 'absolute', top: -14, right: -6, fontSize: 88, fontWeight: 800, color: 'rgba(0,0,0,0.035)', letterSpacing: '-0.05em', lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }}>{step.num}</span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, position: 'relative' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#1C1917', letterSpacing: '0.04em' }}>{step.num}</span>
                  <div style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', background: 'rgba(var(--brand-rgb),0.08)', border: '1px solid rgba(var(--brand-rgb),0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={step.icon} size={18} style={{ color: 'var(--brand-color)' }} />
                  </div>
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', marginBottom: 7, letterSpacing: '-0.02em', position: 'relative' }}>{step.title}</p>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, position: 'relative' }}>{step.desc}</p>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* §4 Platform preview */}
      <section style={{ padding: '96px 24px', background: '#F7F6F5', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="preview-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.85fr', gap: 56, alignItems: 'center' }}>
            <Reveal x={-24}>
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
            </Reveal>

            {/* Dashboard mockup — plays a small live script (walk-ins, holds clearing) on loop */}
            <Reveal x={24} delay={100}>
              <ReceptionDashboardMockup />
            </Reveal>
          </div>
        </div>
      </section>

      {/* §5 Personas */}
      <section className="section-dots" style={{ padding: '96px 24px', backgroundColor: '#FFFFFF', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="max-w-5xl mx-auto">
          <Reveal style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--brand-color)', marginBottom: 10 }}>Who uses Glido</p>
            <h2 style={{ fontSize: 'clamp(1.8rem,3.2vw,2.5rem)', fontWeight: 800, color: '#1C1917', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 12 }}>
              Built for everyone in the chain
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: 380, margin: '0 auto', lineHeight: 1.75 }}>
              From the freight forwarder booking a slot to the driver scanning in — everyone benefits.
            </p>
          </Reveal>

          <StaggerGroup className="persona-grid" staggerMs={90} style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
            {PERSONAS.map(p => (
              <StaggerItem key={p.title}
                whileHover={{ y: -6, scale: 1.015 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                style={{ background: p.bg, borderRadius: 'var(--r-xl)', padding: '34px 30px', position: 'relative', overflow: 'hidden', cursor: 'default' }}
              >
                <Icon name={p.icon} size={104} style={{ position: 'absolute', top: -18, right: -18, color: 'rgba(255,255,255,0.06)' }} />
                <Icon name={p.icon} size={26} style={{ color: 'rgba(255,255,255,0.85)', marginBottom: 22, display: 'block', position: 'relative' }} />
                <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', marginBottom: 10, position: 'relative' }}>{p.title}</p>
                <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 22, position: 'relative' }}>{p.desc}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
                  {p.bullets.map(b => (
                    <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'rgba(255,255,255,0.70)' }}>
                      <Icon name={ICONS.check} size={13} style={{ flexShrink: 0, color: 'rgba(255,255,255,0.45)' }} />
                      {b}
                    </li>
                  ))}
                </ul>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* §6 Bento features */}
      <section style={{ padding: '96px 24px', background: '#F7F6F5', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="max-w-5xl mx-auto">
          <Reveal style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--brand-color)', marginBottom: 10 }}>Built for the floor</p>
            <h2 style={{ fontSize: 'clamp(1.8rem,3.2vw,2.5rem)', fontWeight: 800, color: '#1C1917', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 12 }}>
              Purpose-built for Container Freight Stations
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: 380, margin: '0 auto', lineHeight: 1.75 }}>Every feature solves a real operational headache.</p>
          </Reveal>

          {/* ICS bento hero */}
          <Reveal className="bento-hero" style={{ background: '#FFFFFF', border: '1px solid rgba(var(--brand-rgb),0.20)', borderRadius: 'var(--r-xl)', padding: '40px 44px', marginBottom: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04),0 8px 32px rgba(0,0,0,0.06),0 0 0 1px rgba(var(--brand-rgb),0.06)' }}>
            <div>
              <div style={{ width: 28, height: 3, borderRadius: 999, background: 'var(--brand-color)', marginBottom: 18 }} />
              <Icon name={ICONS.shield} size={22} style={{ color: 'var(--brand-color)', marginBottom: 14, display: 'block' }} />
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
          </Reveal>

          {/* 2-col bento */}
          <StaggerGroup className="bento-row" staggerMs={80} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {BENTO_2.map(feat => (
              <StaggerItem key={feat.title}
                whileHover={{ y: -3, boxShadow: `0 4px 20px rgba(${feat.hue},0.12)`, borderColor: `rgba(${feat.hue},0.30)` }}
                style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', padding: 30 }}
              >
                <div style={{ width: 24, height: 3, borderRadius: 999, background: `rgb(${feat.hue})`, marginBottom: 16 }} />
                <Icon name={feat.icon} size={20} style={{ color: `rgb(${feat.hue})`, marginBottom: 14, display: 'block' }} />
                <p style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', marginBottom: 7 }}>{feat.title}</p>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{feat.desc}</p>
              </StaggerItem>
            ))}
          </StaggerGroup>

          {/* 3-col bento */}
          <StaggerGroup className="bento-row" staggerMs={70} style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {BENTO_3.map(feat => (
              <StaggerItem key={feat.title}
                whileHover={{ y: -3, boxShadow: `0 4px 20px rgba(${feat.hue},0.12)`, borderColor: `rgba(${feat.hue},0.30)` }}
                style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', padding: 28 }}
              >
                <div style={{ width: 24, height: 3, borderRadius: 999, background: `rgb(${feat.hue})`, marginBottom: 14 }} />
                <Icon name={feat.icon} size={19} style={{ color: `rgb(${feat.hue})`, marginBottom: 12, display: 'block' }} />
                <p style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', marginBottom: 6 }}>{feat.title}</p>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{feat.desc}</p>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* §8 CTA */}
      <section style={{ padding: '120px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${ctaBgImg})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,14,20,0.55) 0%, rgba(10,14,20,0.72) 55%, rgba(10,14,20,0.88) 100%)' }} />

        <div className="max-w-2xl mx-auto" style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <Reveal style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 14px', borderRadius: 'var(--r-full)', background: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.32)', marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: 'var(--r-full)', background: '#4ADE80', animation: 'pulse-dot 2s ease-in-out infinite', display: 'inline-block' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#4ADE80' }}>Accepting bookings now</span>
          </Reveal>

          <Reveal delay={80}>
            <h2 style={{ fontSize: 'clamp(2.2rem,4.8vw,3.5rem)', fontWeight: 800, color: '#fff', letterSpacing: '-0.045em', lineHeight: 1.05, marginBottom: 16 }}>
              Ready to skip<br />the queue?
            </h2>
          </Reveal>

          <Reveal delay={130} style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', lineHeight: 1.8, marginBottom: 36, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
            Your first booking takes under 3 minutes. No account, no calls, no paper.
          </Reveal>

          <Reveal delay={180} style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/book" className="btn-primary" style={{ padding: '14px 32px', fontSize: 15, color: 'var(--brand-text)' }}>
              <Icon name={ICONS.calendar} size={15} style={{ color: 'var(--brand-text)' }} />
              Book a Visit
              <Icon name={ICONS.arrowRight} size={14} style={{ color: 'var(--brand-text)' }} />
            </Link>
            <Link to="/bookings" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 26px', fontSize: 15, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 'var(--r-full)', textDecoration: 'none', transition: 'all 0.18s ease' }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)' }}
              onMouseOut={e  => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)' }}
            >
              <Icon name={ICONS.search} size={15} />
              Look Up Booking
            </Link>
          </Reveal>

          <Reveal delay={230} style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', marginTop: 28 }}>
            {tenant?.name || 'Sydney Container Freight Station'} · ABN 12 345 678 901
          </Reveal>
        </div>
      </section>
    </>
  )
}
