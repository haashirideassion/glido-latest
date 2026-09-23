import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { usePageTitle } from '@/lib/usePageTitle'
import {
  InvoiceDetail, createCreditNote, getInvoice, issueInvoice, raiseDispute,
  setInvoiceDelivery, writeOffInvoice,
} from '@/lib/db/billing'
import { useBillingCapabilities, approvalFor, reasonFor } from '@/lib/useBillingCapabilities'
import { ChargeWorkingPanel } from '@/components/billing/ChargeWorkingPanel'
import {
  Amount, DataTable, Field, GatedButton, HeadRow, Loading, Modal, Note, Panel,
  REASON_CODES, ReasonFields, RefusalNotice, ScrollTable, StatusPill, TD, TH, TR,
  formatDate, formatDateTime, humanise, inputStyle, useAsync,
} from '@/components/billing/BillingUI'

/**
 * B-06 Invoice detail — the document of record (IN-01, IN-04, IN-11, IN-12, PY-02).
 *
 * The action row is driven by `availableActions` from the server, which is the
 * §4 state machine: only legal transitions are offered, and the same table
 * gates the endpoints, so the UI cannot present an action the API will refuse.
 */
export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { caps, thresholds } = useBillingCapabilities()
  const inv = useAsync(() => getInvoice(id!), [id])
  const [error, setError] = useState<Error | null>(null)
  const [modal, setModal] = useState<'credit' | 'dispute' | 'writeoff' | null>(null)
  const [busy, setBusy] = useState(false)

  usePageTitle(inv.data?.invoiceNumber ? `Invoice ${inv.data.invoiceNumber}` : 'Invoice')

  if (inv.loading) return <Loading label="Loading invoice…" />
  if (!inv.data) {
    return <Note tone="warn">This invoice could not be loaded.</Note>
  }

  const d = inv.data
  const can = (a: string) => d.availableActions.includes(a)

  async function act(fn: () => Promise<unknown>, success: string) {
    setBusy(true); setError(null)
    try {
      await fn()
      toast.success(success)
      inv.reload()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--card-gap)' }}>
      <RefusalNotice
        error={error}
        onDismiss={() => setError(null)}
        onAlternative={alt => {
          setError(null)
          if (alt === 'credit_note') setModal('credit')
        }}
      />

      {/* Header: identity, state, and the legal actions */}
      <Panel padded={false}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 16,
          padding: 'var(--card-pad)', flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1C1917' }}>
                {d.documentTitle} {d.invoiceNumber ?? '(draft)'}
              </h1>
              <StatusPill status={d.status} size={12.5} />
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              {d.billTo.name}
              {d.billTo.accountCode && ` · ${d.billTo.accountCode}`}
              {d.issueDate && ` · issued ${formatDate(d.issueDate)}`}
              {d.dueDate && ` · due ${formatDate(d.dueDate)}`}
            </p>
            {/* TX-03: the wording changes when the supplier is not GST-registered */}
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
              {d.taxNote}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {can('issue') && (
              <GatedButton
                variant="primary"
                busy={busy}
                blockedReason={reasonFor(caps, 'can_issue_invoice')}
                onClick={() => act(
                  () => issueInvoice(d.id),
                  'Invoice issued — number allocated and pay-by-link created',
                )}
              >
                Issue invoice
              </GatedButton>
            )}
            {can('deliver') && (
              <GatedButton
                busy={busy}
                onClick={() => act(
                  async () => {
                    const res = await setInvoiceDelivery(d.id, { state: 'sent', channel: 'email' })
                    if (res.exception) toast.warning(res.exception)
                  },
                  'Marked as sent',
                )}
              >
                Mark sent
              </GatedButton>
            )}
            {can('credit_note') && (
              <GatedButton
                onClick={() => setModal('credit')}
                blockedReason={reasonFor(caps, 'can_issue_credit_note')}
              >
                Raise credit note
              </GatedButton>
            )}
            {can('raise_dispute') && (
              <GatedButton onClick={() => setModal('dispute')}>Log dispute</GatedButton>
            )}
            {can('write_off') && (
              <GatedButton
                variant="danger"
                onClick={() => setModal('writeoff')}
                blockedReason={reasonFor(caps, 'can_write_off')}
              >
                Write off
              </GatedButton>
            )}
          </div>
        </div>

        {/* IN-06, stated on the document itself rather than discovered on submit */}
        {d.status !== 'draft' && (
          <div style={{ padding: '0 var(--card-pad) var(--card-pad)' }}>
            <Note>
              This invoice has been issued, so its lines and totals are fixed. Corrections are
              made with a credit note, which keeps both documents in the record.
            </Note>
          </div>
        )}
      </Panel>

      <div style={{
        display: 'grid', gap: 'var(--card-gap)',
        gridTemplateColumns: 'minmax(0, 2.2fr) minmax(280px, 1fr)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--card-gap)', minWidth: 0 }}>
          <Panel
            title="Lines"
            subtitle="Every line expands to the working behind it"
            traces="RT-11"
            padded={false}
          >
            <ScrollTable>
              <DataTable>
                <HeadRow>
                  <TH width={34}>#</TH>
                  <TH>Description</TH>
                  <TH align="right">Qty</TH>
                  <TH align="right">Unit</TH>
                  <TH align="right">Net</TH>
                  <TH align="right">GST</TH>
                  <TH align="right">Total</TH>
                </HeadRow>
                <tbody>
                  {d.lines.map(l => (
                    <TR key={l.id}>
                      <TD>{l.lineNo}</TD>
                      <TD style={{ maxWidth: 380 }}>
                        <span style={{ fontWeight: 600, color: '#1C1917' }}>{l.description}</span>
                        {l.bookingReference && (
                          <span style={{
                            display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)',
                          }}>
                            {l.bookingReference}
                          </span>
                        )}
                        {l.taxability !== 'standard' && (
                          <span style={{
                            display: 'inline-block', marginTop: 3, fontSize: 11,
                            fontWeight: 600, color: '#7E22CE',
                          }}>
                            {humanise(l.taxability)}
                          </span>
                        )}
                        <div style={{ marginTop: 5 }}>
                          <ChargeWorkingPanel working={l.working} variant="card" />
                        </div>
                      </TD>
                      <TD align="right">
                        {trim(l.quantity)}
                        <span style={{
                          display: 'block', fontSize: 11, color: 'var(--text-tertiary)',
                        }}>
                          {l.unitOfMeasure}
                        </span>
                      </TD>
                      <TD align="right"><Amount value={l.unitPrice} size={12.5} /></TD>
                      <TD align="right"><Amount value={l.lineSubtotal} /></TD>
                      <TD align="right"><Amount value={l.taxAmount} size={12.5} /></TD>
                      <TD align="right"><Amount value={l.lineTotal} bold /></TD>
                    </TR>
                  ))}
                </tbody>
                <tfoot>
                  <TotalRow label="Subtotal" value={d.totals.subtotal} />
                  {Number(d.totals.discountTotal.amount) !== 0 && (
                    <TotalRow label="Discounts" value={d.totals.discountTotal} tone="credit" />
                  )}
                  <TotalRow label={d.isTaxInvoice ? 'GST' : 'Tax'} value={d.totals.taxTotal} />
                  <TotalRow label="Total" value={d.totals.total} strong />
                  {Number(d.totals.amountPaid.amount) !== 0 && (
                    <TotalRow label="Paid" value={d.totals.amountPaid} tone="credit" />
                  )}
                  {Number(d.totals.amountCredited.amount) !== 0 && (
                    <TotalRow label="Credited" value={d.totals.amountCredited} tone="credit" />
                  )}
                  {Number(d.totals.amountWrittenOff.amount) !== 0 && (
                    <TotalRow label="Written off" value={d.totals.amountWrittenOff} tone="credit" />
                  )}
                  <TotalRow label="Balance due" value={d.totals.balanceDue} strong />
                </tfoot>
              </DataTable>
            </ScrollTable>
          </Panel>

          <Panel title="History" subtitle="Append-only — every state change, with who and when" traces="NFR-B-04">
            {!d.history.length ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>
                No events recorded.
              </p>
            ) : (
              <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {d.history.map(h => (
                  <li key={h.id} style={{
                    display: 'flex', gap: 10, padding: '7px 0',
                    borderTop: '1px solid rgba(0,0,0,0.05)', fontSize: 12.5,
                  }}>
                    <span style={{ minWidth: 150, color: 'var(--text-tertiary)' }}>
                      {formatDateTime(h.at)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ color: '#1C1917' }}>
                        {h.fromStatus ? `${humanise(h.fromStatus)} → ` : ''}{humanise(h.toStatus)}
                      </strong>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {' '}· {humanise(h.eventKind)} · {h.actor}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--card-gap)', minWidth: 0 }}>
          <Panel title="Bill to" traces="IN-04">
            <Detail label="Account" value={
              d.billTo.accountId ? (
                <Link to={`/billing/receivables/accounts/${d.billTo.accountId}`} style={{
                  color: 'var(--brand-color)', textDecoration: 'none', fontWeight: 600,
                }}>
                  {d.billTo.name}
                </Link>
              ) : d.billTo.name
            } />
            <Detail label="ABN" value={d.billTo.abn ?? '—'} />
            <Detail label="Email" value={d.billTo.email ?? '—'} />
            <Detail label="Terms" value={d.paymentTerms ? humanise(d.paymentTerms) : '—'} />
            <hr style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,0.07)', margin: '10px 0' }} />
            <Detail label="Supplier" value={d.supplier.name ?? '—'} />
            <Detail label="Supplier ABN" value={d.supplier.abn ?? '—'} />
          </Panel>

          {/* PY-02, PY-03, PY-04 — how the payer can actually pay */}
          <Panel title="How to pay" traces="PY-02">
            {d.remittanceRef && (
              <Detail
                label="Remittance reference"
                value={<code style={{ fontSize: 13, fontWeight: 700 }}>{d.remittanceRef}</code>}
                hint="Quoting this is what lets an EFT match itself automatically."
              />
            )}
            {d.paymentRails.eft && (
              <>
                <Detail label="Bank" value={d.paymentRails.eft.bankName ?? '—'} />
                <Detail label="BSB" value={d.paymentRails.eft.bsb ?? '—'} />
                <Detail label="Account" value={d.paymentRails.eft.accountNumber ?? '—'} />
              </>
            )}
            {d.paymentRails.compay && (
              <Detail label="ComPay biller code" value={d.paymentRails.compay.billerCode} />
            )}
            {d.paymentRails.payLink && (
              <Detail
                label="Pay by link"
                value={<code style={{ fontSize: 12 }}>{d.paymentRails.payLink}</code>}
                hint="A hosted page scoped to this invoice alone — no login needed."
              />
            )}
            {!d.paymentRails.eft && !d.paymentRails.compay && !d.paymentRails.payLink && (
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                No payment rails configured. Set them up in Settings → Payments.
              </p>
            )}
          </Panel>

          <Panel title="Delivery" traces="IN-09">
            <Detail label="State" value={<StatusPill status={d.delivery.state} />} />
            {d.delivery.deliveredAt && (
              <Detail label="Delivered" value={formatDateTime(d.delivery.deliveredAt)} />
            )}
            {d.delivery.peppolState && (
              <Detail label="Peppol" value={humanise(d.delivery.peppolState)} />
            )}
            {(d.delivery.state === 'bounced' || d.delivery.state === 'failed') && (
              <div style={{ marginTop: 8 }}>
                <Note tone="warn">
                  Delivery {d.delivery.state}. This invoice must not be treated as delivered —
                  confirm the billing address before chasing payment.
                </Note>
              </div>
            )}
          </Panel>

          <Panel title="Chasing" traces="AR-06">
            <Detail label="Ladder step" value={String(d.dunning.step)} />
            <Detail
              label="Next action"
              value={d.dunning.nextAt ? formatDateTime(d.dunning.nextAt) : '—'}
            />
            {d.dunning.paused && (
              <div style={{ marginTop: 8 }}>
                <Note>
                  Chasing is paused{d.dunning.pauseReason ? `: ${d.dunning.pauseReason.toLowerCase()}` : ''}.
                  Reminders resume once the dispute is resolved.
                </Note>
              </div>
            )}
          </Panel>

          {d.payments.length > 0 && (
            <Panel title="Payments" traces="PY-10">
              {d.payments.map(p => (
                <div key={p.id} style={{
                  display: 'flex', justifyContent: 'space-between', gap: 10,
                  padding: '6px 0', borderTop: '1px solid rgba(0,0,0,0.05)', fontSize: 12.5,
                }}>
                  <span>
                    <strong>{p.receiptNumber}</strong>
                    <span style={{ display: 'block', color: 'var(--text-tertiary)' }}>
                      {humanise(p.method)} · {formatDate(p.receivedDate)}
                    </span>
                  </span>
                  <Amount value={p.amount} bold />
                </div>
              ))}
            </Panel>
          )}

          {d.creditNotes.length > 0 && (
            <Panel title="Credit notes" traces="IN-06">
              {d.creditNotes.map(c => (
                <div key={c.id} style={{
                  display: 'flex', justifyContent: 'space-between', gap: 10,
                  padding: '6px 0', borderTop: '1px solid rgba(0,0,0,0.05)', fontSize: 12.5,
                }}>
                  <span>
                    <strong>{c.number ?? 'Draft'}</strong>
                    <span style={{ display: 'block', color: 'var(--text-tertiary)' }}>
                      {humanise(c.scope)} · {humanise(c.reasonCode)}
                    </span>
                  </span>
                  <Amount value={c.total} bold tone="credit" />
                </div>
              ))}
            </Panel>
          )}

          {d.disputes.length > 0 && (
            <Panel title="Disputes" traces="AR-09">
              {d.disputes.map(x => (
                <div key={x.id} style={{
                  padding: '6px 0', borderTop: '1px solid rgba(0,0,0,0.05)', fontSize: 12.5,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <StatusPill status={x.status} />
                    {x.disputedAmount && <Amount value={x.disputedAmount} />}
                  </div>
                  <p style={{ margin: '3px 0 0', color: 'var(--text-secondary)' }}>
                    {humanise(x.reasonCode)}{x.reasonNote ? ` — ${x.reasonNote}` : ''}
                  </p>
                </div>
              ))}
              <div style={{ marginTop: 8 }}>
                <Link to="/billing/receivables#disputes" style={{
                  fontSize: 12.5, fontWeight: 600, color: 'var(--brand-color)',
                  textDecoration: 'none',
                }}>
                  Resolve in the dispute queue →
                </Link>
              </div>
            </Panel>
          )}
        </div>
      </div>

      {modal === 'credit' && (
        <CreditNoteModal
          invoice={d}
          thresholds={thresholds}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); inv.reload() }}
        />
      )}
      {modal === 'dispute' && (
        <DisputeModal
          invoice={d}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); inv.reload() }}
        />
      )}
      {modal === 'writeoff' && (
        <WriteOffModal
          invoice={d}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); inv.reload() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// B-08 Credit note — the only correction path (IN-06, TX-08)
// ─────────────────────────────────────────────────────────────────────────────

function CreditNoteModal({
  invoice, thresholds, onClose, onDone,
}: {
  invoice: InvoiceDetail
  thresholds: Record<string, any>
  onClose: () => void
  onDone: () => void
}) {
  const [scope, setScope] = useState<'full' | 'partial'>('full')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reasonCode, setReasonCode] = useState('')
  const [reasonNote, setReasonNote] = useState('')
  const [approverId, setApproverId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const lines = scope === 'full'
    ? invoice.lines
    : invoice.lines.filter(l => selected.has(l.id))
  const amount = lines.reduce(
    (s, l) => s + Number(l.lineSubtotal.amount) - Number(l.discountAmount.amount)
      + Number(l.taxAmount.amount), 0)
  const approval = approvalFor(thresholds, 'credit_note', amount, invoice.totals.total.currency)

  async function submit() {
    if (!reasonCode) { setFieldError('A reason is required for a credit note.'); return }
    if (scope === 'partial' && !selected.size) {
      setFieldError(null)
      setError(new Error('Select at least one line to credit.'))
      return
    }
    setBusy(true); setError(null); setFieldError(null)
    try {
      const res = await createCreditNote(invoice.id, {
        scope,
        invoiceLineIds: scope === 'partial' ? [...selected] : undefined,
        reasonCode,
        reasonNote: reasonNote || undefined,
        approvedBy: approverId || undefined,
      })
      toast.success(`Credit note ${res.creditNoteNumber} issued`, {
        description: `${res.total.display} · invoice is now ${humanise(res.invoiceStatus)}`,
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
      title="Raise a credit note"
      subtitle={`Against ${invoice.documentTitle} ${invoice.invoiceNumber}`}
      traces="IN-06"
      width={640}
      onClose={onClose}
      footer={
        <>
          <GatedButton variant="ghost" onClick={onClose}>Cancel</GatedButton>
          <GatedButton variant="primary" onClick={submit} busy={busy}>
            Issue credit note
          </GatedButton>
        </>
      }
    >
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      <Note>
        An issued invoice is never edited. A credit note reverses part or all of it and both
        documents stay in the record, which is what keeps the audit trail intact.
      </Note>

      <div style={{ marginTop: 14 }}>
        <Field label="Scope" required>
          <div style={{ display: 'flex', gap: 14 }}>
            {(['full', 'partial'] as const).map(s => (
              <label key={s} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13.5, cursor: 'pointer',
              }}>
                <input
                  type="radio" name="cn-scope" checked={scope === s}
                  onChange={() => setScope(s)}
                />
                {s === 'full' ? 'Full invoice' : 'Selected lines'}
              </label>
            ))}
          </div>
        </Field>

        {scope === 'partial' && (
          <div style={{
            border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-md)',
            marginBottom: 14, maxHeight: 220, overflowY: 'auto',
          }}>
            {invoice.lines.map(l => (
              <label key={l.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderBottom: '1px solid rgba(0,0,0,0.05)', cursor: 'pointer', fontSize: 13,
              }}>
                <input
                  type="checkbox"
                  checked={selected.has(l.id)}
                  onChange={e => setSelected(prev => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(l.id); else next.delete(l.id)
                    return next
                  })}
                />
                <span style={{ flex: 1, minWidth: 0 }}>{l.description}</span>
                <Amount value={l.lineTotal} />
              </label>
            ))}
          </div>
        )}

        <ReasonFields
          codes={REASON_CODES.creditNote as any}
          code={reasonCode}
          note={reasonNote}
          onCodeChange={v => { setReasonCode(v); setFieldError(null) }}
          onNoteChange={setReasonNote}
          error={fieldError}
        />

        {approval.required && (
          <>
            <Note tone="warn">{approval.message}</Note>
            <div style={{ marginTop: 12 }}>
              <Field
                label="Approver"
                required
                hint="Must be a different person — the system refuses self-approval."
              >
                <input
                  value={approverId}
                  onChange={e => setApproverId(e.target.value)}
                  placeholder="Approver user id"
                  style={inputStyle}
                />
              </Field>
            </div>
          </>
        )}

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: '10px 12px', background: 'rgba(0,0,0,0.03)',
          borderRadius: 'var(--r-md)', marginTop: 4,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Credit amount</span>
          <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {new Intl.NumberFormat('en-AU', {
              style: 'currency', currency: invoice.totals.total.currency,
            }).format(amount)}
          </span>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// X-09 / A-07 — dispute submission (AR-09)
// ─────────────────────────────────────────────────────────────────────────────

function DisputeModal({
  invoice, onClose, onDone,
}: {
  invoice: InvoiceDetail; onClose: () => void; onDone: () => void
}) {
  const [reasonCode, setReasonCode] = useState('')
  const [reasonNote, setReasonNote] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const disputed = invoice.lines
    .filter(l => selected.has(l.id))
    .reduce((s, l) => s + Number(l.lineTotal.amount), 0)

  async function submit() {
    if (!reasonCode) { setFieldError('A reason is required to raise a dispute.'); return }
    setBusy(true); setError(null); setFieldError(null)
    try {
      const res = await raiseDispute(invoice.id, {
        reasonCode,
        reasonNote: reasonNote || undefined,
        invoiceLineIds: selected.size ? [...selected] : undefined,
        disputedAmount: selected.size ? disputed : undefined,
      })
      toast.success('Dispute logged', { description: res.confirmation })
      onDone()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Log a dispute"
      subtitle={`Against ${invoice.documentTitle} ${invoice.invoiceNumber}`}
      traces="AR-09"
      onClose={onClose}
      footer={
        <>
          <GatedButton variant="ghost" onClick={onClose}>Cancel</GatedButton>
          <GatedButton variant="primary" onClick={submit} busy={busy}>Log dispute</GatedButton>
        </>
      }
    >
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      <Note>
        Logging a dispute pauses payment reminders on this invoice immediately, and they resume
        only once it is resolved. Chasing a customer over a charge they have contested is the
        fastest way to lose them.
      </Note>

      <div style={{ marginTop: 14 }}>
        <Field label="Contested lines" hint="Leave empty to dispute the whole invoice.">
          <div style={{
            border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-md)',
            maxHeight: 200, overflowY: 'auto',
          }}>
            {invoice.lines.map(l => (
              <label key={l.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderBottom: '1px solid rgba(0,0,0,0.05)', cursor: 'pointer', fontSize: 13,
              }}>
                <input
                  type="checkbox"
                  checked={selected.has(l.id)}
                  onChange={e => setSelected(prev => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(l.id); else next.delete(l.id)
                    return next
                  })}
                />
                <span style={{ flex: 1, minWidth: 0 }}>{l.description}</span>
                <Amount value={l.lineTotal} />
              </label>
            ))}
          </div>
        </Field>

        <ReasonFields
          codes={REASON_CODES.dispute as any}
          code={reasonCode}
          note={reasonNote}
          onCodeChange={v => { setReasonCode(v); setFieldError(null) }}
          onNoteChange={setReasonNote}
          error={fieldError}
        />
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// A-09 — write-off (AR-10)
// ─────────────────────────────────────────────────────────────────────────────

function WriteOffModal({
  invoice, onClose, onDone,
}: {
  invoice: InvoiceDetail; onClose: () => void; onDone: () => void
}) {
  const [amount, setAmount] = useState(invoice.totals.balanceDue.amount)
  const [reasonCode, setReasonCode] = useState('')
  const [reasonNote, setReasonNote] = useState('')
  const [approverId, setApproverId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  async function submit() {
    if (!reasonCode) { setFieldError('A reason is required for a write-off.'); return }
    setBusy(true); setError(null); setFieldError(null)
    try {
      const res = await writeOffInvoice(invoice.id, {
        amount: Number(amount),
        reasonCode,
        reasonNote: reasonNote || undefined,
        approvedBy: approverId || undefined,
      })
      toast.success(`${res.amount.display} written off`, { description: res.ledgerNote })
      onDone()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Write off bad debt"
      subtitle={`${invoice.totals.balanceDue.display} outstanding on ${invoice.invoiceNumber}`}
      traces="AR-10"
      onClose={onClose}
      footer={
        <>
          <GatedButton variant="ghost" onClick={onClose}>Cancel</GatedButton>
          <GatedButton variant="danger" onClick={submit} busy={busy}>Write off</GatedButton>
        </>
      }
    >
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      <Note tone="warn">
        A write-off always carries a named approver, and it cannot be self-approved. The amount
        posts to bad debt expense and clears the receivable — the invoice itself is retained.
      </Note>

      <div style={{ marginTop: 14 }}>
        <Field
          label="Amount"
          required
          hint={`At most ${invoice.totals.balanceDue.display} remains outstanding.`}
        >
          <input
            type="number" step="0.01" min="0" value={amount}
            onChange={e => setAmount(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <ReasonFields
          codes={REASON_CODES.writeOff as any}
          code={reasonCode}
          note={reasonNote}
          onCodeChange={v => { setReasonCode(v); setFieldError(null) }}
          onNoteChange={setReasonNote}
          error={fieldError}
        />

        <Field
          label="Approver"
          required
          hint="Must be a different person from you — the system refuses self-approval."
        >
          <input
            value={approverId}
            onChange={e => setApproverId(e.target.value)}
            placeholder="Approver user id"
            style={inputStyle}
          />
        </Field>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function TotalRow({
  label, value, strong, tone,
}: {
  label: string; value: any; strong?: boolean; tone?: 'credit'
}) {
  return (
    <tr style={{ borderTop: strong ? '2px solid rgba(0,0,0,0.14)' : '1px solid rgba(0,0,0,0.05)' }}>
      <td colSpan={5} style={{
        padding: '7px 10px', textAlign: 'right',
        fontSize: strong ? 13.5 : 12.5, fontWeight: strong ? 700 : 600,
        color: strong ? '#1C1917' : 'var(--text-secondary)',
      }}>
        {label}
      </td>
      <td />
      <td style={{ padding: '7px 10px', textAlign: 'right' }}>
        <Amount value={value} bold={strong} size={strong ? 14.5 : 13} tone={tone} />
      </td>
    </tr>
  )
}

function Detail({
  label, value, hint,
}: {
  label: string; value: React.ReactNode; hint?: string
}) {
  return (
    <div style={{ marginBottom: 9 }}>
      <p style={{
        margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
        textTransform: 'uppercase', color: 'var(--text-tertiary)',
      }}>
        {label}
      </p>
      <div style={{ fontSize: 13, color: '#1C1917', marginTop: 1, wordBreak: 'break-word' }}>
        {value}
      </div>
      {hint && (
        <p style={{
          margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-mid)', lineHeight: 1.4,
        }}>
          {hint}
        </p>
      )}
    </div>
  )
}

function trim(n: number): string {
  return String(Number(n.toFixed(4)))
}
