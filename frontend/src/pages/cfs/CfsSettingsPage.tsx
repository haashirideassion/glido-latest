import React, { useEffect, useState } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { toast } from '@/lib/toast'
import { useCfs } from '@/components/cfs/CfsContext'
import { ErrorBanner, useLive } from '@/components/cfs/ui'
import { cfs, jobNoun, type CfsLocation, type CfsSettings, type CfsTeam, type Direction } from '@/lib/cfs'

// ─── Shared settings chrome ───────────────────────────────────────────────────
// Tokens and primitives copied from Planner / Allocator / Reception settings so every Settings
// surface in the app reads as one system (pill tabs, TabHead, cards, uppercase field labels,
// switch rows, pill Save button).

const LABEL: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 8 }
const INPUT: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: 15, color: '#1C1917', background: '#FFFFFF', border: '1px solid #E2E0DD', borderRadius: 'var(--r-sm)', outline: 'none', transition: 'border-color 0.15s ease, box-shadow 0.15s ease', boxSizing: 'border-box' }
const CARD: React.CSSProperties  = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)', marginBottom: 12 }
const SAVE: React.CSSProperties  = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px', background: 'var(--brand-color)', color: 'var(--brand-text)', border: 'none', borderRadius: 'var(--r-full)', fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22),0 4px 14px rgba(var(--brand-rgb),0.40)', marginTop: 20, transition: 'box-shadow 0.15s ease' }
const GHOST: React.CSSProperties = { padding: '9px 18px', fontSize: 14, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }

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
    <input {...props} style={{ ...INPUT, ...(props.disabled ? { background: '#F7F6F5', color: 'var(--text-secondary)' } : {}), ...props.style as React.CSSProperties }}
      onFocus={e => { e.target.style.borderColor = 'rgba(var(--brand-rgb),0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.12)'; props.onFocus?.(e) }}
      onBlur={e  => { e.target.style.borderColor = 'rgba(0,0,0,0.10)'; e.target.style.boxShadow = 'none'; props.onBlur?.(e) }}
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

function Switch({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <div role="switch" aria-checked={on} onClick={disabled ? undefined : onToggle}
      style={{ width: 42, height: 24, borderRadius: 'var(--r-full)', background: on ? 'var(--brand-color)' : '#D1D5DB', position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.2s' }} />
    </div>
  )
}

/** Label + description on the left, a control on the right — Reception's permission-row layout. */
function Row({ title, desc, first, children }: { title: string; desc: string; first?: boolean; children: React.ReactNode }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        <tr style={{ borderTop: first ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
          <td style={{ padding: '14px 0', paddingRight: 24, verticalAlign: 'middle' }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: 0 }}>{title}</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0', lineHeight: 1.4 }}>{desc}</p>
          </td>
          <td style={{ padding: '14px 0', verticalAlign: 'middle', width: 1, paddingLeft: 24 }}>{children}</td>
        </tr>
      </tbody>
    </table>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 12, fontWeight: 600, color: '#78716C', background: '#F0F0EF', borderRadius: 'var(--r-full)', padding: '3px 10px' }}>{children}</span>
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div role="dialog" aria-label={title} style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: 24, maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.20)' }} onClick={e => e.stopPropagation()}>
        <SectionHead title={title} />
        {children}
      </div>
    </div>
  )
}

type Tab = 'general' | 'notifications' | 'locations' | 'teams'
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'general', label: 'General' }, { key: 'notifications', label: 'Notifications' },
  { key: 'locations', label: 'Locations' }, { key: 'teams', label: 'Teams' },
]

export default function CfsSettingsPage() {
  usePageTitle('Glido | Packing & Unpacking Settings')
  const { isAdmin, direction } = useCfs()   // the header's Unpacking / Packing switch drives this
  const { data, error, loading, refresh } = useLive(() => cfs.settings(), [], 0)

  const [tab, setTab] = useState<Tab>('general')
  const [form, setForm] = useState<CfsSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [locModal, setLocModal] = useState<Partial<CfsLocation> | null>(null)
  const [teamModal, setTeamModal] = useState<Partial<CfsTeam> | null>(null)

  useEffect(() => { if (data) setForm({ ...data[direction] }) }, [data, direction])

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
        {[0, 1].map(i => <div key={i} style={{ height: 160, borderRadius: 'var(--r-lg)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
      </div>
    )
  }
  if (error || !data || !form) return <ErrorBanner message={error ?? 'Could not load settings'} onRetry={() => refresh()} />

  const teams = data.teams.filter(t => t.active && (t.direction === 'both' || t.direction === direction))
  const readOnly = !isAdmin
  const dirty = JSON.stringify(form) !== JSON.stringify(data[direction])
  const noun = jobNoun(direction)
  const set = <K extends keyof CfsSettings>(k: K, v: CfsSettings[K]) => setForm(f => (f ? { ...f, [k]: v } : f))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (readOnly) return
    setSaving(true)
    try {
      await cfs.saveSettings(direction, {
        default_team_id: form.default_team_id || null,
        notification_emails: form.notification_emails, report_emails: form.report_emails,
        require_resolution: form.require_resolution,
        min_match_pct: Number(form.min_match_pct), numeric_tolerance_pct: Number(form.numeric_tolerance_pct),
      })
      toast(`${noun} settings saved`, 'success'); await refresh(true)
    } catch (err: any) { toast(err?.message || 'Could not save settings', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 84 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, background: '#F0F0EF', padding: 4, borderRadius: 'var(--r-full)', width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            style={{ padding: '8px 20px', borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', background: tab === t.key ? '#fff' : 'transparent', color: tab === t.key ? '#1C1917' : 'var(--text-secondary)', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.10)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {readOnly && (
        <p style={{ fontSize: 14, color: '#B45309', margin: '10px 0 0' }}>You can view these settings. Only a reception admin can change them.</p>
      )}

      {tab === 'general' && (
        <form onSubmit={save}>
          <TabHead title="General Settings" desc={`Defaults for ${noun.toLowerCase()} jobs. Use the switch at the top right to edit the other job type.`} />

          <div style={CARD}>
            <SectionHead title="Planning" desc="Pre-selected when a job is planned." />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <Field label="Default Team" hint="Used when planning a job, until someone picks another team.">
                <CustomSelect neutral value={form.default_team_id ?? ''} onChange={v => { if (!readOnly) set('default_team_id', v || null) }}
                  placeholder="None" options={teams.map(t => ({ value: t.id, label: t.name }))} />
              </Field>
            </div>
          </div>

          {direction === 'import' && (
            <div style={CARD}>
              <SectionHead title="Manifest Validation" desc="How strictly the manifest has to agree with ICS before it can be confirmed." />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <Field label="Minimum Match (%)" hint="The manifest can't be confirmed below this overall match.">
                  <FocusInput type="number" min={0} max={100} step="0.1" value={form.min_match_pct} disabled={readOnly}
                    onChange={e => set('min_match_pct', e.target.value as unknown as number)} />
                </Field>
                <Field label="Numeric Tolerance (%)" hint="Weights and volumes within this % count as a near match (e.g. 8.9 vs 8.88 cbm).">
                  <FocusInput type="number" min={0} max={20} step="0.1" value={form.numeric_tolerance_pct} disabled={readOnly}
                    onChange={e => set('numeric_tolerance_pct', e.target.value as unknown as number)} />
                </Field>
              </div>
              <div style={{ marginTop: 6 }}>
                <Row first title="Require all mismatches resolved" desc="Block Confirm Manifest while any field still disagrees between the manifest and ICS.">
                  <Switch on={form.require_resolution} disabled={readOnly} onToggle={() => set('require_resolution', !form.require_resolution)} />
                </Row>
              </div>
            </div>
          )}

          {!readOnly && <SaveBtn loading={saving} dirty={dirty} />}
        </form>
      )}

      {tab === 'notifications' && (
        <form onSubmit={save}>
          <TabHead title="Notification Settings" desc={`Who is emailed about ${noun.toLowerCase()} jobs`} />

          <div style={CARD}>
            <SectionHead title="Email Recipients" desc="Separate several addresses with commas." />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
              <Field label="Notification Emails" hint="Told when a new request or a result arrives.">
                <FocusInput type="text" value={form.notification_emails} disabled={readOnly} placeholder="ops@example.com, planner@example.com"
                  onChange={e => set('notification_emails', e.target.value)} />
              </Field>
              <Field label="Report Emails" hint="Receives completion reports.">
                <FocusInput type="text" value={form.report_emails} disabled={readOnly} placeholder="reports@example.com"
                  onChange={e => set('report_emails', e.target.value)} />
              </Field>
            </div>
          </div>

          {!readOnly && <SaveBtn loading={saving} dirty={dirty} />}
        </form>
      )}

      {tab === 'locations' && (
        <div>
          <TabHead title="Locations" desc="Warehouses and yards jobs can be planned into. Shared by packing and unpacking — capacity is the number of jobs per day across both." />
          {!readOnly && (
            <div style={{ marginBottom: 12 }}>
              <button type="button" style={GHOST} onClick={() => setLocModal({ kind: 'warehouse', capacity_per_day: 4, active: true })}>+ Add location</button>
            </div>
          )}
          {data.locations.length === 0 && <div style={CARD}><p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0 }}>No locations yet.</p></div>}
          {data.locations.map(l => (
            <div key={l.id} style={{ ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, opacity: l.active ? 1 : 0.6 }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: 0 }}>{l.name}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0', lineHeight: 1.4, textTransform: 'capitalize' }}>{l.kind} · {l.capacity_per_day} jobs/day</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {!l.active && <Chip>Inactive</Chip>}
                {!readOnly && <button type="button" style={GHOST} onClick={() => setLocModal(l)}>Edit</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'teams' && (
        <div>
          <TabHead title="Teams" desc="Crews that can be assigned to packing and unpacking jobs." />
          {!readOnly && (
            <div style={{ marginBottom: 12 }}>
              <button type="button" style={GHOST} onClick={() => setTeamModal({ direction: 'both', active: true })}>+ Add team</button>
            </div>
          )}
          {data.teams.length === 0 && <div style={CARD}><p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0 }}>No teams yet.</p></div>}
          {data.teams.map(t => (
            <div key={t.id} style={{ ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, opacity: t.active ? 1 : 0.6 }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: 0 }}>{t.name}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0', lineHeight: 1.4 }}>{t.direction === 'both' ? 'Packing and unpacking' : jobNoun(t.direction)}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {!t.active && <Chip>Inactive</Chip>}
                {!readOnly && <button type="button" style={GHOST} onClick={() => setTeamModal(t)}>Edit</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {locModal && <LocationModal value={locModal} onClose={() => setLocModal(null)} onSaved={async () => { setLocModal(null); await refresh(true) }} />}
      {teamModal && <TeamModal value={teamModal} onClose={() => setTeamModal(null)} onSaved={async () => { setTeamModal(null); await refresh(true) }} />}
    </div>
  )
}

function ModalActions({ onClose, busy, onSave }: { onClose: () => void; busy: boolean; onSave: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
      <button type="button" onClick={onClose} style={GHOST}>Cancel</button>
      <button type="button" onClick={onSave} disabled={busy}
        style={{ padding: '9px 22px', fontSize: 14, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1, fontFamily: 'inherit' }}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

function ActiveRow({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
      <div>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', margin: 0 }}>Active</p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0' }}>Inactive entries can't be chosen for new jobs.</p>
      </div>
      <Switch on={on} onToggle={onToggle} />
    </div>
  )
}

function LocationModal({ value, onClose, onSaved }: { value: Partial<CfsLocation>; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: value.name ?? '', kind: value.kind ?? 'warehouse', capacity_per_day: value.capacity_per_day ?? 4, active: value.active ?? true })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    if (!v.name.trim()) { setErr('Name is required'); return }
    setBusy(true); setErr(null)
    try {
      const body = { ...v, name: v.name.trim(), capacity_per_day: Number(v.capacity_per_day) }
      if (value.id) await cfs.editLocation(value.id, body); else await cfs.addLocation(body)
      toast('Location saved', 'success'); onSaved()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <ModalShell title={value.id ? 'Edit location' : 'Add location'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Name"><FocusInput value={v.name} onChange={e => setV({ ...v, name: e.target.value })} maxLength={100} autoFocus /></Field>
        <Field label="Type">
          <CustomSelect neutral value={v.kind} onChange={k => setV({ ...v, kind: k as 'warehouse' | 'yard' })}
            options={[{ value: 'warehouse', label: 'Warehouse' }, { value: 'yard', label: 'Yard' }]} />
        </Field>
        <Field label="Jobs per day"><FocusInput type="number" min={1} max={100} value={v.capacity_per_day} onChange={e => setV({ ...v, capacity_per_day: e.target.value as unknown as number })} /></Field>
        <ActiveRow on={v.active} onToggle={() => setV({ ...v, active: !v.active })} />
        {err && <p role="alert" style={{ color: '#DC2626', fontSize: 13, margin: 0 }}>{err}</p>}
      </div>
      <ModalActions onClose={onClose} busy={busy} onSave={save} />
    </ModalShell>
  )
}

function TeamModal({ value, onClose, onSaved }: { value: Partial<CfsTeam>; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: value.name ?? '', direction: (value.direction ?? 'both') as Direction | 'both', active: value.active ?? true })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    if (!v.name.trim()) { setErr('Name is required'); return }
    setBusy(true); setErr(null)
    try {
      const body = { ...v, name: v.name.trim() }
      if (value.id) await cfs.editTeam(value.id, body); else await cfs.addTeam(body)
      toast('Team saved', 'success'); onSaved()
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }
  return (
    <ModalShell title={value.id ? 'Edit team' : 'Add team'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Name"><FocusInput value={v.name} onChange={e => setV({ ...v, name: e.target.value })} maxLength={100} autoFocus /></Field>
        <Field label="Works on">
          <CustomSelect neutral value={v.direction} onChange={d => setV({ ...v, direction: d as Direction | 'both' })}
            options={[{ value: 'both', label: 'Packing and unpacking' }, { value: 'import', label: 'Unpacking only' }, { value: 'export', label: 'Packing only' }]} />
        </Field>
        <ActiveRow on={v.active} onToggle={() => setV({ ...v, active: !v.active })} />
        {err && <p role="alert" style={{ color: '#DC2626', fontSize: 13, margin: 0 }}>{err}</p>}
      </div>
      <ModalActions onClose={onClose} busy={busy} onSave={save} />
    </ModalShell>
  )
}
