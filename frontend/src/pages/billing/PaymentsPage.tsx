import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { usePageTitle } from '@/lib/usePageTitle'
import {
  ReceiptRow, allocateReceipt, createReceipt, getAccounts, getMatchQueue,
  getPaymentFailures, getReceipts, resolveMatch, reverseReceipt, suggestAllocation,
} from '@/lib/db/billing'
import { useBillingCapabilities, reasonFor } from '@/lib/useBillingCapabilities'
import {
  Amount, DataTable, EmptyRow, Field, GatedButton, HeadRow, Loading, Modal, Note,
  Panel, REASON_CODES, ReasonFields, RefusalNotice, ScrollTable, Stat, StatusPill,
  TD, TH, TR, formatDate, humanise, inputStyle, useAsync,
} from '@/components/billing/BillingUI'

/**
 * Payments and reconciliation: P-01 receipts, P-02 manual entry, P-04 match
 * queue, P-05 allocation, P-06 reversal, P-08 failures.
 *
 * The rule that shapes this screen is AR-08: money that cannot be matched to an
 * invoice stays unallocated *on the account* rather than being forced onto a
 * plausible invoice. So "unallocated" is a first-class state throughout, not an
 * error to be cleared.
 */

const TABS = [
  { key: 'receipts', label: 'Receipts' },
  { key: 'match',    label: 'Match queue' },
  { key: 'failures', label: 'Failures' },
] as const

type TabKey = typeof TABS[number]['key']

export default function PaymentsPage() {
  usePageTitle('Payments')
  const { hash } = useLocation()
  const initial = (hash.replace('#', '') || 'receipts') as TabKey
  const [tab, setTab] = useState<TabKey>(TABS.some(t => t.key === initial) ? initial : 'receipts')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--card-gap)' }}>
      <div className="billing-subnav">
        {TABS.map(t => (
          <a key={t.key} href={`#${t.key}`}
            className={tab === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}>
            {t.label}
          </a>
        ))}
      </div>
      {tab === 'receipts' && <ReceiptsTab />}
      {tab === 'match'    && <MatchQueueTab />}
      {tab === 'failures' && <FailuresTab />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// P-01 / P-02 — receipts
// ─────────────────────────────────────────────────────────────────────────────

function ReceiptsTab() {
  const { caps } = useBillingCapabilities()
  const [filter, setFilter] = useState('all')
  const list = useAsync(
    () => getReceipts(filter === 'unallocated' ? { allocation: 'unallocated' } : {}),
    [filter],
  )
  const [entryOpen, setEntryOpen] = useState(false)
  const [allocating, setAllocating] = useState<ReceiptRow | null>(null)
  const [reversing, setReversing] = useState<ReceiptRow | null>(null)

  const rows = list.data?.receipts ?? []

  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
        <Stat label="Received" value={<Amount value={list.data?.totals.received} size={24} bold />} />
        <Stat label="Allocated" value={<Amount value={list.data?.totals.allocated} size={24} bold />} />
        <Stat
          label="Unallocated"
          value={<Amount value={list.data?.totals.unallocated} size={24} bold />}
          sub="held on account until someone applies it"
          tone={Number(list.data?.totals.unallocated.amount ?? 0) > 0 ? 'warn' : 'good'}
        />
      </div>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel
          title="Receipts"
          subtitle="Every payment in, whatever rail it arrived on"
          traces="PY-10"
          padded={false}
          actions={
            <>
              <select value={filter} onChange={e => setFilter(e.target.value)}
                style={{ ...inputStyle, width: 170, padding: '6px 10px', fontSize: 13 }}>
                <option value="all">All receipts</option>
                <option value="unallocated">Unallocated only</option>
              </select>
              <GatedButton variant="primary" onClick={() => setEntryOpen(true)}
                blockedReason={reasonFor(caps, 'can_confirm_eft_payment')}>
                Record a payment
              </GatedButton>
            </>
          }
        >
          {list.loading ? <Loading /> : (
            <ScrollTable>
              <DataTable>
                <HeadRow>
                  <TH>Receipt</TH><TH>Account</TH><TH>Method</TH><TH>Received</TH>
                  <TH align="right">Amount</TH><TH align="right">Unallocated</TH>
                  <TH>State</TH><TH>Reference</TH><TH />
                </HeadRow>
                <tbody>
                  {!rows.length && (
                    <EmptyRow colSpan={9}>
                      No receipts {filter === 'unallocated' ? 'awaiting allocation' : 'recorded'}.
                    </EmptyRow>
                  )}
                  {rows.map(r => (
                    <TR key={r.id} highlight={Number(r.unallocatedAmount.amount) > 0}>
                      <TD>
                        <span style={{ fontWeight: 600 }}>{r.receiptNumber}</span>
                        {r.reversalOfId && (
                          <span style={{ display: 'block', fontSize: 11.5, color: '#7E22CE', fontWeight: 600 }}>
                            Reversal
                          </span>
                        )}
                      </TD>
                      <TD>
                        {r.accountName ?? (
                          <span style={{ color: 'var(--text-tertiary)' }}>Unidentified</span>
                        )}
                      </TD>
                      <TD>
                        {humanise(r.method)}
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                          via {humanise(r.source)}
                        </span>
                      </TD>
                      <TD>{formatDate(r.receivedDate)}</TD>
                      <TD align="right">
                        <Amount value={r.amount} bold
                          tone={Number(r.amount.amount) < 0 ? 'credit' : undefined} />
                      </TD>
                      <TD align="right">
                        <Amount value={r.unallocatedAmount}
                          bold={Number(r.unallocatedAmount.amount) > 0} />
                      </TD>
                      <TD><StatusPill status={r.status} /></TD>
                      <TD><span style={{ fontSize: 12 }}>{r.payerReference ?? '—'}</span></TD>
                      <TD align="right">
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <GatedButton size="sm" onClick={() => setAllocating(r)}
                            blockedReason={
                              reasonFor(caps, 'can_confirm_eft_payment')
                              ?? (Number(r.unallocatedAmount.amount) <= 0
                                ? 'This receipt is fully allocated.'
                                : r.status === 'reversed' ? 'This receipt has been reversed.' : null)
                            }>
                            Allocate
                          </GatedButton>
                          <GatedButton size="sm" variant="danger" hideWhenBlocked
                            onClick={() => setReversing(r)}
                            blockedReason={
                              reasonFor(caps, 'can_refund')
                              ?? (r.status === 'reversed' || r.reversalOfId ? 'Already reversed.' : null)
                            }>
                            Reverse
                          </GatedButton>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </DataTable>
            </ScrollTable>
          )}
        </Panel>
      </div>

      {entryOpen && (
        <ManualReceiptModal onClose={() => setEntryOpen(false)}
          onDone={() => { setEntryOpen(false); list.reload() }} />
      )}
      {allocating && (
        <AllocationModal receipt={allocating} onClose={() => setAllocating(null)}
          onDone={() => { setAllocating(null); list.reload() }} />
      )}
      {reversing && (
        <ReversalModal receipt={reversing} onClose={() => setReversing(null)}
          onDone={() => { setReversing(null); list.reload() }} />
      )}
    </>
  )
}

/** P-02 — manual receipt entry, capability-gated (PY-07). */
function ManualReceiptModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const accounts = useAsync(() => getAccounts({ status: 'active,on_hold' }), [])
  const [form, setForm] = useState({
    accountId: '', amount: '', method: 'eft',
    receivedDate: new Date().toISOString().slice(0, 10),
    payerReference: '', narrative: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  async function submit() {
    if (!form.amount || Number(form.amount) <= 0) {
      setError(new Error('Enter an amount greater than zero.')); return
    }
    setBusy(true); setError(null)
    try {
      const res = await createReceipt({
        accountId: form.accountId || undefined,
        amount: Number(form.amount).toFixed(2),
        method: form.method,
        receivedDate: form.receivedDate,
        payerReference: form.payerReference || undefined,
        narrative: form.narrative || undefined,
      })
      toast.success(`Receipt ${res.receiptNumber} recorded`, {
        description: `${res.amount.display} · ${res.unallocated.display} unallocated`,
      })
      onDone()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Record a payment"
      subtitle="For money that arrived outside the automated rails"
      traces="PY-07"
      onClose={onClose}
      footer={
        <>
          <GatedButton variant="ghost" onClick={onClose}>Cancel</GatedButton>
          <GatedButton variant="primary" onClick={submit} busy={busy}>Record</GatedButton>
        </>
      }
    >
      <RefusalNotice error={error} onDismiss={() => setError(null)} />
      <Note>
        Recording a receipt does not apply it to anything. Allocate it afterwards — whatever is
        left over stays on the account rather than being pushed onto an invoice it may not
        belong to.
      </Note>
      <div style={{ marginTop: 14 }}>
        <Field label="Account" hint="Leave blank if the payer cannot be identified yet.">
          <select value={form.accountId}
            onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}
            style={inputStyle}>
            <option value="">Unidentified</option>
            {accounts.data?.accounts.map(a => (
              <option key={a.id} value={a.id}>{a.legalName} ({a.accountCode})</option>
            ))}
          </select>
        </Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Amount" required>
              <input type="number" step="0.01" min="0" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                style={inputStyle} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Method" required>
              <select value={form.method}
                onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                style={inputStyle}>
                {['eft', 'card', 'compay', 'cash', 'manual'].map(m => (
                  <option key={m} value={m}>{humanise(m)}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Received" required>
              <input type="date" value={form.receivedDate}
                onChange={e => setForm(f => ({ ...f, receivedDate: e.target.value }))}
                style={inputStyle} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Payer reference" hint="What the payer quoted, if anything.">
              <input value={form.payerReference}
                onChange={e => setForm(f => ({ ...f, payerReference: e.target.value }))}
                style={inputStyle} />
            </Field>
          </div>
        </div>
        <Field label="Narrative">
          <input value={form.narrative}
            onChange={e => setForm(f => ({ ...f, narrative: e.target.value }))}
            style={inputStyle} />
        </Field>
      </div>
    </Modal>
  )
}

/** P-05 — split a receipt across invoices (AR-08). */
function AllocationModal({
  receipt, onClose, onDone,
}: {
  receipt: ReceiptRow; onClose: () => void; onDone: () => void
}) {
  const suggestion = useAsync(() => suggestAllocation(receipt.id), [receipt.id])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Seed with the oldest-first suggestion; the user adjusts from there.
  useEffect(() => {
    if (!suggestion.data) return
    const seeded: Record<string, string> = {}
    for (const s of suggestion.data.suggestion) {
      if (!s.excludeReason) seeded[s.invoiceId] = s.suggestedAmount.amount
    }
    setAmounts(seeded)
  }, [suggestion.data])

  const allocated = Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0)
  const available = Number(receipt.unallocatedAmount.amount)
  const residual = Math.round((available - allocated) * 100) / 100
  const fmt = (n: number) => new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: receipt.amount.currency,
  }).format(n)

  async function submit() {
    const entries = Object.entries(amounts)
      .filter(([, v]) => Number(v) > 0)
      .map(([invoiceId, v]) => ({ invoiceId, amount: Number(v) }))
    if (!entries.length) {
      setError(new Error('Enter at least one amount to allocate.')); return
    }
    setBusy(true); setError(null)
    try {
      const res = await allocateReceipt(receipt.id, entries)
      toast.success('Allocated', {
        description: `${res.allocatedTotal.display} applied · ${res.unallocatedBalance.display} left on account`,
      })
      onDone()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Allocate receipt"
      subtitle={`${receipt.receiptNumber} · ${receipt.unallocatedAmount.display} unallocated`}
      traces="AR-08"
      width={640}
      onClose={onClose}
      footer={
        <>
          <GatedButton variant="ghost" onClick={onClose}>Cancel</GatedButton>
          <GatedButton variant="primary" onClick={submit} busy={busy}
            blockedReason={
              allocated > available + 0.005
                ? `You have allocated more than the ${receipt.unallocatedAmount.display} available.`
                : null
            }>
            Allocate
          </GatedButton>
        </>
      }
    >
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      {suggestion.loading ? <Loading /> : !suggestion.data?.suggestion.length ? (
        <Note>
          This account has no open invoices, so the whole receipt stays on the account as a
          credit balance until there is something to apply it to.
        </Note>
      ) : (
        <>
          <Note>
            Pre-filled oldest first. Adjust freely — anything you leave over stays unallocated
            on the account rather than being forced onto an invoice.
          </Note>
          <div style={{ marginTop: 12 }}>
            <ScrollTable>
              <DataTable>
                <HeadRow>
                  <TH>Invoice</TH><TH>Due</TH>
                  <TH align="right">Outstanding</TH><TH align="right" width={130}>Allocate</TH>
                </HeadRow>
                <tbody>
                  {suggestion.data.suggestion.map(s => (
                    <TR key={s.invoiceId}>
                      <TD>
                        <Link to={`/billing/invoices/${s.invoiceId}`} style={{
                          fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none',
                        }}>
                          {s.invoiceNumber}
                        </Link>
                        <span style={{ display: 'block', marginTop: 2 }}>
                          <StatusPill status={s.status} />
                        </span>
                        {s.excludeReason && (
                          <span style={{
                            display: 'block', fontSize: 11.5, color: '#7E22CE',
                            fontWeight: 600, marginTop: 2,
                          }}>
                            {s.excludeReason}
                          </span>
                        )}
                      </TD>
                      <TD>{formatDate(s.dueDate)}</TD>
                      <TD align="right"><Amount value={s.balanceDue} /></TD>
                      <TD align="right">
                        <input type="number" step="0.01" min="0" max={s.balanceDue.amount}
                          value={amounts[s.invoiceId] ?? ''}
                          onChange={e => setAmounts(a => ({ ...a, [s.invoiceId]: e.target.value }))}
                          style={{ ...inputStyle, width: 110, textAlign: 'right', padding: '5px 8px' }} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </DataTable>
            </ScrollTable>
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 12,
            padding: '10px 12px', background: 'rgba(0,0,0,0.03)',
            borderRadius: 'var(--r-md)', fontSize: 13,
          }}>
            <span><strong>Allocating</strong> {fmt(allocated)}</span>
            <span style={{ color: residual < 0 ? '#B91C1C' : residual > 0 ? '#C2410C' : '#15803D' }}>
              <strong>
                {residual < 0 ? 'Over-allocated by '
                  : residual > 0 ? 'Left on account ' : 'Fully allocated'}
              </strong>
              {residual !== 0 && fmt(Math.abs(residual))}
            </span>
          </div>
        </>
      )}
    </Modal>
  )
}

/** P-06 — reversal, never a deletion (PY-08). */
function ReversalModal({
  receipt, onClose, onDone,
}: {
  receipt: ReceiptRow; onClose: () => void; onDone: () => void
}) {
  const [amount, setAmount] = useState(receipt.amount.amount)
  const [reasonCode, setReasonCode] = useState('')
  const [reasonNote, setReasonNote] = useState('')
  const [approverId, setApproverId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  async function submit() {
    if (!reasonCode) { setFieldError('A reason is required for a reversal.'); return }
    setBusy(true); setError(null); setFieldError(null)
    try {
      const res = await reverseReceipt(receipt.id, {
        reason: reasonNote ? `${reasonCode}: ${reasonNote}` : reasonCode,
        amount: Number(amount),
        approvedBy: approverId || undefined,
      })
      toast.success(`Reversed as ${res.reversalReceiptNumber}`, { description: res.note })
      onDone()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Reverse a payment"
      subtitle={`${receipt.receiptNumber} · ${receipt.amount.display}`}
      traces="PY-08"
      onClose={onClose}
      footer={
        <>
          <GatedButton variant="ghost" onClick={onClose}>Cancel</GatedButton>
          <GatedButton variant="danger" onClick={submit} busy={busy}>Reverse</GatedButton>
        </>
      }
    >
      <RefusalNotice error={error} onDismiss={() => setError(null)} />
      <Note tone="warn">
        The original receipt is kept and marked reversed, and a mirror receipt records the
        outflow. Any invoices this payment settled go back to owing, and chasing resumes on them.
      </Note>
      <div style={{ marginTop: 14 }}>
        <Field label="Amount" required hint={`At most ${receipt.amount.display}.`}>
          <input type="number" step="0.01" min="0" value={amount}
            onChange={e => setAmount(e.target.value)} style={inputStyle} />
        </Field>
        <ReasonFields
          codes={REASON_CODES.refund as any}
          code={reasonCode} note={reasonNote}
          onCodeChange={v => { setReasonCode(v); setFieldError(null) }}
          onNoteChange={setReasonNote}
          error={fieldError}
        />
        <Field label="Approver" hint="Required above the refund threshold; must not be you.">
          <input value={approverId} onChange={e => setApproverId(e.target.value)}
            placeholder="Approver user id" style={inputStyle} />
        </Field>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// P-04 — match queue (PY-06)
// ─────────────────────────────────────────────────────────────────────────────

function MatchQueueTab() {
  const { caps } = useBillingCapabilities()
  const [state, setState] = useState('open')
  const q = useAsync(() => getMatchQueue(state), [state])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const lines = q.data?.lines ?? []
  const m = q.data?.metrics

  async function decide(lineId: string, accept: boolean) {
    setBusy(lineId); setError(null)
    try {
      await resolveMatch(lineId, { accept })
      toast.success(accept ? 'Matched and receipted' : 'Ignored')
      q.reload()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
        <Stat label="Bank lines" value={m?.totalLines ?? 0} />
        <Stat label="Matched" value={m?.matched ?? 0} />
        <Stat
          label="Match rate"
          value={m?.matchRatePct == null ? '—' : `${m.matchRatePct}%`}
          sub={`target ${m?.target ?? 90}% for correctly-referenced EFT`}
          tone={m?.matchRatePct != null && m.matchRatePct < (m.target ?? 90) ? 'warn' : 'good'}
        />
        <Stat label="Auto by reference" value={m?.autoByReference ?? 0}
          sub="matched on the remittance reference alone" />
      </div>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel
          title="Match queue"
          subtitle="Suggestions are made on reference, then amount, then account name — in that order"
          traces="PY-06"
          padded={false}
          actions={
            <select value={state} onChange={e => setState(e.target.value)}
              style={{ ...inputStyle, width: 150, padding: '6px 10px', fontSize: 13 }}>
              <option value="open">Open</option>
              <option value="all">All</option>
              <option value="matched">Matched</option>
              <option value="ignored">Ignored</option>
            </select>
          }
        >
          {q.loading ? <Loading /> : (
            <ScrollTable>
              <DataTable>
                <HeadRow>
                  <TH>Value date</TH><TH align="right">Amount</TH><TH>Narrative</TH>
                  <TH>Reference</TH><TH>Suggestion</TH><TH>Basis</TH><TH>State</TH><TH />
                </HeadRow>
                <tbody>
                  {!lines.length && (
                    <EmptyRow colSpan={8}>
                      Nothing in the queue. Import a bank statement to populate it.
                    </EmptyRow>
                  )}
                  {lines.map(l => (
                    <TR key={l.id} highlight={l.matchState === 'unmatched'}>
                      <TD>{formatDate(l.valueDate)}</TD>
                      <TD align="right"><Amount value={l.amount} bold /></TD>
                      <TD style={{ maxWidth: 220 }}>{l.narrative ?? '—'}</TD>
                      <TD>{l.reference ?? '—'}</TD>
                      <TD>
                        {!l.suggestion ? (
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                            No confident match
                          </span>
                        ) : l.suggestion.invoiceNumber ? (
                          <>
                            <Link to={`/billing/invoices/${l.suggestion.invoiceId}`} style={{
                              fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none',
                            }}>
                              {l.suggestion.invoiceNumber}
                            </Link>
                            <span style={{
                              display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)',
                            }}>
                              {l.suggestion.accountName} · {l.suggestion.balanceDue?.display} due
                            </span>
                          </>
                        ) : (
                          <span style={{ fontSize: 12 }}>{l.suggestion.accountName}</span>
                        )}
                      </TD>
                      <TD>
                        {l.matchBasis ? (
                          <>
                            {humanise(l.matchBasis)}
                            {l.matchConfidence != null && (
                              <span style={{
                                display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)',
                              }}>
                                {l.matchConfidence}% confident
                              </span>
                            )}
                          </>
                        ) : '—'}
                      </TD>
                      <TD><StatusPill status={l.matchState} /></TD>
                      <TD align="right">
                        {(l.matchState === 'unmatched' || l.matchState === 'suggested') && (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <GatedButton size="sm" variant="primary" busy={busy === l.id}
                              onClick={() => decide(l.id, true)}
                              blockedReason={
                                reasonFor(caps, 'can_confirm_eft_payment')
                                ?? (!l.suggestion
                                  ? 'No suggested match to accept. Record the payment manually and allocate it.'
                                  : null)
                              }>
                              Accept
                            </GatedButton>
                            <GatedButton size="sm" busy={busy === l.id}
                              onClick={() => decide(l.id, false)}
                              blockedReason={reasonFor(caps, 'can_confirm_eft_payment')}>
                              Ignore
                            </GatedButton>
                          </div>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </DataTable>
            </ScrollTable>
          )}
        </Panel>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// P-08 — failed card payments (PY-11)
// ─────────────────────────────────────────────────────────────────────────────

function FailuresTab() {
  const list = useAsync(() => getPaymentFailures(), [])
  const rows = list.data ?? []

  return (
    <Panel
      title="Failed payments"
      subtitle="A failed attempt never marks an invoice paid — the balance stands"
      traces="PY-11"
      padded={false}
    >
      {list.loading ? <Loading /> : (
        <ScrollTable>
          <DataTable>
            <HeadRow>
              <TH>Attempted</TH><TH>Invoice</TH><TH>Account</TH>
              <TH align="right">Amount</TH><TH>Failure</TH>
              <TH align="right">Retries</TH><TH>Invoice state</TH>
            </HeadRow>
            <tbody>
              {!rows.length && <EmptyRow colSpan={7}>No failed payment attempts.</EmptyRow>}
              {rows.map((r: any) => (
                <TR key={r.id}>
                  <TD>{formatDate(r.attemptedAt)}</TD>
                  <TD>
                    {r.invoiceId ? (
                      <Link to={`/billing/invoices/${r.invoiceId}`} style={{
                        fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none',
                      }}>
                        {r.invoiceNumber}
                      </Link>
                    ) : '—'}
                  </TD>
                  <TD>{r.accountName ?? '—'}</TD>
                  <TD align="right"><Amount value={r.amount} /></TD>
                  <TD>
                    <span style={{ fontSize: 12.5, color: '#B91C1C' }}>
                      {r.failureMessage ?? r.failureCode ?? 'Unknown'}
                    </span>
                  </TD>
                  <TD align="right">{r.retryCount}</TD>
                  <TD>{r.invoiceStatus ? <StatusPill status={r.invoiceStatus} /> : '—'}</TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        </ScrollTable>
      )}
    </Panel>
  )
}
