import React, { useEffect, useRef, useState } from 'react'
import { CustomSelect } from '@/components/ui/CustomSelect'
import { Icon, ICONS } from '@/lib/Icon'
import { useSignedUrl, openSignedUrl } from '@/lib/useSignedUrl'
import type { CfsContainer, FieldStatus } from '@/lib/cfs'

/** Shared building blocks for the Packing & Unpacking module screens. */

export const LABEL: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }
export const INPUT: React.CSSProperties = { width: '100%', padding: '9px 12px', fontSize: 15, color: '#1C1917', background: '#FFFFFF', border: '1px solid #E2E0DD', borderRadius: 'var(--r-sm)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
export const CARD: React.CSSProperties = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', padding: '14px 16px' }

// ── Buttons ──────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export function Btn({
  variant = 'secondary', loading, disabled, small, children, style, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean; small?: boolean }) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    padding: small ? '6px 12px' : '9px 18px', fontSize: small ? 13 : 14, fontWeight: 600, fontFamily: 'inherit',
    borderRadius: 'var(--r-full)', cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.55 : 1, transition: 'background 0.13s ease, transform 0.08s ease', whiteSpace: 'nowrap',
  }
  const v: Record<BtnVariant, React.CSSProperties> = {
    primary:   { background: 'var(--brand-color)', color: 'var(--brand-text)', border: '1px solid transparent' },
    secondary: { background: '#FFFFFF', color: '#1C1917', border: '1px solid rgba(0,0,0,0.14)' },
    danger:    { background: '#FFFFFF', color: '#DC2626', border: '1px solid rgba(220,38,38,0.35)' },
    ghost:     { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent' },
  }
  return (
    <button type="button" {...rest} disabled={disabled || loading} style={{ ...base, ...v[variant], ...style }}>
      {loading && <span className="cfs-spin" aria-hidden />}
      {children}
    </button>
  )
}

// ── Chips ────────────────────────────────────────────────────────────────────

export function Chip({ children, tone = 'neutral', title, style }: {
  children: React.ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'purple'; title?: string; style?: React.CSSProperties
}) {
  const tones = {
    neutral: ['#F3F2F1', '#57534E'], green: ['rgba(34,197,94,0.13)', '#15803D'], amber: ['rgba(245,158,11,0.15)', '#B45309'],
    red: ['rgba(239,68,68,0.13)', '#B91C1C'], blue: ['rgba(59,130,246,0.13)', '#1D4ED8'], purple: ['rgba(124,58,237,0.12)', '#6D28D9'],
  } as const
  const [bg, fg] = tones[tone]
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, background: bg, color: fg, fontSize: 12, fontWeight: 600, lineHeight: 1.3, whiteSpace: 'nowrap', ...style }}>
      {children}
    </span>
  )
}

/** Same stage pills as the Planner trip cards. */
export const STAGE_PILL: Record<string, { bg: string; color: string }> = {
  new_request:       { bg: 'rgba(0,0,0,0.05)',      color: 'var(--text-secondary)' },
  manifested:        { bg: 'rgba(37,99,235,0.08)',  color: '#2563EB' },
  planned:           { bg: 'rgba(234,179,8,0.10)',  color: '#A16207' },
  result_validation: { bg: 'rgba(124,58,237,0.09)', color: '#6D28D9' },
  completed:         { bg: 'rgba(34,197,94,0.10)',  color: '#16A34A' },
  cancelled:         { bg: 'rgba(239,68,68,0.09)',  color: '#B91C1C' },
  accepted:          { bg: 'rgba(34,197,94,0.10)',  color: '#16A34A' },
  submitted:         { bg: 'rgba(234,179,8,0.10)',  color: '#A16207' },
  declined:          { bg: 'rgba(239,68,68,0.09)',  color: '#B91C1C' },
}
export function StagePill({ status, children }: { status: string; children: React.ReactNode }) {
  const p = STAGE_PILL[status] ?? STAGE_PILL.new_request
  return <span style={{ fontSize: 12.5, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)', background: p.bg, color: p.color, whiteSpace: 'nowrap' }}>{children}</span>
}

/** Small uppercase label above a value — the Planner card "cell" label. */
export const CELL_LABEL: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }

const INSPECTION_TONE = { not_required: 'neutral', pending: 'amber', passed: 'green', failed: 'red' } as const
const FUMIGATION_TONE = { not_required: 'neutral', pending: 'amber', completed: 'green', failed: 'red' } as const
const pretty = (s: string) => s.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

/** Inspection + fumigation status, shown on every card in every tab. */
export function ComplianceBadges({ c, hideNotRequired = true }: {
  c: Pick<CfsContainer, 'inspection_status' | 'fumigation_status'>; hideNotRequired?: boolean
}) {
  const parts: React.ReactNode[] = []
  if (!(hideNotRequired && c.inspection_status === 'not_required')) {
    parts.push(<Chip key="i" tone={INSPECTION_TONE[c.inspection_status]} title="Inspection">Inspection: {pretty(c.inspection_status)}</Chip>)
  }
  if (!(hideNotRequired && c.fumigation_status === 'not_required')) {
    parts.push(<Chip key="f" tone={FUMIGATION_TONE[c.fumigation_status]} title="Fumigation">Fumigation: {pretty(c.fumigation_status)}</Chip>)
  }
  if (!parts.length) return <Chip tone="neutral" title="No inspection or fumigation required">No holds</Chip>
  return <>{parts}</>
}

export function MatchBadge({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return null
  const tone = pct >= 99.5 ? 'green' : pct >= 90 ? 'amber' : 'red'
  return <Chip tone={tone} title="Manifest vs ICS match">{pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}% match</Chip>
}

export const FIELD_STATUS_STYLE: Record<FieldStatus, { bg: string; fg: string; label: string }> = {
  match:    { bg: 'rgba(34,197,94,0.12)',  fg: '#15803D', label: 'Match' },
  near:     { bg: 'rgba(59,130,246,0.12)', fg: '#1D4ED8', label: 'Near match' },
  mismatch: { bg: 'rgba(239,68,68,0.13)',  fg: '#B91C1C', label: 'Mismatch' },
  missing:  { bg: 'rgba(245,158,11,0.16)', fg: '#B45309', label: 'Missing' },
}

// ── Form bits ────────────────────────────────────────────────────────────────

export function Field({ label, children, hint, span }: { label: string; children: React.ReactNode; hint?: string; span?: number }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined, minWidth: 0 }}>
      <label style={{ display: 'block' }}>
        <span style={LABEL}>{label}</span>
        {children}
      </label>
      {hint && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>{hint}</p>}
    </div>
  )
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput(props, ref) {
  return (
    <input ref={ref} {...props} style={{ ...INPUT, ...(props.style as React.CSSProperties) }}
      onFocus={e => { e.target.style.borderColor = 'rgba(var(--brand-rgb),0.55)'; e.target.style.boxShadow = '0 0 0 3px rgba(var(--brand-rgb),0.12)'; props.onFocus?.(e) }}
      onBlur={e => { e.target.style.borderColor = '#E2E0DD'; e.target.style.boxShadow = 'none'; props.onBlur?.(e) }} />
  )
})

export function Select({ value, onChange, options, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string; disabled?: boolean
}) {
  // Same dropdown the other modules use (CustomSelect) instead of the browser's native <select>.
  return (
    <div style={disabled ? { opacity: 0.55, pointerEvents: 'none' } : undefined} aria-disabled={disabled || undefined}>
      <CustomSelect neutral value={value} onChange={onChange} options={options} placeholder={placeholder} />
    </div>
  )
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} style={{ ...INPUT, minHeight: 80, resize: 'vertical', ...(props.style as React.CSSProperties) }} />
}

// ── Layout helpers ───────────────────────────────────────────────────────────

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 12px' }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.01em', margin: 0 }}>{children}</h3>
      {action}
    </div>
  )
}

export function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...CELL_LABEL, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', wordBreak: 'break-word' }}>{value === null || value === undefined || value === '' ? '—' : value}</div>
    </div>
  )
}

export function EmptyState({ icon, title, body, action }: { icon?: string; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div style={{ ...CARD, textAlign: 'center', padding: '44px 24px' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(var(--brand-rgb),0.09)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon ?? ICONS.container} size={24} style={{ color: 'var(--brand-color)' }} />
      </div>
      <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: '0 0 4px' }}>{title}</p>
      {body && <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 auto', maxWidth: 420 }}>{body}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40, color: 'var(--text-secondary)', fontSize: 14 }}>
      <span className="cfs-spin dark" aria-hidden /> {label}
    </div>
  )
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{ ...CARD, borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.04)', display: 'flex', alignItems: 'center', gap: 12 }}>
      <Icon name={ICONS.warning} size={20} style={{ color: '#DC2626', flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 14, color: '#7F1D1D' }}>{message}</span>
      {onRetry && <Btn small onClick={onRetry}>Retry</Btn>}
    </div>
  )
}

// ── Modal ────────────────────────────────────────────────────────────────────

export function Modal({ title, onClose, children, footer, width = 520 }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label={title}
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(28,25,23,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={ref} tabIndex={-1} style={{ background: '#fff', borderRadius: 'var(--r-lg)', width: '100%', maxWidth: width, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', outline: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1C1917' }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#78716C', display: 'flex' }}>
            <Icon name={ICONS.close} size={22} />
          </button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(0,0,0,0.07)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>{footer}</div>}
      </div>
    </div>
  )
}

/** Modal that collects a required text reason (decline / reject / cancel). */
export function ReasonModal({ title, label, confirmLabel, danger, onSubmit, onClose, optional }: {
  title: string; label: string; confirmLabel: string; danger?: boolean; optional?: boolean
  onSubmit: (reason: string) => Promise<void>; onClose: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = async () => {
    if (!optional && !text.trim()) { setErr('This is required'); return }
    setBusy(true); setErr(null)
    try { await onSubmit(text.trim()) } catch (e: any) { setErr(e.message || 'Something went wrong'); setBusy(false) }
  }
  return (
    <Modal title={title} onClose={onClose} footer={
      <>
        <Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn variant={danger ? 'danger' : 'primary'} onClick={submit} loading={busy}>{confirmLabel}</Btn>
      </>}>
      <Field label={label}>
        <TextArea value={text} onChange={e => setText(e.target.value)} autoFocus maxLength={1000} />
      </Field>
      {err && <p role="alert" style={{ color: '#DC2626', fontSize: 13, margin: '8px 0 0' }}>{err}</p>}
    </Modal>
  )
}

// ── Photos ───────────────────────────────────────────────────────────────────

export function PhotoThumb({ path, name, tag, onRemove, size = 92 }: {
  path: string; name?: string | null; tag?: string; onRemove?: () => void; size?: number
}) {
  const src = useSignedUrl(path)
  const isImage = /\.(png|jpe?g|gif|webp|heic)$/i.test(path)
  return (
    <div style={{ position: 'relative', width: size, flexShrink: 0 }}>
      <button type="button" onClick={() => openSignedUrl(path)} title={name ?? 'Open'}
        style={{ width: size, height: size, borderRadius: 'var(--r-md)', border: '1px solid rgba(0,0,0,0.1)', background: '#F3F2F1', padding: 0, cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isImage && src
          ? <img src={src} alt={name ?? 'Photo'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Icon name={ICONS.document} size={28} style={{ color: '#78716C' }} />}
      </button>
      {tag && <span style={{ position: 'absolute', left: 4, bottom: 4, fontSize: 10, fontWeight: 700, background: 'rgba(28,25,23,0.78)', color: '#fff', padding: '2px 6px', borderRadius: 6 }}>{tag}</span>}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Remove" title="Remove"
          style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      )}
    </div>
  )
}

// ── Data hooks ───────────────────────────────────────────────────────────────

/**
 * Loads data and keeps it fresh: re-fetches every `intervalMs`, when the tab regains
 * focus, and whenever `deps` change. The interval is what makes compliance status etc.
 * update "live" across modules without a manual refresh.
 */
export function useLive<T>(load: () => Promise<T>, deps: unknown[], intervalMs = 20000) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loadRef = useRef(load)
  loadRef.current = load
  const seq = useRef(0)

  const refresh = React.useCallback(async (silent = false) => {
    const mine = ++seq.current
    if (!silent) setLoading(true)
    try {
      const d = await loadRef.current()
      if (mine === seq.current) { setData(d); setError(null) }
    } catch (e: any) {
      if (mine === seq.current && !silent) setError(e.message || 'Could not load')
    } finally {
      if (mine === seq.current && !silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    setData(null)
    void refresh()
    const t = intervalMs > 0 ? setInterval(() => { if (!document.hidden) void refresh(true) }, intervalMs) : null
    const onVis = () => { if (!document.hidden) void refresh(true) }
    document.addEventListener('visibilitychange', onVis)
    return () => { if (t) clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, refresh }
}

/** Global CSS the module screens rely on (spinner, card hover). Render once per layout. */
export function CfsGlobalStyles() {
  return (
    <style>{`
      .cfs-spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.45); border-top-color: currentColor; display: inline-block; animation: cfsSpin 0.7s linear infinite; }
      .cfs-spin.dark { border-color: rgba(0,0,0,0.15); border-top-color: #57534E; width: 18px; height: 18px; }
      @keyframes cfsSpin { to { transform: rotate(360deg); } }
      .cfs-card-hover { transition: border-color 0.15s ease; cursor: pointer; }
      .cfs-card-hover:hover { border-color: rgba(var(--brand-rgb),0.45); }
      .cfs-card-hover:focus-visible { outline: 2px solid var(--brand-color); outline-offset: 2px; }
      @media print { .cfs-no-print { display: none !important; } }
    `}</style>
  )
}
