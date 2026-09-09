import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { getComplianceSummary, getComplianceActivityLog } from '@/lib/db/compliance'
import type { ComplianceSummary, ComplianceActivityLogItem } from '@/data/types'

const METRICS: Array<{ key: keyof ComplianceSummary; label: string; color: string; icon: string }> = [
  { key: 'activeTasks',          label: 'Active Tasks',          color: '#2563EB', icon: ICONS.clipboard },
  { key: 'completedThisMonth',   label: 'Completed This Month',  color: '#16A34A', icon: ICONS.checkSquare },
  { key: 'scheduledInspections', label: 'Scheduled Inspections', color: '#EA580C', icon: ICONS.calendar },
  { key: 'overdueItems',         label: 'Overdue Items',         color: '#DC2626', icon: ICONS.siren },
]

const TILES = [
  { label: 'My Activities', route: '/compliance/activities', description: 'Current compliance tasks and pending activities', cta: 'Access My Activities', icon: ICONS.clipboard, iconBg: 'rgba(37,99,235,0.09)', iconFg: '#2563EB' },
  { label: 'Completed Activities', route: '/compliance/completed', description: 'Historical compliance activities and reports', cta: 'Access Completed Activities', icon: ICONS.clipboardCheck, iconBg: 'rgba(22,163,74,0.09)', iconFg: '#16A34A' },
  { label: 'Site Inspection', route: '/compliance/inspections', description: 'Schedule and manage facility inspections', cta: 'Access Site Inspection', icon: ICONS.shield, iconBg: 'rgba(124,58,237,0.09)', iconFg: '#7C3AED' },
]

const STATUS_COLOR: Record<string, string> = { Progress: '#2563EB', 'Pending Review': '#D97706', Scheduled: '#16A34A', Completed: '#16A34A' }
const PRIORITY_COLOR: Record<string, string> = { high: '#DC2626', medium: '#D97706', low: '#78716C' }
const CATEGORY_ICON: Record<ComplianceActivityLogItem['category'], { icon: string; color: string }> = {
  activity:   { icon: ICONS.clipboard, color: '#2563EB' },
  inspection: { icon: ICONS.shield,    color: '#7C3AED' },
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

export default function ComplianceDashboardPage() {
  usePageTitle('Glido | Compliance Dashboard')
  const navigate = useNavigate()
  const [summary, setSummary] = useState<ComplianceSummary | null>(null)
  const [activity, setActivity] = useState<ComplianceActivityLogItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = () => {
    setIsLoading(true); setFailed(false)
    Promise.all([getComplianceSummary(), getComplianceActivityLog(10)])
      .then(([s, a]) => { setSummary(s); setActivity(a); setIsLoading(false) })
      .catch(() => { setFailed(true); setIsLoading(false) })
  }
  useEffect(() => { load() }, [])

  return (
    <>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--card-gap)', marginBottom: 24 }}>
        {METRICS.map(m => (
          <div key={m.key} style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 'var(--card-pad)', boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 6px' }}>{m.label}</p>
              {isLoading ? (
                <div style={{ width: 40, height: 26, borderRadius: 'var(--r-sm)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ) : (
                <p style={{ fontSize: 26, fontWeight: 700, color: '#1C1917', margin: 0 }}>{summary ? summary[m.key] : 0}</p>
              )}
            </div>
            <Icon name={m.icon} size={26} style={{ color: m.color, opacity: 0.85 }} />
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--card-gap)', marginBottom: 24 }}>
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
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.4, margin: '0 0 12px' }}>{t.description}</p>
            <span style={{ fontSize: 13, fontWeight: 600, color: t.iconFg }}>{t.cta} →</span>
          </div>
        ))}
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 'var(--card-pad)', boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0 }}>Recent Activities</p>
          <button onClick={() => navigate('/compliance/activities')} style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 600, color: 'var(--brand-color)', cursor: 'pointer' }}>View All</button>
        </div>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ height: 44, borderRadius: 'var(--r-sm)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
          </div>
        ) : failed ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '0 0 10px' }}>Couldn't load recent activities.</p>
            <button onClick={load} style={{ background: 'none', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>Retry</button>
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
                  {a.status && (
                    <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-full)', color: STATUS_COLOR[a.status] ?? '#57534E', background: `${STATUS_COLOR[a.status] ?? '#57534E'}18`, flexShrink: 0 }}>{a.status}</span>
                  )}
                  {a.priority && (
                    <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-full)', color: PRIORITY_COLOR[a.priority] ?? '#57534E', background: `${PRIORITY_COLOR[a.priority] ?? '#57534E'}18`, flexShrink: 0 }}>{a.priority}</span>
                  )}
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
