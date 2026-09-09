import { Link, useParams } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { getAccount } from '@/lib/db/billing'
import {
  Amount, DataTable, EmptyRow, HeadRow, Loading, Note, Panel, ScrollTable, Stat,
  StatusPill, TD, TH, TR, formatDate, humanise, useAsync,
} from '@/components/billing/BillingUI'

/**
 * A-02 Account detail — one customer, whole picture (AR-01, AR-04, TF-03, AR-12).
 *
 * The panel the FRS calls N-10 (payment risk) is here as observed behaviour
 * rather than a score: "18 of 20 invoices paid by the due date, averaging 27
 * days against 30-day terms" is defensible to the customer in a way that a
 * number out of ten is not (AN-09, AN-11).
 */
export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>()
  const acct = useAsync(() => getAccount(id!), [id])
  usePageTitle(acct.data?.profile?.legalName ?? 'Account')

  if (acct.loading) return <Loading label="Loading account…" />
  if (!acct.data) return <Note tone="warn">This account could not be loaded.</Note>

  const d = acct.data
  const p = d.profile
  const t = d.termsAndCredit

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--card-gap)' }}>
      <Panel padded={false}>
        <div style={{ padding: 'var(--card-pad)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1C1917' }}>
              {p.legalName}
            </h1>
            <StatusPill status={p.status} size={12.5} />
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            {p.accountCode}
            {p.tradingName && p.tradingName !== p.legalName && ` · trading as ${p.tradingName}`}
            {p.abn && ` · ABN ${p.abn}`}
          </p>
        </div>

        {/* AR-11 / AR-02: what this account can and cannot do right now */}
        {!t.bookingRights.onAccount && (
          <div style={{ padding: '0 var(--card-pad) var(--card-pad)' }}>
            <Note tone="warn">
              <strong>Cannot book on account.</strong> {t.bookingRights.reason}{' '}
              Prepaid booking remains available to them, so they are not blocked from trading.
            </Note>
          </div>
        )}
      </Panel>

      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
        <Stat label="Credit limit" value={<Amount value={t.creditLimit} size={22} bold />} />
        <Stat
          label="Exposure"
          value={<Amount value={t.exposure} size={22} bold />}
          sub={t.pctOfLimit == null ? 'No limit set' : `${t.pctOfLimit}% of limit`}
          tone={t.pctOfLimit != null && t.pctOfLimit >= 80 ? 'warn' : 'neutral'}
        />
        <Stat label="Headroom" value={<Amount value={t.headroom} size={22} bold />} />
        <Stat
          label="Open invoices"
          value={t.openInvoices}
          sub={t.earliestDueDate ? `earliest due ${formatDate(t.earliestDueDate)}` : undefined}
        />
        <Stat
          label="Prepayment balance"
          value={<Amount value={d.prepayments.balance} size={22} bold />}
          sub="funds held on account"
        />
      </div>

      <div style={{
        display: 'grid', gap: 'var(--card-gap)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      }}>
        <Panel title="Terms & credit" traces="AR-04">
          <KV label="Payment terms" value={`${humanise(t.paymentTerms)} (${t.paymentTermsDays} days)`} />
          <KV label="Invoice cycle" value={humanise(t.invoiceCycle)} />
          <KV label="Statements" value={humanise(t.statementFrequency)} />
          <KV
            label="Credit hold"
            value={t.creditHold ? `Yes — ${t.creditHoldReason ?? 'no reason recorded'}` : 'No'}
          />
        </Panel>

        <Panel title="Tariff" traces="TF-03">
          <KV
            label="Rate card"
            value={
              d.tariff.rateCardId
                ? <Link to={`/billing/settings#tariffs`} style={{
                    color: 'var(--brand-color)', textDecoration: 'none', fontWeight: 600,
                  }}>
                    {d.tariff.rateCardName}
                  </Link>
                : 'None assigned'
            }
          />
          <KV label="Basis" value={d.tariff.basis} />
          {d.tariff.rateCardStatus && (
            <KV label="Card status" value={humanise(d.tariff.rateCardStatus)} />
          )}
          {!d.tariff.rateCardId && (
            <div style={{ marginTop: 8 }}>
              <Note>
                With no card assigned this account is priced on the site default. Assign a card
                in Settings → Rate cards if it has negotiated rates.
              </Note>
            </div>
          )}
        </Panel>

        <Panel title="Profile" traces="AR-01">
          <KV label="Billing contact" value={p.billingContact ?? '—'} />
          <KV label="Billing email" value={p.billingEmail ?? '—'} />
          <KV label="Phone" value={p.billingPhone ?? '—'} />
          <KV label="Address" value={p.billingAddress ?? '—'} />
          <KV
            label="Approved"
            value={p.approvedAt ? `${formatDate(p.approvedAt)} by ${p.approvedBy ?? '—'}` : 'Not approved'}
          />
        </Panel>

        {/* AN-09 / AN-11 — behaviour with its derivation, not a bare score */}
        <Panel title="Payment behaviour" traces="AN-09">
          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#1C1917', lineHeight: 1.5 }}>
            {d.paymentBehaviour.explanation}
          </p>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <KV label="Invoices paid" value={String(d.paymentBehaviour.invoicesPaid)} />
            <KV
              label="Avg days to pay"
              value={d.paymentBehaviour.avgDaysToPay == null ? '—' : `${d.paymentBehaviour.avgDaysToPay}d`}
            />
            <KV
              label="On time"
              value={d.paymentBehaviour.onTimeRate == null ? '—' : `${d.paymentBehaviour.onTimeRate}%`}
            />
            <KV
              label="Worst late"
              value={d.paymentBehaviour.worstDaysLate == null ? '—' : `${d.paymentBehaviour.worstDaysLate}d`}
            />
          </div>
        </Panel>
      </div>

      {d.aged && (
        <Panel title="Ageing" traces="AR-05">
          <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
            <Stat label="Current" value={<Amount value={d.aged.current} size={18} bold />} />
            <Stat label="1–30" value={<Amount value={d.aged.days1To30} size={18} bold />} />
            <Stat label="31–60" value={<Amount value={d.aged.days31To60} size={18} bold />} />
            <Stat label="61–90" value={<Amount value={d.aged.days61To90} size={18} bold />} />
            <Stat label="90+" value={<Amount value={d.aged.days90Plus} size={18} bold />} tone="warn" />
            <Stat label="Total" value={<Amount value={d.aged.totalDue} size={18} bold />} />
          </div>
        </Panel>
      )}

      <Panel title="Invoices" traces="IN-11" padded={false}>
        <ScrollTable>
          <DataTable>
            <HeadRow>
              <TH>Invoice</TH>
              <TH>Issued</TH>
              <TH>Due</TH>
              <TH align="right">Total</TH>
              <TH align="right">Paid</TH>
              <TH align="right">Balance</TH>
              <TH>State</TH>
              <TH>Delivery</TH>
            </HeadRow>
            <tbody>
              {!d.invoices.length && (
                <EmptyRow colSpan={8}>No invoices issued to this account yet.</EmptyRow>
              )}
              {d.invoices.map((i: any) => (
                <TR key={i.id}>
                  <TD>
                    <Link to={`/billing/invoices/${i.id}`} style={{
                      fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none',
                    }}>
                      {i.invoiceNumber}
                    </Link>
                  </TD>
                  <TD>{formatDate(i.issueDate)}</TD>
                  <TD>{formatDate(i.dueDate)}</TD>
                  <TD align="right"><Amount value={i.total} /></TD>
                  <TD align="right"><Amount value={i.amountPaid} /></TD>
                  <TD align="right">
                    <Amount value={i.balanceDue} bold={Number(i.balanceDue.amount) > 0} />
                  </TD>
                  <TD><StatusPill status={i.status} /></TD>
                  <TD><StatusPill status={i.deliveryState} /></TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        </ScrollTable>
      </Panel>

      {d.prepayments.movements.length > 0 && (
        <Panel title="Prepayments" subtitle="Funds held on account and how they were drawn down" traces="AR-12" padded={false}>
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH>Date</TH>
                <TH>Direction</TH>
                <TH align="right">Amount</TH>
                <TH>Note</TH>
              </HeadRow>
              <tbody>
                {d.prepayments.movements.map((m: any) => (
                  <TR key={m.id}>
                    <TD>{formatDate(m.at)}</TD>
                    <TD>{humanise(m.direction)}</TD>
                    <TD align="right">
                      <Amount value={m.amount} tone={m.direction === 'in' ? 'credit' : undefined} />
                    </TD>
                    <TD>{m.note ?? '—'}</TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          </ScrollTable>
        </Panel>
      )}

      {d.disputes.length > 0 && (
        <Panel title="Disputes" traces="AR-09" padded={false}>
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH>Invoice</TH>
                <TH>Reason</TH>
                <TH>Status</TH>
                <TH>Raised</TH>
              </HeadRow>
              <tbody>
                {d.disputes.map((x: any) => (
                  <TR key={x.id}>
                    <TD>{x.invoiceNumber}</TD>
                    <TD>{humanise(x.reasonCode)}</TD>
                    <TD><StatusPill status={x.status} /></TD>
                    <TD>{formatDate(x.createdAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          </ScrollTable>
        </Panel>
      )}
    </div>
  )
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
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
    </div>
  )
}
