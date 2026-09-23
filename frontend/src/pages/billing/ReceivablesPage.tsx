import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { usePageTitle } from '@/lib/usePageTitle'
import {
  DisputeRow, addCollectionNote, decideCreditOverride, getAccounts, getAgedReceivables,
  getCollections, getCreditOverrides, getDisputes, resolveDispute, setCreditHold,
} from '@/lib/db/billing'
import { useBillingCapabilities, reasonFor } from '@/lib/useBillingCapabilities'
import { ChargeWorkingPanel } from '@/components/billing/ChargeWorkingPanel'
import {
  Amount, DataTable, EmptyRow, Field, GatedButton, HeadRow, Loading, Modal, Note,
  Panel, RefusalNotice, ScrollTable, Stat, StatusPill, TD, TH, TR, formatDate,
  humanise, inputStyle, useAsync,
} from '@/components/billing/BillingUI'

/**
 * Receivables and credit control: A-01 accounts, A-04 ageing, A-05 collections,
 * A-07 disputes, A-08 overrides. Grouped into one screen with tabs because they
 * are the same conversation — who owes us what, and what is being done about it.
 */

const TABS = [
  { key: 'accounts',    label: 'Accounts',    traces: 'A-01' },
  { key: 'aged',        label: 'Ageing',      traces: 'A-04' },
  { key: 'collections', label: 'Collections', traces: 'A-05' },
  { key: 'disputes',    label: 'Disputes',    traces: 'A-07' },
  { key: 'overrides',   label: 'Overrides',   traces: 'A-08' },
] as const

type TabKey = typeof TABS[number]['key']

export default function ReceivablesPage() {
  usePageTitle('Receivables')
  const { hash } = useLocation()
  const initial = (hash.replace('#', '') || 'accounts') as TabKey
  const [tab, setTab] = useState<TabKey>(
    TABS.some(t => t.key === initial) ? initial : 'accounts')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--card-gap)' }}>
      <div className="billing-subnav">
        {TABS.map(t => (
          <a
            key={t.key} href={`#${t.key}`}
            className={tab === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </a>
        ))}
      </div>

      {tab === 'accounts'    && <AccountsTab />}
      {tab === 'aged'        && <AgedTab />}
      {tab === 'collections' && <CollectionsTab />}
      {tab === 'disputes'    && <DisputesTab />}
      {tab === 'overrides'   && <OverridesTab />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// A-01 — the account book
// ─────────────────────────────────────────────────────────────────────────────

function AccountsTab() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [holdFor, setHoldFor] = useState<{ id: string; name: string; onHold: boolean } | null>(null)
  const list = useAsync(() => getAccounts({ search: query || undefined }), [query])

  const rows = list.data?.accounts ?? []
  const onHold = rows.filter(r => r.creditHold)
  const nearLimit = rows.filter(r => r.exposureBand === 'near_limit' || r.exposureBand === 'at_limit')

  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
        <Stat label="Accounts" value={rows.length} />
        <Stat
          label="At or near limit"
          value={nearLimit.length}
          tone={nearLimit.length ? 'warn' : 'good'}
          sub="80% of the credit limit or above"
        />
        <Stat
          label="On credit hold"
          value={onHold.length}
          tone={onHold.length ? 'warn' : 'neutral'}
          sub="cannot book on account; prepaid still available"
        />
      </div>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel
          title="Customer accounts"
          traces="AR-01"
          padded={false}
          actions={
            <form
              onSubmit={e => { e.preventDefault(); setQuery(search) }}
              style={{ display: 'flex', gap: 6 }}
            >
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Name, code or ABN…"
                style={{ ...inputStyle, width: 220, padding: '6px 10px', fontSize: 13 }}
              />
              <button type="submit" style={{
                padding: '6px 12px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                background: '#fff', border: '1px solid rgba(0,0,0,0.14)',
                borderRadius: 'var(--r-sm)', cursor: 'pointer',
              }}>
                Search
              </button>
            </form>
          }
        >
          {list.loading ? <Loading /> : (
            <ScrollTable>
              <DataTable>
                <HeadRow>
                  <TH>Account</TH>
                  <TH>Status</TH>
                  <TH>Terms</TH>
                  <TH align="right">Limit</TH>
                  <TH align="right">Exposure</TH>
                  <TH>Utilisation</TH>
                  <TH align="right">Open</TH>
                  <TH align="right">Days to pay</TH>
                  <TH>Tariff</TH>
                  <TH />
                </HeadRow>
                <tbody>
                  {!rows.length && (
                    <EmptyRow colSpan={10}>
                      No customer accounts yet. An account must exist before a customer can be
                      invoiced in arrears.
                    </EmptyRow>
                  )}
                  {rows.map(r => (
                    <TR key={r.id} highlight={r.creditHold}>
                      <TD>
                        <Link
                          to={`/billing/receivables/accounts/${r.id}`}
                          style={{ fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none' }}
                        >
                          {r.legalName}
                        </Link>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                          {r.accountCode}{r.abn ? ` · ABN ${r.abn}` : ''}
                        </span>
                      </TD>
                      <TD>
                        <StatusPill status={r.status} />
                        {r.creditHold && (
                          <span
                            title={r.creditHoldReason ?? undefined}
                            style={{ display: 'block', fontSize: 11.5, color: '#B91C1C', marginTop: 2 }}
                          >
                            On hold
                          </span>
                        )}
                      </TD>
                      <TD>{humanise(r.paymentTerms)}</TD>
                      <TD align="right"><Amount value={r.creditLimit} /></TD>
                      <TD align="right"><Amount value={r.exposure} bold /></TD>
                      <TD>
                        <UtilisationBar pct={r.pctOfLimit} band={r.exposureBand} />
                      </TD>
                      <TD align="right">
                        {r.openInvoices}
                        {r.overdueInvoices > 0 && (
                          <span style={{
                            display: 'block', fontSize: 11.5, color: '#B91C1C', fontWeight: 600,
                          }}>
                            {r.overdueInvoices} overdue
                          </span>
                        )}
                      </TD>
                      <TD align="right">
                        {r.avgDaysToPay == null ? '—' : (
                          <span style={{
                            color: r.avgDaysToPay > r.paymentTermsDays ? '#B91C1C' : undefined,
                            fontWeight: r.avgDaysToPay > r.paymentTermsDays ? 600 : 400,
                          }}>
                            {r.avgDaysToPay}d
                          </span>
                        )}
                      </TD>
                      <TD>
                        <span style={{ fontSize: 12 }}>
                          {r.rateCardName ?? 'Site default'}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {r.tariffBasis}
                        </span>
                      </TD>
                      <TD align="right">
                        <GatedButton
                          size="sm"
                          variant={r.creditHold ? 'secondary' : 'danger'}
                          onClick={() => setHoldFor({
                            id: r.id, name: r.legalName, onHold: r.creditHold,
                          })}
                        >
                          {r.creditHold ? 'Release' : 'Hold'}
                        </GatedButton>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </DataTable>
            </ScrollTable>
          )}
        </Panel>
      </div>

      {holdFor && (
        <CreditHoldModal
          account={holdFor}
          onClose={() => setHoldFor(null)}
          onDone={() => { setHoldFor(null); list.reload() }}
        />
      )}
    </>
  )
}

/** Utilisation as a bar *and* a percentage — colour is never the only cue (rule 8). */
function UtilisationBar({
  pct, band,
}: {
  pct: number | null; band: string
}) {
  if (pct == null) {
    return <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No limit set</span>
  }
  const colour = band === 'at_limit' ? '#DC2626'
    : band === 'near_limit' ? '#EA580C' : '#16A34A'
  return (
    <div style={{ minWidth: 96 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 11.5, fontWeight: 600, marginBottom: 2,
      }}>
        <span style={{ color: colour }}>{pct}%</span>
        <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
          {humanise(band)}
        </span>
      </div>
      <div style={{
        height: 5, background: 'rgba(0,0,0,0.07)',
        borderRadius: 'var(--r-full)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(100, Math.max(2, pct))}%`, height: '100%',
          background: colour, borderRadius: 'var(--r-full)',
        }} />
      </div>
    </div>
  )
}

function CreditHoldModal({
  account, onClose, onDone,
}: {
  account: { id: string; name: string; onHold: boolean }
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const placing = !account.onHold

  async function submit() {
    if (placing && !reason.trim()) {
      setFieldError('A reason is required to place an account on credit hold.')
      return
    }
    setBusy(true); setError(null); setFieldError(null)
    try {
      const res = await setCreditHold(account.id, placing, reason || undefined)
      toast.success(placing ? 'Account placed on credit hold' : 'Credit hold released', {
        description: res.note,
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
      title={placing ? 'Place on credit hold' : 'Release credit hold'}
      subtitle={account.name}
      traces="AR-11"
      onClose={onClose}
      footer={
        <>
          <GatedButton variant="ghost" onClick={onClose}>Cancel</GatedButton>
          <GatedButton
            variant={placing ? 'danger' : 'primary'} onClick={submit} busy={busy}
          >
            {placing ? 'Place on hold' : 'Release hold'}
          </GatedButton>
        </>
      }
    >
      <RefusalNotice error={error} onDismiss={() => setError(null)} />
      <Note>
        {placing
          ? 'This account will no longer be able to book on account. Prepaid booking stays available to them, so they are not blocked from trading — only from trading on credit.'
          : 'This account will be able to book on account again.'}
      </Note>
      {placing && (
        <div style={{ marginTop: 14 }}>
          <Field
            label="Reason"
            required
            error={fieldError}
            hint="Shown to staff when a booking is refused, and recorded in the audit log."
          >
            <textarea
              value={reason}
              onChange={e => { setReason(e.target.value); setFieldError(null) }}
              rows={2}
              placeholder="e.g. Beyond terms on INV-000123"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>
        </div>
      )}
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// A-04 — aged receivables
// ─────────────────────────────────────────────────────────────────────────────

function AgedTab() {
  const aged = useAsync(() => getAgedReceivables(), [])
  if (aged.loading) return <Loading label="Ageing receivables…" />
  const d = aged.data

  return (
    <>
      {d && !d.reconciliation.agrees && (
        <div style={{ marginBottom: 'var(--card-gap)' }}>
          <Note tone="warn">
            The ageing buckets total {d.reconciliation.buckets.display} but the invoice register
            says {d.reconciliation.invoiceRegister.display} — a variance of{' '}
            {d.reconciliation.variance.display}. Investigate before relying on this report or
            sending statements.
          </Note>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
        <Stat label="Total due" value={<Amount value={d?.totals.totalDue} size={24} bold />} />
        <Stat label="Current" value={<Amount value={d?.totals.current} size={20} bold />} />
        <Stat label="1–30 days" value={<Amount value={d?.totals.days1To30} size={20} bold />} />
        <Stat label="31–60 days" value={<Amount value={d?.totals.days31To60} size={20} bold />} tone="warn" />
        <Stat label="61–90 days" value={<Amount value={d?.totals.days61To90} size={20} bold />} tone="warn" />
        <Stat label="90+ days" value={<Amount value={d?.totals.days90Plus} size={20} bold />} tone="warn" />
      </div>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel
          title="Aged receivables by account"
          subtitle={d?.reconciliation.agrees
            ? 'Agrees with the invoice register'
            : 'Does not agree with the invoice register'}
          traces="AR-05"
          padded={false}
        >
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH>Account</TH>
                <TH align="right">Current</TH>
                <TH align="right">1–30</TH>
                <TH align="right">31–60</TH>
                <TH align="right">61–90</TH>
                <TH align="right">90+</TH>
                <TH align="right">Total</TH>
              </HeadRow>
              <tbody>
                {!d?.rows.length && (
                  <EmptyRow colSpan={7}>Nothing outstanding. Every issued invoice is settled.</EmptyRow>
                )}
                {d?.rows.map(r => (
                  <TR key={r.accountId}>
                    <TD>
                      <Link
                        to={`/billing/receivables/accounts/${r.accountId}`}
                        style={{ fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none' }}
                      >
                        {r.accountName}
                      </Link>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                        {r.accountCode}
                      </span>
                    </TD>
                    <TD align="right"><Amount value={r.buckets.current} /></TD>
                    <TD align="right"><Amount value={r.buckets.days1To30} /></TD>
                    <TD align="right"><Amount value={r.buckets.days31To60} /></TD>
                    <TD align="right"><Amount value={r.buckets.days61To90} /></TD>
                    <TD align="right">
                      <Amount
                        value={r.buckets.days90Plus}
                        tone={Number(r.buckets.days90Plus.amount) > 0 ? 'debit' : undefined}
                      />
                    </TD>
                    <TD align="right"><Amount value={r.totalDue} bold /></TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          </ScrollTable>
        </Panel>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// A-05 — collections worklist
// ─────────────────────────────────────────────────────────────────────────────

function CollectionsTab() {
  const list = useAsync(() => getCollections(), [])
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const rows = list.data ?? []
  const paused = rows.filter(r => r.paused)

  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
        <Stat label="To chase" value={rows.length - paused.length} />
        <Stat
          label="Paused"
          value={paused.length}
          sub="disputed — reminders are held"
          tone={paused.length ? 'warn' : 'neutral'}
        />
        <Stat
          label="Promises to pay"
          value={rows.filter(r => r.promiseToPayDate).length}
        />
      </div>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel
          title="Collections worklist"
          subtitle="Overdue invoices by dunning step. A paused ladder always says why."
          traces="AR-06"
          padded={false}
        >
          {list.loading ? <Loading /> : (
            <ScrollTable>
              <DataTable>
                <HeadRow>
                  <TH>Invoice</TH>
                  <TH>Account</TH>
                  <TH>Due</TH>
                  <TH align="right">Overdue</TH>
                  <TH align="right">Balance</TH>
                  <TH>Step</TH>
                  <TH>Next action</TH>
                  <TH />
                </HeadRow>
                <tbody>
                  {!rows.length && (
                    <EmptyRow colSpan={8}>Nothing overdue. The ladder has nothing to chase.</EmptyRow>
                  )}
                  {rows.map(r => (
                    <TR key={r.invoiceId} highlight={r.daysOverdue > 30}>
                      <TD>
                        <Link to={`/billing/invoices/${r.invoiceId}`} style={{
                          fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none',
                        }}>
                          {r.invoiceNumber}
                        </Link>
                        <span style={{ display: 'block', marginTop: 2 }}>
                          <StatusPill status={r.status} />
                        </span>
                      </TD>
                      <TD>
                        {r.accountName}
                        {r.creditHold && (
                          <span style={{
                            display: 'block', fontSize: 11.5, color: '#B91C1C', fontWeight: 600,
                          }}>
                            On credit hold
                          </span>
                        )}
                      </TD>
                      <TD>{formatDate(r.dueDate)}</TD>
                      <TD align="right">
                        <span style={{
                          fontWeight: 600,
                          color: r.daysOverdue > 30 ? '#B91C1C'
                            : r.daysOverdue > 0 ? '#C2410C' : undefined,
                        }}>
                          {r.daysOverdue}d
                        </span>
                      </TD>
                      <TD align="right"><Amount value={r.balanceDue} bold /></TD>
                      <TD>{r.dunningStep}</TD>
                      <TD>
                        {r.paused ? (
                          <span style={{ fontSize: 12, color: '#7E22CE', fontWeight: 600 }}>
                            Paused — {r.pauseReason ?? 'disputed'}
                          </span>
                        ) : r.promiseToPayDate ? (
                          <span style={{ fontSize: 12, color: '#15803D', fontWeight: 600 }}>
                            Promised {formatDate(r.promiseToPayDate)}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {r.nextStepSubject ?? '—'}
                          </span>
                        )}
                      </TD>
                      <TD align="right">
                        <GatedButton
                          size="sm"
                          onClick={() => setNoteFor(r.invoiceId)}
                          blockedReason={r.paused
                            ? 'Chasing is paused while the dispute is open. Resolve it in the Disputes tab first.'
                            : null}
                        >
                          Log action
                        </GatedButton>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </DataTable>
            </ScrollTable>
          )}
        </Panel>
      </div>

      {noteFor && (
        <CollectionNoteModal
          invoiceId={noteFor}
          onClose={() => setNoteFor(null)}
          onDone={() => { setNoteFor(null); list.reload() }}
        />
      )}
    </>
  )
}

function CollectionNoteModal({
  invoiceId, onClose, onDone,
}: {
  invoiceId: string; onClose: () => void; onDone: () => void
}) {
  const [detail, setDetail] = useState('')
  const [promise, setPromise] = useState('')
  const [escalate, setEscalate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  async function submit() {
    setBusy(true); setError(null)
    try {
      await addCollectionNote(invoiceId, {
        detail: detail || undefined,
        promiseToPayDate: promise || undefined,
        escalate,
      })
      toast.success(escalate ? 'Escalated to the next step' : 'Action logged')
      onDone()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Log a collection action"
      subtitle="Recorded against the dunning ladder for this invoice"
      traces="AR-06"
      onClose={onClose}
      footer={
        <>
          <GatedButton variant="ghost" onClick={onClose}>Cancel</GatedButton>
          <GatedButton variant="primary" onClick={submit} busy={busy}>Save</GatedButton>
        </>
      }
    >
      <RefusalNotice error={error} onDismiss={() => setError(null)} />
      <Field label="What happened" hint="A phone call, an email, a conversation.">
        <textarea
          value={detail} onChange={e => setDetail(e.target.value)} rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>
      <Field label="Promise to pay" hint="If they committed to a date, record it here.">
        <input type="date" value={promise} onChange={e => setPromise(e.target.value)} style={inputStyle} />
      </Field>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
        fontWeight: 600, cursor: 'pointer',
      }}>
        <input type="checkbox" checked={escalate} onChange={e => setEscalate(e.target.checked)} />
        Escalate to the next ladder step
      </label>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// A-07 — dispute queue
// ─────────────────────────────────────────────────────────────────────────────

function DisputesTab() {
  const [status, setStatus] = useState('raised,under_review')
  const list = useAsync(() => getDisputes(status), [status])
  const [resolving, setResolving] = useState<DisputeRow | null>(null)
  const rows = list.data ?? []

  return (
    <>
      <Panel
        title="Dispute queue"
        subtitle="Resolving a dispute resumes payment reminders on its invoice"
        traces="AR-09"
        padded={false}
        actions={
          <select
            value={status} onChange={e => setStatus(e.target.value)}
            style={{ ...inputStyle, width: 180, padding: '6px 10px', fontSize: 13 }}
          >
            <option value="raised,under_review">Open</option>
            <option value="all">All</option>
            <option value="upheld">Upheld</option>
            <option value="credited">Credited</option>
            <option value="adjusted">Adjusted</option>
          </select>
        }
      >
        {list.loading ? <Loading /> : !rows.length ? (
          <p style={{ margin: 0, padding: 'var(--card-pad)', fontSize: 13, color: 'var(--text-tertiary)' }}>
            No disputes {status === 'all' ? 'recorded' : 'open'}.
          </p>
        ) : (
          <div>
            {rows.map(x => (
              <div key={x.id} style={{
                padding: 'var(--card-pad)', borderTop: '1px solid rgba(0,0,0,0.06)',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  gap: 12, flexWrap: 'wrap', alignItems: 'flex-start',
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Link to={`/billing/invoices/${x.invoiceId}`} style={{
                        fontWeight: 700, fontSize: 14, color: 'var(--brand-color)',
                        textDecoration: 'none',
                      }}>
                        {x.invoiceNumber}
                      </Link>
                      <StatusPill status={x.status} />
                      <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                        {x.accountName}
                      </span>
                    </div>
                    <p style={{ margin: '5px 0 0', fontSize: 13, color: '#1C1917' }}>
                      <strong>{humanise(x.reasonCode)}</strong>
                      {x.reasonNote ? ` — ${x.reasonNote}` : ''}
                    </p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
                      Raised by {x.raisedBy ?? 'customer'} on {formatDate(x.createdAt)}
                      {x.resolvedBy && ` · resolved by ${x.resolvedBy} (${x.resolution})`}
                    </p>

                    {x.lines.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <p style={{
                          margin: '0 0 5px', fontSize: 11, fontWeight: 700,
                          letterSpacing: '0.04em', textTransform: 'uppercase',
                          color: 'var(--text-tertiary)',
                        }}>
                          Contested lines
                        </p>
                        {x.lines.map(l => (
                          <div key={l.id} style={{
                            padding: '6px 0', borderTop: '1px solid rgba(0,0,0,0.05)',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{l.description}</span>
                              <span style={{
                                fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                              }}>
                                {l.lineTotal}
                              </span>
                            </div>
                            {/* The evidence: the derivation behind the contested charge */}
                            <div style={{ marginTop: 4 }}>
                              <ChargeWorkingPanel working={l.working} variant="card" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {x.disputedAmount && (
                      <div style={{ marginBottom: 6 }}>
                        <p style={{
                          margin: 0, fontSize: 10.5, fontWeight: 700,
                          letterSpacing: '0.04em', textTransform: 'uppercase',
                          color: 'var(--text-tertiary)',
                        }}>
                          Disputed
                        </p>
                        <Amount value={x.disputedAmount} bold size={16} />
                      </div>
                    )}
                    {x.availableResolutions.length > 0 && (
                      <GatedButton variant="primary" size="sm" onClick={() => setResolving(x)}>
                        Resolve
                      </GatedButton>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {resolving && (
        <ResolveDisputeModal
          dispute={resolving}
          onClose={() => setResolving(null)}
          onDone={() => { setResolving(null); list.reload() }}
        />
      )}
    </>
  )
}

function ResolveDisputeModal({
  dispute, onClose, onDone,
}: {
  dispute: DisputeRow; onClose: () => void; onDone: () => void
}) {
  const [resolution, setResolution] = useState<'uphold' | 'credit' | 'adjust' | ''>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const OUTCOMES = [
    {
      value: 'uphold' as const,
      label: 'Uphold the charge',
      detail: 'The charge stands. Payment reminders resume immediately.',
    },
    {
      value: 'credit' as const,
      label: 'Credit it',
      detail: 'Resolve in the customer’s favour. You then raise a credit note against the invoice.',
    },
    {
      value: 'adjust' as const,
      label: 'Adjust it',
      detail: 'Partially agree. Adjust the underlying charge, then credit the difference.',
    },
  ]

  async function submit() {
    if (!resolution) { setFieldError('Choose an outcome.'); return }
    if (!note.trim()) { setFieldError('A resolution note is required.'); return }
    setBusy(true); setError(null); setFieldError(null)
    try {
      const res = await resolveDispute(dispute.id, { resolution, resolutionNote: note })
      toast.success('Dispute resolved', { description: res.nextStep })
      onDone()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Resolve dispute"
      subtitle={`${dispute.invoiceNumber} · ${dispute.accountName}`}
      traces="AR-09"
      onClose={onClose}
      footer={
        <>
          <GatedButton variant="ghost" onClick={onClose}>Cancel</GatedButton>
          <GatedButton variant="primary" onClick={submit} busy={busy}>Resolve</GatedButton>
        </>
      }
    >
      <RefusalNotice error={error} onDismiss={() => setError(null)} />
      <Note>
        Whichever outcome you choose, payment reminders resume on this invoice once it is
        resolved.
      </Note>
      <div style={{ marginTop: 14 }}>
        <Field label="Outcome" required error={fieldError}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {OUTCOMES.map(o => (
              <label key={o.value} style={{
                display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer',
                padding: '9px 11px',
                border: `1px solid ${resolution === o.value ? 'var(--brand-color)' : 'rgba(0,0,0,0.12)'}`,
                background: resolution === o.value ? 'rgba(var(--brand-rgb),0.04)' : '#fff',
                borderRadius: 'var(--r-md)',
              }}>
                <input
                  type="radio" name="resolution" checked={resolution === o.value}
                  onChange={() => { setResolution(o.value); setFieldError(null) }}
                  style={{ marginTop: 2 }}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: '#1C1917' }}>
                    {o.label}
                  </span>
                  <span style={{
                    display: 'block', fontSize: 12, color: 'var(--text-secondary)',
                    marginTop: 1, lineHeight: 1.4,
                  }}>
                    {o.detail}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Field>
        <Field
          label="Resolution note"
          required
          hint="What was decided and why — this is what the customer is told."
        >
          <textarea
            value={note} onChange={e => { setNote(e.target.value); setFieldError(null) }}
            rows={3} style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// A-08 — credit-limit overrides
// ─────────────────────────────────────────────────────────────────────────────

function OverridesTab() {
  const { caps } = useBillingCapabilities()
  const list = useAsync(() => getCreditOverrides(), [])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const rows = list.data ?? []

  async function decide(id: string, decision: 'approved' | 'declined') {
    setBusy(id); setError(null)
    try {
      await decideCreditOverride(id, decision)
      toast.success(`Override ${decision}`)
      list.reload()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <RefusalNotice error={error} onDismiss={() => setError(null)} />
      <Panel
        title="Credit-limit overrides"
        subtitle="A controlled exception. The requester can never approve their own request."
        traces="AR-03"
        padded={false}
      >
        {list.loading ? <Loading /> : (
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH>Account</TH>
                <TH align="right">Current limit</TH>
                <TH align="right">Requested</TH>
                <TH align="right">Exposure then</TH>
                <TH>Reason</TH>
                <TH>Requested by</TH>
                <TH>Status</TH>
                <TH />
              </HeadRow>
              <tbody>
                {!rows.length && (
                  <EmptyRow colSpan={8}>No override requests.</EmptyRow>
                )}
                {rows.map(r => (
                  <TR key={r.id}>
                    <TD>
                      <Link to={`/billing/receivables/accounts/${r.accountId}`} style={{
                        fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none',
                      }}>
                        {r.accountName}
                      </Link>
                    </TD>
                    <TD align="right"><Amount value={r.currentLimit} /></TD>
                    <TD align="right"><Amount value={r.requestedAmount} bold /></TD>
                    <TD align="right"><Amount value={r.exposureAtRequest} /></TD>
                    <TD style={{ maxWidth: 240 }}>{r.reason}</TD>
                    <TD>
                      {r.requestedBy ?? '—'}
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                        {formatDate(r.createdAt)}
                      </span>
                    </TD>
                    <TD>
                      <StatusPill status={r.status === 'pending' ? 'under_review' : r.status} />
                      {r.decidedBy && (
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                          by {r.decidedBy}
                        </span>
                      )}
                    </TD>
                    <TD align="right">
                      {r.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <GatedButton
                            size="sm" variant="primary"
                            busy={busy === r.id}
                            onClick={() => decide(r.id, 'approved')}
                            blockedReason={reasonFor(caps, 'can_override_credit_limit')}
                          >
                            Approve
                          </GatedButton>
                          <GatedButton
                            size="sm" variant="danger"
                            busy={busy === r.id}
                            onClick={() => decide(r.id, 'declined')}
                            blockedReason={reasonFor(caps, 'can_override_credit_limit')}
                          >
                            Decline
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
    </>
  )
}
