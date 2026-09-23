import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { getPlannerActivity } from '@/lib/db/planner-reports'
import type { PlannerActivityItem } from '@/lib/db/planner-reports'

const TILES = [
  {
    label: 'Vessels', route: '/planner/vessels',
    description: 'Manage vessel schedules and container assignments',
    icon: ICONS.ship, iconBg: 'rgba(37,99,235,0.09)', iconFg: '#2563EB',
  },
  {
    label: 'Trips', route: '/planner/trips',
    description: 'Plan and manage import/export trips and logistics',
    icon: ICONS.truck, iconBg: 'rgba(124,58,237,0.09)', iconFg: '#7C3AED',
  },
  {
    label: 'Settings', route: '/planner/settings',
    description: 'Configure planner preferences and system settings',
    icon: ICONS.settings, iconBg: 'rgba(0,0,0,0.05)', iconFg: '#57534E',
  },
  {
    label: 'Reports', route: '/planner/reports',
    description: 'Generate and view analytical reports and statistics',
    icon: ICONS.reports, iconBg: 'rgba(34,197,94,0.09)', iconFg: '#16A34A',
  },
]

const CATEGORY_ICON: Record<PlannerActivityItem['category'], { icon: string; color: string }> = {
  vessel: { icon: ICONS.ship,    color: '#2563EB' },
  trip:   { icon: ICONS.truck,   color: '#7C3AED' },
  report: { icon: ICONS.reports, color: '#16A34A' },
}

// FR: "The relative day and time... (e.g. 2 hours ago, Yesterday, 2 days ago)" — matches the same
// full-word format used on the Customer Portal Dashboard, not abbreviated "2h ago"/"2d ago".
function relativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'Just now'
  if (s < 3600) { const m = Math.floor(s / 60); return `${m} minute${m === 1 ? '' : 's'} ago` }
  if (s < 86400) { const h = Math.floor(s / 3600); return `${h} hour${h === 1 ? '' : 's'} ago` }
  if (s < 172800) return 'Yesterday'
  const d = Math.floor(s / 86400)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

export default function PlannerDashboardPage() {
  usePageTitle('Glido | Planner Dashboard')
  const navigate = useNavigate()
  const [activity, setActivity] = useState<PlannerActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getPlannerActivity()
      .then(rows => { if (!cancelled) { setActivity(rows); setIsLoading(false) } })
      .catch(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
        /* Four fixed columns squashed the tiles below ~900px. Same breakpoints the Customer
           Portal dashboard already uses, so the two modules behave alike. */
        @media (max-width: 900px) { .plan-tiles { grid-template-columns: repeat(2,1fr) !important; } }
        @media (max-width: 560px) { .plan-tiles { grid-template-columns: 1fr !important; } }
      `}</style>

      <div className="plan-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--card-gap)', marginBottom: 24 }}>
        {TILES.map(t => (
          <div key={t.label} onClick={() => navigate(t.route)}
            style={{
              background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)',
              padding: 'var(--card-pad)', boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)',
              cursor: 'pointer', transition: 'transform 0.15s cubic-bezier(0.16,1,0.3,1), box-shadow 0.15s ease',
            }}
            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.09), 0 2px 8px rgba(0,0,0,0.05)' }}
            onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)' }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', background: t.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Icon name={t.icon} size={22} style={{ color: t.iconFg }} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.01em', marginBottom: 4 }}>{t.label}</p>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>{t.description}</p>
          </div>
        ))}
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 'var(--card-pad)', boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)' }}>
        {/* FRD names this section "Recent Activity & update". */}
        <p style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', marginBottom: 14 }}>Recent Activity &amp; update</p>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ height: 44, borderRadius: 'var(--r-sm)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
          </div>
        ) : activity.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Icon name={ICONS.bell} size={28} style={{ color: 'rgba(0,0,0,0.12)' }} />
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '10px 0 0' }}>No recent activity yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {activity.map((a, i) => {
              const meta = CATEGORY_ICON[a.category]
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: i < activity.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 'var(--r-sm)', background: `${meta.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={meta.icon} size={15} style={{ color: meta.color }} />
                  </div>
                  <p style={{ flex: 1, fontSize: 14.5, color: '#1C1917', margin: 0 }}>{a.message}</p>
                  <span style={{ fontSize: 13, color: 'var(--text-tertiary)', flexShrink: 0 }}>{relativeTime(a.createdAt)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
