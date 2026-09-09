import { useState, useEffect } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { getPlannerSettings, updatePlannerSettings } from '@/lib/db/planner-settings'
import { toast } from '@/lib/toast'
import type { PlannerSettings } from '@/data/types'

const CARD: React.CSSProperties = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)', marginBottom: 16 }

type Tab = 'general' | 'notifications' | 'integrations'
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'general', label: 'General' }, { key: 'notifications', label: 'Notifications' }, { key: 'integrations', label: 'Integrations' },
]

const NOTIF_EVENTS: Array<{ key: 'vessel_arrival' | 'trip_scheduled' | 'trip_completed'; label: string }> = [
  { key: 'vessel_arrival',  label: 'Vessel arrival' },
  { key: 'trip_scheduled',  label: 'Trip scheduled' },
  { key: 'trip_completed',  label: 'Trip completed' },
]

const INTEGRATIONS = [
  { name: 'Vessel Tracking API', description: 'Connect to real-time vessel tracking services' },
  { name: 'Port Authority System', description: 'Sync with port management systems' },
  { name: 'Weather API', description: 'Get weather forecasts for trip planning' },
]

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      style={{ width: 44, height: 24, borderRadius: 'var(--r-full)', flexShrink: 0, border: 'none', cursor: 'pointer',
        background: on ? 'var(--brand-color)' : 'rgba(0,0,0,0.15)', position: 'relative', transition: 'background 0.2s ease' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: 'var(--r-full)', background: '#fff', transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.20)' }} />
    </button>
  )
}

export default function PlannerSettingsPage() {
  usePageTitle('Glido | Planner Settings')
  const [tab, setTab] = useState<Tab>('general')
  const [pendingTab, setPendingTab] = useState<Tab | null>(null)
  const [settings, setSettings] = useState<PlannerSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [configureIntegration, setConfigureIntegration] = useState<string | null>(null)

  // Local editable copies
  const [defaultLandingPage, setDefaultLandingPage] = useState('vessels')
  const [itemsPerPage, setItemsPerPage] = useState('10')
  const [showCompletedDefault, setShowCompletedDefault] = useState(false)
  const [emailNotif, setEmailNotif] = useState({ vessel_arrival: true, trip_scheduled: true, trip_completed: true })
  const [systemNotif, setSystemNotif] = useState({ vessel_arrival: true, trip_scheduled: true, trip_completed: true })

  useEffect(() => {
    getPlannerSettings().then(s => {
      if (!s) return
      setSettings(s)
      setDefaultLandingPage(s.defaultLandingPage)
      setItemsPerPage(String(s.itemsPerPage))
      setShowCompletedDefault(s.showCompletedDefault)
      setEmailNotif(s.emailNotifications)
      setSystemNotif(s.systemNotifications)
      setIsLoading(false)
    }).catch(() => setIsLoading(false))
  }, [])

  const requestTabChange = (next: Tab) => {
    if (dirty) { setPendingTab(next); return }
    setTab(next)
  }
  const discardAndSwitch = () => {
    if (settings) {
      setDefaultLandingPage(settings.defaultLandingPage)
      setItemsPerPage(String(settings.itemsPerPage))
      setShowCompletedDefault(settings.showCompletedDefault)
      setEmailNotif(settings.emailNotifications)
      setSystemNotif(settings.systemNotifications)
    }
    setDirty(false)
    if (pendingTab) { setTab(pendingTab); setPendingTab(null) }
  }

  const saveGeneral = async () => {
    const n = Number(itemsPerPage)
    if (!Number.isInteger(n) || n < 5 || n > 100) { toast('Items per page must be between 5 and 100', 'error'); return }
    setSaving(true)
    try {
      const result = await updatePlannerSettings({
        default_landing_page: defaultLandingPage, items_per_page: n, show_completed_default: showCompletedDefault,
      })
      if (!result) { toast('Could not save settings', 'error'); return }
      setSettings(result); setDirty(false)
      toast('Settings saved', 'success')
    } finally { setSaving(false) }
  }

  const saveNotifications = async () => {
    setSaving(true)
    try {
      const result = await updatePlannerSettings({ email_notifications: emailNotif, system_notifications: systemNotif })
      if (!result) { toast('Could not save settings', 'error'); return }
      setSettings(result); setDirty(false)
      toast('Notification settings saved', 'success')
    } finally { setSaving(false) }
  }

  if (isLoading) {
    return <div style={{ height: 200, borderRadius: 'var(--r-lg)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#F0F0EF', padding: 4, borderRadius: 'var(--r-full)', width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => requestTabChange(t.key)}
            style={{ padding: '8px 20px', borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', background: tab === t.key ? '#fff' : 'transparent', color: tab === t.key ? '#1C1917' : 'var(--text-secondary)', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.10)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 2 }}>General Settings</p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 18 }}>Manage your planner general preferences</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div style={{ ...CARD, marginBottom: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 12 }}>Default View</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Default Landing Page</p>
              <select value={defaultLandingPage} onChange={e => { setDefaultLandingPage(e.target.value); setDirty(true) }}
                style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', outline: 'none', fontFamily: 'inherit', background: '#fff' }}>
                <option value="vessels">Vessels</option>
                <option value="trips">Trips</option>
                <option value="reports">Reports</option>
              </select>
            </div>

            <div style={{ ...CARD, marginBottom: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 14 }}>Display Settings</p>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Items per page</p>
                <input type="number" min={5} max={100} value={itemsPerPage} onChange={e => { setItemsPerPage(e.target.value); setDirty(true) }}
                  style={{ width: 120, height: 38, padding: '0 12px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 14.5, color: '#1C1917' }}>Show completed items by default</p>
                <Toggle on={showCompletedDefault} onToggle={() => { setShowCompletedDefault(v => !v); setDirty(true) }} />
              </div>
            </div>
          </div>

          <button type="button" onClick={saveGeneral} disabled={saving}
            style={{ padding: '10px 22px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      )}

      {tab === 'notifications' && (
        <>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 2 }}>Notification Settings</p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 18 }}>Customize when and how you receive notifications</p>

          <div style={CARD}>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 14 }}>Email Notifications</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {NOTIF_EVENTS.map(ev => (
                <div key={ev.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: 14.5, color: '#1C1917' }}>{ev.label}</p>
                  <Toggle on={emailNotif[ev.key]} onToggle={() => { setEmailNotif(prev => ({ ...prev, [ev.key]: !prev[ev.key] })); setDirty(true) }} />
                </div>
              ))}
            </div>
          </div>

          <div style={CARD}>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 14 }}>System Notifications</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {NOTIF_EVENTS.map(ev => (
                <div key={ev.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: 14.5, color: '#1C1917' }}>{ev.label}</p>
                  <Toggle on={systemNotif[ev.key]} onToggle={() => { setSystemNotif(prev => ({ ...prev, [ev.key]: !prev[ev.key] })); setDirty(true) }} />
                </div>
              ))}
            </div>
          </div>

          <button type="button" onClick={saveNotifications} disabled={saving}
            style={{ padding: '10px 22px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      )}

      {tab === 'integrations' && (
        <>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 2 }}>Integrations</p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 18 }}>Connect with external systems and APIs</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {INTEGRATIONS.map(intg => (
              <div key={intg.name} style={{ ...CARD, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 3 }}>{intg.name}</p>
                  <p style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{intg.description}</p>
                </div>
                <button type="button" onClick={() => setConfigureIntegration(intg.name)}
                  style={{ height: 36, padding: '0 16px', fontSize: 13.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  Configure
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Unsaved-changes confirm */}
      {pendingTab && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}>
          <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: 24, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.20)' }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', marginBottom: 8 }}>Discard unsaved changes?</p>
            <p style={{ fontSize: 14.5, color: 'var(--text-secondary)', marginBottom: 20 }}>You have unsaved changes on this tab. Switching tabs will discard them.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setPendingTab(null)}
                style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Stay
              </button>
              <button type="button" onClick={discardAndSwitch}
                style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: '#fff', background: '#DC2626', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Configure integration — placeholder detail */}
      {configureIntegration && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }} onClick={() => setConfigureIntegration(null)}>
          <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: 24, maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.20)' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', marginBottom: 8 }}>{configureIntegration}</p>
            <p style={{ fontSize: 14.5, color: 'var(--text-secondary)', marginBottom: 20 }}>
              This integration is not yet connected. Contact your system administrator to set up API credentials for {configureIntegration}.
            </p>
            <button type="button" onClick={() => setConfigureIntegration(null)}
              style={{ width: '100%', height: 38, fontSize: 14, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
