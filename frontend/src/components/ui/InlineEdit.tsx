import React, { useRef, useState } from 'react'
import { toast } from '@/lib/toast'

/**
 * Click a value, type, done — no menu, no panel, no explicit Edit mode.
 *
 * Enter or blur commits, Escape abandons, and `onSave` reports success so the field can stay open
 * when a save is rejected. Shared by the Planner Trips list and the trip detail screen so both
 * behave identically; the label/layout wrappers differ, the editing behaviour does not.
 */

export interface InlineEditProps {
  /** The underlying value the editor works on — for a select, the option's value (e.g. an id). */
  value?: string | null
  /** What to show when not editing. Defaults to `value`; for a select, pass the option's label. */
  display?: string | null
  placeholder?: string
  type?: 'text' | 'date' | 'select'
  options?: Array<{ value: string; label: string }>
  mono?: boolean
  locked?: boolean
  lockedHint?: string
  align?: 'left' | 'right'
  fontSize?: number
  fontWeight?: number
  /** Return false to signal the save failed — the field reopens so the edit is not lost. */
  onSave: (next: string) => Promise<boolean>
}

export function InlineEdit({
  value, display, placeholder = '—', type = 'text', options, mono, locked,
  lockedHint = 'This record can no longer be edited', align = 'left',
  fontSize = 13.5, fontWeight, onSave,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')
  const [saving, setSaving]   = useState(false)
  // Enter fires commit and then blur fires it again — this keeps the second one from double-saving.
  const committed = useRef(false)

  const shown = display ?? value
  const empty = shown == null || shown === ''

  const start = () => {
    if (locked || saving) return
    setDraft(value ?? '')
    committed.current = false
    setEditing(true)
  }

  const commit = async (next: string) => {
    if (committed.current) return
    committed.current = true
    if (next === (value ?? '')) { setEditing(false); return }
    setSaving(true)
    const ok = await onSave(next)
    setSaving(false)
    if (ok) setEditing(false)
    else    committed.current = false   // leave it open so the typing is not thrown away
  }

  const cancel = () => { committed.current = true; setEditing(false) }

  if (editing) {
    const field: React.CSSProperties = {
      width: '100%', height: 26, padding: '0 6px', fontSize, fontFamily: 'inherit',
      border: '1px solid var(--brand-color)', borderRadius: 'var(--r-sm)', outline: 'none',
      boxShadow: '0 0 0 3px rgba(var(--brand-rgb),0.14)', background: '#fff',
      boxSizing: 'border-box', textAlign: align,
    }
    return type === 'select' ? (
      <select autoFocus value={draft} style={field}
        onChange={e => { setDraft(e.target.value); commit(e.target.value) }}
        onBlur={() => commit(draft)}
        onKeyDown={e => { if (e.key === 'Escape') cancel() }}>
        <option value="">—</option>
        {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    ) : (
      <input autoFocus type={type} value={draft} style={field}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); commit(draft) }
          if (e.key === 'Escape') { e.preventDefault(); cancel() }
        }} />
    )
  }

  return (
    <span
      role={locked ? undefined : 'button'}
      tabIndex={locked ? undefined : 0}
      title={locked ? lockedHint : 'Click to edit'}
      onClick={e => { e.stopPropagation(); start() }}
      onKeyDown={e => { if (!locked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); start() } }}
      style={{
        // inline-block + a minimum width, because an unassigned field renders no text at all
        // (the FRD wants Vehicle/Driver left blank until allocated). As a zero-width flex item
        // the dashed underline collapsed to nothing, so the field was invisible AND unclickable.
        display: 'inline-block', maxWidth: '100%', minWidth: locked ? 0 : empty ? 72 : 24,
        minHeight: 19, fontSize, fontWeight,
        color: saving || empty ? 'var(--text-tertiary)' : '#1C1917',
        fontFamily: mono && !empty ? 'ui-monospace,monospace' : 'inherit',
        textAlign: align,
        cursor: locked ? 'default' : 'text',
        borderBottom: locked ? '1px solid transparent' : '1px dashed rgba(0,0,0,0.18)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        verticalAlign: 'bottom',
      }}>
      {saving ? 'Saving…' : empty ? (placeholder || '\u00A0') : shown}
    </span>
  )
}

export interface OOGValue {
  isOOG?: boolean
  length?: string
  width?: string
  height?: string
}

/**
 * Out of Gauge is a flag plus three dimensions, so it opens in place rather than behaving as a
 * single field. Saving Yes with no dimension at all is refused — an OOG flag with nothing behind
 * it tells the depot nothing.
 */
export function InlineOOG({ value, locked, onSave }: {
  value: OOGValue
  locked?: boolean
  onSave: (next: Required<Pick<OOGValue, 'isOOG'>> & { length: string | null; width: string | null; height: string | null }) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [isOOG, setIsOOG]     = useState(!!value.isOOG)
  const [l, setL] = useState(value.length ?? '')
  const [w, setW] = useState(value.width  ?? '')
  const [h, setH] = useState(value.height ?? '')
  const [saving, setSaving]   = useState(false)

  const open = () => {
    if (locked) return
    setIsOOG(!!value.isOOG)
    setL(value.length ?? ''); setW(value.width ?? ''); setH(value.height ?? '')
    setEditing(true)
  }

  const save = async () => {
    if (isOOG && !l.trim() && !w.trim() && !h.trim()) {
      toast('Enter at least one OOG dimension, or turn Out of Gauge off', 'error'); return
    }
    setSaving(true)
    const ok = await onSave({
      isOOG,
      length: isOOG ? (l.trim() || null) : null,
      width:  isOOG ? (w.trim() || null) : null,
      height: isOOG ? (h.trim() || null) : null,
    })
    setSaving(false)
    if (ok) setEditing(false)
  }

  const summary = value.isOOG
    ? `Yes — ${value.length || '—'} × ${value.width || '—'} × ${value.height || '—'} cm`
    : 'No'

  const dim: React.CSSProperties = {
    width: 52, height: 26, padding: '0 5px', fontSize: 12.5, fontFamily: 'inherit',
    border: '1px solid rgba(0,0,0,0.16)', borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box',
  }

  if (!editing) {
    return (
      <span
        role={locked ? undefined : 'button'}
        tabIndex={locked ? undefined : 0}
        title={locked ? 'This record can no longer be edited' : 'Click to edit'}
        onClick={e => { e.stopPropagation(); open() }}
        onKeyDown={e => { if (!locked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); open() } }}
        style={{
          display: 'inline-block', maxWidth: '100%', minWidth: locked ? 0 : 24,
          minHeight: 19, fontSize: 13.5, color: '#1C1917',
          cursor: locked ? 'default' : 'text',
          borderBottom: locked ? '1px solid transparent' : '1px dashed rgba(0,0,0,0.18)',
          verticalAlign: 'bottom',
        }}>
        {summary}
      </span>
    )
  }

  return (
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {(['Yes', 'No'] as const).map(opt => {
        const yes = opt === 'Yes'
        const active = isOOG === yes
        return (
          <button key={opt} type="button" onClick={() => setIsOOG(yes)}
            style={{ height: 26, padding: '0 10px', fontSize: 12.5, fontWeight: 600, borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${active ? 'var(--brand-color)' : 'rgba(0,0,0,0.15)'}`, background: active ? 'var(--brand-color)' : '#fff', color: active ? 'var(--brand-text)' : '#1C1917' }}>
            {opt}
          </button>
        )
      })}
      {isOOG && (
        <>
          <input autoFocus value={l} onChange={e => setL(e.target.value)} placeholder="L" style={dim} />
          <input value={w} onChange={e => setW(e.target.value)} placeholder="W" style={dim} />
          <input value={h} onChange={e => setH(e.target.value)} placeholder="H" style={dim} />
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>cm</span>
        </>
      )}
      <button type="button" onClick={save} disabled={saving}
        style={{ height: 26, padding: '0 11px', fontSize: 12.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button type="button" onClick={() => setEditing(false)}
        style={{ height: 26, padding: '0 9px', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        Cancel
      </button>
    </div>
  )
}

export const INLINE_LABEL: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 2px',
}
