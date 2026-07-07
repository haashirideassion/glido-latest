import { useState, useEffect, useRef } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { fetcher, postFetcher, patchFetcher, deleteFetcher } from '@/lib/fetcher'
import { Icon, ICONS } from '@/lib/Icon'
import { AnimatedNumber, motion } from '@/lib/motion'
import { EmptyState } from '@/components/reception/EmptyState'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Template {
  id: string
  name: string
  subject: string
  body: string
  created_at: string
}

interface Broadcast {
  id: string
  subject: string
  body: string
  recipients: 'all' | string[]
  template_id: string | null
  template_name: string | null
  sent_by: string | null
  status: string
  created_at: string
}

interface Carrier {
  id: string
  name: string
  contact_email: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Australia/Sydney',
  })
}

function recipientLabel(recipients: 'all' | string[], carriers: Carrier[]): string {
  if (recipients === 'all' || recipients === undefined) return 'All Carriers'
  if (!Array.isArray(recipients) || recipients.length === 0) return 'All Carriers'
  if (recipients.length === carriers.length) return 'All Carriers'
  const names = recipients.map(id => carriers.find(c => c.id === id)?.name ?? id)
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, type, onDone }: { message: string; type: 'success' | 'error'; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t) }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 20px', borderRadius: 'var(--r-md)',
      background: type === 'success' ? '#F0FDF4' : '#FEF2F2',
      border: `1px solid ${type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      fontSize: 15, fontWeight: 500,
      color: type === 'success' ? '#15803D' : '#DC2626',
      whiteSpace: 'nowrap',
    }}>
      {message}
    </div>
  )
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteConfirm({ label, onClose, onConfirm, deleting }: {
  label: string; onClose: () => void; onConfirm: () => void; deleting: boolean
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 1001, width: 400, background: '#fff', borderRadius: 'var(--r-xl)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)', padding: '28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={ICONS.trash} size={20} style={{ color: '#EF4444' }} />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', margin: 0 }}>Delete template?</h3>
        </div>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
          <strong style={{ color: '#1C1917' }}>{label}</strong> will be permanently deleted.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting} style={{ padding: '9px 20px', borderRadius: 'var(--r-md)', border: 'none', background: deleting ? 'rgba(239,68,68,0.5)' : '#EF4444', color: '#fff', fontSize: 15, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Shared style constants ────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid rgba(0,0,0,0.07)',
  borderRadius: 'var(--r-lg)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
}

const LABEL: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block',
}

const INPUT: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 'var(--r-md)',
  border: '1px solid rgba(0,0,0,0.12)', fontSize: 15, fontFamily: 'inherit',
  color: '#1C1917', background: '#fff', boxSizing: 'border-box', outline: 'none',
}

const SELECT: React.CSSProperties = {
  ...INPUT, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cpath fill='%239CA3AF' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
  paddingRight: 36,
}

const BTN_PRIMARY: React.CSSProperties = {
  padding: '10px 22px', borderRadius: 'var(--r-md)', border: 'none',
  background: 'var(--brand-color)', color: 'var(--brand-text)',
  fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', gap: 7,
}

const BTN_SECONDARY: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 'var(--r-md)',
  border: '1px solid rgba(0,0,0,0.12)', background: '#fff',
  fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  color: '#374151', display: 'flex', alignItems: 'center', gap: 7,
}

// ── Custom Select ─────────────────────────────────────────────────────────────

interface SelectOption { value: string; label: string }

function CustomSelect({ value, onChange, options, placeholder }: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const allOpts = [{ value: '', label: placeholder }, ...options]
  const selected = allOpts.find(o => o.value === value) ?? allOpts[0]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    setOpen(v => !v)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer', outline: 'none',
          fontSize: 15, fontFamily: 'inherit', color: value ? '#1C1917' : '#9CA3AF',
          background: '#fff', border: '1px solid rgba(0,0,0,0.12)',
          transition: 'border-color 0.15s, box-shadow 0.15s', boxSizing: 'border-box',
        }}
        onFocus={e  => { e.currentTarget.style.borderColor = 'rgba(var(--brand-rgb),0.50)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.10)' }}
        onBlur={e   => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.boxShadow = 'none' }}
      >
        <span>{selected.label}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.5, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && dropPos && (
        <div style={{
          position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width,
          zIndex: 9999, background: '#fff', border: '1px solid rgba(0,0,0,0.09)',
          borderRadius: 'var(--r-md)', boxShadow: '0 8px 28px rgba(0,0,0,0.08)', padding: 5,
        }}>
          {allOpts.map(opt => {
            const isSelected = opt.value === value
            return (
              <button
                key={opt.value || '__none__'}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  fontSize: 15, fontFamily: 'inherit',
                  background: isSelected ? 'rgba(var(--brand-rgb),0.08)' : 'transparent',
                  color: isSelected ? 'var(--brand-color)' : '#1C1917',
                }}
                onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
                onMouseOut={e  => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isSelected && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L4.5 8.5 10 3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span>{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Compose Tab ───────────────────────────────────────────────────────────────

function ComposeTab({
  templates, onSent, onSaveTemplate,
}: {
  templates: Template[]
  onSent: (b: Broadcast) => void
  onSaveTemplate: (t: Template) => void
}) {
  const [templateId, setTemplateId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveNameModal, setSaveNameModal] = useState(false)
  const [saveName, setSaveName] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const syncScroll  = () => { if (backdropRef.current && textareaRef.current) backdropRef.current.scrollTop = textareaRef.current.scrollTop }

  const VARS_AVAILABLE = [
    { token: '{carrier_name}',  label: 'Carrier Name',    desc: 'Resolved per recipient — their company name' },
    { token: '{contact_name}',  label: 'Contact Person',  desc: 'Resolved per recipient — their contact person' },
    { token: '{facility_name}', label: 'Facility Name',   desc: 'Your CFS facility name from Settings' },
  ]
  const VARS_UNAVAILABLE = [
    { token: '{driver_name}',      label: 'Driver Name',   desc: 'Booking-specific — only available when sending from a booking' },
    { token: '{reference_number}', label: 'Reference #',   desc: 'Booking-specific — only available when sending from a booking' },
  ]

  const insertVariable = (token: string) => {
    const el = textareaRef.current
    if (!el) { setBody(prev => prev + token); return }
    const start = el.selectionStart
    const end   = el.selectionEnd
    setBody(body.slice(0, start) + token + body.slice(end))
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    }, 0)
  }

  // Apply template
  useEffect(() => {
    if (!templateId) return
    const t = templates.find(t => t.id === templateId)
    if (t) { setSubject(t.subject); setBody(t.body) }
  }, [templateId, templates])

  const canSend = subject.trim() && body.trim()

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    try {
      const payload = {
        subject: subject.trim(),
        body: body.trim(),
        recipients: 'all',
        template_id: templateId || null,
      }
      const res = await postFetcher('/api/broadcasts', payload)
      onSent(res.data)
      setSubject(''); setBody(''); setTemplateId('')
    } catch (err: any) {
      alert(err?.message ?? 'Failed to send broadcast')
    } finally {
      setSending(false)
    }
  }

  const handleSaveAsTemplate = async () => {
    if (!canSend || !saveName.trim()) return
    setSaving(true)
    try {
      const res = await postFetcher('/api/broadcasts/templates', {
        name: saveName.trim(), subject: subject.trim(), body: body.trim(),
      })
      onSaveTemplate(res.data)
      setSaveNameModal(false)
      setSaveName('')
    } catch (err: any) {
      alert(err?.message ?? 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Template row + recipients notice */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
        <div>
          <label style={LABEL}>Use Template</label>
          <CustomSelect
            value={templateId}
            onChange={setTemplateId}
            placeholder="No template"
            options={templates.map(t => ({ value: t.id, label: t.name }))}
          />
        </div>
        <div>
          <label style={LABEL}>Recipients</label>
          <div style={{ ...INPUT, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.03)', color: 'var(--text-secondary)', cursor: 'default' }}>
            <Icon name={ICONS.users} size={15} style={{ flexShrink: 0, opacity: 0.6 }} />
            All carriers (including blocked)
          </div>
        </div>
      </div>

      {/* Subject */}
      <div style={{ marginBottom: 16 }}>
        <label style={LABEL}>Subject</label>
        <input
          type="text"
          placeholder="Enter message subject…"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          style={INPUT}
        />
      </div>

      {/* Message */}
      <div style={{ marginBottom: 16 }}>
        <label style={LABEL}>Message</label>
        <div style={{ position: 'relative', borderRadius: 'var(--r-sm)', border: '1px solid rgba(0,0,0,0.12)', background: '#FFFFFF', overflow: 'hidden' }}>
          {/* Highlight backdrop */}
          <div
            ref={backdropRef}
            aria-hidden
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              padding: '10px 14px', fontSize: 15, lineHeight: 1.6,
              fontFamily: 'inherit', whiteSpace: 'pre-wrap',
              wordWrap: 'break-word', overflowWrap: 'break-word',
              overflow: 'hidden', color: '#1C1917', boxSizing: 'border-box',
            }}
          >
            {body.split(/(\{[^{}]*\})/g).map((seg, i) =>
              /^\{[^{}]*\}$/.test(seg) ? (
                <mark key={i} style={{
                  background: 'rgba(var(--brand-rgb),0.12)',
                  color: 'var(--brand-color)',
                  borderRadius: 3,
                  padding: '1px 3px',
                  fontWeight: 700,
                  fontStyle: 'normal',
                }}>{seg}</mark>
              ) : seg
            )}
            {'\n'}
          </div>
          {/* Transparent textarea on top */}
          <textarea
            ref={textareaRef}
            placeholder="Write your message here…"
            value={body}
            onChange={e => setBody(e.target.value)}
            onScroll={syncScroll}
            rows={10}
            className="broadcast-body-ta"
            style={{
              width: '100%', padding: '10px 14px', fontSize: 15, lineHeight: 1.6,
              fontFamily: 'inherit', boxSizing: 'border-box',
              background: 'transparent', color: 'transparent', caretColor: '#1C1917',
              border: 'none', outline: 'none', resize: 'vertical', display: 'block',
            }}
          />
        </div>
        <style>{`.broadcast-body-ta::placeholder { color: #A8A29E; }`}</style>
      </div>

      {/* Variable helper */}
      <div style={{ marginBottom: 24, background: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#6B7280' }}>Template Variables</span>
          <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 2 }}>— click to insert at cursor</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[...VARS_AVAILABLE, ...VARS_UNAVAILABLE].map(v => {
            const avail = VARS_AVAILABLE.includes(v)
            return avail ? (
              <button
                key={v.token}
                type="button"
                onClick={() => insertVariable(v.token)}
                title={v.desc}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 11px', borderRadius: 'var(--r-full)', fontSize: 13, fontWeight: 600,
                  background: 'rgba(var(--brand-rgb),0.07)', border: '1px solid rgba(var(--brand-rgb),0.22)',
                  color: 'var(--brand-color)', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'background 0.12s',
                }}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(var(--brand-rgb),0.14)')}
                onMouseOut={e  => (e.currentTarget.style.background = 'rgba(var(--brand-rgb),0.07)')}
              >
                <code style={{ fontSize: 12, fontFamily: 'monospace' }}>{v.token}</code>
                <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 500 }}>{v.label}</span>
              </button>
            ) : (
              <div
                key={v.token}
                title={v.desc}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 11px', borderRadius: 'var(--r-full)', fontSize: 13, fontWeight: 600,
                  background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.09)',
                  color: '#9CA3AF', cursor: 'not-allowed',
                }}
              >
                <code style={{ fontSize: 12, fontFamily: 'monospace' }}>{v.token}</code>
                <span style={{ fontSize: 11, fontWeight: 500 }}>{v.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => { if (canSend) setSaveNameModal(true) }}
          disabled={!canSend}
          style={{ ...BTN_SECONDARY, opacity: canSend ? 1 : 0.45 }}
        >
          <Icon name={ICONS.document} size={16} />
          Save as Template
        </button>
        <button
          onClick={handleSend}
          disabled={!canSend || sending}
          style={{ ...BTN_PRIMARY, opacity: canSend && !sending ? 1 : 0.55 }}
        >
          <Icon name={ICONS.email} size={16} />
          {sending ? 'Sending…' : 'Send Broadcast'}
        </button>
      </div>

      {/* Save name modal */}
      {saveNameModal && (
        <>
          <div onClick={() => setSaveNameModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1001, width: 400, background: '#fff', borderRadius: 'var(--r-xl)', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', padding: '28px' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', marginBottom: 16 }}>Save as Template</h3>
            <label style={LABEL}>Template Name</label>
            <input
              type="text"
              placeholder="e.g. Weekly update"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSaveAsTemplate()}
              style={{ ...INPUT, marginBottom: 20 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setSaveNameModal(false)} style={BTN_SECONDARY}>Cancel</button>
              <button onClick={handleSaveAsTemplate} disabled={!saveName.trim() || saving} style={{ ...BTN_PRIMARY, opacity: saveName.trim() && !saving ? 1 : 0.55 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Templates Tab ─────────────────────────────────────────────────────────────

function TemplatesTab({
  templates, loading, onDelete, onEdit,
}: {
  templates: Template[]
  loading: boolean
  onDelete: (id: string) => void
  onEdit: (t: Template) => void
}) {
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteFetcher(`/api/broadcasts/templates/${deleteTarget.id}`)
      onDelete(deleteTarget.id)
      setDeleteTarget(null)
    } catch { alert('Failed to delete template') }
    finally { setDeleting(false) }
  }

  if (loading) return <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 15 }}>Loading…</div>

  if (templates.length === 0) return (
    <EmptyState variant="inbox" title="No templates yet" subtitle="Save a broadcast as a template to reuse it quickly." />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {templates.map(t => (
        <div key={t.id} style={{ ...CARD, padding: '18px 20px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ width: 38, height: 38, borderRadius: 'var(--r-md)', background: 'rgba(var(--brand-rgb),0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={ICONS.document} size={18} style={{ color: 'var(--brand-color)' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: '0 0 2px' }}>{t.name}</p>
            <p style={{ fontSize: 14, color: '#374151', margin: '0 0 4px', fontWeight: 500 }}>{t.subject}</p>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>{t.body}</p>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>Created {fmtDate(t.created_at)}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => onEdit(t)}
              title="Edit"
              style={{ width: 32, height: 32, borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.09)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7280' }}
            >
              <Icon name={ICONS.edit} size={15} />
            </button>
            <button
              onClick={() => setDeleteTarget(t)}
              title="Delete"
              style={{ width: 32, height: 32, borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.09)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#9CA3AF' }}
              onMouseOver={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)' }}
              onMouseOut={e  => { e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.09)' }}
            >
              <Icon name={ICONS.trash} size={15} />
            </button>
          </div>
        </div>
      ))}

      {deleteTarget && (
        <DeleteConfirm
          label={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}
    </div>
  )
}

// ── Edit Template Modal ───────────────────────────────────────────────────────

function EditTemplateModal({ template, onClose, onSaved }: {
  template: Template; onClose: () => void; onSaved: (t: Template) => void
}) {
  const [name, setName] = useState(template.name)
  const [subject, setSubject] = useState(template.subject)
  const [body, setBody] = useState(template.body)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !subject.trim() || !body.trim()) return
    setSaving(true)
    try {
      const res = await patchFetcher(`/api/broadcasts/templates/${template.id}`, {
        name: name.trim(), subject: subject.trim(), body: body.trim(),
      })
      onSaved(res.data)
    } catch { alert('Failed to update template') }
    finally { setSaving(false) }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1001, width: 560, background: '#fff', borderRadius: 'var(--r-xl)', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', padding: '28px' }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', marginBottom: 20 }}>Edit Template</h3>
        <label style={LABEL}>Template Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} style={{ ...INPUT, marginBottom: 16 }} />
        <label style={LABEL}>Subject</label>
        <input type="text" value={subject} onChange={e => setSubject(e.target.value)} style={{ ...INPUT, marginBottom: 16 }} />
        <label style={LABEL}>Message</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} style={{ ...INPUT, resize: 'vertical', lineHeight: 1.6, marginBottom: 20 }} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={BTN_SECONDARY}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ ...BTN_PRIMARY, opacity: saving ? 0.55 : 1 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── History Tab ───────────────────────────────────────────────────────────────

function BroadcastPane({ broadcast, carriers, docked, onClose }: { broadcast: Broadcast; carriers: Carrier[]; docked?: boolean; onClose: () => void }) {
  const rLabel = recipientLabel(broadcast.recipients as any, carriers)
  const PANEL: React.CSSProperties = { background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-sm)', padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }
  const SL: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }
  const meta = [
    { label: 'Recipients', value: rLabel, icon: ICONS.users },
    { label: 'Template',   value: broadcast.template_name, icon: ICONS.document },
    { label: 'Date',       value: fmtDate(broadcast.created_at), icon: ICONS.calendar },
    { label: 'Sent by',    value: broadcast.sent_by, icon: ICONS.user },
  ].filter(m => m.value)
  const panelStyle: React.CSSProperties = docked
    ? { position: 'relative', height: '100%', width: '100%', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 6px 24px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { position: 'fixed', right: 0, top: 0, height: '100%', width: 'min(480px, 100vw)', zIndex: 50, background: '#FFFFFF', borderLeft: '1px solid rgba(0,0,0,0.08)', boxShadow: '-8px 0 40px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column' }
  return (
    <>
      {!docked && <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(28,25,23,0.35)', backdropFilter: 'blur(4px)' }} />}
      <motion.div
        style={panelStyle}
        initial={docked ? { opacity: 0, x: 16 } : { x: '100%' }}
        animate={docked ? { opacity: 1, x: 0 } : { x: 0 }}
        transition={docked ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] } : { type: 'spring', stiffness: 400, damping: 40 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 12px 18px', borderBottom: '1px solid rgba(0,0,0,0.07)', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: 'rgba(var(--brand-rgb),0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={ICONS.email} size={18} style={{ color: 'var(--brand-color)' }} />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{broadcast.subject}</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ padding: '3px 10px', borderRadius: 'var(--r-full)', fontSize: 12, fontWeight: 600, background: '#F0FDF4', color: '#15803D', border: '1px solid rgba(34,197,94,0.2)' }}>Sent</span>
            <button onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 'var(--r-full)', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-secondary)', transition: 'background 0.15s, color 0.15s' }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = '#1C1917' }}
              onMouseOut={e  => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#F5F4F3', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section>
            <p style={SL}>Details</p>
            <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {meta.map(m => (
                <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-secondary)', flexShrink: 0 }}><Icon name={m.icon} size={14} style={{ color: 'var(--text-secondary)' }} />{m.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.value}</span>
                </div>
              ))}
            </div>
          </section>
          <section>
            <p style={SL}>Message</p>
            <div style={{ ...PANEL, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{broadcast.body}</div>
          </section>
        </div>
      </motion.div>
    </>
  )
}

function HistoryTab({ broadcasts, carriers, loading }: { broadcasts: Broadcast[]; carriers: Carrier[]; loading: boolean }) {
  const [selected, setSelected] = useState<Broadcast | null>(null)
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true))
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (loading) return <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 15 }}>Loading…</div>

  if (broadcasts.length === 0) return (
    <EmptyState title="No broadcasts sent yet" subtitle="Broadcasts you send will appear here." />
  )

  const paneOpen = !!selected && isWide
  const TH: React.CSSProperties = { textAlign: 'left', padding: '8px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(0,0,0,0.07)', background: '#FAFAF9', position: 'sticky', top: 0, zIndex: 1 }
  const TD: React.CSSProperties = { padding: '10px 14px', fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(0,0,0,0.05)' }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, ...CARD, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Subject</th>
                  <th style={TH}>Recipients</th>
                  {!paneOpen && <th style={TH}>Template</th>}
                  <th style={TH}>Date</th>
                  <th style={TH}>Status</th>
                  <th style={{ ...TH, textAlign: 'right' }} />
                </tr>
              </thead>
              <tbody>
                {broadcasts.map(b => {
                  const isSel = selected?.id === b.id
                  return (
                    <tr key={b.id} onClick={() => setSelected(b)}
                      style={{ cursor: 'pointer', background: isSel ? 'rgba(var(--brand-rgb),0.06)' : 'transparent', transition: 'background 0.12s' }}
                      onMouseOver={e => { if (!isSel) e.currentTarget.style.background = '#FAFAF9' }}
                      onMouseOut={e  => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
                    >
                      <td style={{ ...TD, color: '#1C1917', fontWeight: 600, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.subject}</td>
                      <td style={TD}>{recipientLabel(b.recipients as any, carriers)}</td>
                      {!paneOpen && <td style={{ ...TD, color: b.template_name ? '#1C1917' : 'var(--text-tertiary)' }}>{b.template_name ?? '—'}</td>}
                      <td style={TD}>{fmtDate(b.created_at)}</td>
                      <td style={TD}><span style={{ padding: '3px 9px', borderRadius: 'var(--r-full)', fontSize: 11.5, fontWeight: 600, background: '#F0FDF4', color: '#15803D', border: '1px solid rgba(34,197,94,0.2)' }}>Sent</span></td>
                      <td style={{ ...TD, textAlign: 'right', color: 'var(--text-tertiary)', opacity: 0.5 }}>›</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {selected && isWide && (
          <div style={{ width: 480, flexShrink: 0, position: 'sticky', top: 12, height: 'calc(100vh - var(--dash-header-h) - 24px)' }}>
            <BroadcastPane broadcast={selected} carriers={carriers} docked onClose={() => setSelected(null)} />
          </div>
        )}
      </div>

      {selected && !isWide && (
        <BroadcastPane broadcast={selected} carriers={carriers} onClose={() => setSelected(null)} />
      )}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type TabId = 'compose' | 'templates' | 'history'

const TABS: { id: TabId; label: string }[] = [
  { id: 'compose',   label: 'Compose Message' },
  { id: 'templates', label: 'Templates'       },
  { id: 'history',   label: 'Broadcast History' },
]

export default function BroadcastPage() {
  usePageTitle('Glido | Broadcast Center')

  const [tab, setTab] = useState<TabId>('compose')
  const [templates, setTemplates] = useState<Template[]>([])
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [editTarget, setEditTarget] = useState<Template | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    fetcher('/api/broadcasts/templates').then(r => setTemplates(r?.data ?? [])).finally(() => setLoadingTemplates(false))
    fetcher('/api/broadcasts').then(r => setBroadcasts(r?.data ?? [])).finally(() => setLoadingHistory(false))
    fetcher('/api/carriers?status=active').then(r => setCarriers(r?.data ?? []))
  }, [])

  const handleSent = (b: Broadcast) => {
    setBroadcasts(prev => [b, ...prev])
    setToast({ message: 'Broadcast recorded', type: 'success' })
    setTab('history')
  }

  const handleSaveTemplate = (t: Template) => {
    setTemplates(prev => [t, ...prev])
    setToast({ message: 'Template saved', type: 'success' })
  }

  const handleDeleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id))
    setToast({ message: 'Template deleted', type: 'success' })
  }

  const handleEditSaved = (t: Template) => {
    setTemplates(prev => prev.map(x => x.id === t.id ? t : x))
    setEditTarget(null)
    setToast({ message: 'Template updated', type: 'success' })
  }

  return (
    <div>

      {/* Stats row */}
      <div style={{ display: 'flex', alignItems: 'stretch', background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.02),0 4px 20px rgba(0,0,0,0.04)' }}>
        {[
          { label: 'Total Broadcasts', value: broadcasts.length, sub: 'Sent messages',      icon: ICONS.email,    iconBg: 'rgba(var(--brand-rgb),0.10)',  iconFg: 'var(--brand-color)' },
          { label: 'Templates Saved',  value: templates.length,  sub: 'Reusable templates', icon: ICONS.document, iconBg: 'rgba(139,92,246,0.10)',        iconFg: '#8B5CF6'            },
          { label: 'Active Carriers',  value: carriers.length,   sub: 'Registered carriers', icon: ICONS.truck,    iconBg: 'rgba(14,165,233,0.10)',        iconFg: '#0EA5E9'            },
        ].map((s, i) => (
          <div key={s.label}
            style={{ flex: 1, minWidth: 0, padding: 'var(--kpi-pad-y) var(--kpi-pad-x)', borderLeft: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.07)', transition: 'background 0.18s ease' }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.015)')}
            onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 34, height: 34, borderRadius: 'var(--r-md)', background: s.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${s.iconFg}22` }}>
                <Icon name={s.icon} size={17} style={{ color: s.iconFg }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</p>
            </div>
            <p style={{ fontSize: 'var(--kpi-value)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#1C1917', margin: '0 0 6px', fontVariantNumeric: 'tabular-nums' }}><AnimatedNumber value={s.value} /></p>
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tab panel */}
      <div style={{ ...CARD, overflow: 'hidden' }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.07)', padding: '0 20px', background: '#fafafa' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '14px 18px', border: 'none', background: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 14, fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? 'var(--brand-color)' : '#6B7280',
                borderBottom: `2px solid ${tab === t.id ? 'var(--brand-color)' : 'transparent'}`,
                marginBottom: -1, transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: '24px 24px 28px' }}>
          {tab === 'compose' && (
            <ComposeTab
              templates={templates}
              onSent={handleSent}
              onSaveTemplate={handleSaveTemplate}
            />
          )}
          {tab === 'templates' && (
            <TemplatesTab
              templates={templates}
              loading={loadingTemplates}
              onDelete={handleDeleteTemplate}
              onEdit={t => setEditTarget(t)}
            />
          )}
          {tab === 'history' && (
            <HistoryTab
              broadcasts={broadcasts}
              carriers={carriers}
              loading={loadingHistory}
            />
          )}
        </div>
      </div>

      {/* No-email notice */}
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name={ICONS.info} size={14} style={{ flexShrink: 0 }} />
        Broadcasts are recorded here. Actual email delivery requires SMTP configuration.
      </p>

      {editTarget && (
        <EditTemplateModal
          template={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handleEditSaved}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
