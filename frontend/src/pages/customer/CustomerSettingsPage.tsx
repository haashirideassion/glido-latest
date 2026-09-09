import { useState, useEffect } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { fetcher, patchFetcher, postFetcher } from '@/lib/fetcher'
import { toast } from '@/lib/toast'

const CARD: React.CSSProperties = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 20px rgba(0,0,0,0.04)', marginBottom: 16 }
const INPUT: React.CSSProperties = { width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }

export default function CustomerSettingsPage() {
  usePageTitle('Glido | Customer Portal Settings')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [originalEmail, setOriginalEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // FR 2.2 — which tab (Import/Export) My Requests lands on by default for this customer.
  const [defaultTab, setDefaultTab] = useState<'import' | 'export'>('import')
  const [originalDefaultTab, setOriginalDefaultTab] = useState<'import' | 'export'>('import')
  const [savingTab, setSavingTab] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    fetcher('/api/auth/me').then(res => {
      if (res?.data) {
        setName(res.data.name ?? ''); setEmail(res.data.email ?? '')
        setOriginalName(res.data.name ?? ''); setOriginalEmail(res.data.email ?? '')
        const tabPref = res.data.default_requests_tab === 'export' ? 'export' : 'import'
        setDefaultTab(tabPref); setOriginalDefaultTab(tabPref)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const dirty = name !== originalName || email !== originalEmail
  const tabDirty = defaultTab !== originalDefaultTab

  const saveDefaultTab = async () => {
    setSavingTab(true)
    try {
      const res = await patchFetcher('/api/auth/me', { default_requests_tab: defaultTab })
      if (!res?.data) { toast('Could not save preference', 'error'); return }
      setOriginalDefaultTab(res.data.default_requests_tab === 'export' ? 'export' : 'import')
      toast('Preference saved', 'success')
    } catch (err: any) {
      toast(err?.message ?? 'Could not save preference', 'error')
    } finally { setSavingTab(false) }
  }

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
    <div style={{ maxWidth: 720 }}>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

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
        <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 2 }}>Preferences</p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>Choose which tab My Requests opens on by default</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>Default Requests Tab</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['import', 'export'] as const).map(opt => {
              const active = defaultTab === opt
              return (
                <button key={opt} type="button" onClick={() => setDefaultTab(opt)}
                  style={{ padding: '6px 16px', fontSize: 13.5, fontWeight: 600, borderRadius: 'var(--r-full)', textTransform: 'capitalize', border: `1.5px solid ${active ? 'var(--brand-color)' : 'rgba(0,0,0,0.12)'}`, background: active ? 'var(--brand-color)' : '#fff', color: active ? 'var(--brand-text)' : '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="button" onClick={() => setDefaultTab(originalDefaultTab)} disabled={!tabDirty || savingTab}
            style={{ padding: '9px 18px', fontSize: 14, fontWeight: 600, color: tabDirty ? '#374151' : 'var(--text-tertiary)', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: tabDirty ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={saveDefaultTab} disabled={!tabDirty || savingTab}
            style={{ padding: '9px 18px', fontSize: 14, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: (tabDirty && !savingTab) ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: (tabDirty && !savingTab) ? 1 : 0.6 }}>
            {savingTab ? 'Saving…' : 'Save Preference'}
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
    </div>
  )
}
