import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { getServiceRequests } from '@/lib/db/service-requests'
import { useCustomerPermissions } from '@/lib/useCustomerPermissions'
import type { ServiceRequest, RequestStage } from '@/data/types'

function buildTiles(canCreate: boolean) { return [
  {
    label:       'New Business Request',
    route:       null,
    description: 'Not available yet',
    icon:        ICONS.container,
    iconBg:      'rgba(0,0,0,0.05)',
    iconFg:      '#A8A29E',
    disabled:    true,
  },
  {
    label:       'New Service Request',
    route:       '/customer/requests/new',
    description: 'Submit a new import or export service request',
    icon:        ICONS.add,
    iconBg:      'rgba(var(--brand-rgb),0.09)',
    iconFg:      'var(--brand-color)',
    disabled:    !canCreate,
  },
  {
    label:       'My Requests',
    route:       '/customer/requests',
    description: 'View and track your submitted requests',
    icon:        ICONS.bookings,
    iconBg:      'rgba(99,102,241,0.09)',
    iconFg:      '#6366F1',
    disabled:    false,
  },
  {
    label:       'Track Shipments',
    route:       null,
    description: 'Not available yet',
    icon:        ICONS.ship,
    iconBg:      'rgba(0,0,0,0.05)',
    iconFg:      '#A8A29E',
    disabled:    true,
  },
  {
    label:       'Reports',
    route:       '/customer/reports',
    description: 'View analytics on your service requests',
    icon:        ICONS.reports,
    iconBg:      'rgba(34,197,94,0.09)',
    iconFg:      '#16A34A',
    disabled:    false,
  },
  {
    label:       'Settings',
    route:       '/customer/settings',
    description: 'Manage your account and preferences',
    icon:        ICONS.settings,
    iconBg:      'rgba(0,0,0,0.05)',
    iconFg:      '#57534E',
    disabled:    false,
  },
]}

const STAGE_LABEL: Record<RequestStage, string> = {
  received: 'Received', in_transit: 'In Transit', arrived: 'Arrived', completed: 'Completed',
}

function activityFor(r: ServiceRequest): { icon: string; color: string; text: string; at: string } {
  if (r.stage === 'received') {
    return { icon: ICONS.add, color: 'var(--brand-color)', text: `Service request ${r.requestId} submitted`, at: r.createdAt }
  }
  return { icon: ICONS.checkSquare, color: '#16A34A', text: `Service request ${r.requestId} is now ${STAGE_LABEL[r.stage]}`, at: r.updatedAt }
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

export default function CustomerDashboardPage() {
  usePageTitle('Glido | Customer Portal')
  const navigate = useNavigate()
  const perms = useCustomerPermissions()
  const TILES = buildTiles(perms.can_create_service_request)
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getServiceRequests({ sort: 'newest' }).then(rows => {
      if (!cancelled) { setRequests(rows); setIsLoading(false) }
    }).catch(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [])

  const activity = requests.slice(0, 5).map(activityFor)

  return (
    <>
      <style>{`
        @media (max-width: 900px) { .dash-tiles { grid-template-columns: repeat(2,1fr) !important; } }
        @media (max-width: 560px) { .dash-tiles { grid-template-columns: 1fr !important; } }
        .dash-tile:not(.disabled):hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,0,0,0.09), 0 2px 8px rgba(0,0,0,0.05); }
      `}</style>

      {/* Action tiles */}
      <div className="dash-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--card-gap)', marginBottom: 24 }}>
        {TILES.map(t => (
          <div
            key={t.label}
            className={`dash-tile${t.disabled ? ' disabled' : ''}`}
            onClick={() => { if (!t.disabled && t.route) navigate(t.route) }}
            style={{
              background: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.07)',
              borderRadius: 'var(--r-lg)',
              padding: 'var(--card-pad)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)',
              cursor: t.disabled ? 'not-allowed' : 'pointer',
              opacity: t.disabled ? 0.55 : 1,
              transition: 'transform 0.15s cubic-bezier(0.16,1,0.3,1), box-shadow 0.15s ease',
            }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 'var(--r-md)', background: t.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Icon name={t.icon} size={22} style={{ color: t.iconFg }} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.01em', marginBottom: 4 }}>{t.label}</p>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>{t.description}</p>
          </div>
        ))}
      </div>

      {/* Recent activity */}
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 'var(--card-pad)', boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', marginBottom: 14 }}>Recent Activity</p>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ height: 44, borderRadius: 'var(--r-sm)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Icon name={ICONS.bell} size={28} style={{ color: 'rgba(0,0,0,0.12)' }} />
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '10px 0 0' }}>No recent activity yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {activity.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: i < activity.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                <div style={{ width: 32, height: 32, borderRadius: 'var(--r-sm)', background: `${a.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={a.icon} size={15} style={{ color: a.color }} />
                </div>
                <p style={{ flex: 1, fontSize: 14.5, color: '#1C1917', margin: 0 }}>{a.text}</p>
                <span style={{ fontSize: 13, color: 'var(--text-tertiary)', flexShrink: 0 }}>{relativeTime(a.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
    </>
  )
}
