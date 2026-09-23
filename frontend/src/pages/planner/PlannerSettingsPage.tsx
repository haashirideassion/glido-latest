import React, { useState, useEffect } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { getPlannerSettings, updatePlannerSettings } from '@/lib/db/planner-settings'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { toast } from '@/lib/toast'
import type { PlannerSettings } from '@/data/types'

// ─── Shared settings chrome ───────────────────────────────────────────────────
// Tokens and primitives copied verbatim from reception/SettingsPage so every Settings surface
// in the app reads as one system. Worth extracting into a shared module next time either page
// is touched — CustomerSettingsPage carries the same copy.

const LABEL: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 8 }
const INPUT: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: 15, color: '#1C1917', background: '#FFFFFF', border: '1px solid #E2E0DD', borderRadius: 'var(--r-sm)', outline: 'none', transition: 'border-color 0.15s ease, box-shadow 0.15s ease', boxSizing: 'border-box' }
const CARD: React.CSSProperties  = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)', marginBottom: 12 }
const SAVE: React.CSSProperties  = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px', background: 'var(--brand-color)', color: 'var(--brand-text)', border: 'none', borderRadius: 'var(--r-full)', fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22),0 4px 14px rgba(var(--brand-rgb),0.40)', marginTop: 20, transition: 'box-shadow 0.15s ease' }

// FRD 2.4.2.3 names a heading and a line of sub-text for each tab. They sit above the cards so
// the planner reads what the tab is for before the first control.
function TabHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ margin: '10px 0 14px' }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', marginBottom: 4 }}>{title}</h2>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{desc}</p>
    </div>
  )
}

function SectionHead({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', marginBottom: desc ? 4 : 0 }}>{title}</h3>
      {desc && <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{desc}</p>}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={LABEL}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 5, lineHeight: 1.4 }}>{hint}</p>}
    </div>
  )
}

function FocusInput({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} style={{ ...INPUT, ...props.style as React.CSSProperties }}
      onFocus={e => { e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.12)' }}
      onBlur={e  => { e.target.style.borderColor = 'rgba(0,0,0,0.10)'; e.target.style.boxShadow = 'none' }}
    />
  )
}

function SaveBtn({ loading, dirty }: { loading?: boolean; dirty?: boolean }) {
  const disabled = loading || !dirty
  return (
    <button type="submit" disabled={disabled} style={{ ...SAVE, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {loading ? 'Saving…' : 'Save changes'}
    </button>
  )
}

// Reception's toggle geometry (42×24, #D1D5DB when off) — the planner page previously used a
// 44×24 switch with a different off-state grey.
function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div onClick={onToggle}
      style={{ width: 42, height: 24, borderRadius: 'var(--r-full)', background: on ? 'var(--brand-color)' : '#D1D5DB', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.2s' }} />
    </div>
  )
}

// Reception's PermPanel layout — a label+description table with a switch per row.
function TogglePanel<K extends string>({ title, desc, items, values, onToggle }: {
  title: string; desc: string
  items: Array<{ key: K; label: string; desc: string }>
  values: Record<K, boolean>
  onToggle: (key: K) => void
}) {
  return (
    <div style={CARD}>
      <SectionHead title={title} desc={desc} />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {items.map((item, ii) => (
            <tr key={item.key} style={{ borderTop: ii === 0 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
              <td style={{ padding: '14px 0', paddingRight: 24, verticalAlign: 'middle' }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: 0 }}>{item.label}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0', lineHeight: 1.4 }}>{item.desc}</p>
              </td>
              <td style={{ padding: '14px 0', verticalAlign: 'middle', width: 1, paddingLeft: 24 }}>
                <Switch on={values[item.key]} onToggle={() => onToggle(item.key)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page data ────────────────────────────────────────────────────────────────

type Tab = 'general' | 'notifications' | 'integrations'
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'general', label: 'General' }, { key: 'notifications', label: 'Notifications' }, { key: 'integrations', label: 'Integrations' },
]

type NotifKey = 'vessel_arrival' | 'trip_scheduled' | 'trip_completed'
const NOTIF_EVENTS: Array<{ key: NotifKey; label: string; desc: string }> = [
  { key: 'vessel_arrival',  label: 'Vessel arrival',  desc: 'When a vessel you are tracking berths at the terminal.' },
  { key: 'trip_scheduled',  label: 'Trip scheduled',  desc: 'When a new trip is created against one of your vessels.' },
  { key: 'trip_completed',  label: 'Trip completed',  desc: 'When a trip reaches its final stage.' },
]

const INTEGRATIONS = [
  { name: 'Vessel Tracking API',   description: 'Connect to real-time vessel tracking services' },
  { name: 'Port Authority System', description: 'Sync with port management systems' },
  { name: 'Weather API',           description: 'Get weather forecasts for trip planning' },
]

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

  const saveGeneral = async (e: React.FormEvent) => {
    e.preventDefault()
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

  const saveNotifications = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const result = await updatePlannerSettings({ email_notifications: emailNotif, system_notifications: systemNotif })
      if (!result) { toast('Could not save settings', 'error'); return }
      setSettings(result); setDirty(false)
      toast('Notification settings saved', 'success')
    } finally { setSaving(false) }
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[0, 1].map(i => <div key={i} style={{ height: 160, borderRadius: 'var(--r-lg)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 84 }}>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

      <div style={{ display: 'flex', gap: 6, marginBottom: 6, background: '#F0F0EF', padding: 4, borderRadius: 'var(--r-full)', width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => requestTabChange(t.key)}
            style={{ padding: '8px 20px', borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', background: tab === t.key ? '#fff' : 'transparent', color: tab === t.key ? '#1C1917' : 'var(--text-secondary)', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.10)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <form onSubmit={saveGeneral}>
          <TabHead title="General Settings" desc="Manage your planner general preferences" />

          <div style={CARD}>
            <SectionHead title="Default View" desc="Where the Planner module opens when you sign in." />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
              <Field label="Default Landing Page" hint="Where /planner takes you after you sign in.">
                <CustomSelect
                  neutral
                  value={defaultLandingPage}
                  onChange={v => { setDefaultLandingPage(v); setDirty(true) }}
                  options={[
                    { value: 'dashboard', label: 'Dashboard' },
                    { value: 'vessels',   label: 'Vessels' },
                    { value: 'trips',     label: 'Trips' },
                    { value: 'reports',   label: 'Reports' },
                  ]}
                />
              </Field>
            </div>
          </div>

          <div style={CARD}>
            <SectionHead title="Display Settings" desc="How lists are paginated and filtered by default." />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
              <Field label="Items Per Page" hint="Between 5 and 100.">
                <FocusInput type="number" min={5} max={100} value={itemsPerPage}
                  onChange={e => { setItemsPerPage(e.target.value); setDirty(true) }} />
              </Field>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
              <tbody>
                <tr style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <td style={{ padding: '14px 0', paddingRight: 24, verticalAlign: 'middle' }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: 0 }}>Show completed items by default</p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0', lineHeight: 1.4 }}>
                      When off, completed trips are hidden until you filter for them.
                    </p>
                  </td>
                  <td style={{ padding: '14px 0', verticalAlign: 'middle', width: 1, paddingLeft: 24 }}>
                    <Switch on={showCompletedDefault} onToggle={() => { setShowCompletedDefault(v => !v); setDirty(true) }} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <SaveBtn loading={saving} dirty={dirty} />
        </form>
      )}

      {tab === 'notifications' && (
        <form onSubmit={saveNotifications}>
          <TabHead title="Notification Settings" desc="Customize when and how you receive notifications" />

          <TogglePanel
            title="Email Notifications"
            desc="Sent to the address on your account."
            items={NOTIF_EVENTS}
            values={emailNotif}
            onToggle={key => { setEmailNotif(prev => ({ ...prev, [key]: !prev[key] })); setDirty(true) }}
          />

          <TogglePanel
            title="System Notifications"
            desc="Shown in the notification bell inside Glido."
            items={NOTIF_EVENTS}
            values={systemNotif}
            onToggle={key => { setSystemNotif(prev => ({ ...prev, [key]: !prev[key] })); setDirty(true) }}
          />

          <SaveBtn loading={saving} dirty={dirty} />
        </form>
      )}

      {tab === 'integrations' && (
        <div>
          <TabHead title="Integrations" desc="Connect with external systems and APIs" />

          {INTEGRATIONS.map(intg => (
            <div key={intg.name} style={{ ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: 0 }}>{intg.name}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0', lineHeight: 1.4 }}>{intg.description}</p>
              </div>
              <button type="button" onClick={() => setConfigureIntegration(intg.name)}
                style={{ padding: '9px 18px', fontSize: 14, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                Configure
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Unsaved-changes confirm */}
      {pendingTab && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }}>
          <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: 24, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.20)' }}>
            <SectionHead title="Discard unsaved changes?" desc="You have unsaved changes on this tab. Switching tabs will discard them." />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" onClick={() => setPendingTab(null)}
                style={{ padding: '9px 18px', fontSize: 14, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Stay
              </button>
              <button type="button" onClick={discardAndSwitch}
                style={{ padding: '9px 18px', fontSize: 14, fontWeight: 600, color: '#fff', background: '#DC2626', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
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
            <SectionHead title={configureIntegration}
              desc={`This integration is not yet connected. Contact your system administrator to set up API credentials for ${configureIntegration}.`} />
            <button type="button" onClick={() => setConfigureIntegration(null)}
              style={{ width: '100%', padding: '10px 18px', marginTop: 6, fontSize: 14, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
