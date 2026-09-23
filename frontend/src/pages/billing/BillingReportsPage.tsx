import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import {
  getAuditLog, getConcessionsReport, getExceptionsReport, getGstSummary,
  getIntegrityChecks, getLeakage, getPaymentMixReport, getRevenueByCustomer,
  getRevenueByService, getStorageDwellReport,
} from '@/lib/db/billing'
import { useBillingCapabilities } from '@/lib/useBillingCapabilities'
import {
  Amount, DataTable, EmptyRow, GatedButton, HeadRow, Loading, Note, Panel,
  ScrollTable, Stat, TD, TH, TR, formatDate, formatDateTime, humanise, inputStyle,
  useAsync,
} from '@/components/billing/BillingUI'

/**
 * R-01 report library and the reports themselves (RP-01 … RP-09, AN-03, NFR-B-04/08).
 *
 * The FRS's framing for §8 is a loop, not a filing cabinet: a report should end
 * in an action. So the leakage console and the exception report both carry the
 * remedy screen for each row rather than leaving the reader to work out where
 * to go.
 */

const REPORTS = [
  { key: 'gst',         label: 'GST / BAS',        traces: 'RP-04' },
  { key: 'service',     label: 'By service',       traces: 'RP-01' },
  { key: 'customer',    label: 'By customer',      traces: 'RP-02' },
  { key: 'storage',     label: 'Storage & dwell',  traces: 'RP-05' },
  { key: 'concessions', label: 'Concessions',      traces: 'RP-07' },
  { key: 'payments',    label: 'Payment mix',      traces: 'RP-09' },
  { key: 'leakage',     label: 'Leakage',          traces: 'AN-03' },
  { key: 'exceptions',  label: 'Exceptions',       traces: 'RP-08' },
  { key: 'integrity',   label: 'Integrity',        traces: 'NFR-B-08' },
  { key: 'audit',       label: 'Audit log',        traces: 'NFR-B-04' },
] as const

type Key = typeof REPORTS[number]['key']

function defaultPeriod() {
  const now = new Date()
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  }
}

export default function BillingReportsPage() {
  usePageTitle('Reports')
  const { hash } = useLocation()
  const initial = (hash.replace('#', '') || 'gst') as Key
  const [key, setKey] = useState<Key>(REPORTS.some(r => r.key === initial) ? initial : 'gst')
  const [period, setPeriod] = useState(defaultPeriod)
  const { caps } = useBillingCapabilities()

  const needsPeriod = !['leakage', 'exceptions', 'integrity'].includes(key)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--card-gap)' }}>
      <div className="billing-subnav">
        {REPORTS.map(r => (
          <a key={r.key} href={`#${r.key}`}
            className={key === r.key ? 'active' : ''}
            onClick={() => setKey(r.key)}>
            {r.label}
          </a>
        ))}
      </div>

      {needsPeriod && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
              From
            </span>
            <input type="date" value={period.from}
              onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))}
              style={{ ...inputStyle, width: 160 }} />
          </label>
          <label>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
              To
            </span>
            <input type="date" value={period.to}
              onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))}
              style={{ ...inputStyle, width: 160 }} />
          </label>
          <GatedButton
            blockedReason={caps.can_export ? null
              : 'You do not have permission to export data. Ask an administrator to grant the export capability.'}
          >
            Export
          </GatedButton>
        </div>
      )}

      {key === 'gst'         && <GstReport period={period} />}
      {key === 'service'     && <ServiceReport period={period} />}
      {key === 'customer'    && <CustomerReport period={period} />}
      {key === 'storage'     && <StorageReport period={period} />}
      {key === 'concessions' && <ConcessionsReport period={period} />}
      {key === 'payments'    && <PaymentMixReport period={period} />}
      {key === 'leakage'     && <LeakageConsole />}
      {key === 'exceptions'  && <ExceptionsReport />}
      {key === 'integrity'   && <IntegrityReport />}
      {key === 'audit'       && <AuditLogReport />}
    </div>
  )
}

type Period = { from: string; to: string }

// ── R-04 GST / BAS (RP-04, TX-04) ───────────────────────────────────────────

function GstReport({ period }: { period: Period }) {
  const r = useAsync(() => getGstSummary(period), [period.from, period.to])
  if (r.loading) return <Loading />
  const d = r.data
  if (!d) return <Note tone="warn">Could not load the GST summary.</Note>

  return (
    <>
      {!d.reconciliation.agrees && (
        <Note tone="warn">
          Line-level GST does not reconcile to the invoice register — a variance of{' '}
          {d.reconciliation.taxVariance.display}. Resolve this before lodging a BAS from
          these figures.
        </Note>
      )}
      {!d.registration.isRegistered && (
        <Note>
          This tenant is not registered for GST, so no GST is charged and invoices are titled
          "Invoice" rather than "Tax Invoice".
        </Note>
      )}

      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap', marginTop: 'var(--card-gap)' }}>
        <Stat label="Sales excl. GST" value={<Amount value={d.summary.salesExGst} size={22} bold />} />
        <Stat label="GST on sales" value={<Amount value={d.summary.gstOnSales} size={22} bold />} />
        <Stat label="Sales incl. GST" value={<Amount value={d.summary.salesIncGst} size={22} bold />} />
        <Stat
          label="Reconciles"
          value={d.reconciliation.agrees ? 'Yes' : 'No'}
          tone={d.reconciliation.agrees ? 'good' : 'warn'}
          sub="line level vs invoice register"
        />
      </div>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel title="By tax treatment" traces="TX-01" padded={false}>
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH>Treatment</TH><TH>Code</TH><TH align="right">Rate</TH>
                <TH align="right">Invoices</TH><TH align="right">Taxable base</TH>
                <TH align="right">GST</TH>
              </HeadRow>
              <tbody>
                {!d.byTreatment.length && <EmptyRow colSpan={6}>No invoiced lines in this period.</EmptyRow>}
                {d.byTreatment.map((t: any, i: number) => (
                  <TR key={i}>
                    <TD>{humanise(t.taxability)}</TD>
                    <TD>{t.taxCode}</TD>
                    <TD align="right">{t.taxRate}%</TD>
                    <TD align="right">{t.invoiceCount}</TD>
                    <TD align="right"><Amount value={t.taxableBase} /></TD>
                    <TD align="right"><Amount value={t.gst} bold /></TD>
                  </TR>
                ))}
                {Number(d.creditNotes.gst.amount) !== 0 && (
                  <TR>
                    <TD>Credit notes</TD><TD>—</TD><TD align="right">—</TD><TD align="right">—</TD>
                    <TD align="right"><Amount value={d.creditNotes.base} tone="credit" /></TD>
                    <TD align="right"><Amount value={d.creditNotes.gst} tone="credit" bold /></TD>
                  </TR>
                )}
              </tbody>
            </DataTable>
          </ScrollTable>
        </Panel>
      </div>
    </>
  )
}

// ── R-02 revenue by service (RP-01) ─────────────────────────────────────────

function ServiceReport({ period }: { period: Period }) {
  const r = useAsync(() => getRevenueByService(period), [period.from, period.to])
  if (r.loading) return <Loading />
  const d = r.data

  return (
    <Panel
      title="Revenue by service"
      subtitle={`Compared with ${d?.priorPeriod.from} – ${d?.priorPeriod.to}`}
      traces="RP-01"
      padded={false}
    >
      <ScrollTable>
        <DataTable>
          <HeadRow>
            <TH>Service</TH><TH>Category</TH><TH align="right">Invoices</TH>
            <TH align="right">Quantity</TH><TH align="right">Net revenue</TH>
            <TH align="right">Prior period</TH><TH align="right">Change</TH>
          </HeadRow>
          <tbody>
            {!d?.rows.length && <EmptyRow colSpan={7}>No invoiced revenue in this period.</EmptyRow>}
            {d?.rows.map((x: any, i: number) => (
              <TR key={i}>
                <TD>
                  <span style={{ fontWeight: 600, color: '#1C1917' }}>{x.itemName}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                    {x.itemCode}
                  </span>
                </TD>
                <TD>{humanise(x.category)}</TD>
                <TD align="right">{x.invoiceCount}</TD>
                <TD align="right">{Number(x.totalQuantity ?? 0).toFixed(2)}</TD>
                <TD align="right"><Amount value={x.netRevenue} bold /></TD>
                <TD align="right"><Amount value={x.priorNetRevenue} /></TD>
                <TD align="right">
                  {x.changePct == null ? '—' : (
                    <span style={{
                      fontWeight: 600, color: x.changePct >= 0 ? '#15803D' : '#B91C1C',
                    }}>
                      {x.changePct >= 0 ? '▲' : '▼'} {Math.abs(x.changePct)}%
                    </span>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid rgba(0,0,0,0.14)' }}>
              <td colSpan={4} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                Total
              </td>
              <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                <Amount value={d?.totals.netRevenue} bold size={14} />
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </DataTable>
      </ScrollTable>
    </Panel>
  )
}

// ── R-03 revenue by customer, with concentration (RP-02) ────────────────────

function CustomerReport({ period }: { period: Period }) {
  const r = useAsync(() => getRevenueByCustomer(period), [period.from, period.to])
  if (r.loading) return <Loading />
  const d = r.data
  const c = d?.concentration

  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
        <Stat label="Customers" value={c?.customerCount ?? 0} />
        <Stat label="Net revenue" value={<Amount value={c?.totalNetRevenue} size={22} bold />} />
        <Stat
          label="Top customer"
          value={c?.top1Pct == null ? '—' : `${c.top1Pct}%`}
          sub="share of revenue"
          tone={c?.top1Pct != null && c.top1Pct > 30 ? 'warn' : 'neutral'}
        />
        <Stat
          label="Top 5"
          value={c?.top5Pct == null ? '—' : `${c.top5Pct}%`}
          sub="concentration risk"
          tone={c?.top5Pct != null && c.top5Pct > 70 ? 'warn' : 'neutral'}
        />
      </div>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel title="Revenue by customer" traces="RP-02" padded={false}>
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH>#</TH><TH>Account</TH><TH align="right">Invoices</TH>
                <TH align="right">Net revenue</TH><TH align="right">Outstanding</TH>
                <TH align="right">Share</TH><TH align="right">Cumulative</TH>
              </HeadRow>
              <tbody>
                {!d?.rows.length && <EmptyRow colSpan={7}>No invoiced revenue in this period.</EmptyRow>}
                {d?.rows.map((x: any) => (
                  <TR key={x.accountId}>
                    <TD>{x.rank}</TD>
                    <TD>
                      <Link to={`/billing/receivables/accounts/${x.accountId}`} style={{
                        fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none',
                      }}>
                        {x.accountName}
                      </Link>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                        {x.accountCode}
                      </span>
                    </TD>
                    <TD align="right">{x.invoiceCount}</TD>
                    <TD align="right"><Amount value={x.netRevenue} bold /></TD>
                    <TD align="right"><Amount value={x.outstanding} /></TD>
                    <TD align="right">{x.sharePct}%</TD>
                    <TD align="right">{x.cumulativeSharePct}%</TD>
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

// ── R-05 storage & dwell — the leakage metric (RP-05, TF-06) ────────────────

function StorageReport({ period }: { period: Period }) {
  const r = useAsync(() => getStorageDwellReport(period), [period.from, period.to])
  if (r.loading) return <Loading />
  const d = r.data
  const t = d?.totals

  return (
    <>
      <Note>
        Free allowance days are real storage that was provided and not charged. This report
        exists to put a number on it, which is the difference between a deliberate commercial
        decision and money quietly disappearing.
      </Note>

      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap', marginTop: 'var(--card-gap)' }}>
        <Stat label="Units stored" value={t?.cbmDaysStored ?? 0} sub="CBM-days on site" />
        <Stat label="Units billed" value={t?.cbmDaysBilled ?? 0} sub="CBM-days charged" />
        <Stat
          label="Given away"
          value={t?.cbmDaysGivenAway ?? 0}
          sub={`${t?.givenAwayPct ?? 0}% of everything stored`}
          tone={(t?.givenAwayPct ?? 0) > 25 ? 'warn' : 'neutral'}
        />
        <Stat label="Billed revenue" value={<Amount value={t?.billedRevenue} size={22} bold />} />
        <Stat
          label="Revenue given away"
          value={<Amount value={t?.revenueGivenAway} size={22} bold />}
          sub="at tariff rates"
          tone={Number(t?.revenueGivenAway?.amount ?? 0) > 0 ? 'warn' : 'good'}
        />
      </div>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel title="By consignment" traces="RP-05" padded={false}>
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH>Booking</TH><TH>Customer</TH><TH>Storage from</TH>
                <TH align="right">Stored</TH><TH align="right">Billed</TH>
                <TH align="right">Free</TH><TH align="right">Revenue</TH>
                <TH align="right">Given away</TH>
              </HeadRow>
              <tbody>
                {!d?.rows.length && (
                  <EmptyRow colSpan={8}>No storage charges raised in this period.</EmptyRow>
                )}
                {d?.rows.map((x: any) => (
                  <TR key={x.bookingId} highlight={Number(x.givenAwayValue.amount) > 0}>
                    <TD>
                      <Link to={`/reception/bookings/${x.bookingId}`} style={{
                        fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none',
                      }}>
                        {x.reference}
                      </Link>
                    </TD>
                    <TD>{x.customer ?? '—'}</TD>
                    <TD>{formatDate(x.storageStartDate)}</TD>
                    <TD align="right">{x.unitsStored}</TD>
                    <TD align="right">{x.unitsBilled}</TD>
                    <TD align="right">
                      {x.freeDaysConsumed} of {x.freeDaysGranted}
                    </TD>
                    <TD align="right"><Amount value={x.billedRevenue} bold /></TD>
                    <TD align="right">
                      <Amount value={x.givenAwayValue}
                        tone={Number(x.givenAwayValue.amount) > 0 ? 'debit' : undefined} />
                    </TD>
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

// ── R-07 concessions (RP-07) ────────────────────────────────────────────────

function ConcessionsReport({ period }: { period: Period }) {
  const r = useAsync(() => getConcessionsReport(period), [period.from, period.to])
  if (r.loading) return <Loading />
  const d = r.data

  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
        <Stat label="Concessions" value={d?.totals.concessions ?? 0} />
        <Stat label="Given away" value={<Amount value={d?.totals.totalGivenAway} size={22} bold />} />
        <Stat
          label="Unapproved"
          value={d?.totals.unapprovedCount ?? 0}
          sub="no approver recorded"
          tone={(d?.totals.unapprovedCount ?? 0) > 0 ? 'warn' : 'good'}
        />
      </div>

      <div style={{
        display: 'grid', gap: 'var(--card-gap)', marginTop: 'var(--card-gap)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      }}>
        <Panel title="By reason">
          {!d?.byReason.length ? <Muted>None.</Muted> : d.byReason.map((x: any) => (
            <Row key={x.reason} label={humanise(x.reason)} count={x.count} value={x.value} />
          ))}
        </Panel>
        <Panel title="By person" subtitle="Who is giving value away">
          {!d?.byActor.length ? <Muted>None.</Muted> : d.byActor.map((x: any) => (
            <Row key={x.actor} label={x.actor} count={x.count} value={x.value} />
          ))}
        </Panel>
      </div>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel title="Every concession" traces="RP-07" padded={false}>
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH>When</TH><TH>Booking</TH><TH>Charge</TH>
                <TH align="right">Was</TH><TH align="right">Now</TH>
                <TH align="right">Given away</TH><TH>Reason</TH>
                <TH>By</TH><TH>Approved by</TH>
              </HeadRow>
              <tbody>
                {!d?.rows.length && <EmptyRow colSpan={9}>No concessions in this period.</EmptyRow>}
                {d?.rows.map((x: any) => (
                  <TR key={x.chargeLineId} highlight={x.unapproved}>
                    <TD>{formatDate(x.at)}</TD>
                    <TD>{x.bookingReference ?? '—'}</TD>
                    <TD>{x.description}</TD>
                    <TD align="right">{x.originalTotal ? <Amount value={x.originalTotal} /> : '—'}</TD>
                    <TD align="right"><Amount value={x.newTotal} /></TD>
                    <TD align="right"><Amount value={x.givenAway} bold tone="debit" /></TD>
                    <TD>
                      {humanise(x.reasonCode ?? 'unspecified')}
                      {x.reasonNote && (
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                          {x.reasonNote}
                        </span>
                      )}
                    </TD>
                    <TD>{x.actor ?? '—'}</TD>
                    <TD>
                      {x.approver ?? (
                        <span style={{ color: '#B91C1C', fontWeight: 600, fontSize: 12 }}>
                          Not approved
                        </span>
                      )}
                    </TD>
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

// ── R-09 payment mix (RP-09) ────────────────────────────────────────────────

function PaymentMixReport({ period }: { period: Period }) {
  const r = useAsync(() => getPaymentMixReport(period), [period.from, period.to])
  if (r.loading) return <Loading />
  const d = r.data

  return (
    <>
      <Panel title="By method" traces="RP-09" padded={false}>
        <ScrollTable>
          <DataTable>
            <HeadRow>
              <TH>Method</TH><TH align="right">Receipts</TH><TH align="right">Total</TH>
              <TH align="right">Share</TH><TH align="right">Surcharges</TH>
              <TH align="right">Avg days to pay</TH>
            </HeadRow>
            <tbody>
              {!d?.byMethod.length && <EmptyRow colSpan={6}>No payments in this period.</EmptyRow>}
              {d?.byMethod.map((x: any) => (
                <TR key={x.method}>
                  <TD>{humanise(x.method)}</TD>
                  <TD align="right">{x.receiptCount}</TD>
                  <TD align="right"><Amount value={x.total} bold /></TD>
                  <TD align="right">{x.sharePct}%</TD>
                  <TD align="right"><Amount value={x.surcharges} /></TD>
                  <TD align="right">{x.avgDaysToPay == null ? '—' : `${x.avgDaysToPay}d`}</TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        </ScrollTable>
      </Panel>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel
          title="Settlement timing by account"
          subtitle="Behaviour against the terms actually agreed"
          traces="RP-09"
          padded={false}
        >
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH>Account</TH><TH align="right">Terms</TH><TH align="right">Payments</TH>
                <TH align="right">Total</TH><TH align="right">Avg days</TH>
                <TH align="right">vs terms</TH><TH align="right">Late</TH>
              </HeadRow>
              <tbody>
                {!d?.byAccount.length && <EmptyRow colSpan={7}>No payments in this period.</EmptyRow>}
                {d?.byAccount.map((x: any, i: number) => (
                  <TR key={i} highlight={x.daysOverTerms != null && x.daysOverTerms > 0}>
                    <TD>
                      {x.accountName}
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                        {x.accountCode}
                      </span>
                    </TD>
                    <TD align="right">{x.termsDays}d</TD>
                    <TD align="right">{x.payments}</TD>
                    <TD align="right"><Amount value={x.total} /></TD>
                    <TD align="right">{x.avgDaysToPay == null ? '—' : `${x.avgDaysToPay}d`}</TD>
                    <TD align="right">
                      {x.daysOverTerms == null ? '—' : (
                        <span style={{
                          fontWeight: 600,
                          color: x.daysOverTerms > 0 ? '#B91C1C' : '#15803D',
                        }}>
                          {x.daysOverTerms > 0 ? `+${x.daysOverTerms}` : x.daysOverTerms}d
                        </span>
                      )}
                    </TD>
                    <TD align="right">{x.latePayments}</TD>
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

// ── N-03 leakage console (AN-03, AN-11, F11) ────────────────────────────────

const REMEDY_LINK: Record<string, { label: string; to: string }> = {
  add_manual_charge: { label: 'Add the charge on the booking', to: '/reception/bookings' },
  adjust_charge:     { label: 'Adjust the charge', to: '/reception/bookings' },
  accrual_catchup:   { label: 'Run the accrual catch-up', to: '/billing/settings#jobs' },
  route_to_approver: { label: 'Review approvals', to: '/billing/settings#approvals' },
}

function LeakageConsole() {
  const r = useAsync(() => getLeakage(), [])
  if (r.loading) return <Loading label="Looking for leakage…" />
  const d = r.data

  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
        <Stat
          label="Estimated leakage"
          value={<Amount value={d?.totalEstimatedLeakage} size={26} bold />}
          tone={Number(d?.totalEstimatedLeakage?.amount ?? 0) > 0 ? 'warn' : 'good'}
        />
        <Stat label="Categories flagged" value={d?.categories.length ?? 0} />
      </div>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Note>{d?.provenanceNote}</Note>
      </div>

      {!d?.categories.length ? (
        <div style={{ marginTop: 'var(--card-gap)' }}>
          <Note tone="good">
            Nothing flagged. Every completed booking has charges, every charge matches its
            tariff snapshot, storage is accrued to date, and no concession is unapproved.
          </Note>
        </div>
      ) : d.categories.map(c => (
        <div key={c.code} style={{ marginTop: 'var(--card-gap)' }}>
          <Panel
            title={c.label}
            subtitle={c.explanation}
            traces={c.remedyScreen}
            padded={false}
            actions={
              <>
                {c.estimatedValue && <Amount value={c.estimatedValue} bold size={15} tone="debit" />}
                {REMEDY_LINK[c.remedy] && (
                  <Link to={REMEDY_LINK[c.remedy].to} style={{
                    fontSize: 12.5, fontWeight: 600, color: 'var(--brand-color)',
                    textDecoration: 'none',
                  }}>
                    {REMEDY_LINK[c.remedy].label} →
                  </Link>
                )}
              </>
            }
          >
            <ScrollTable>
              <DataTable>
                <HeadRow>
                  <TH>Booking</TH><TH>Detail</TH><TH>Why this was flagged</TH>
                  <TH align="right">Value</TH>
                </HeadRow>
                <tbody>
                  {c.rows.map((x: any, i: number) => (
                    <TR key={i}>
                      <TD>
                        {x.bookingId ? (
                          <Link to={`/reception/bookings/${x.bookingId}`} style={{
                            fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none',
                          }}>
                            {x.reference}
                          </Link>
                        ) : (x.itemCode ?? '—')}
                      </TD>
                      <TD>
                        {x.itemName ?? x.description ?? '—'}
                        {x.daysOnSite != null && (
                          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                            {x.daysOnSite} days on site
                          </span>
                        )}
                      </TD>
                      {/* AN-11: the derivation, before any dollar moves */}
                      <TD style={{ maxWidth: 420, fontSize: 12.5, lineHeight: 1.45 }}>
                        {x.derivation}
                      </TD>
                      <TD align="right">
                        {x.shortfall ? <Amount value={x.shortfall} bold tone="debit" />
                          : x.givenAway ? <Amount value={x.givenAway} bold tone="debit" />
                          : x.expectedRate ? <Amount value={x.expectedRate} />
                          : '—'}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </DataTable>
            </ScrollTable>
          </Panel>
        </div>
      ))}
    </>
  )
}

// ── R-08 exceptions (RP-08) ─────────────────────────────────────────────────

function ExceptionsReport() {
  const r = useAsync(() => getExceptionsReport(), [])
  if (r.loading) return <Loading />
  const list = r.data?.exceptions ?? []

  if (!list.length) {
    return (
      <Note tone="good">
        No exceptions. Nothing is unrated, unmapped, stale or unallocated.
      </Note>
    )
  }

  return (
    <>
      {list.map((e: any) => (
        <div key={e.code} style={{ marginBottom: 'var(--card-gap)' }}>
          <Panel
            title={e.label}
            subtitle={e.explanation}
            padded={false}
            actions={
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: e.severity === 'high' ? '#B91C1C'
                  : e.severity === 'medium' ? '#C2410C' : 'var(--text-tertiary)',
                background: e.severity === 'high' ? 'rgba(220,38,38,0.10)'
                  : e.severity === 'medium' ? 'rgba(234,88,12,0.10)' : 'rgba(0,0,0,0.05)',
                padding: '3px 9px', borderRadius: 'var(--r-full)',
              }}>
                {e.severity} · {e.count}
              </span>
            }
          >
            <ScrollTable>
              <DataTable>
                <HeadRow>
                  <TH>Reference</TH><TH>Detail</TH>
                </HeadRow>
                <tbody>
                  {e.rows.slice(0, 50).map((x: any, i: number) => (
                    <TR key={i}>
                      <TD>
                        {x.bookingId ? (
                          <Link to={`/reception/bookings/${x.bookingId}`} style={{
                            fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none',
                          }}>
                            {x.reference ?? x.reference_number}
                          </Link>
                        ) : x.receiptNumber ? x.receiptNumber
                          : x.itemCode ?? x.id ?? '—'}
                      </TD>
                      <TD style={{ fontSize: 12.5 }}>
                        {x.itemName && `${x.itemName} · `}
                        {x.daysOnSite != null && `${x.daysOnSite} days on site`}
                        {x.accrualsRecorded != null && `, ${x.accrualsRecorded} accruals`}
                        {x.lastAccrual && `, last ${formatDate(x.lastAccrual)}`}
                        {x.total && <> · <Amount value={x.total} /></>}
                        {x.unallocated && <> · <Amount value={x.unallocated} /> unallocated</>}
                        {x.chargeLines != null && ` · ${x.chargeLines} charge lines affected`}
                        {x.completedAt && ` · completed ${formatDate(x.completedAt)}`}
                      </TD>
                    </TR>
                  ))}
                  {e.rows.length > 50 && (
                    <TR>
                      <TD colSpan={2}>
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          …and {e.rows.length - 50} more.
                        </span>
                      </TD>
                    </TR>
                  )}
                </tbody>
              </DataTable>
            </ScrollTable>
          </Panel>
        </div>
      ))}
    </>
  )
}

// ── Y-02 integrity (NFR-B-08) ───────────────────────────────────────────────

function IntegrityReport() {
  const r = useAsync(() => getIntegrityChecks(), [])
  if (r.loading) return <Loading label="Running integrity checks…" />
  const d = r.data

  return (
    <>
      <Note tone={d?.allPassed ? 'good' : 'warn'}>
        {d?.allPassed
          ? 'Every financial integrity check passes: invoice lines agree with their headers, payments agree with allocations, and balances derive correctly.'
          : 'One or more integrity checks failed. These are arithmetic disagreements inside the ledger and should be investigated before they reach a customer.'}
        {' '}Checked {formatDateTime(d?.checkedAt)}.
      </Note>

      <div style={{ marginTop: 'var(--card-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--card-gap)' }}>
        {d?.checks.map(c => (
          <Panel
            key={c.name}
            title={c.label}
            actions={
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: c.passed ? '#15803D' : '#B91C1C',
              }}>
                {c.passed ? '✓ Passing' : `! ${c.failures} failing`}
              </span>
            }
          >
            {c.passed ? (
              <Muted>No discrepancies.</Muted>
            ) : (
              <ScrollTable>
                <DataTable>
                  <HeadRow>
                    <TH>Record</TH><TH>Detail</TH>
                  </HeadRow>
                  <tbody>
                    {c.rows.map((x: any, i: number) => (
                      <TR key={i}>
                        <TD>{x.invoice_number ?? x.receipt_number ?? x.id}</TD>
                        <TD style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
                          {JSON.stringify(x)}
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </DataTable>
              </ScrollTable>
            )}
          </Panel>
        ))}
      </div>
    </>
  )
}

// ── B-11 financial audit log (TX-06, TX-07, NFR-B-04) ───────────────────────

function AuditLogReport() {
  const [entityType, setEntityType] = useState('all')
  const r = useAsync(() => getAuditLog({ entityType, limit: 300 }), [entityType])
  const d = r.data

  const TYPES = [
    'all', 'invoice', 'credit_note', 'receipt', 'allocation', 'charge_line',
    'account', 'dispute', 'write_off', 'catalogue_item', 'rate_card', 'setting',
  ]

  return (
    <Panel
      title="Financial audit log"
      subtitle={`Append-only, retained for ${d?.retentionYears ?? 7} years. Nothing here can be edited or deleted.`}
      traces="NFR-B-04"
      padded={false}
      actions={
        <select value={entityType} onChange={e => setEntityType(e.target.value)}
          style={{ ...inputStyle, width: 180, padding: '6px 10px', fontSize: 13 }}>
          {TYPES.map(t => <option key={t} value={t}>{t === 'all' ? 'All events' : humanise(t)}</option>)}
        </select>
      }
    >
      {r.loading ? <Loading /> : (
        <ScrollTable>
          <DataTable>
            <HeadRow>
              <TH>When</TH><TH>Entity</TH><TH>Action</TH>
              <TH align="right">Amount</TH><TH>Reason</TH><TH>Actor</TH>
            </HeadRow>
            <tbody>
              {!d?.entries.length && <EmptyRow colSpan={6}>No events recorded.</EmptyRow>}
              {d?.entries.map(e => (
                <TR key={e.id}>
                  <TD>{formatDateTime(e.at)}</TD>
                  <TD>{humanise(e.entityType)}</TD>
                  <TD>
                    <span style={{ fontWeight: 600 }}>{humanise(e.action)}</span>
                  </TD>
                  <TD align="right">
                    {e.amountDelta ? <Amount value={e.amountDelta} tone="auto" /> : '—'}
                  </TD>
                  <TD>
                    {e.reasonCode ? humanise(e.reasonCode) : '—'}
                    {e.reasonNote && (
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                        {e.reasonNote}
                      </span>
                    )}
                  </TD>
                  <TD>
                    {e.actor}
                    {e.actorIp && (
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {e.actorIp}
                      </span>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        </ScrollTable>
      )}
    </Panel>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function Muted({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>{children}</p>
}

function Row({ label, count, value }: { label: string; count: number; value: any }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 10,
      padding: '6px 0', borderTop: '1px solid rgba(0,0,0,0.05)', fontSize: 13,
    }}>
      <span>
        {label}
        <span style={{ marginLeft: 6, fontSize: 11.5, color: 'var(--text-tertiary)' }}>
          ×{count}
        </span>
      </span>
      <Amount value={value} bold />
    </div>
  )
}
