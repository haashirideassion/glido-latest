import { Link } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { getRevenueDashboard, getLeakage, getJobMonitor } from '@/lib/db/billing'
import {
  Amount, Loading, Note, Panel, Stat, useAsync, formatDate,
} from '@/components/billing/BillingUI'

/**
 * N-01 Revenue dashboard (AN-01), with the two things the FRS says an owner
 * should not have to go looking for: what is leaking (N-03 / AN-03) and whether
 * the accrual actually ran last night (Y-01 / RT-05). An accrual that quietly
 * stopped is the most expensive failure in the module, so it is on the front page.
 */
export default function BillingDashboardPage() {
  usePageTitle('Revenue Dashboard')

  const dash = useAsync(() => getRevenueDashboard(), [])
  const leak = useAsync(() => getLeakage(), [])
  const jobs = useAsync(() => getJobMonitor(), [])

  if (dash.loading) return <Loading label="Loading revenue…" />

  const d = dash.data
  const health = jobs.data?.accrualHealth

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--card-gap)' }}>
      {health?.warning && (
        <Note tone="warn">
          <strong>{health.warning}</strong>{' '}
          Storage accrues nightly; a missed run means cargo sat on your floor unbilled.{' '}
          <Link to="/billing/settings#jobs" style={{ color: 'inherit', fontWeight: 700 }}>
            Open the job monitor
          </Link>{' '}
          to run the catch-up.
        </Note>
      )}

      {/* MTD / QTD / YTD against the prior year (AN-01) */}
      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
        {(['mtd', 'qtd', 'ytd'] as const).map(k => {
          const p = d?.periods[k]
          if (!p) return null
          const label = k === 'mtd' ? 'Month to date'
            : k === 'qtd' ? 'Quarter to date' : 'Financial year to date'
          return (
            <Stat
              key={k}
              label={label}
              value={<Amount value={p.netRevenue} size={28} bold />}
              hint={`${p.from} to ${p.to}`}
              sub={
                p.changePct == null
                  ? `${p.invoices} invoice${p.invoices === 1 ? '' : 's'} · no prior-year comparison`
                  : `${p.changePct >= 0 ? '▲' : '▼'} ${Math.abs(p.changePct)}% vs ${p.priorYear.display} last year`
              }
              tone={p.changePct != null && p.changePct < 0 ? 'warn' : 'neutral'}
            />
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
        <Stat
          label="Outstanding"
          value={<Amount value={d?.receivables.outstanding} size={26} bold />}
          sub={`${d?.receivables.openInvoices ?? 0} open invoice${d?.receivables.openInvoices === 1 ? '' : 's'}`}
        />
        <Stat
          label="Overdue"
          value={<Amount value={d?.receivables.overdue} size={26} bold />}
          sub={`${d?.receivables.overduePct ?? 0}% of everything outstanding`}
          tone={(d?.receivables.overduePct ?? 0) > 20 ? 'warn' : 'neutral'}
        />
        <Stat
          label="Unbilled"
          value={<Amount value={d?.unbilled.value} size={26} bold />}
          sub={`${d?.unbilled.bookings ?? 0} booking${d?.unbilled.bookings === 1 ? '' : 's'} waiting to invoice`}
          tone={(d?.unbilled.bookings ?? 0) > 0 ? 'warn' : 'good'}
          hint="Work these in the Billing Workbench"
        />
        <Stat
          label="Estimated leakage"
          value={<Amount value={leak.data?.totalEstimatedLeakage} size={26} bold />}
          sub={
            leak.loading ? 'Checking…'
              : `${leak.data?.categories.length ?? 0} categor${leak.data?.categories.length === 1 ? 'y' : 'ies'} flagged`
          }
          tone={(leak.data?.categories.length ?? 0) > 0 ? 'warn' : 'good'}
        />
      </div>

      <div style={{
        display: 'grid', gap: 'var(--card-gap)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      }}>
        <Panel title="Revenue by category" subtitle="Financial year to date" traces="RP-01">
          {!d?.byCategory.length ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>
              No invoiced revenue yet this financial year.
            </p>
          ) : (
            <CategoryBars rows={d.byCategory} />
          )}
        </Panel>

        <Panel
          title="Revenue leakage"
          subtitle="Money earned but not charged"
          traces="AN-03"
          actions={
            <Link to="/billing/reports#leakage" style={{
              fontSize: 12.5, fontWeight: 600, color: 'var(--brand-color)', textDecoration: 'none',
            }}>
              Open console →
            </Link>
          }
        >
          {leak.loading ? (
            <Loading label="Checking for leakage…" />
          ) : !leak.data?.categories.length ? (
            <Note tone="good">
              Nothing flagged. Every completed booking has charges, every charge matches its
              tariff, storage is accrued to date and no concession is unapproved.
            </Note>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {leak.data.categories.map(c => (
                <div key={c.code} style={{
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                  gap: 12, padding: '8px 0',
                  borderTop: '1px solid rgba(0,0,0,0.06)',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1C1917' }}>
                      {c.label}
                      <span style={{
                        marginLeft: 6, fontSize: 11.5, fontWeight: 600,
                        color: 'var(--text-tertiary)',
                      }}>
                        ×{c.count}
                      </span>
                    </p>
                    <p style={{
                      margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)',
                      lineHeight: 1.4,
                    }}>
                      {c.explanation}
                    </p>
                  </div>
                  {c.estimatedValue && (
                    <Amount value={c.estimatedValue} bold tone="debit" />
                  )}
                </div>
              ))}
              <p style={{
                margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.45,
              }}>
                {leak.data.provenanceNote}
              </p>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Nightly accrual" subtitle="Storage and demurrage accrue overnight" traces="Y-01">
        {jobs.loading ? (
          <Loading />
        ) : (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
            <KV label="Last run" value={health?.lastRunDate ? formatDate(health.lastRunDate) : 'Never'} />
            <KV label="Outcome" value={health?.lastRunStatus ?? '—'} />
            <KV
              label="Ran for yesterday"
              value={health?.ranYesterday ? 'Yes' : 'No'}
              tone={health?.ranYesterday ? 'good' : 'warn'}
            />
            <KV
              label="Integrity checks"
              value={
                !jobs.data?.integrityChecks.length ? 'Not yet run'
                  : jobs.data.integrityChecks.every(c => c.passed) ? 'All passing'
                  : `${jobs.data.integrityChecks.filter(c => !c.passed).length} failing`
              }
              tone={
                !jobs.data?.integrityChecks.length ? undefined
                  : jobs.data.integrityChecks.every(c => c.passed) ? 'good' : 'warn'
              }
            />
          </div>
        )}
      </Panel>
    </div>
  )
}

function KV({
  label, value, tone,
}: {
  label: string; value: string; tone?: 'good' | 'warn'
}) {
  const color = tone === 'good' ? '#15803D' : tone === 'warn' ? '#B91C1C' : '#1C1917'
  return (
    <div>
      <p style={{
        margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
        textTransform: 'uppercase', color: 'var(--text-tertiary)',
      }}>
        {label}
      </p>
      <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 600, color }}>{value}</p>
    </div>
  )
}

/**
 * A plain bar list rather than a chart library: the numbers are always shown
 * next to the bars, so length is a secondary encoding and never the only one
 * (rule 8).
 */
function CategoryBars({ rows }: { rows: Array<{ category: string; netRevenue: any }> }) {
  const max = Math.max(...rows.map(r => Math.abs(Number(r.netRevenue.amount))), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {rows.map(r => {
        const n = Number(r.netRevenue.amount)
        const pct = Math.max(1, (Math.abs(n) / max) * 100)
        return (
          <div key={r.category}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', gap: 10,
              fontSize: 12.5, marginBottom: 3,
            }}>
              <span style={{ fontWeight: 600, color: '#1C1917', textTransform: 'capitalize' }}>
                {r.category.replace(/_/g, ' ')}
              </span>
              <Amount value={r.netRevenue} bold size={12.5} />
            </div>
            <div style={{
              height: 6, background: 'rgba(0,0,0,0.06)',
              borderRadius: 'var(--r-full)', overflow: 'hidden',
            }}>
              <div style={{
                width: `${pct}%`, height: '100%', background: 'var(--brand-color)',
                borderRadius: 'var(--r-full)',
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
