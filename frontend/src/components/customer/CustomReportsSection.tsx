import { useState, useEffect } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import {
  getCustomerReportSchedules, createCustomerReportSchedule, updateCustomerReportSchedule,
  deleteCustomerReportSchedule, getCustomerReportRuns, METRIC_LABEL,
} from '@/lib/db/customer-report-schedules'
import type { CustomerReportSchedule, CustomerReportRun, ReportMetric, ReportFrequency } from '@/lib/db/customer-report-schedules'
import { CARD, SERVICE_LABEL, STATUS_LABEL } from '@/lib/customerReportLabels'
import { CustomSelect } from '@/components/ui/CustomSelect'

const ALL_METRICS = Object.keys(METRIC_LABEL) as ReportMetric[]
const FREQUENCY_LABEL: Record<ReportFrequency, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }

function downloadSnapshotCsv(run: CustomerReportRun, scheduleName: string) {
  const s = run.snapshot
  const lines = [
    'Service Type,Count', ...s.serviceTypeDistribution.map(r => `${SERVICE_LABEL[r.service_key] ?? r.service_key},${r.count}`),
    '', 'Status,Count', ...s.requestStatus.map(r => `${STATUS_LABEL[r.status] ?? r.status},${r.count}`),
    '', 'Month,Count', ...s.monthlyRequests.map(r => `${r.month},${r.count}`),
    '', 'Avg Processing Days', String(s.avgProcessingDays ?? ''),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${scheduleName.replace(/[^a-zA-Z0-9-_]/g, '_')}-${run.generatedAt.slice(0, 10)}.csv`
  a.click()
}

export function CustomReportsSection() {
  const [schedules, setSchedules] = useState<CustomerReportSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [runsById, setRunsById] = useState<Record<string, CustomerReportRun[]>>({})

  const [name, setName] = useState('')
  const [category, setCategory] = useState<'' | 'import' | 'export'>('')
  const [metrics, setMetrics] = useState<ReportMetric[]>(ALL_METRICS)
  const [frequency, setFrequency] = useState<ReportFrequency>('weekly')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    getCustomerReportSchedules().then(rows => { setSchedules(rows); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const toggleMetric = (m: ReportMetric) => setMetrics(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  const resetForm = () => { setName(''); setCategory(''); setMetrics(ALL_METRICS); setFrequency('weekly') }

  const createSchedule = async () => {
    if (!name.trim()) { toast('Please name your custom report', 'error'); return }
    if (metrics.length === 0) { toast('Select at least one metric', 'error'); return }
    setSaving(true)
    try {
      const created = await createCustomerReportSchedule({ name: name.trim(), category_filter: category || undefined, metrics, frequency })
      if (!created) { toast('Could not create custom report', 'error'); return }
      toast('Custom report created', 'success')
      resetForm(); setShowForm(false); load()
    } finally { setSaving(false) }
  }

  const toggleActive = async (s: CustomerReportSchedule) => {
    const updated = await updateCustomerReportSchedule(s.id, { active: !s.active })
    // The PATCH response doesn't include the list endpoint's computed run_count — reload instead
    // of merging it in directly, so the count stays accurate.
    if (updated) load()
  }

  const remove = async (id: string) => {
    const ok = await deleteCustomerReportSchedule(id)
    if (ok) { toast('Custom report deleted', 'success'); setSchedules(prev => prev.filter(s => s.id !== id)) }
    else toast('Could not delete custom report', 'error')
  }

  const toggleRuns = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!runsById[id]) {
      const runs = await getCustomerReportRuns(id)
      setRunsById(prev => ({ ...prev, [id]: runs }))
    }
  }

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: '0 0 4px' }}>Custom Reports</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Create a custom report and schedule it to run automatically</p>
        </div>
        <button type="button" onClick={() => setShowForm(v => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', fontSize: 13.5, fontWeight: 600, color: showForm ? '#374151' : 'var(--brand-text)', background: showForm ? '#F7F6F5' : 'var(--brand-color)', border: showForm ? '1px solid rgba(0,0,0,0.12)' : 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          <Icon name={showForm ? ICONS.close : ICONS.add} size={14} />
          {showForm ? 'Cancel' : 'New Custom Report'}
        </button>
      </div>

      {showForm && (
        <div style={{ marginTop: 16, padding: 16, background: '#FAFAF9', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Report Name</p>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekly Import Summary"
              style={{ width: '100%', height: 36, padding: '0 12px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }} />
          </div>

          <div>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Metrics to include</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ALL_METRICS.map(m => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: '#1C1917', cursor: 'pointer' }}>
                  <input type="checkbox" checked={metrics.includes(m)} onChange={() => toggleMetric(m)} />
                  {METRIC_LABEL[m]}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Service Type Filter</p>
              <CustomSelect
                placeholder="All"
                options={[{ value: 'import', label: 'Import' }, { value: 'export', label: 'Export' }]}
                value={category}
                onChange={v => setCategory(v as '' | 'import' | 'export')}
                neutral
              />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Schedule</p>
              <CustomSelect
                options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]}
                value={frequency}
                onChange={v => setFrequency(v as ReportFrequency)}
                neutral
              />
            </div>
          </div>

          <button type="button" onClick={createSchedule} disabled={saving}
            style={{ alignSelf: 'flex-start', height: 36, padding: '0 18px', fontSize: 14, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Creating…' : 'Create Custom Report'}
          </button>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ height: 60, background: '#F8FAFC', borderRadius: 'var(--r-sm)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        ) : schedules.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--text-tertiary)', margin: 0 }}>No custom reports yet — create one above.</p>
        ) : schedules.map(s => (
          <div key={s.id} style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-md)', padding: '12px 14px', opacity: s.active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 14.5, fontWeight: 600, color: '#1C1917', margin: 0 }}>{s.name}</p>
                <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: '2px 0 0' }}>
                  {FREQUENCY_LABEL[s.frequency]} · {s.categoryFilter ? (s.categoryFilter === 'import' ? 'Import only' : 'Export only') : 'All'} · {s.metrics.length} metric{s.metrics.length !== 1 ? 's' : ''} · {s.runCount} run{s.runCount !== 1 ? 's' : ''}
                  {s.lastRunAt && ` · last run ${new Date(s.lastRunAt).toLocaleDateString()}`}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => toggleActive(s)}
                  style={{ height: 30, padding: '0 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 'var(--r-full)', border: `1px solid ${s.active ? 'rgba(34,197,94,0.3)' : 'rgba(0,0,0,0.12)'}`, background: s.active ? 'rgba(34,197,94,0.10)' : '#fff', color: s.active ? '#16A34A' : '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {s.active ? 'Active' : 'Paused'}
                </button>
                <button type="button" onClick={() => toggleRuns(s.id)}
                  style={{ height: 30, padding: '0 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 'var(--r-full)', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {expandedId === s.id ? 'Hide Runs' : 'View Runs'}
                </button>
                <button type="button" onClick={() => remove(s.id)} aria-label="Delete custom report"
                  style={{ width: 30, height: 30, borderRadius: 'var(--r-sm)', border: 'none', background: 'transparent', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Icon name={ICONS.trash} size={14} />
                </button>
              </div>
            </div>

            {expandedId === s.id && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {!runsById[s.id] ? (
                  <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>Loading…</p>
                ) : runsById[s.id].length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>No runs generated yet — this fires the next time it's due ({FREQUENCY_LABEL[s.frequency].toLowerCase()}), checked whenever you open Reports.</p>
                ) : runsById[s.id].map(run => (
                  <div key={run.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, padding: '6px 10px', background: '#FAFAF9', borderRadius: 'var(--r-sm)' }}>
                    <span style={{ color: '#374151' }}>{new Date(run.generatedAt).toLocaleString()}</span>
                    <button type="button" onClick={() => downloadSnapshotCsv(run, s.name)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <Icon name={ICONS.download} size={12} /> Download CSV
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
