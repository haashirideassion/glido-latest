import { useKiosk } from '@/contexts/KioskContext'
import { Icon, ICONS } from '@/lib/Icon'
import type { KioskScreen } from '@/contexts/KioskContext'

const BOOKING_SCREENS: KioskScreen[] = ['lookup', 'scan', 'confirm', 'consent', 'idscan', 'slot-picker']
const WALKIN_SCREENS:  KioskScreen[] = ['purpose', 'walkin']

const BASE = 'width:56px;height:56px;border-radius:9999px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.25s ease;background:#fff;'
const c = (active: boolean, done: boolean) => BASE + (active || done ? 'border:2.5px solid var(--brand-color);color:var(--brand-color);' : 'border:2.5px solid #C2C2C2;color:#C2C2C2;')
const lb = (active: boolean, done: boolean): React.CSSProperties => ({ fontSize: 15, textAlign: 'center', whiteSpace: 'nowrap', fontWeight: active || done ? 700 : 400, color: active || done ? '#101010' : '#605F5F', transition: 'all 0.25s ease' })
const line = (done: boolean, afterActive = false): React.CSSProperties => ({
  height: 3, flex: 1, borderRadius: 'var(--r-xs)', marginTop: 27, minWidth: 8, transition: 'background 0.3s ease',
  background: done
    ? 'var(--brand-color)'
    : afterActive
    ? 'linear-gradient(to right, var(--brand-color), #C2C2C2)'
    : '#C2C2C2',
})

function GridSvg({ side }: { side: 'left' | 'right' }) {
  return (
    <svg width="497" height="418" viewBox="0 0 497 418" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', [side]: 0 }}>
      <g opacity="0.22">
        <line x1="495.384" y1="0.5"        x2="-157" y2="0.499964"   stroke="black"/>
        <line x1="495.384" y1="84.1426"    x2="-157" y2="84.1425"    stroke="black"/>
        <line x1="29.8955"  y1="0"          x2="29.8955"  y2="417"    stroke="black"/>
        <line x1="495.384" y1="167.785"    x2="-157" y2="167.785"    stroke="black"/>
        <line x1="123.093"  y1="0"          x2="123.093"  y2="417"    stroke="black"/>
        <line x1="495.384" y1="251.427"    x2="-157" y2="251.427"    stroke="black"/>
        <line x1="216.291"  y1="0"          x2="216.291"  y2="417"    stroke="black"/>
        <line x1="495.384" y1="333.858"    x2="-157" y2="333.858"    stroke="black"/>
        <line x1="309.489"  y1="0"          x2="309.489"  y2="417"    stroke="black"/>
        <line x1="495.384" y1="417.5"      x2="-157" y2="417.5"      stroke="black"/>
        <line x1="402.686"  y1="0"          x2="402.686"  y2="417"    stroke="black"/>
        <line x1="495.884"  y1="0"          x2="495.884"  y2="417"    stroke="black"/>
      </g>
    </svg>
  )
}

function Step({ icon, label, active, done }: { icon: string; label: string; active: boolean; done: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0 }}>
      <div style={{ ...Object.fromEntries(c(active, done).split(';').filter(Boolean).map(s => { const [k, ...v] = s.split(':'); return [k.trim().replace(/-([a-z])/g, (_: string, x: string) => x.toUpperCase()), v.join(':').trim()] })) } as any}>
        <Icon name={icon} size={24} />
      </div>
      <span style={lb(active, done)}>{label}</span>
    </div>
  )
}

export function KioskStepper() {
  const { state, goTo } = useKiosk()
  const s = state.currentScreen
  const isBooking = BOOKING_SCREENS.includes(s)
  const isWalkIn  = WALKIN_SCREENS.includes(s)
  if (!isBooking && !isWalkIn) return null


  const back = () => {
    if (isBooking) {
      const map: Partial<Record<typeof s, typeof s>> = { lookup: 'welcome', scan: 'lookup', 'slot-picker': 'lookup', confirm: 'lookup', consent: 'confirm', idscan: 'consent' }
      goTo(map[s] ?? 'welcome')
    } else {
      goTo(s === 'purpose' ? 'welcome' : 'purpose')
    }
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(120deg, rgba(var(--brand-rgb),0.06) 0%, rgba(var(--brand-rgb),0.02) 35%, rgba(255,255,255,0) 70%), #fff', padding: '32px 60px 28px', borderBottom: '1px solid rgba(0,0,0,0.055)', boxShadow: '0 4px 16px rgba(0,0,0,0.04),0 1px 4px rgba(0,0,0,0.03)', flexShrink: 0 }}>

      {/* Grid patterns */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 380, pointerEvents: 'none', zIndex: 0, WebkitMaskImage: 'linear-gradient(to right,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)', maskImage: 'linear-gradient(to right,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)' }}>
        <GridSvg side="left" />
      </div>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 380, pointerEvents: 'none', zIndex: 0, WebkitMaskImage: 'linear-gradient(to left,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)', maskImage: 'linear-gradient(to left,rgba(0,0,0,0.30) 0%,rgba(0,0,0,0.10) 100%)' }}>
        <GridSvg side="right" />
      </div>

      {/* Back button */}
      <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 2 }}>
        <button onClick={back} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px 9px 14px', fontSize: 15, fontWeight: 600, color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 'var(--r-full)', background: '#fff', cursor: 'pointer', transition: 'all 0.15s ease' }}
          onMouseOver={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.background = '#f9fafb' }}
          onMouseOut={e  => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <path d="M8.5 2.5L4.5 7l4 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
      </div>

      {/* Title */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', marginBottom: 28 }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 8 }}>
          {isBooking ? 'Booking Check-In' : 'Walk-In Registration'}
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
          {isBooking
            ? 'Scan or enter your reference number to check in for your scheduled slot'
            : 'No booking? Register your visit and reception will be notified to assist you'}
        </p>
      </div>

      {/* Booking flow stepper */}
      {isBooking && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', maxWidth: 560, margin: '0 auto' }}>
            <Step icon={ICONS.search} label="Find Booking" active={['lookup','scan','slot-picker'].includes(s)} done={['confirm','consent','idscan'].includes(s)} />
            <div style={line(['confirm','consent','idscan'].includes(s), ['lookup','scan','slot-picker'].includes(s))} />
            <Step icon={ICONS.check}  label="Confirm"      active={s === 'confirm'}              done={['consent','idscan'].includes(s)} />
            <div style={line(['consent','idscan'].includes(s), s === 'confirm')} />
            <Step icon={ICONS.shield} label="Verify ID"    active={['consent','idscan'].includes(s)} done={false} />
          </div>
        </div>
      )}

      {/* Walk-in flow stepper */}
      {isWalkIn && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', maxWidth: 320, margin: '0 auto' }}>
            <Step icon={ICONS.users} label="Visit Type"   active={s === 'purpose'} done={s === 'walkin'} />
            <div style={line(s === 'walkin', s === 'purpose')} />
            <Step icon={ICONS.user}  label="Your Details" active={s === 'walkin'}  done={false} />
          </div>
        </div>
      )}
    </div>
  )
}
