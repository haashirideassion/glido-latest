import { useEffect, useState } from 'react'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { useComplianceCapabilities } from '@/lib/useComplianceCapabilities'
import {
  getCompletedActivities, getCompletedActivitiesSummary, downloadActivityReport, exportCompletedActivitiesCsv,
  type CompletedPeriod,
} from '@/lib/db/compliance'
import type { ComplianceActivity, CompletedActivitiesSummary } from '@/data/types'
import { INPUT, EmptyState, ModalShell, DetailRow } from '@/components/compliance/FormControls'

const PERIODS: [CompletedPeriod, string][] = [['all', 'All Time'], ['week', 'Last Week'], ['month', 'Last Month'], ['quarter', 'Last Quarter']]
const CATEGORY_COLOR: Record<string, string> = { 'Safety Audit': '#DC2626', 'Equipment Check': '#2563EB', 'Environmental': '#16A34A' }

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function Stars({ rating }: { rating?: number | null }) {
  const r = rating ?? 0
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => <Icon key={i} name={ICONS.star} size={13} style={{ color: i <= r ? '#D97706' : 'rgba(0,0,0,0.15)' }} />)}
    </span>
  )
}

export default function CompletedActivitiesPage() {
  usePageTitle('Glido | Completed Activities')
  const { caps } = useComplianceCapabilities()

  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<CompletedPeriod>('all')
  const [rows, setRows] = useState<ComplianceActivity[]>([])
  const [summary, setSummary] = useState<CompletedActivitiesSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [detailsRow, setDetailsRow] = useState<ComplianceActivity | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = () => {
    setIsLoading(true); setFailed(false)
    Promise.all([
      getCompletedActivities({ period, search: search.length >= 3 ? search : undefined }),
      getCompletedActivitiesSummary(),
    ]).then(([rows, summary]) => { setRows(rows); setSummary(summary); setIsLoading(false) })
      .catch(() => { setFailed(true); setIsLoading(false) })
  }
  useEffect(() => { load() }, [period, search])

  const handleExport = async () => {
    setExporting(true)
    try { await exportCompletedActivitiesCsv({ period, search: search || undefined }); toast('Report exported', 'success') }
    catch { toast('Failed to export report', 'error') }
    finally { setExporting(false) }
  }

  const handleReport = async (row: ComplianceActivity) => {
    try { await downloadActivityReport(row.id, `${row.entryNumber}-report.txt`) }
    catch { toast('Failed to download report', 'error') }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Icon name={ICONS.search} size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search completed activities…" style={{ ...INPUT, paddingLeft: 36 }} />
        </div>
        {caps.can_export_report && (
          <button onClick={handleExport} disabled={exporting || rows.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 6, background: rows.length === 0 ? 'rgba(0,0,0,0.08)' : 'var(--brand-color)', color: rows.length === 0 ? 'var(--text-tertiary)' : 'var(--brand-text)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: rows.length === 0 ? 'default' : 'pointer' }}>
            <Icon name={ICONS.export} size={16} /> {exporting ? 'Exporting…' : 'Export Report'}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--card-gap)', marginBottom: 18 }}>
        {[
          { label: 'Total Completed', value: summary?.totalCompleted ?? 0, color: '#16A34A' },
          { label: 'This Month', value: summary?.thisMonth ?? 0, color: '#2563EB' },
          { label: 'Avg Rating', value: summary?.avgRating ?? 0, color: '#D97706' },
          { label: 'On Time', value: `${summary?.onTimePct ?? 0}%`, color: '#7C3AED' },
        ].map(m => (
          <div key={m.label} style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 'var(--card-pad)', textAlign: 'center' }}>
            <p style={{ fontSize: 24, fontWeight: 700, color: m.color, margin: '0 0 4px' }}>{m.value}</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>{m.label}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {PERIODS.map(([v, l]) => (
          <button key={v} onClick={() => setPeriod(v)}
            style={{ padding: '7px 16px', borderRadius: 'var(--r-full)', border: '1px solid ' + (period === v ? 'var(--brand-color)' : 'rgba(0,0,0,0.10)'), background: period === v ? 'var(--brand-color)' : '#FFFFFF', color: period === v ? 'var(--brand-text)' : '#44403C', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {l}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map(i => <div key={i} style={{ height: 110, borderRadius: 'var(--r-lg)', background: '#F3F3F2' }} />)}
        </div>
      ) : failed ? (
        <EmptyState icon={ICONS.warning} text="Couldn't load completed activities." action={{ label: 'Retry', onClick: load }} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ICONS.clipboardCheck} text="No completed activities found." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(row => (
            <div key={row.id} style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-lg)', padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <Icon name={ICONS.checkSquare} size={16} style={{ color: '#16A34A' }} />
                    <p style={{ fontSize: 15.5, fontWeight: 700, color: '#1C1917', margin: 0 }}>{row.title}</p>
                    {row.category && <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-full)', color: CATEGORY_COLOR[row.category] ?? '#57534E', background: `${CATEGORY_COLOR[row.category] ?? '#57534E'}18` }}>{row.category}</span>}
                  </div>
                  {row.description && <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: '0 0 8px' }}>{row.description}</p>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    <span>Completed: {fmtDate(row.completedDate)}</span>
                    {row.completedByName && <span>By: {row.completedByName}</span>}
                    {row.assignedByName && <span>Assigned by: {row.assignedByName}</span>}
                    <Stars rating={row.qualityRating} />
                  </div>
                  {row.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {row.tags.map(t => <span key={t} style={{ fontSize: 11, padding: '2px 9px', borderRadius: 'var(--r-full)', background: 'rgba(0,0,0,0.06)', color: '#44403C' }}>{t}</span>)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setDetailsRow(row)} style={{ fontSize: 12.5, fontWeight: 600, border: '1px solid rgba(0,0,0,0.12)', background: '#FFF', borderRadius: 'var(--r-sm)', padding: '6px 14px', cursor: 'pointer' }}>View Details</button>
                  <button onClick={() => handleReport(row)} disabled={!row.reportAvailable} style={{ fontSize: 12.5, fontWeight: 600, border: 'none', background: row.reportAvailable ? 'var(--brand-color)' : 'rgba(0,0,0,0.08)', color: row.reportAvailable ? 'var(--brand-text)' : 'var(--text-tertiary)', borderRadius: 'var(--r-sm)', padding: '6px 14px', cursor: row.reportAvailable ? 'pointer' : 'default' }}>Report</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {detailsRow && (
        <ModalShell title="Activity Details" onClose={() => setDetailsRow(null)}>
          <p style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', margin: '0 0 14px' }}>{detailsRow.title}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', fontSize: 13.5 }}>
            <DetailRow label="Entry Number" value={detailsRow.entryNumber} />
            <DetailRow label="Category" value={detailsRow.category} />
            <DetailRow label="Completed Date" value={fmtDate(detailsRow.completedDate)} />
            <DetailRow label="Completed By" value={detailsRow.completedByName ?? undefined} />
            <DetailRow label="Assigned By" value={detailsRow.assignedByName ?? undefined} />
            <DetailRow label="Quality Rating" value={detailsRow.qualityRating != null ? `${detailsRow.qualityRating} / 5` : undefined} />
          </div>
          {detailsRow.description && <p style={{ marginTop: 16, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{detailsRow.description}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setDetailsRow(null)} style={{ background: 'rgba(0,0,0,0.06)', border: 'none', borderRadius: 'var(--r-sm)', padding: '9px 20px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Close</button>
          </div>
        </ModalShell>
      )}
    </>
  )
}
