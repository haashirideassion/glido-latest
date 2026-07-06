import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'

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

const MODULES = [
  {
    label:       'Visitor Portal',
    route:       '/bookings',
    description: 'Book appointments, check status and manage visits',
    icon:        ICONS.calendar,
    iconBg:      'rgba(var(--brand-rgb),0.09)',
    iconFg:      'var(--brand-color)',
  },
  {
    label:       'Reception',
    route:       '/reception',
    description: 'Manage visitors, timeslots and document verification',
    icon:        ICONS.home,
    iconBg:      'rgba(99,102,241,0.09)',
    iconFg:      '#6366F1',
  },
  {
    label:       'Visitor Register',
    route:       '/kiosk',
    description: 'Tablet-based visitor check-in system',
    icon:        ICONS.kiosk,
    iconBg:      'rgba(34,197,94,0.09)',
    iconFg:      '#16A34A',
  },
]

export default function ModulesPage() {
  usePageTitle('Glido | Modules')
  const navigate = useNavigate()

  return (
    <>
      <style>{`
        @media (max-width: 800px)  { .modules-grid { grid-template-columns: repeat(2,1fr) !important; } }
        @media (max-width: 520px)  { .modules-grid { grid-template-columns: 1fr !important; } }
        .module-card:hover { transform: translateY(-3px) !important; box-shadow: 0 12px 36px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.07) !important; }
      `}</style>

      <div style={{ minHeight: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', background: 'linear-gradient(120deg, rgba(var(--brand-rgb),0.06) 0%, rgba(var(--brand-rgb),0.02) 35%, rgba(255,255,255,0) 70%), #fff', position: 'relative', overflow: 'hidden' }}>

        {/* Grid patterns */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 380, pointerEvents: 'none', zIndex: 0, WebkitMaskImage: 'linear-gradient(to right,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)', maskImage: 'linear-gradient(to right,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)' }}>
          <GridSvg side="left" />
        </div>
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 380, pointerEvents: 'none', zIndex: 0, WebkitMaskImage: 'linear-gradient(to left,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)', maskImage: 'linear-gradient(to left,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)' }}>
          <GridSvg side="right" />
        </div>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48, position: 'relative', zIndex: 1 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', margin: 0 }}>
            Welcome to Glido
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', marginTop: 8, margin: '8px 0 0' }}>
            Select a module to get started
          </p>
        </div>

        {/* Grid */}
        <div
          className="modules-grid"
          style={{
            display: 'grid',
            position: 'relative', zIndex: 1,
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 24,
            width: '100%',
            maxWidth: 1100,
            margin: '0 auto',
          }}
        >
          {MODULES.map(m => (
            <div
              key={m.route}
              className="module-card"
              onClick={() => navigate(m.route)}
              style={{
                background: '#FFFFFF',
                borderRadius: 'var(--r-xl)',
                padding: 32,
                minHeight: 280,
                boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.07)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.18s cubic-bezier(0.16,1,0.3,1), box-shadow 0.18s ease',
              }}
            >
              {/* Icon */}
              <div style={{
                width: 72, height: 72, borderRadius: 'var(--r-lg)',
                background: m.iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 22, flexShrink: 0,
              }}>
                <Icon name={m.icon} size={32} style={{ color: m.iconFg }} />
              </div>

              {/* Label */}
              <p style={{ fontSize: 20, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', marginBottom: 8 }}>
                {m.label}
              </p>

              {/* Description */}
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.55, flex: 1, marginBottom: 24 }}>
                {m.description}
              </p>

              {/* Arrow */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 20, color: '#C7C3BF', lineHeight: 1 }}>→</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </>
  )
}
