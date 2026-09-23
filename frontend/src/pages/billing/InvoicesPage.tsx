import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { getInvoices } from '@/lib/db/billing'
import {
  Amount, DataTable, EmptyRow, HeadRow, Loading, Panel, ScrollTable, Stat,
  StatusPill, TD, TH, TR, formatDate, inputStyle, useAsync,
} from '@/components/billing/BillingUI'

/** B-05 Invoice list — find and act (IN-11, IN-09). */

const STATE_TABS = [
  { key: 'all',        label: 'All' },
  { key: 'draft',      label: 'Draft' },
  { key: 'issued',     label: 'Issued' },
  { key: 'part_paid',  label: 'Part paid' },
  { key: 'overdue',    label: 'Overdue' },
  { key: 'disputed',   label: 'Disputed' },
  { key: 'paid',       label: 'Paid' },
  { key: 'credited,part_credited', label: 'Credited' },
  { key: 'written_off', label: 'Written off' },
] as const

export default function InvoicesPage() {
  usePageTitle('Invoices')
  const navigate = useNavigate()
  const [status, setStatus] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')

  const list = useAsync(
    () => getInvoices({ status, search: query || undefined, limit: 300 }),
    [status, query],
  )
  const rows = list.data ?? []

  const outstanding = rows.reduce((s, r) => s + Number(r.balanceDue.amount), 0)
  const overdue = rows.filter(r => r.daysOverdue > 0)
  const currency = rows[0]?.total.currency ?? 'AUD'
  const asMoney = (n: number) => ({
    amount: n.toFixed(2), currency,
    display: new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(n),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--card-gap)' }}>
      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
        <Stat label="Invoices shown" value={rows.length} />
        <Stat label="Outstanding" value={<Amount value={asMoney(outstanding)} size={26} bold />} />
        <Stat
          label="Overdue"
          value={overdue.length}
          sub={overdue.length ? `oldest ${Math.max(...overdue.map(r => r.daysOverdue))} days` : 'none'}
          tone={overdue.length ? 'warn' : 'good'}
        />
        <Stat
          label="Delivery exceptions"
          value={rows.filter(r => r.deliveryState === 'bounced' || r.deliveryState === 'failed').length}
          sub="bounced or failed — never assume delivered"
          tone={rows.some(r => r.deliveryState === 'bounced' || r.deliveryState === 'failed')
            ? 'warn' : 'neutral'}
        />
      </div>

      <Panel
        title="Invoices"
        traces="IN-11"
        padded={false}
        actions={
          <form
            onSubmit={e => { e.preventDefault(); setQuery(search) }}
            style={{ display: 'flex', gap: 6 }}
          >
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Invoice number or account…"
              style={{ ...inputStyle, width: 240, padding: '6px 10px', fontSize: 13 }}
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
        <div style={{
          padding: '10px var(--card-pad)', borderBottom: '1px solid rgba(0,0,0,0.06)',
        }}>
          <div className="billing-subnav">
            {STATE_TABS.map(t => (
              <a
                key={t.key}
                href="#"
                className={status === t.key ? 'active' : ''}
                onClick={e => { e.preventDefault(); setStatus(t.key) }}
              >
                {t.label}
              </a>
            ))}
          </div>
        </div>

        {list.loading ? (
          <Loading label="Loading invoices…" />
        ) : (
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH>Invoice</TH>
                <TH>Account</TH>
                <TH>Issued</TH>
                <TH>Due</TH>
                <TH align="right">Total</TH>
                <TH align="right">Balance</TH>
                <TH>State</TH>
                <TH>Delivery</TH>
                <TH>Chasing</TH>
              </HeadRow>
              <tbody>
                {!rows.length && (
                  <EmptyRow colSpan={9}>
                    {query || status !== 'all'
                      ? 'No invoices match this filter.'
                      : 'No invoices yet. Issue one from the Billing Workbench.'}
                  </EmptyRow>
                )}
                {rows.map(r => (
                  <TR
                    key={r.id}
                    onClick={() => navigate(`/billing/invoices/${r.id}`)}
                    highlight={r.daysOverdue > 0 || r.openDisputes > 0}
                  >
                    <TD>
                      <span style={{ fontWeight: 600, color: 'var(--brand-color)' }}>
                        {r.invoiceNumber ?? 'Draft'}
                      </span>
                      {r.docType === 'proforma' && (
                        <span style={{
                          display: 'block', fontSize: 11, color: 'var(--text-tertiary)',
                        }}>
                          Proforma
                        </span>
                      )}
                    </TD>
                    <TD>
                      {r.accountName ?? '—'}
                      {r.accountCode && (
                        <span style={{
                          display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)',
                        }}>
                          {r.accountCode}
                        </span>
                      )}
                    </TD>
                    <TD>{formatDate(r.issueDate)}</TD>
                    <TD>
                      {formatDate(r.dueDate)}
                      {r.daysOverdue > 0 && (
                        <span style={{
                          display: 'block', fontSize: 11.5, fontWeight: 600, color: '#B91C1C',
                        }}>
                          {r.daysOverdue} day{r.daysOverdue === 1 ? '' : 's'} overdue
                        </span>
                      )}
                    </TD>
                    <TD align="right"><Amount value={r.total} /></TD>
                    <TD align="right">
                      <Amount value={r.balanceDue} bold={Number(r.balanceDue.amount) > 0} />
                    </TD>
                    <TD>
                      <StatusPill status={r.status} />
                      {r.openDisputes > 0 && (
                        <span style={{
                          display: 'block', fontSize: 11.5, color: '#7E22CE',
                          fontWeight: 600, marginTop: 2,
                        }}>
                          {r.openDisputes} open dispute{r.openDisputes === 1 ? '' : 's'}
                        </span>
                      )}
                    </TD>
                    <TD><StatusPill status={r.deliveryState} /></TD>
                    <TD>
                      {r.dunningPaused ? (
                        <span style={{ fontSize: 12, color: '#7E22CE', fontWeight: 600 }}>
                          Paused
                        </span>
                      ) : r.dunningStep > 0 ? (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Step {r.dunningStep}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
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
  )
}
