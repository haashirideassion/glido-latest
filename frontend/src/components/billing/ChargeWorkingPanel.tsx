import { useState } from 'react'
import { ChargeWorking } from '@/lib/db/billing'

/**
 * "Show your working" (RT-11, X-03, cross-cutting rule 1).
 *
 * The FRS makes this global: *any* charge line, anywhere it appears, expands to
 * its inputs and formula in plain language. So this component is deliberately
 * generic and appears on the quote, the booking financials tab, the invoice, the
 * simulator and the dispute queue — the customer, the reception desk and the
 * auditor all read the same derivation.
 *
 * The engine emits `steps` already phrased for a person; the structured fields
 * (formula, freeAllowance, tierWalk, minimum) are rendered as callouts because
 * they are the four things customers actually argue about.
 */

interface Props {
  working: ChargeWorking | null | undefined
  /** Rendered inline (a table row's detail) or as a bordered card. */
  variant?: 'inline' | 'card'
  defaultOpen?: boolean
  /** Hide the toggle and always show — used inside a drawer that already opted in. */
  alwaysOpen?: boolean
}

export function ChargeWorkingPanel({
  working, variant = 'card', defaultOpen = false, alwaysOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen || alwaysOpen)

  if (!working) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
        No derivation was recorded for this line.
      </p>
    )
  }

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* The four things a customer disputes, surfaced before the step list. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {working.formula && (
          <Callout
            label="Chargeable quantity"
            value={`${working.formula.name} → ${trim(working.formula.result)}`}
            detail={working.formula.expression}
          />
        )}
        {working.freeAllowance && working.freeAllowance.consumed > 0 && (
          <Callout
            label="Free allowance applied"
            value={`${working.freeAllowance.consumed} of ${working.freeAllowance.granted} ${working.freeAllowance.unit}${working.freeAllowance.granted === 1 ? '' : 's'}`}
            detail={
              working.freeAllowance.remaining > 0
                ? `${working.freeAllowance.remaining} ${working.freeAllowance.unit}(s) still free`
                : 'Allowance fully consumed'
            }
            tone="credit"
          />
        )}
        {working.minimumQuantityApplied && (
          <Callout
            label="Minimum quantity applied"
            value={`raised to ${trim(working.minimumQuantityApplied.minimum)}`}
            detail={`Actual was ${trim(working.minimumQuantityApplied.raw)}`}
            tone="notice"
          />
        )}
        {working.minChargeApplied && (
          <Callout
            label="Minimum charge applied"
            value={working.minChargeApplied.minCharge}
            detail={`Calculated ${working.minChargeApplied.calculated}`}
            tone="notice"
          />
        )}
        {working.maxCapApplied && (
          <Callout
            label="Cap applied"
            value={working.maxCapApplied.maxCap}
            detail={`Calculated ${working.maxCapApplied.calculated}`}
            tone="credit"
          />
        )}
      </div>

      {/* The tier walk, which is unreadable as prose and fine as a table. */}
      {working.tierWalk && working.tierWalk.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                <Th>Tier</Th>
                <Th>Range</Th>
                <Th align="right">Units</Th>
                <Th align="right">Rate</Th>
                <Th align="right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {working.tierWalk.map(t => (
                <tr key={t.tierNo} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  <Td>{t.tierNo}</Td>
                  <Td>{t.toQty == null ? `over ${trim(t.fromQty)}` : `${trim(t.fromQty)}–${trim(t.toQty)}`}</Td>
                  <Td align="right">{trim(t.unitsInTier)}</Td>
                  <Td align="right" mono>{t.unitRate}</Td>
                  <Td align="right" mono>{t.amount}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* The narrative the engine produced, in order. */}
      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {working.steps.map((s, i) => (
          <li
            key={i}
            style={{
              display: 'flex', gap: 10, alignItems: 'baseline',
              padding: '6px 0',
              borderTop: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.05)',
            }}
          >
            <span style={{
              fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
              minWidth: 16, fontVariantNumeric: 'tabular-nums',
            }}>
              {i + 1}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1C1917' }}>
                {s.label}
              </span>
              {s.detail && (
                <span style={{
                  display: 'block', fontSize: 12, color: 'var(--text-secondary)',
                  marginTop: 1, wordBreak: 'break-word',
                }}>
                  {s.detail}
                </span>
              )}
            </span>
            {s.value && (
              <span style={{
                fontSize: 12.5, fontWeight: 600, color: '#1C1917',
                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
              }}>
                {s.value}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )

  if (alwaysOpen) {
    return variant === 'card' ? <Card>{body}</Card> : body
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontSize: 12, fontWeight: 600, color: 'var(--brand-color)',
          fontFamily: 'inherit',
        }}
        aria-expanded={open}
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        {open ? 'Hide working' : 'Show working'}
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          {variant === 'card' ? <Card>{body}</Card> : body}
        </div>
      )}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.015)',
      border: '1px solid rgba(0,0,0,0.07)',
      borderRadius: 'var(--r-md)',
      padding: 12,
    }}>
      {children}
    </div>
  )
}

const TONES = {
  neutral: { bg: 'rgba(0,0,0,0.04)',        fg: '#44403C' },
  credit:  { bg: 'rgba(22,163,74,0.10)',    fg: '#15803D' },
  notice:  { bg: 'rgba(234,88,12,0.10)',    fg: '#C2410C' },
} as const

function Callout({
  label, value, detail, tone = 'neutral',
}: {
  label: string; value: string; detail?: string; tone?: keyof typeof TONES
}) {
  const t = TONES[tone]
  return (
    <div
      title={detail}
      style={{
        background: t.bg, borderRadius: 'var(--r-sm)', padding: '6px 10px',
        minWidth: 0, maxWidth: '100%',
      }}
    >
      <span style={{
        display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em',
        textTransform: 'uppercase', color: t.fg, opacity: 0.85,
      }}>
        {label}
      </span>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: t.fg }}>
        {value}
      </span>
      {detail && (
        <span style={{
          display: 'block', fontSize: 11, color: t.fg, opacity: 0.8,
          marginTop: 1, wordBreak: 'break-word',
        }}>
          {detail}
        </span>
      )}
    </div>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{
      textAlign: align, padding: '4px 8px', fontSize: 10.5, fontWeight: 700,
      letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--text-tertiary)',
    }}>
      {children}
    </th>
  )
}

function Td({
  children, align = 'left', mono = false,
}: {
  children: React.ReactNode; align?: 'left' | 'right'; mono?: boolean
}) {
  return (
    <td style={{
      textAlign: align, padding: '5px 8px', fontSize: 12, color: 'var(--text-muted)',
      fontVariantNumeric: mono ? 'tabular-nums' : undefined,
    }}>
      {children}
    </td>
  )
}

function trim(n: number): string {
  return String(Number(n.toFixed(4)))
}
