import { useState, useEffect } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { fetcher, patchFetcher, postFetcher } from '@/lib/fetcher'
import { getAllocatorSettings, updateAllocatorSettings } from '@/lib/db/allocator-settings'
import { getTruckCustomField, setTruckCustomField } from '@/lib/db/truck-custom-field'
import { getTripCustomField, setTripCustomField } from '@/lib/db/trip-custom-field'
import { getMaintenanceCustomField, setMaintenanceCustomField } from '@/lib/db/maintenance-custom-field'
import type { CustomFieldConfig, CustomFieldType } from '@/lib/db/truck-custom-field'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { toast } from '@/lib/toast'
import type { AllocatorSettings } from '@/data/types'

const CARD: React.CSSProperties = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)', marginBottom: 16 }
const INPUT: React.CSSProperties = { width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }

type Tab = 'general' | 'notifications' | 'account'
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'general', label: 'General' }, { key: 'notifications', label: 'Notifications' }, { key: 'account', label: 'Account' },
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

export default function AllocatorSettingsPage() {
  usePageTitle('Glido | Allocator Settings')
  const [tab, setTab] = useState<Tab>('general')
  const [pendingTab, setPendingTab] = useState<Tab | null>(null)
  const [settings, setSettings] = useState<AllocatorSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // General
  const [defaultView, setDefaultView] = useState('dashboard')
  const [automatedAllocation, setAutomatedAllocation] = useState(false)
  const [opStart, setOpStart] = useState('06:00')
  const [opEnd, setOpEnd] = useState('18:00')

  // Notifications
  const [newTripNotif, setNewTripNotif] = useState(true)
  const [conflictAlerts, setConflictAlerts] = useState(true)
  const [maintenanceReminders, setMaintenanceReminders] = useState(true)
  const [emailNotif, setEmailNotif] = useState(false)

  // Custom fields (tenant-wide, not per-user) — Truck / Trip / Maintenance each get one.
  const [truckField, setTruckField] = useState<CustomFieldConfig>({ label: null, type: 'text' })
  const [tripField, setTripField] = useState<CustomFieldConfig>({ label: null, type: 'text' })
  const [maintField, setMaintField] = useState<CustomFieldConfig>({ label: null, type: 'text' })
  useEffect(() => {
    getTruckCustomField().then(setTruckField).catch(() => {})
    getTripCustomField().then(setTripField).catch(() => {})
    getMaintenanceCustomField().then(setMaintField).catch(() => {})
  }, [])

  const saveTruckField = async (label: string, type: CustomFieldType) => {
    const result = await setTruckCustomField(label, type)
    setTruckField(result)
    toast(label ? 'Truck custom field saved' : 'Truck custom field removed', 'success')
  }
  const saveTripField = async (label: string, type: CustomFieldType) => {
    const result = await setTripCustomField(label, type)
    setTripField(result)
    toast(label ? 'Trip custom field saved' : 'Trip custom field removed', 'success')
  }
  const saveMaintField = async (label: string, type: CustomFieldType) => {
    const result = await setMaintenanceCustomField(label, type)
    setMaintField(result)
    toast(label ? 'Maintenance custom field saved' : 'Maintenance custom field removed', 'success')
  }

  useEffect(() => {
    getAllocatorSettings().then(s => {
      if (!s) return
      setSettings(s)
      setDefaultView(s.defaultView)
      setAutomatedAllocation(s.automatedAllocation)
      setOpStart(s.operationStartTime.slice(0, 5))
      setOpEnd(s.operationEndTime.slice(0, 5))
      setNewTripNotif(s.newTripNotifications)
      setConflictAlerts(s.resourceConflictAlerts)
      setMaintenanceReminders(s.maintenanceReminders)
      setEmailNotif(s.emailNotifications)
      setIsLoading(false)
    }).catch(() => setIsLoading(false))
  }, [])

  // Account tab tracks its own dirty state (name/email diff) — mirrored up here so the shared
  // tab-switch confirmation also guards against unsaved Account edits, not just General/Notifications.
  const [accountDirty, setAccountDirty] = useState(false)
  const [accountResetToken, setAccountResetToken] = useState(0)

  const requestTabChange = (next: Tab) => {
    if (dirty || accountDirty) { setPendingTab(next); return }
    setTab(next)
  }
  const discardAndSwitch = () => {
    if (settings) {
      setDefaultView(settings.defaultView)
      setAutomatedAllocation(settings.automatedAllocation)
      setOpStart(settings.operationStartTime.slice(0, 5))
      setOpEnd(settings.operationEndTime.slice(0, 5))
      setNewTripNotif(settings.newTripNotifications)
      setConflictAlerts(settings.resourceConflictAlerts)
      setMaintenanceReminders(settings.maintenanceReminders)
      setEmailNotif(settings.emailNotifications)
    }
    setDirty(false)
    setAccountResetToken(t => t + 1)
    if (pendingTab) { setTab(pendingTab); setPendingTab(null) }
  }

  const saveGeneral = async () => {
    if (opEnd <= opStart) { toast('End time must be later than start time', 'error'); return }
    setSaving(true)
    try {
      const result = await updateAllocatorSettings({
        default_view: defaultView, automated_allocation: automatedAllocation,
        operation_start_time: opStart, operation_end_time: opEnd,
      })
      if (!result) { toast('Could not save settings', 'error'); return }
      setSettings(result); setDirty(false)
      toast('Settings saved', 'success')
    } finally { setSaving(false) }
  }

  const saveNotifications = async () => {
    setSaving(true)
    try {
      const result = await updateAllocatorSettings({
        new_trip_notifications: newTripNotif, resource_conflict_alerts: conflictAlerts,
        maintenance_reminders: maintenanceReminders, email_notifications: emailNotif,
      })
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
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 18 }}>Manage your allocator general preferences</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ ...CARD, marginBottom: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 6 }}>Default View</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Choose the default view when you open the allocator dashboard</p>
              <select value={defaultView} onChange={e => { setDefaultView(e.target.value); setDirty(true) }} style={INPUT}>
                <option value="dashboard">Dashboard</option>
                <option value="resources">Resources</option>
                <option value="trips">Trips</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>

            <div style={{ ...CARD, marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 3 }}>Automated Allocation</p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Allow the system to auto-allocate resources based on availability</p>
                </div>
                <Toggle on={automatedAllocation} onToggle={() => { setAutomatedAllocation(v => !v); setDirty(true) }} />
              </div>
            </div>

            <div style={{ ...CARD, marginBottom: 0, gridColumn: '1 / -1' }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 3 }}>Operation Hours</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>Define the standard operation hours for resource allocation</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(160px, 260px))', gap: 10 }}>
                <div>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Start Time</p>
                  <input type="time" value={opStart} onChange={e => { setOpStart(e.target.value); setDirty(true) }} style={INPUT} />
                </div>
                <div>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>End Time</p>
                  <input type="time" value={opEnd} onChange={e => { setOpEnd(e.target.value); setDirty(true) }} style={INPUT} />
                </div>
              </div>
            </div>
          </div>

          <button type="button" onClick={saveGeneral} disabled={saving}
            style={{ padding: '10px 22px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>

          <CustomFieldCard
            title="Truck Custom Field" description="Add one extra field to show on every truck in Resources Management."
            standardFields={['Resource ID', 'Status', 'Type', 'Capacity', 'Location', 'Last Service Date']}
            config={truckField} onSave={saveTruckField}
          />
          <CustomFieldCard
            title="Trip Custom Field" description="Add one extra field to show on every trip in Trip Allocation."
            standardFields={['Trip Reference', 'Priority', 'Allocation Status', 'Date', 'Time Window', 'Origin', 'Destination', 'Time to Reach', 'Time to Complete', 'Weight', 'Hazardous', 'OOG']}
            config={tripField} onSave={saveTripField}
          />
          <CustomFieldCard
            title="Maintenance Custom Field" description="Add one extra field to show on every maintenance record."
            standardFields={['Maintenance ID', 'Status', 'Resource & Activity', 'Start Date', 'Estimated Completion', 'Technician', 'Progress', 'Remarks']}
            config={maintField} onSave={saveMaintField}
          />
        </>
      )}

      {tab === 'notifications' && (
        <>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 2 }}>Notification Preferences</p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 18 }}>Choose which notifications you'd like to receive</p>

          <div style={CARD}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <NotifRow label="New Trip Notifications" description="Receive notifications when new trips are available for allocation" on={newTripNotif} onToggle={() => { setNewTripNotif(v => !v); setDirty(true) }} />
              <NotifRow label="Resource Conflict Alerts" description="Get alerted when there are scheduling conflicts with resources" on={conflictAlerts} onToggle={() => { setConflictAlerts(v => !v); setDirty(true) }} />
              <NotifRow label="Maintenance Reminders" description="Receive notifications for upcoming and overdue maintenance" on={maintenanceReminders} onToggle={() => { setMaintenanceReminders(v => !v); setDirty(true) }} />
              <NotifRow label="Email Notifications" description="Receive notifications via email in addition to the system" on={emailNotif} onToggle={() => { setEmailNotif(v => !v); setDirty(true) }} />
            </div>
          </div>

          <button type="button" onClick={saveNotifications} disabled={saving}
            style={{ padding: '10px 22px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Notification Settings'}
          </button>
        </>
      )}

      {tab === 'account' && <AccountTab onDirtyChange={setAccountDirty} resetToken={accountResetToken} />}

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
    </div>
  )
}

function NotifRow({ label, description, on, onToggle }: { label: string; description: string; on: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
      <div>
        <p style={{ fontSize: 14.5, fontWeight: 600, color: '#1C1917', marginBottom: 2 }}>{label}</p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{description}</p>
      </div>
      <Toggle on={on} onToggle={onToggle} />
    </div>
  )
}

function CustomFieldCard({ title, description, standardFields, config, onSave }: {
  title: string; description: string; standardFields: string[]; config: CustomFieldConfig
  onSave: (label: string, type: CustomFieldType) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [type, setType] = useState<CustomFieldType>('text')
  const [saving, setSaving] = useState(false)
  const hasActive = !!config.label

  const startAdd = () => { setLabel(''); setType('text'); setAdding(true) }
  const startEdit = () => { setLabel(config.label ?? ''); setType(config.type); setAdding(true) }

  const save = async () => {
    if (!label.trim()) { toast('Field label is required', 'error'); return }
    setSaving(true)
    try { await onSave(label.trim(), type); setAdding(false) }
    catch { toast('Could not save custom field', 'error') }
    finally { setSaving(false) }
  }
  const remove = async () => {
    setSaving(true)
    try { await onSave('', 'text'); setAdding(false) }
    catch { toast('Could not remove custom field', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ ...CARD, marginTop: 16 }}>
      <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 3 }}>{title}</p>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>{description}</p>

      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Standard fields (always shown)</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        {standardFields.map(f => (
          <span key={f} style={{ fontSize: 12.5, fontWeight: 500, padding: '5px 10px', borderRadius: 'var(--r-full)', background: '#F0F0EF', color: 'var(--text-secondary)' }}>{f}</span>
        ))}
      </div>

      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Custom field</p>

      {!adding && hasActive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(var(--brand-rgb),0.05)', border: '1px solid rgba(var(--brand-rgb),0.18)', borderRadius: 'var(--r-sm)' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', flex: 1 }}>{config.label}</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-full)', background: '#fff', color: 'var(--text-secondary)', textTransform: 'capitalize', border: '1px solid rgba(0,0,0,0.08)' }}>{config.type}</span>
          <button type="button" onClick={startEdit}
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 6px' }}>
            Edit
          </button>
          <button type="button" onClick={remove} disabled={saving}
            style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', padding: '4px 6px' }}>
            Remove
          </button>
        </div>
      )}

      {!adding && !hasActive && (
        <button type="button" onClick={startAdd}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 16px', fontSize: 13.5, fontWeight: 600, color: 'var(--brand-color)', background: 'none', border: '1.5px dashed rgba(var(--brand-rgb),0.35)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
          + Add Field
        </button>
      )}

      {adding && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Field Label</p>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Registration Number" style={INPUT} />
          </div>
          <div style={{ width: 150 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Data Type</p>
            <CustomSelect value={type} onChange={v => setType(v as CustomFieldType)}
              options={[{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' }]} />
          </div>
          <button type="button" onClick={() => setAdding(false)} disabled={saving}
            style={{ height: 38, padding: '0 14px', fontSize: 13.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving}
            style={{ height: 38, padding: '0 16px', fontSize: 13.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

function AccountTab({ onDirtyChange, resetToken }: { onDirtyChange: (dirty: boolean) => void; resetToken: number }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [originalEmail, setOriginalEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    fetcher('/api/auth/me').then(res => {
      if (res?.data) {
        setName(res.data.name ?? ''); setEmail(res.data.email ?? '')
        setOriginalName(res.data.name ?? ''); setOriginalEmail(res.data.email ?? '')
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // The parent's tab-switch confirmation discards by bumping resetToken — snap fields back then.
  useEffect(() => { setName(originalName); setEmail(originalEmail) }, [resetToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = name !== originalName || email !== originalEmail
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])

  const saveAccount = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Please enter a valid email address', 'error'); return }
    setSaving(true)
    try {
      const res = await patchFetcher('/api/auth/me', { name: name.trim(), email: email.trim() })
      if (!res?.data) { toast('Could not save account settings', 'error'); return }
      setOriginalName(res.data.name); setOriginalEmail(res.data.email)
      toast('Account settings saved', 'success')
    } catch (err: any) {
      toast(err?.message ?? 'Could not save account settings', 'error')
    } finally { setSaving(false) }
  }

  const cancelAccount = () => { setName(originalName); setEmail(originalEmail) }

  const changePassword = async () => {
    if (!currentPassword) { toast('Please enter your current password', 'error'); return }
    if (newPassword.length < 8) { toast('New password must be at least 8 characters', 'error'); return }
    if (newPassword !== confirmPassword) { toast('New password and confirmation do not match', 'error'); return }
    setChangingPassword(true)
    try {
      await postFetcher('/api/auth/change-password', { currentPassword, newPassword })
      toast('Password updated successfully', 'success')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch {
      toast('Current password is incorrect', 'error')
    } finally { setChangingPassword(false) }
  }

  if (loading) return <div style={{ height: 200, borderRadius: 'var(--r-lg)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />

  return (
    <>
      <p style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 2 }}>Account Settings</p>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 18 }}>Manage your name, email and password</p>

      <div style={CARD}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Name</p>
            <input value={name} onChange={e => setName(e.target.value)} style={INPUT} />
          </div>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Email</p>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={INPUT} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="button" onClick={cancelAccount} disabled={!dirty || saving}
            style={{ padding: '9px 18px', fontSize: 14, fontWeight: 600, color: dirty ? '#374151' : 'var(--text-tertiary)', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: dirty ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={saveAccount} disabled={!dirty || saving}
            style={{ padding: '9px 18px', fontSize: 14, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: (dirty && !saving) ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: (dirty && !saving) ? 1 : 0.6 }}>
            {saving ? 'Saving…' : 'Save Account Settings'}
          </button>
        </div>
      </div>

      <div style={CARD}>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 14 }}>Change Password</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Current Password</p>
            <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={INPUT} />
          </div>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>New Password</p>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={INPUT} />
          </div>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Confirm New Password</p>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={INPUT} />
          </div>
        </div>
        <button type="button" onClick={changePassword} disabled={changingPassword}
          style={{ marginTop: 16, padding: '9px 18px', fontSize: 14, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: changingPassword ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: changingPassword ? 0.6 : 1 }}>
          {changingPassword ? 'Updating…' : 'Update Password'}
        </button>
      </div>
    </>
  )
}
