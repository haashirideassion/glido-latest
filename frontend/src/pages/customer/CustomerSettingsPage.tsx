import React, { useState, useEffect } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { fetcher, patchFetcher, postFetcher } from '@/lib/fetcher'
import { toast } from '@/lib/toast'
import { CustomSelect } from '@/components/ui/CustomSelect'

// ─── Shared settings chrome ───────────────────────────────────────────────────
// These tokens and primitives are copied verbatim from reception/SettingsPage so the two
// Settings surfaces read as one system. Worth extracting into a shared module the next time
// either page is touched — see the note at the foot of this file.

const LABEL: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 8 }
const INPUT: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: 15, color: '#1C1917', background: '#FFFFFF', border: '1px solid #E2E0DD', borderRadius: 'var(--r-sm)', outline: 'none', transition: 'border-color 0.15s ease, box-shadow 0.15s ease', boxSizing: 'border-box' }
const CARD: React.CSSProperties  = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)', marginBottom: 12 }
const SAVE: React.CSSProperties  = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px', background: 'var(--brand-color)', color: 'var(--brand-text)', border: 'none', borderRadius: 'var(--r-full)', fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22),0 4px 14px rgba(var(--brand-rgb),0.40)', marginTop: 20, transition: 'box-shadow 0.15s ease' }

function GroupLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  const anchorId = typeof children === 'string' ? 'sec-' + children.replace(/\s+/g, '-') : undefined
  return (
    <div id={anchorId} style={{ display: 'flex', alignItems: 'center', gap: 12, margin: `${first ? 4 : 18}px 0 10px`, scrollMarginTop: 16 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.07)' }} />
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

function SaveBtn({ loading, dirty, label = 'Save changes', busyLabel = 'Saving…' }: {
  loading?: boolean; dirty?: boolean; label?: string; busyLabel?: string
}) {
  const disabled = loading || !dirty
  return (
    <button type="submit" disabled={disabled} style={{ ...SAVE, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {loading ? busyLabel : label}
    </button>
  )
}

function FieldSkeleton({ count }: { count: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

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

  const dirty     = name !== originalName || email !== originalEmail
  const tabDirty  = defaultTab !== originalDefaultTab
  const pwDirty   = currentPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0

  const saveAccount = async (e: React.FormEvent) => {
    e.preventDefault()
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

  const saveDefaultTab = async (e: React.FormEvent) => {
    e.preventDefault()
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

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 84 }}>

      {/* ── Account ───────────────────────────────────────────────────────── */}
      <form onSubmit={saveAccount}>
        <GroupLabel first>Account</GroupLabel>
        <div style={CARD}>
          <SectionHead title="Profile" desc="Your name and the email address you sign in with." />
          {loading ? <FieldSkeleton count={2} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Name">
                <FocusInput type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
              </Field>
              <Field label="Email">
                <FocusInput type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
              </Field>
            </div>
          )}
          <SaveBtn loading={saving} dirty={dirty} />
        </div>
      </form>

      {/* ── Preferences ───────────────────────────────────────────────────── */}
      <form onSubmit={saveDefaultTab}>
        <GroupLabel>Preferences</GroupLabel>
        <div style={CARD}>
          <SectionHead title="My Requests" desc="Controls which tab the My Requests page opens on." />
          {loading ? <FieldSkeleton count={1} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Default Requests Tab" hint="Applies to you only — other users keep their own preference.">
                <CustomSelect
                  neutral
                  value={defaultTab}
                  onChange={v => setDefaultTab(v === 'export' ? 'export' : 'import')}
                  options={[
                    { value: 'import', label: 'Import' },
                    { value: 'export', label: 'Export' },
                  ]}
                />
              </Field>
            </div>
          )}
          <SaveBtn loading={savingTab} dirty={tabDirty} />
        </div>
      </form>

      {/* ── Security ──────────────────────────────────────────────────────── */}
      <form onSubmit={changePassword}>
        <GroupLabel>Security</GroupLabel>
        <div style={CARD}>
          <SectionHead title="Change Password" desc="Use at least 8 characters. You'll stay signed in on this device." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Current Password">
                <FocusInput type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              </Field>
            </div>
            <Field label="New Password">
              <FocusInput type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </Field>
            <Field label="Confirm New Password">
              <FocusInput type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            </Field>
          </div>
          <SaveBtn loading={changingPassword} dirty={pwDirty} label="Update password" busyLabel="Updating…" />
        </div>
      </form>

    </div>
  )
}
