import React, { useState, useEffect } from 'react'
import { getTenantFull as getTenant, updateTenant } from '@/lib/db/tenants'
import { toast } from '@/lib/toast'
import { CFS_ADMIN_SECTIONS, normalizeAccess, type CfsAdminAccess } from '@/lib/useCfsAdminSections'

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

const CARD: React.CSSProperties  = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)', marginBottom: 12 }

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 10px' }}>
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

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      style={{
        width: 48, height: 27, borderRadius: 'var(--r-full)', flexShrink: 0, border: 'none', cursor: 'pointer',
        position: 'relative', padding: 0,
        background: on
          ? 'linear-gradient(180deg, color-mix(in srgb, var(--brand-color) 82%, #000000) 0%, var(--brand-color) 55%, color-mix(in srgb, var(--brand-color) 88%, #ffffff) 100%)'
          : 'linear-gradient(180deg, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.10) 100%)',
        boxShadow: on
          ? 'inset 0 1px 2px rgba(0,0,0,0.25), inset 0 -1px 1px rgba(255,255,255,0.25), 0 0 0 3px rgba(var(--brand-rgb),0.15)'
          : 'inset 0 1px 2px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.35)',
        transition: 'background 0.22s ease, box-shadow 0.22s ease',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 23 : 2, width: 23, height: 23,
        borderRadius: 'var(--r-full)',
        background: 'linear-gradient(165deg, #ffffff 0%, #f2f1f0 55%, #e4e2e0 100%)',
        transition: 'left 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: '0 1px 1px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.22), inset 0 1px 1px rgba(255,255,255,0.90), inset 0 -1px 1px rgba(0,0,0,0.06)',
      }} />
    </button>
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
      <button type="submit" disabled={!dirty || saving}
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

export default function AdminAccessPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [access, setAccess]   = useState<CfsAdminAccess>(() => normalizeAccess(undefined))

  useEffect(() => {
    getTenant(DEFAULT_TENANT_ID)
      .then(t => setAccess(normalizeAccess((t?.working_hours as any)?.cfs_admin_sections)))
      .catch(() => { /* keep defaults */ })
      .finally(() => setLoading(false))
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      // Merge into working_hours so we don't clobber other blobs (pricing, exceptions, etc.)
      const tenant = await getTenant(DEFAULT_TENANT_ID)
      const existingWh = (tenant?.working_hours as any) ?? {}
      await updateTenant(DEFAULT_TENANT_ID, {
        working_hours: { ...existingWh, cfs_admin_sections: access },
      })
      toast('Access settings saved', 'success')
      setDirty(false)
    } catch (err: any) {
      toast(err?.message ?? 'Failed to save access settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 84 }}>
      <form onSubmit={save}>
        <GroupLabel>CFS Admin Access</GroupLabel>
        <div style={CARD}>
          <SectionHead title="Section Access" desc="Choose which settings sections CFS Admins can see and control. Disabled sections are hidden from them entirely — you still manage them here." />
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {CFS_ADMIN_SECTIONS.map(s => <div key={s.key} style={{ height: 56, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.06)' }} />)}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {CFS_ADMIN_SECTIONS.map((s, i) => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 2px', borderTop: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.05)' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: 0 }}>{s.label}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>{s.hint}</p>
                  </div>
                  <Toggle on={access[s.key]} onClick={() => { setAccess(a => ({ ...a, [s.key]: !a[s.key] })); setDirty(true) }} />
                </div>
              ))}
            </div>
          )}
        </div>
        <StickySaveFooter dirty={dirty} saving={saving} />
      </form>
    </div>
  )
}
