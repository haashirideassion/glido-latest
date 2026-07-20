import React, { useState, useEffect } from 'react'
import { getTenantFull as getTenant, updateTenant } from '@/lib/db/tenants'
import { toast } from '@/lib/toast'

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

const LABEL: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 8 }
const INPUT: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: 15, color: '#1C1917', background: '#FFFFFF', border: '1px solid #E2E0DD', borderRadius: 'var(--r-sm)', outline: 'none', transition: 'border-color 0.15s ease, box-shadow 0.15s ease', boxSizing: 'border-box' }
const CARD: React.CSSProperties  = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)', marginBottom: 12 }

function GroupLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: `${first ? 4 : 18}px 0 10px` }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.07)' }} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={LABEL}>{label}</label>
      {children}
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

function SectionHead({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.02em', marginBottom: desc ? 4 : 0 }}>{title}</h3>
      {desc && <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{desc}</p>}
    </div>
  )
}

function StickySaveFooter({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
      padding: '14px 32px',
      background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
      borderTop: '1px solid rgba(0,0,0,0.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16,
    }}>
      {dirty && (
        <p style={{ fontSize: 14, color: 'var(--brand-color)', fontWeight: 600 }}>You have unsaved changes</p>
      )}
      <button
        type="submit"
        disabled={!dirty || saving}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 24px', borderRadius: 'var(--r-full)', border: 'none',
          fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: (!dirty || saving) ? 'not-allowed' : 'pointer',
          background: dirty ? 'var(--brand-color, #FC6514)' : 'rgba(0,0,0,0.08)',
          color: dirty ? '#fff' : 'var(--text-tertiary)',
          opacity: saving ? 0.6 : 1,
          transition: 'all 0.2s',
        }}
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}

function Skeleton({ count }: { count: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      {Array.from({ length: count }, (_, i) => <div key={i} style={{ height: 44, borderRadius: 'var(--r-sm)', background: 'rgba(0,0,0,0.06)' }} />)}
    </div>
  )
}

interface Cargowise { apiUrl: string; apiKey: string; tenantCode: string; refreshInterval: string }
interface Smtp { host: string; port: string; username: string; password: string; fromAddress: string; fromName: string }

export default function AdminIntegrationsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [showCwApiKey, setShowCwApiKey]     = useState(false)
  const [showSmtpPassword, setShowSmtpPassword] = useState(false)
  const [cargowise, setCargowise] = useState<Cargowise>({ apiUrl: '', apiKey: '', tenantCode: '', refreshInterval: '30' })
  const [smtp, setSmtp]           = useState<Smtp>({ host: '', port: '587', username: '', password: '', fromAddress: '', fromName: '' })

  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID)
      .then(tenant => {
        if (!tenant) return
        setCargowise({
          apiUrl:          tenant.cargowise_api_url          ?? '',
          apiKey:          tenant.cargowise_api_key          ?? '',
          tenantCode:      tenant.cargowise_tenant_code      ?? '',
          refreshInterval: String(tenant.cargowise_refresh_interval ?? 30),
        })
        setSmtp({
          host:        tenant.smtp_host         ?? '',
          port:        String(tenant.smtp_port ?? 587),
          username:    tenant.smtp_username     ?? '',
          password:    tenant.smtp_password     ?? '',
          fromAddress: tenant.smtp_from_address ?? '',
          fromName:    tenant.smtp_from_name    ?? '',
        })
      })
      .catch(() => { /* use defaults */ })
      .finally(() => setLoading(false))
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateTenant(DEFAULT_TENANT_ID, {
        cargowise_api_url:          cargowise.apiUrl || null,
        cargowise_api_key:          cargowise.apiKey || null,
        cargowise_tenant_code:      cargowise.tenantCode || null,
        cargowise_refresh_interval: Number(cargowise.refreshInterval) || 30,
        smtp_host:         smtp.host || null,
        smtp_port:         Number(smtp.port) || 587,
        smtp_username:     smtp.username || null,
        smtp_password:     smtp.password || null,
        smtp_from_address: smtp.fromAddress || null,
        smtp_from_name:    smtp.fromName || null,
      })
      toast('Integration settings saved', 'success')
      setDirty(false)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save integration settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 84 }}>
      <form onSubmit={save}>
        <GroupLabel first>Connected Systems</GroupLabel>

        {/* CargoWise / ICS API */}
        <div style={CARD}>
          <SectionHead title="ICS API" desc="Enables automatic customs clearance status checks." />
          {loading ? <Skeleton count={4} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="API Endpoint">
                <FocusInput type="url" value={cargowise.apiUrl} placeholder="https://cw1.cargowise.com/api/…"
                  onChange={e => { setCargowise(v => ({ ...v, apiUrl: e.target.value })); setDirty(true) }} />
              </Field>
              <Field label="API Key">
                <div style={{ position: 'relative' }}>
                  <FocusInput
                    type={showCwApiKey ? 'text' : 'password'}
                    value={cargowise.apiKey}
                    placeholder="Your CargoWise API key"
                    onChange={e => { setCargowise(v => ({ ...v, apiKey: e.target.value })); setDirty(true) }}
                    style={{ paddingRight: 44 }}
                  />
                  <button type="button" onClick={() => setShowCwApiKey(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, fontFamily: 'inherit' }}>
                    {showCwApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </Field>
              <Field label="Tenant Code">
                <FocusInput type="text" value={cargowise.tenantCode} placeholder="SYDCFS"
                  onChange={e => { setCargowise(v => ({ ...v, tenantCode: e.target.value })); setDirty(true) }} />
              </Field>
              <Field label="Refresh Interval (min)">
                <FocusInput type="number" value={cargowise.refreshInterval} min="5" max="1440"
                  onChange={e => { setCargowise(v => ({ ...v, refreshInterval: e.target.value })); setDirty(true) }} />
              </Field>
            </div>
          )}
        </div>

        {/* SMTP */}
        <div style={CARD}>
          <SectionHead title="Email (SMTP)" desc="Used for booking confirmations and notifications." />
          {loading ? <Skeleton count={6} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="SMTP Host">
                <FocusInput type="text" value={smtp.host} placeholder="smtp.mailgun.org"
                  onChange={e => { setSmtp(v => ({ ...v, host: e.target.value })); setDirty(true) }} />
              </Field>
              <Field label="SMTP Port">
                <FocusInput type="number" value={smtp.port} min="1" max="65535"
                  onChange={e => { setSmtp(v => ({ ...v, port: e.target.value })); setDirty(true) }} />
              </Field>
              <Field label="Username">
                <FocusInput type="text" value={smtp.username} placeholder="postmaster@mg.cfs.com.au"
                  onChange={e => { setSmtp(v => ({ ...v, username: e.target.value })); setDirty(true) }} />
              </Field>
              <Field label="Password">
                <div style={{ position: 'relative' }}>
                  <FocusInput
                    type={showSmtpPassword ? 'text' : 'password'}
                    value={smtp.password}
                    placeholder="•••••••••"
                    onChange={e => { setSmtp(v => ({ ...v, password: e.target.value })); setDirty(true) }}
                    style={{ paddingRight: 44 }}
                  />
                  <button type="button" onClick={() => setShowSmtpPassword(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, fontFamily: 'inherit' }}>
                    {showSmtpPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </Field>
              <Field label="From Address">
                <FocusInput type="email" value={smtp.fromAddress} placeholder="bookings@cfs.com.au"
                  onChange={e => { setSmtp(v => ({ ...v, fromAddress: e.target.value })); setDirty(true) }} />
              </Field>
              <Field label="From Name">
                <FocusInput type="text" value={smtp.fromName} placeholder="Sydney CFS"
                  onChange={e => { setSmtp(v => ({ ...v, fromName: e.target.value })); setDirty(true) }} />
              </Field>
            </div>
          )}
        </div>

        <StickySaveFooter dirty={dirty} saving={saving} />
      </form>
    </div>
  )
}
