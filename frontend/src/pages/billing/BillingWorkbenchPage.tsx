import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { usePageTitle } from '@/lib/usePageTitle'
import {
  PreflightCase, WorkbenchRow, createInvoice, executeBillingRun,
  getWorkbench, runPreflight,
} from '@/lib/db/billing'
import { useBillingCapabilities, reasonFor } from '@/lib/useBillingCapabilities'
import {
  Amount, DataTable, EmptyRow, GatedButton, HeadRow, Loading, Modal, Note, Panel,
  RefusalNotice, ScrollTable, Stat, StatusPill, TD, TH, TR, formatDate, humanise, useAsync,
} from '@/components/billing/BillingUI'

/**
 * B-01 Billing workbench → B-02 pre-flight → B-03 run (IN-01, IN-13, IN-02).
 *
 * The FRS's phrase for B-02 is "nothing issues blind", and the distinction it
 * draws is the whole design of this screen: a *blocking* case cannot be waved
 * through, an *acknowledgeable* one can but must be ticked by a named person.
 */
export default function BillingWorkbenchPage() {
  usePageTitle('Billing Workbench')
  const { caps } = useBillingCapabilities()
  const wb = useAsync(() => getWorkbench(), [])
  const [runOpen, setRunOpen] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [busyBooking, setBusyBooking] = useState<string | null>(null)

  const rows = wb.data?.rows ?? []
  const withExceptions = rows.filter(r => r.exceptions.length > 0)
  const oldest = rows.reduce((m, r) => Math.max(m, r.ageDays), 0)

  /** Single-booking invoice — the B-06 draft path for one account. */
  async function invoiceOne(row: WorkbenchRow) {
    if (!row.accountId) {
      toast.error('No billing account', {
        description: 'This is a guest booking and is settled at checkout, not invoiced.',
      })
      return
    }
    setBusyBooking(row.bookingId)
    setError(null)
    try {
      const res = await createInvoice({
        accountId: row.accountId,
        bookingIds: [row.bookingId],
        issue: true,
      })
      toast.success(`Invoice ${res.invoiceNumber} issued`, {
        description: `${row.accountName} · due ${res.dueDate}`,
      })
      wb.reload()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusyBooking(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--card-gap)' }}>
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
        <Stat
          label="Awaiting invoice"
          value={wb.data?.totals.bookings ?? 0}
          sub="completed bookings with un-invoiced charges"
        />
        <Stat
          label="Value unbilled"
          value={<Amount value={wb.data?.totals.value} size={26} bold />}
          sub="at current charge lines"
        />
        <Stat
          label="Oldest"
          value={`${oldest} day${oldest === 1 ? '' : 's'}`}
          sub="since the first charge was raised"
          tone={oldest > 14 ? 'warn' : 'neutral'}
        />
        <Stat
          label="With exceptions"
          value={withExceptions.length}
          sub="need a look before they issue"
          tone={withExceptions.length > 0 ? 'warn' : 'good'}
        />
      </div>

      <Panel
        title="Unbilled queue"
        subtitle="Completed bookings with charges that have not reached an invoice"
        traces="IN-01"
        padded={false}
        actions={
          <GatedButton
            variant="primary"
            onClick={() => setRunOpen(true)}
            blockedReason={reasonFor(caps, 'can_run_billing')}
          >
            Run billing cycle
          </GatedButton>
        }
      >
        {wb.loading ? (
          <Loading label="Loading the unbilled queue…" />
        ) : (
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH>Booking</TH>
                <TH>Account</TH>
                <TH>Cycle</TH>
                <TH align="right">Lines</TH>
                <TH align="right">Unbilled</TH>
                <TH align="right">Age</TH>
                <TH>Exceptions</TH>
                <TH />
              </HeadRow>
              <tbody>
                {!rows.length && (
                  <EmptyRow colSpan={8}>
                    Nothing waiting to be invoiced. Every completed booking with charges has
                    reached an invoice.
                  </EmptyRow>
                )}
                {rows.map(r => (
                  <TR key={r.bookingId} highlight={r.exceptions.length > 0}>
                    <TD>
                      <Link
                        to={`/reception/bookings/${r.bookingId}`}
                        style={{ fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none' }}
                      >
                        {r.reference}
                      </Link>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                        {formatDate(r.slotDate)}
                      </span>
                    </TD>
                    <TD>
                      {r.accountId ? (
                        <Link
                          to={`/billing/receivables/accounts/${r.accountId}`}
                          style={{ color: '#1C1917', textDecoration: 'none', fontWeight: 500 }}
                        >
                          {r.accountName}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>{r.accountName}</span>
                      )}
                      {r.accountCode && (
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                          {r.accountCode}
                        </span>
                      )}
                    </TD>
                    <TD>{humanise(r.invoiceCycle)}</TD>
                    <TD align="right">{r.lineCount}</TD>
                    <TD align="right"><Amount value={r.unbilledTotal} bold /></TD>
                    <TD align="right">
                      <span style={{ color: r.ageDays > 14 ? '#B91C1C' : undefined }}>
                        {r.ageDays}d
                      </span>
                    </TD>
                    <TD>
                      {!r.exceptions.length ? (
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 14, fontSize: 12 }}>
                          {r.exceptions.map((e, i) => (
                            <li key={i} style={{ color: '#C2410C', lineHeight: 1.4 }}>{e}</li>
                          ))}
                        </ul>
                      )}
                    </TD>
                    <TD align="right">
                      <GatedButton
                        size="sm"
                        onClick={() => invoiceOne(r)}
                        busy={busyBooking === r.bookingId}
                        blockedReason={
                          reasonFor(caps, 'can_issue_invoice')
                          ?? (!r.accountId
                            ? 'This booking has no billing account — it settles at checkout rather than on an invoice.'
                            : Number(r.unbilledTotal.amount) <= 0
                              ? 'Nothing to invoice: the charge total is zero or negative.'
                              : null)
                        }
                      >
                        Invoice
                      </GatedButton>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          </ScrollTable>
        )}
      </Panel>

      {runOpen && (
        <BillingRunModal
          onClose={() => setRunOpen(false)}
          onDone={() => { setRunOpen(false); wb.reload() }}
        />
      )}
    </div>
  )
}

/**
 * B-02 → B-03. Pre-flight first, always; the run button does not exist until
 * the report has been produced and every acknowledgeable case ticked.
 */
function BillingRunModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [scope, setScope] = useState({ periodStart: '', periodEnd: '', cycle: 'all' })
  const [preflight, setPreflight] = useState<{
    runId: string
    canProceed: boolean
    cases: PreflightCase[]
    summary: any
  } | null>(null)
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set())
  const [issue, setIssue] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [result, setResult] = useState<any | null>(null)

  const blocking = preflight?.cases.filter(c => c.severity === 'block') ?? []
  const ackable = preflight?.cases.filter(c => c.severity === 'acknowledge') ?? []
  const allAcked = ackable.every(c => acknowledged.has(c.code))

  async function doPreflight() {
    setBusy(true); setError(null); setResult(null)
    try {
      const res = await runPreflight({
        periodStart: scope.periodStart || undefined,
        periodEnd: scope.periodEnd || undefined,
        cycle: scope.cycle,
      })
      setPreflight(res)
      setAcknowledged(new Set())
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  async function doRun() {
    if (!preflight) return
    setBusy(true); setError(null)
    try {
      const res = await executeBillingRun({
        runId: preflight.runId,
        acknowledgedCases: [...acknowledged],
        issue,
      })
      setResult(res)
      if (!res.failed) {
        toast.success(`${res.created} invoice${res.created === 1 ? '' : 's'} created`)
      } else {
        toast.warning(`${res.created} created, ${res.failed} failed`)
      }
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={result ? 'Billing run complete' : 'Billing run'}
      subtitle={
        result ? 'Per-invoice outcome below. Failures can be re-driven by running again.'
          : 'Choose a scope, run the pre-flight checks, then execute.'
      }
      traces="IN-13"
      width={720}
      onClose={result ? onDone : onClose}
      footer={
        result ? (
          <GatedButton variant="primary" onClick={onDone}>Done</GatedButton>
        ) : (
          <>
            <GatedButton variant="ghost" onClick={onClose}>Cancel</GatedButton>
            {!preflight ? (
              <GatedButton variant="primary" onClick={doPreflight} busy={busy}>
                Run pre-flight
              </GatedButton>
            ) : (
              <>
                <GatedButton onClick={doPreflight} busy={busy}>Re-check</GatedButton>
                <GatedButton
                  variant="primary"
                  onClick={doRun}
                  busy={busy}
                  blockedReason={
                    blocking.length
                      ? `${blocking.length} blocking case(s) must be fixed first — these cannot be acknowledged away.`
                      : !allAcked
                        ? 'Acknowledge every case above before the run can proceed.'
                        : preflight.summary.bookings === 0
                          ? 'Nothing in scope to invoice.'
                          : null
                  }
                >
                  {issue ? 'Create and issue' : 'Create drafts'}
                </GatedButton>
              </>
            )}
          </>
        )
      }
    >
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      {result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
            <Stat label="Created" value={result.created} tone="good" />
            <Stat label="Failed" value={result.failed} tone={result.failed ? 'warn' : 'neutral'} />
          </div>
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH>Account</TH>
                <TH>Invoice</TH>
                <TH align="right">Total</TH>
                <TH>Outcome</TH>
              </HeadRow>
              <tbody>
                {result.outcomes.map((o: any, i: number) => (
                  <TR key={i}>
                    <TD>{o.accountName}</TD>
                    <TD>
                      {o.invoiceId ? (
                        <Link to={`/billing/invoices/${o.invoiceId}`} style={{
                          color: 'var(--brand-color)', fontWeight: 600, textDecoration: 'none',
                        }}>
                          {o.invoiceNumber ?? 'Draft'}
                        </Link>
                      ) : '—'}
                    </TD>
                    <TD align="right">{o.total ? <Amount value={o.total} /> : '—'}</TD>
                    <TD>
                      {o.ok
                        ? <StatusPill status="succeeded" />
                        : <span style={{ fontSize: 12, color: '#B91C1C' }}>{o.error}</span>}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          </ScrollTable>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ flex: '1 1 140px' }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5 }}>
                Period from
              </span>
              <input
                type="date" value={scope.periodStart}
                onChange={e => { setScope(s => ({ ...s, periodStart: e.target.value })); setPreflight(null) }}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13.5, fontFamily: 'inherit',
                  border: '1px solid rgba(0,0,0,0.16)', borderRadius: 'var(--r-sm)',
                  boxSizing: 'border-box',
                }}
              />
            </label>
            <label style={{ flex: '1 1 140px' }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5 }}>
                Period to
              </span>
              <input
                type="date" value={scope.periodEnd}
                onChange={e => { setScope(s => ({ ...s, periodEnd: e.target.value })); setPreflight(null) }}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13.5, fontFamily: 'inherit',
                  border: '1px solid rgba(0,0,0,0.16)', borderRadius: 'var(--r-sm)',
                  boxSizing: 'border-box',
                }}
              />
            </label>
            <label style={{ flex: '1 1 140px' }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 5 }}>
                Invoice cycle
              </span>
              <select
                value={scope.cycle}
                onChange={e => { setScope(s => ({ ...s, cycle: e.target.value })); setPreflight(null) }}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13.5, fontFamily: 'inherit',
                  border: '1px solid rgba(0,0,0,0.16)', borderRadius: 'var(--r-sm)',
                  boxSizing: 'border-box',
                }}
              >
                <option value="all">All cycles</option>
                <option value="per_booking">Per booking</option>
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
          </div>

          {!preflight ? (
            <Note>
              The pre-flight report lists every case that could make an invoice wrong — no
              charges, zero value, a negative total, storage still accruing, or a service with
              no revenue account. Nothing issues until it has run.
            </Note>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
                <Stat label="Bookings in scope" value={preflight.summary.bookings} />
                <Stat label="Accounts" value={preflight.summary.accounts} />
                <Stat
                  label="Value"
                  value={<Amount value={preflight.summary.value} size={22} bold />}
                />
              </div>

              {!preflight.cases.length ? (
                <Note tone="good">
                  Pre-flight is clear. Nothing needs acknowledging.
                </Note>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {preflight.cases.map(c => (
                    <div key={c.code} style={{
                      border: `1px solid ${c.severity === 'block' ? 'rgba(220,38,38,0.28)' : 'rgba(234,88,12,0.24)'}`,
                      background: c.severity === 'block' ? 'rgba(220,38,38,0.04)' : 'rgba(234,88,12,0.04)',
                      borderRadius: 'var(--r-md)', padding: '10px 12px',
                    }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        gap: 10, alignItems: 'flex-start',
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{
                            margin: 0, fontSize: 13, fontWeight: 700,
                            color: c.severity === 'block' ? '#7F1D1D' : '#7C2D12',
                          }}>
                            {c.label}
                            <span style={{
                              marginLeft: 8, fontSize: 10.5, fontWeight: 700,
                              letterSpacing: '0.04em', textTransform: 'uppercase',
                              background: 'rgba(0,0,0,0.07)', padding: '1px 6px',
                              borderRadius: 'var(--r-full)',
                            }}>
                              {c.severity === 'block' ? 'Blocks the run' : 'Acknowledge to proceed'}
                            </span>
                          </p>
                          <p style={{
                            margin: '3px 0 0', fontSize: 12.5, lineHeight: 1.45,
                            color: c.severity === 'block' ? '#7F1D1D' : '#7C2D12', opacity: 0.9,
                          }}>
                            {c.explanation}
                          </p>
                          <p style={{
                            margin: '3px 0 0', fontSize: 12, fontWeight: 600,
                            color: 'var(--text-secondary)',
                          }}>
                            {c.count} booking{c.count === 1 ? '' : 's'} affected
                          </p>
                        </div>
                        {c.severity === 'acknowledge' && (
                          <label style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                            whiteSpace: 'nowrap', color: '#7C2D12',
                          }}>
                            <input
                              type="checkbox"
                              checked={acknowledged.has(c.code)}
                              onChange={e => setAcknowledged(prev => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(c.code); else next.delete(c.code)
                                return next
                              })}
                            />
                            Acknowledge
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <label style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                <input type="checkbox" checked={issue} onChange={e => setIssue(e.target.checked)} />
                Issue immediately
                <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 12.5 }}>
                  — leave unticked to create drafts you can review first
                </span>
              </label>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
