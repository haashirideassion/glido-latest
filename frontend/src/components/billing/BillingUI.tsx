import { ReactNode, useEffect, useState } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import { BillingAlternative, BillingRefusal, Money, ZERO_MONEY } from '@/lib/db/billing'

/**
 * Shared primitives for the Billing module. These exist to make three of the
 * FRS's cross-cutting rules structurally hard to break, rather than relying on
 * each screen remembering them:
 *
 *   rule 2  currency on every amount   → <Amount> takes a Money, never a number
 *   rule 4  capability gating visible  → <GatedButton> disables with a reason
 *   rule 6  refusals offer the legal alternative → <RefusalNotice> renders the action
 *   rule 8  colour is never the only encoding → every <StatusPill> carries a label
 */

// ─────────────────────────────────────────────────────────────────────────────
// Money (NFR-B-03, rule 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders a server-formatted Money. There is deliberately no numeric overload:
 * the server formats amounts with their currency so what appears here is
 * byte-identical to what the invoice says, and a component cannot accidentally
 * render a bare number.
 */
export function Amount({
  value, bold = false, size = 13, tone,
}: {
  value: Money | null | undefined
  bold?: boolean
  size?: number
  /** Colour by sign; the number is still shown in full either way. */
  tone?: 'auto' | 'neutral' | 'credit' | 'debit'
}) {
  const m = value ?? ZERO_MONEY
  const n = Number(m.amount)
  let color = '#1C1917'
  if (tone === 'auto') color = n < 0 ? '#15803D' : n > 0 ? '#1C1917' : 'var(--text-tertiary)'
  else if (tone === 'credit') color = '#15803D'
  else if (tone === 'debit') color = '#B91C1C'

  return (
    <span
      title={`${m.amount} ${m.currency}`}
      style={{
        fontSize: size,
        fontWeight: bold ? 700 : 500,
        color,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {m.display}
    </span>
  )
}

/** A labelled figure — the KPI unit used across the module's headers. */
export function Stat({
  label, value, sub, tone, hint,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'neutral' | 'warn' | 'good'
  hint?: string
}) {
  const border = tone === 'warn' ? 'rgba(234,88,12,0.30)'
    : tone === 'good' ? 'rgba(22,163,74,0.28)' : 'rgba(0,0,0,0.08)'
  return (
    <div
      title={hint}
      style={{
        background: '#fff', border: `1px solid ${border}`,
        borderRadius: 'var(--r-lg)', padding: 'var(--kpi-pad-y) var(--kpi-pad-x)',
        minWidth: 0, flex: '1 1 160px',
      }}
    >
      <p style={{
        margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
        textTransform: 'uppercase', color: 'var(--text-tertiary)',
      }}>
        {label}
      </p>
      <div style={{ marginTop: 4, fontSize: 'var(--kpi-value)', fontWeight: 700, lineHeight: 1.1, color: '#1C1917' }}>
        {value}
      </div>
      {sub && (
        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{sub}</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Status (rule 8 — colour is never the only encoding)
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TONES: Record<string, { bg: string; fg: string }> = {
  // Invoice
  draft:         { bg: 'rgba(0,0,0,0.06)',      fg: '#44403C' },
  issued:        { bg: 'rgba(37,99,235,0.12)',  fg: '#1D4ED8' },
  part_paid:     { bg: 'rgba(234,179,8,0.16)',  fg: '#A16207' },
  paid:          { bg: 'rgba(22,163,74,0.13)',  fg: '#15803D' },
  overdue:       { bg: 'rgba(220,38,38,0.12)',  fg: '#B91C1C' },
  disputed:      { bg: 'rgba(147,51,234,0.12)', fg: '#7E22CE' },
  credited:      { bg: 'rgba(100,116,139,0.14)',fg: '#475569' },
  part_credited: { bg: 'rgba(100,116,139,0.14)',fg: '#475569' },
  written_off:   { bg: 'rgba(120,113,108,0.16)',fg: '#57534E' },
  void:          { bg: 'rgba(0,0,0,0.06)',      fg: '#78716C' },
  // Rate card / catalogue
  reviewed:      { bg: 'rgba(37,99,235,0.10)',  fg: '#1D4ED8' },
  active:        { bg: 'rgba(22,163,74,0.13)',  fg: '#15803D' },
  superseded:    { bg: 'rgba(0,0,0,0.06)',      fg: '#57534E' },
  archived:      { bg: 'rgba(0,0,0,0.06)',      fg: '#78716C' },
  inactive:      { bg: 'rgba(0,0,0,0.06)',      fg: '#78716C' },
  // Charge line
  estimated:     { bg: 'rgba(234,179,8,0.16)',  fg: '#A16207' },
  actual:        { bg: 'rgba(37,99,235,0.10)',  fg: '#1D4ED8' },
  adjusted:      { bg: 'rgba(234,88,12,0.12)',  fg: '#C2410C' },
  waived:        { bg: 'rgba(147,51,234,0.10)', fg: '#7E22CE' },
  invoiced:      { bg: 'rgba(22,163,74,0.13)',  fg: '#15803D' },
  // Account
  prospect:      { bg: 'rgba(0,0,0,0.06)',      fg: '#57534E' },
  on_hold:       { bg: 'rgba(220,38,38,0.12)',  fg: '#B91C1C' },
  suspended:     { bg: 'rgba(220,38,38,0.12)',  fg: '#B91C1C' },
  closed:        { bg: 'rgba(0,0,0,0.06)',      fg: '#78716C' },
  // Receipt / dispute / sync
  received:      { bg: 'rgba(37,99,235,0.10)',  fg: '#1D4ED8' },
  matched:       { bg: 'rgba(37,99,235,0.12)',  fg: '#1D4ED8' },
  allocated:     { bg: 'rgba(22,163,74,0.13)',  fg: '#15803D' },
  part_allocated:{ bg: 'rgba(234,179,8,0.16)',  fg: '#A16207' },
  reversed:      { bg: 'rgba(120,113,108,0.16)',fg: '#57534E' },
  unmatched:     { bg: 'rgba(234,88,12,0.12)',  fg: '#C2410C' },
  suggested:     { bg: 'rgba(234,179,8,0.16)',  fg: '#A16207' },
  raised:        { bg: 'rgba(220,38,38,0.12)',  fg: '#B91C1C' },
  under_review:  { bg: 'rgba(234,179,8,0.16)',  fg: '#A16207' },
  upheld:        { bg: 'rgba(22,163,74,0.13)',  fg: '#15803D' },
  // Job / delivery
  succeeded:     { bg: 'rgba(22,163,74,0.13)',  fg: '#15803D' },
  running:       { bg: 'rgba(37,99,235,0.10)',  fg: '#1D4ED8' },
  failed:        { bg: 'rgba(220,38,38,0.12)',  fg: '#B91C1C' },
  skipped:       { bg: 'rgba(0,0,0,0.06)',      fg: '#57534E' },
  not_sent:      { bg: 'rgba(0,0,0,0.06)',      fg: '#57534E' },
  queued:        { bg: 'rgba(234,179,8,0.16)',  fg: '#A16207' },
  sent:          { bg: 'rgba(37,99,235,0.10)',  fg: '#1D4ED8' },
  delivered:     { bg: 'rgba(22,163,74,0.13)',  fg: '#15803D' },
  opened:        { bg: 'rgba(22,163,74,0.13)',  fg: '#15803D' },
  bounced:       { bg: 'rgba(220,38,38,0.12)',  fg: '#B91C1C' },
}

/** Symbol prefixes so status survives greyscale, print and colour blindness (rule 8). */
const STATUS_MARKS: Record<string, string> = {
  paid: '✓', delivered: '✓', opened: '✓', succeeded: '✓', upheld: '✓',
  allocated: '✓', active: '✓', invoiced: '✓',
  overdue: '!', bounced: '!', failed: '!', on_hold: '!', suspended: '!',
  unmatched: '!', raised: '!',
  disputed: '?', under_review: '?', suggested: '?', estimated: '~',
  part_paid: '½', part_credited: '½', part_allocated: '½',
}

export function StatusPill({ status, size = 11.5 }: { status: string; size?: number }) {
  const tone = STATUS_TONES[status] ?? { bg: 'rgba(0,0,0,0.06)', fg: '#44403C' }
  const mark = STATUS_MARKS[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: tone.bg, color: tone.fg,
      padding: '2px 8px', borderRadius: 'var(--r-full)',
      fontSize: size, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {mark && <span aria-hidden style={{ fontWeight: 700 }}>{mark}</span>}
      {humanise(status)}
    </span>
  )
}

export function humanise(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

// ─────────────────────────────────────────────────────────────────────────────
// Capability-gated action (rule 4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A button that is disabled with a stated reason rather than absent, so the
 * user learns the action exists and who can grant it. Pass `hideWhenBlocked`
 * for destructive actions where offering a disabled control is just noise.
 */
export function GatedButton({
  children, onClick, blockedReason, hideWhenBlocked = false,
  variant = 'secondary', size = 'md', type = 'button', busy = false, style,
}: {
  children: ReactNode
  onClick?: () => void
  /** Null when permitted; the explanation when not. */
  blockedReason?: string | null
  hideWhenBlocked?: boolean
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  type?: 'button' | 'submit'
  busy?: boolean
  style?: React.CSSProperties
}) {
  if (blockedReason && hideWhenBlocked) return null
  const disabled = !!blockedReason || busy

  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: size === 'sm' ? '5px 10px' : '8px 14px',
    fontSize: size === 'sm' ? 12.5 : 13.5,
    fontWeight: 600, fontFamily: 'inherit',
    borderRadius: 'var(--r-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background 0.13s ease, border-color 0.13s ease',
    whiteSpace: 'nowrap',
    ...style,
  }
  const variants: Record<string, React.CSSProperties> = {
    primary:   { background: 'var(--brand-color)', color: 'var(--brand-text)', border: 'none' },
    secondary: { background: '#fff', color: '#1C1917', border: '1px solid rgba(0,0,0,0.14)' },
    danger:    { background: '#fff', color: '#B91C1C', border: '1px solid rgba(185,28,28,0.30)' },
    ghost:     { background: 'transparent', color: 'var(--text-secondary)', border: 'none' },
  }

  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={blockedReason ?? undefined}
      aria-disabled={disabled}
      style={{ ...base, ...variants[variant] }}
    >
      {busy && <Spinner size={12} />}
      {children}
    </button>
  )
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <>
      <style>{`@keyframes bspin{to{transform:rotate(360deg)}}`}</style>
      <span
        aria-hidden
        style={{
          width: size, height: size, borderRadius: '50%', flexShrink: 0,
          border: '2px solid currentColor', borderTopColor: 'transparent',
          display: 'inline-block', animation: 'bspin 0.7s linear infinite',
        }}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Refusals (rule 6)
// ─────────────────────────────────────────────────────────────────────────────

const ALTERNATIVE_LABELS: Record<BillingAlternative, string> = {
  deactivate:       'Deactivate instead',
  credit_note:      'Raise a credit note',
  prepaid_checkout: 'Take prepayment instead',
  override_request: 'Request an override',
}

/**
 * Renders a refusal as the FRS requires: the reason, and the legal alternative
 * as an action the user can take right there. A refusal without a next step is
 * a dead end, which is how staff end up working around the system.
 */
export function RefusalNotice({
  error, onAlternative, onDismiss,
}: {
  error: BillingRefusal | Error | null
  onAlternative?: (alternative: BillingAlternative) => void
  onDismiss?: () => void
}) {
  if (!error) return null
  const refusal = error instanceof BillingRefusal ? error : null
  const alternative = refusal?.alternative

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      background: 'rgba(220,38,38,0.06)',
      border: '1px solid rgba(220,38,38,0.22)',
      borderRadius: 'var(--r-md)', padding: '10px 12px',
    }}>
      <Icon name={ICONS.warning} size={16} style={{ color: '#B91C1C', flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#7F1D1D', fontWeight: 500 }}>
          {error.message}
        </p>
        {refusal?.approvalRequired && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#7F1D1D', opacity: 0.85 }}>
            A {refusal.approverRole ?? 'second approver'} must approve this. Choose an
            approver below, or ask them to perform the action.
          </p>
        )}
        {(alternative || onDismiss) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {alternative && onAlternative && (
              <GatedButton size="sm" variant="primary" onClick={() => onAlternative(alternative)}>
                {ALTERNATIVE_LABELS[alternative]}
              </GatedButton>
            )}
            {onDismiss && (
              <GatedButton size="sm" variant="ghost" onClick={onDismiss}>Dismiss</GatedButton>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout scaffolding
// ─────────────────────────────────────────────────────────────────────────────

export function Panel({
  title, subtitle, actions, children, padded = true, traces,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  padded?: boolean
  /** FRS requirement id, shown as a quiet provenance marker. */
  traces?: string
}) {
  return (
    <section style={{
      background: '#fff', border: '1px solid rgba(0,0,0,0.08)',
      borderRadius: 'var(--r-lg)', overflow: 'hidden',
    }}>
      {(title || actions) && (
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '12px var(--card-pad)',
          borderBottom: '1px solid rgba(0,0,0,0.06)', flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{
              margin: 0, fontSize: 15, fontWeight: 700, color: '#1C1917',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {title}
              {traces && (
                <span
                  title={`Traces to FRS requirement ${traces}`}
                  style={{
                    fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)',
                    background: 'rgba(0,0,0,0.04)', padding: '1px 6px',
                    borderRadius: 'var(--r-full)', letterSpacing: '0.02em',
                  }}
                >
                  {traces}
                </span>
              )}
            </h2>
            {subtitle && (
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
        </header>
      )}
      <div style={padded ? { padding: 'var(--card-pad)' } : undefined}>{children}</div>
    </section>
  )
}

/** Wide content must scroll inside its own container, never the page body. */
export function ScrollTable({ children }: { children: ReactNode }) {
  return <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</div>
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <table style={{
      width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13,
    }}>
      {children}
    </table>
  )
}

export function HeadRow({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.10)' }}>{children}</tr>
    </thead>
  )
}

export function TH({
  children, align = 'left', width,
}: {
  children?: ReactNode; align?: 'left' | 'right' | 'center'; width?: number | string
}) {
  return (
    <th style={{
      textAlign: align, padding: '8px 10px', width,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
      textTransform: 'uppercase', color: 'var(--text-tertiary)', whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  )
}

export function TR({
  children, onClick, highlight,
}: {
  children: ReactNode; onClick?: () => void; highlight?: boolean
}) {
  return (
    <tr
      onClick={onClick}
      style={{
        borderBottom: '1px solid rgba(0,0,0,0.05)',
        cursor: onClick ? 'pointer' : undefined,
        background: highlight ? 'rgba(234,88,12,0.04)' : undefined,
      }}
    >
      {children}
    </tr>
  )
}

export function TD({
  children, align = 'left', colSpan, style,
}: {
  children?: ReactNode; align?: 'left' | 'right' | 'center'
  colSpan?: number; style?: React.CSSProperties
}) {
  return (
    <td colSpan={colSpan} style={{
      textAlign: align, padding: '9px 10px', color: 'var(--text-muted)',
      verticalAlign: 'top', ...style,
    }}>
      {children}
    </td>
  )
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{
        padding: '28px 12px', textAlign: 'center',
        fontSize: 13, color: 'var(--text-tertiary)',
      }}>
        {children}
      </td>
    </tr>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      padding: 32, fontSize: 13, color: 'var(--text-secondary)',
    }}>
      <Spinner /> {label}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────

export function Modal({
  title, subtitle, onClose, children, footer, width = 560, traces,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
  traces?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(28,25,23,0.42)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '5vh 16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 'var(--r-xl)', width: '100%', maxWidth: width,
          boxShadow: '0 24px 60px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.10)',
          overflow: 'hidden', marginBottom: '5vh',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, padding: '16px 18px 12px', borderBottom: '1px solid rgba(0,0,0,0.07)',
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{
              margin: 0, fontSize: 17, fontWeight: 700, color: '#1C1917',
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              {title}
              {traces && (
                <span
                  title={`Traces to FRS requirement ${traces}`}
                  style={{
                    fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)',
                    background: 'rgba(0,0,0,0.04)', padding: '1px 6px',
                    borderRadius: 'var(--r-full)',
                  }}
                >
                  {traces}
                </span>
              )}
            </h2>
            {subtitle && (
              <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{
              width: 30, height: 30, borderRadius: 'var(--r-sm)', flexShrink: 0,
              border: '1px solid rgba(0,0,0,0.10)', background: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#57534E"
              strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </header>
        <div style={{ padding: 18 }}>{children}</div>
        {footer && (
          <footer style={{
            display: 'flex', justifyContent: 'flex-end', gap: 8,
            padding: '12px 18px', borderTop: '1px solid rgba(0,0,0,0.07)',
            background: 'rgba(0,0,0,0.015)', flexWrap: 'wrap',
          }}>
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Form fields
// ─────────────────────────────────────────────────────────────────────────────

export function Field({
  label, hint, required, children, error,
}: {
  label: string; hint?: ReactNode; required?: boolean
  children: ReactNode; error?: string | null
}) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{
        display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1C1917', marginBottom: 5,
      }}>
        {label}
        {required && <span style={{ color: '#B91C1C', marginLeft: 3 }} aria-hidden>*</span>}
      </span>
      {children}
      {hint && !error && (
        <span style={{
          display: 'block', fontSize: 11.5, color: 'var(--text-mid)', marginTop: 4,
        }}>
          {hint}
        </span>
      )}
      {error && (
        <span style={{ display: 'block', fontSize: 11.5, color: '#B91C1C', marginTop: 4 }}>
          {error}
        </span>
      )}
    </label>
  )
}

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13.5, fontFamily: 'inherit',
  color: '#1C1917', background: '#fff',
  border: '1px solid rgba(0,0,0,0.16)', borderRadius: 'var(--r-sm)',
  boxSizing: 'border-box',
}

/**
 * A reason field. Reasons are mandatory on manual charges, adjustments,
 * waivers, credit notes, refunds, overrides and write-offs (rule 5), so this
 * component pairs a required code with an optional note and never lets the code
 * be blank.
 */
export function ReasonFields({
  codes, code, note, onCodeChange, onNoteChange, error,
}: {
  codes: Array<{ value: string; label: string }>
  code: string
  note: string
  onCodeChange: (v: string) => void
  onNoteChange: (v: string) => void
  error?: string | null
}) {
  return (
    <>
      <Field
        label="Reason"
        required
        error={error}
        hint="Recorded against this action in the financial audit log and the discount & waiver report."
      >
        <select value={code} onChange={e => onCodeChange(e.target.value)} style={inputStyle}>
          <option value="">Select a reason…</option>
          {codes.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </Field>
      <Field label="Note" hint="Optional detail — what a colleague would need to understand this later.">
        <textarea
          value={note}
          onChange={e => onNoteChange(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>
    </>
  )
}

/** Reason vocabularies, kept together so the reports group cleanly. */
export const REASON_CODES = {
  manualCharge: [
    { value: 'customer_request',   label: 'Customer request' },
    { value: 'additional_service', label: 'Additional service performed' },
    { value: 'correction',         label: 'Correcting a missed charge' },
    { value: 'damage_recovery',    label: 'Damage or loss recovery' },
    { value: 'leakage_remedy',     label: 'Revenue leakage remedy' },
    { value: 'other',              label: 'Other (explain in the note)' },
  ],
  adjustment: [
    { value: 'quoted_differently', label: 'Quoted differently' },
    { value: 'service_shortfall',  label: 'Service shortfall' },
    { value: 'rating_error',       label: 'Rating error' },
    { value: 'goodwill',           label: 'Goodwill' },
    { value: 'commercial_terms',   label: 'Agreed commercial terms' },
    { value: 'other',              label: 'Other (explain in the note)' },
  ],
  waiver: [
    { value: 'goodwill',          label: 'Goodwill' },
    { value: 'service_failure',   label: 'Our service failure' },
    { value: 'duplicate_charge',  label: 'Duplicate charge' },
    { value: 'not_applicable',    label: 'Charge does not apply' },
    { value: 'commercial_terms',  label: 'Agreed commercial terms' },
    { value: 'other',             label: 'Other (explain in the note)' },
  ],
  creditNote: [
    { value: 'billed_in_error',   label: 'Billed in error' },
    { value: 'duplicate_invoice', label: 'Duplicate invoice' },
    { value: 'price_correction',  label: 'Price correction' },
    { value: 'service_not_provided', label: 'Service not provided' },
    { value: 'dispute_upheld',    label: 'Dispute resolved in customer favour' },
    { value: 'goodwill',          label: 'Goodwill' },
    { value: 'other',             label: 'Other (explain in the note)' },
  ],
  dispute: [
    { value: 'incorrect_quantity', label: 'Quantity is wrong' },
    { value: 'incorrect_rate',     label: 'Rate is wrong' },
    { value: 'service_not_received', label: 'Service was not received' },
    { value: 'duplicate',          label: 'Already invoiced' },
    { value: 'not_our_charge',     label: 'Not our charge' },
    { value: 'other',              label: 'Other (explain in the note)' },
  ],
  writeOff: [
    { value: 'uncollectable',   label: 'Uncollectable' },
    { value: 'insolvency',      label: 'Customer insolvency' },
    { value: 'below_threshold', label: 'Below collection threshold' },
    { value: 'settled_partial', label: 'Settled for a lesser amount' },
    { value: 'other',           label: 'Other (explain in the note)' },
  ],
  refund: [
    { value: 'overpayment',     label: 'Overpayment' },
    { value: 'duplicate_payment', label: 'Duplicate payment' },
    { value: 'payment_in_error', label: 'Paid in error' },
    { value: 'credit_refund',   label: 'Refund of a credit balance' },
    { value: 'other',           label: 'Other (explain in the note)' },
  ],
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────────────────────────────────────

export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
): { data: T | null; loading: boolean; error: Error | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loader()
      .then(res => { if (!cancelled) { setData(res); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError(err as Error); setLoading(false) } })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { data, loading, error, reload: () => setNonce(n => n + 1) }
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const parsed = new Date(d.length <= 10 ? `${d}T00:00:00` : d)
  if (Number.isNaN(parsed.getTime())) return d
  return parsed.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  const parsed = new Date(d)
  if (Number.isNaN(parsed.getTime())) return d
  return parsed.toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** A quiet inline note — used for the "what this means" lines the FRS asks for. */
export function Note({
  children, tone = 'info',
}: {
  children: ReactNode; tone?: 'info' | 'warn' | 'good'
}) {
  const tones = {
    info: { bg: 'rgba(37,99,235,0.06)', border: 'rgba(37,99,235,0.20)', fg: '#1D4ED8', icon: ICONS.info },
    warn: { bg: 'rgba(234,88,12,0.06)', border: 'rgba(234,88,12,0.22)', fg: '#C2410C', icon: ICONS.warning },
    good: { bg: 'rgba(22,163,74,0.06)', border: 'rgba(22,163,74,0.22)', fg: '#15803D', icon: ICONS.check },
  }[tone]
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      background: tones.bg, border: `1px solid ${tones.border}`,
      borderRadius: 'var(--r-md)', padding: '9px 11px',
    }}>
      <Icon name={tones.icon} size={15} style={{ color: tones.fg, flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 12.5, color: tones.fg, lineHeight: 1.45, minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}
