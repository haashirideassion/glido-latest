import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { getAllocatorActivity } from '@/lib/db/allocator-activity'
import type { AllocatorActivityItem } from '@/lib/db/allocator-activity'

const TILES = [
  {
    label: 'Resources', route: '/allocator/resources',
    description: 'Manage trucks, trailers and drivers resources',
    icon: ICONS.truck, iconBg: 'rgba(37,99,235,0.09)', iconFg: '#2563EB',
  },
  {
    label: 'Trips', route: '/allocator/trips',
    description: 'Assign resources to trips planned by planners',
    icon: ICONS.container, iconBg: 'rgba(124,58,237,0.09)', iconFg: '#7C3AED',
  },
  {
    label: 'Maintenance', route: '/allocator/maintenance',
    description: 'Manage resource maintenance schedules and history',
    icon: ICONS.wrench, iconBg: 'rgba(234,88,12,0.09)', iconFg: '#EA580C',
  },
  {
    label: 'Settings', route: '/allocator/settings',
    description: 'Configure allocator preferences and system settings',
    icon: ICONS.settings, iconBg: 'rgba(0,0,0,0.05)', iconFg: '#57534E',
  },
]

const CATEGORY_ICON: Record<AllocatorActivityItem['category'], { icon: string; color: string }> = {
  resource:    { icon: ICONS.truck,   color: '#2563EB' },
  trip:        { icon: ICONS.container, color: '#7C3AED' },
  maintenance: { icon: ICONS.wrench,  color: '#EA580C' },
  driver:      { icon: ICONS.driver,  color: '#16A34A' },
}

function relativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'Just now'
  if (s < 3600) { const m = Math.floor(s / 60); return `${m} minute${m === 1 ? '' : 's'} ago` }
  if (s < 86400) { const h = Math.floor(s / 3600); return `${h} hour${h === 1 ? '' : 's'} ago` }
  if (s < 172800) return 'Yesterday'
  const d = Math.floor(s / 86400)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

export default function AllocatorDashboardPage() {
  usePageTitle('Glido | Resource Allocator Dashboard')
  const navigate = useNavigate()
  const [activity, setActivity] = useState<AllocatorActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getAllocatorActivity()
      .then(rows => { if (!cancelled) { setActivity(rows); setIsLoading(false) } })
      .catch(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--card-gap)', marginBottom: 24 }}>
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
        <p style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', marginBottom: 14 }}>Recent Activities</p>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ height: 44, borderRadius: 'var(--r-sm)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
          </div>
        ) : activity.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Icon name={ICONS.bell} size={28} style={{ color: 'rgba(0,0,0,0.12)' }} />
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '10px 0 0' }}>No recent activities yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {activity.map(a => {
              const meta = CATEGORY_ICON[a.category]
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--r-sm)', background: `${meta.color}0A` }}>
                  <div style={{ width: 32, height: 32, borderRadius: 'var(--r-sm)', background: `${meta.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
