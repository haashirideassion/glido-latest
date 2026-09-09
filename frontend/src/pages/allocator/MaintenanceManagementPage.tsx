import { useState, useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { getMaintenanceRecords, scheduleMaintenance, rescheduleMaintenance, startMaintenance, completeMaintenance } from '@/lib/db/maintenance'
import { getMaintenanceCustomField } from '@/lib/db/maintenance-custom-field'
import { customFieldInputType, type CustomFieldType } from '@/lib/db/truck-custom-field'
import { getTrucks, getTrailers } from '@/lib/db/resources'
import { toast } from '@/lib/toast'
import { useAllocatorPermissions } from '@/lib/useAllocatorPermissions'
import { CustomSelect } from '@/components/ui/CustomSelect'
import type { MaintenanceRecord, MaintenanceTab, TripPriority, Truck, Trailer } from '@/data/types'

const TABS: Array<{ key: MaintenanceTab; label: string }> = [
  { key: 'current', label: 'Current Maintenance' }, { key: 'scheduled', label: 'Scheduled' }, { key: 'history', label: 'History' },
]

const PRIORITY_STYLE: Record<TripPriority, { bg: string; color: string }> = {
  high:   { bg: 'rgba(239,68,68,0.10)',  color: '#DC2626' },
  medium: { bg: 'rgba(234,88,12,0.10)',  color: '#EA580C' },
  low:    { bg: 'rgba(37,99,235,0.08)',  color: '#2563EB' },
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—'
  return iso.slice(0, 10)
}

export default function MaintenanceManagementPage() {
  usePageTitle('Glido | Maintenance Management')
  const navigate = useNavigate()
  const perms = useAllocatorPermissions()
  const [tab, setTab] = useState<MaintenanceTab>('current')
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<TripPriority | ''>('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [records, setRecords] = useState<MaintenanceRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState<MaintenanceRecord | null>(null)
  const [detailRecord, setDetailRecord] = useState<MaintenanceRecord | null>(null)
  const [isWide, setIsWide] = useState(() => window.innerWidth >= 1024)

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const [fieldLabel, setFieldLabel] = useState<string | null>(null)
  const [fieldType, setFieldType] = useState<CustomFieldType>('text')
  useEffect(() => { getMaintenanceCustomField().then(c => { setFieldLabel(c.label); setFieldType(c.type) }).catch(() => {}) }, [])

  const paneRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (isWide && (detailRecord || scheduleOpen)) paneRef.current?.scrollIntoView({ block: 'nearest' })
  }, [detailRecord, scheduleOpen, isWide])

  const load = () => {
    setIsLoading(true)
    getMaintenanceRecords({ tab, search: search.trim() || undefined, priority: priorityFilter || undefined })
      .then(rows => { setRecords(rows); setIsLoading(false) })
      .catch(() => setIsLoading(false))
  }
  useEffect(load, [tab, search, priorityFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasFilters = !!(search || priorityFilter)

  const startActivity = async (r: MaintenanceRecord) => {
    const result = await startMaintenance(r.id)
    if (result) { toast('Maintenance commenced', 'success'); load() }
    else toast('Could not start maintenance', 'error')
  }
  const completeActivity = async (r: MaintenanceRecord) => {
    const result = await completeMaintenance(r.id)
    if (result) { toast('Maintenance marked as completed', 'success'); load() }
    else toast('Could not complete maintenance', 'error')
  }

  return (
    <>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

      <button type="button" onClick={() => navigate('/allocator')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 4px', marginBottom: 12, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5L4.5 7l4 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back
      </button>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: '#F0F0EF', padding: 4, borderRadius: 'var(--r-full)', width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            style={{ padding: '8px 16px', borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', background: tab === t.key ? '#fff' : 'transparent', color: tab === t.key ? '#1C1917' : 'var(--text-secondary)', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.10)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 280, flexShrink: 0 }}>
          <Icon name={ICONS.search} size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input type="text" placeholder="Search maintenance records" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 38, padding: '0 14px 0 36px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setFilterOpen(v => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', fontSize: 14, fontWeight: 600, color: priorityFilter ? 'var(--brand-color)' : '#374151', background: priorityFilter ? 'rgba(var(--brand-rgb),0.08)' : '#fff', border: `1px solid ${priorityFilter ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.12)'}`, borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Icon name={ICONS.filter} size={14} />{priorityFilter ? `${priorityFilter[0].toUpperCase()}${priorityFilter.slice(1)} Priority` : 'Filter'}
          </button>
          {filterOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setFilterOpen(false)} />
              <div style={{ position: 'absolute', top: 44, left: 0, zIndex: 101, width: 180, background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                <button type="button" onClick={() => { setPriorityFilter(''); setFilterOpen(false) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 14, fontWeight: !priorityFilter ? 700 : 500, color: !priorityFilter ? 'var(--brand-color)' : '#374151', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  All Priorities
                </button>
                {(['high', 'medium', 'low'] as TripPriority[]).map(p => (
                  <button key={p} type="button" onClick={() => { setPriorityFilter(p); setFilterOpen(false) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 14, fontWeight: priorityFilter === p ? 700 : 500, color: priorityFilter === p ? 'var(--brand-color)' : '#374151', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                    {p} Priority
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {hasFilters && (
          <button onClick={() => { setSearch(''); setPriorityFilter('') }}
            style={{ height: 38, padding: '0 14px', fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)', background: 'none', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear
          </button>
        )}
        {perms.can_schedule_maintenance && (
          <button type="button" onClick={() => setScheduleOpen(true)}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 16px', fontSize: 14, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(var(--brand-rgb),0.30)' }}>
            <Icon name={ICONS.add} size={15} />Schedule Maintenance
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isLoading ? (
            [0, 1, 2].map(i => <div key={i} style={{ height: 130, borderRadius: 'var(--r-md)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)
          ) : records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0 48px' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--r-sm)', background: '#EBEBEA', border: '1px solid rgba(0,0,0,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Icon name={ICONS.wrench} size={22} style={{ color: 'var(--text-tertiary)' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917' }}>No maintenance records found.</p>
            </div>
          ) : tab === 'scheduled' ? records.map(r => (
            <ScheduledCard key={r.id} record={r} onViewDetails={() => setDetailRecord(r)} onReschedule={() => setRescheduleTarget(r)} onStart={() => startActivity(r)} />
          )) : tab === 'history' ? records.map(r => (
            <HistoryCard key={r.id} record={r} onViewDetails={() => setDetailRecord(r)} />
          )) : records.map(r => (
            <CurrentCard key={r.id} record={r} onViewDetails={() => setDetailRecord(r)} onComplete={() => completeActivity(r)} fieldLabel={fieldLabel} />
          ))}
        </div>

        {isWide && (scheduleOpen ? (
          <div ref={paneRef} style={{ width: 460, flexShrink: 0, position: 'sticky', top: 12, height: 'calc(100vh - var(--dash-header-h) - 24px)', minHeight: 'calc(100vh - var(--dash-header-h) - 24px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <ScheduleMaintenanceModal onClose={() => setScheduleOpen(false)} onCreated={() => { setScheduleOpen(false); load() }} fieldLabel={fieldLabel} fieldType={fieldType} docked />
          </div>
        ) : detailRecord && (
          <div ref={paneRef} style={{ width: 460, flexShrink: 0, position: 'sticky', top: 12, height: 'calc(100vh - var(--dash-header-h) - 24px)', minHeight: 'calc(100vh - var(--dash-header-h) - 24px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <DetailModal key={detailRecord.id} record={detailRecord} onClose={() => setDetailRecord(null)} fieldLabel={fieldLabel} docked />
          </div>
        ))}
      </div>

      {rescheduleTarget && <RescheduleModal record={rescheduleTarget} onClose={() => setRescheduleTarget(null)} onDone={() => { setRescheduleTarget(null); load() }} />}
      {!isWide && scheduleOpen && <ScheduleMaintenanceModal onClose={() => setScheduleOpen(false)} onCreated={() => { setScheduleOpen(false); load() }} fieldLabel={fieldLabel} fieldType={fieldType} />}
      {!isWide && detailRecord && <DetailModal key={detailRecord.id} record={detailRecord} onClose={() => setDetailRecord(null)} fieldLabel={fieldLabel} />}
    </>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 90 }}>
      <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 2px' }}>{label}</p>
      <p style={{ color: '#1C1917', margin: 0, fontSize: 13.5 }}>{value}</p>
    </div>
  )
}

function CurrentCard({ record, onViewDetails, onComplete, fieldLabel }: { record: MaintenanceRecord; onViewDetails: () => void; onComplete: () => void; fieldLabel?: string | null }) {
  const inProgress = record.status === 'in_progress'
  const sendToContractor = () => toast('Contractor will be notified by email — coming soon', 'info')
  return (
    <div role="button" tabIndex={0} onClick={onViewDetails} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onViewDetails() }}
      style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', padding: '14px 16px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div>
          <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: '#1C1917', marginBottom: 3 }}>{record.maintenanceCode}</p>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{record.resourceCode ?? record.resourceId} — {record.activityType}</p>
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)', background: inProgress ? 'rgba(234,179,8,0.10)' : 'rgba(37,99,235,0.08)', color: inProgress ? '#A16207' : '#2563EB', whiteSpace: 'nowrap' }}>
          {inProgress ? 'In Progress' : 'Scheduled'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13.5, marginBottom: 12 }}>
        <InfoCell label="Start Date" value={fmtDate(record.startDate)} />
        <InfoCell label="Est. Completion" value={fmtDate(record.estimatedCompletion)} />
        <InfoCell label="Technician" value={record.technician ?? '—'} />
        {fieldLabel && <InfoCell label={fieldLabel} value={record.customFieldValue ?? '—'} />}
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Progress</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1C1917' }}>{record.progressPct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 'var(--r-full)', background: '#F0F0EF', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${record.progressPct}%`, background: 'var(--brand-color)', borderRadius: 'var(--r-full)' }} />
        </div>
      </div>
      {record.remarks && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{record.remarks}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={onViewDetails}
          style={{ height: 34, padding: '0 14px', fontSize: 13.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
          View Details
        </button>
        <button type="button" onClick={e => { e.stopPropagation(); sendToContractor() }}
          style={{ height: 34, padding: '0 14px', fontSize: 13.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
          Send to Contractor
        </button>
        {inProgress && (
          <button type="button" onClick={e => { e.stopPropagation(); onComplete() }}
            style={{ height: 34, padding: '0 14px', fontSize: 13.5, fontWeight: 600, color: '#16A34A', background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Mark Completed
          </button>
        )}
      </div>
    </div>
  )
}

function ScheduledCard({ record, onViewDetails, onReschedule, onStart }: { record: MaintenanceRecord; onViewDetails: () => void; onReschedule: () => void; onStart: () => void }) {
  const pr = PRIORITY_STYLE[record.priority]
  return (
    <div role="button" tabIndex={0} onClick={onViewDetails} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onViewDetails() }}
      style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', padding: '14px 16px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: '#1C1917' }}>{record.resourceCode ?? record.resourceId}</p>
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-full)', background: pr.bg, color: pr.color, textTransform: 'uppercase' }}>{record.priority} Priority</span>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{record.activityType}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13.5, marginBottom: 12 }}>
        <InfoCell label="Due Date" value={fmtDate(record.dueDate)} />
        <InfoCell label="Est. Duration" value={record.estimatedDuration ?? '—'} />
        <InfoCell label="Contractor" value={record.contractor ?? '—'} />
      </div>
      {record.remarks && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{record.remarks}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={e => { e.stopPropagation(); onReschedule() }}
          style={{ height: 34, padding: '0 14px', fontSize: 13.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
          Reschedule
        </button>
        <button type="button" onClick={e => { e.stopPropagation(); onStart() }}
          style={{ height: 34, padding: '0 14px', fontSize: 13.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
          Start
        </button>
      </div>
    </div>
  )
}

function HistoryCard({ record, onViewDetails }: { record: MaintenanceRecord; onViewDetails: () => void }) {
  return (
    <div role="button" tabIndex={0} onClick={onViewDetails} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onViewDetails() }}
      style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 'var(--r-md)', padding: '14px 16px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div>
          <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: '#1C1917', marginBottom: 3 }}>{record.maintenanceCode}</p>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{record.resourceCode ?? record.resourceId} — {record.activityType}</p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)', background: 'rgba(34,197,94,0.10)', color: '#16A34A', whiteSpace: 'nowrap' }}>
          <Icon name={ICONS.check} size={12} />Completed
        </span>
      </div>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13.5, marginBottom: record.remarks ? 10 : 0 }}>
        <InfoCell label="Date" value={fmtDate(record.completedDate)} />
        <InfoCell label="Technician" value={record.technician ?? '—'} />
      </div>
      {record.remarks && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{record.remarks}</p>}
    </div>
  )
}

function DetailModal({ record, onClose, docked = false, fieldLabel }: { record: MaintenanceRecord; onClose: () => void; docked?: boolean; fieldLabel?: string | null }) {
  const panelStyle: React.CSSProperties = docked
    ? { position: 'relative', height: '100%', width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 6px 24px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9011, width: 'min(460px, 100vw)', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }
  return (
    <>
      {!docked && (
        <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}
          style={{ position: 'fixed', inset: 0, zIndex: 9010, background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(2px)' }} />
      )}
      <motion.div style={panelStyle}
        initial={docked ? { opacity: 0, x: 16 } : { x: '100%' }} animate={docked ? { opacity: 1, x: 0 } : { x: 0 }}
        transition={docked ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] } : { type: 'spring', stiffness: 400, damping: 40 }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 17, fontWeight: 700, color: '#1C1917', margin: 0 }}>{record.maintenanceCode}</p>
          <button type="button" onClick={onClose}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: '#F7F6F5', borderRadius: 'var(--r-full)', cursor: 'pointer', color: '#374151' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: 24, overflowY: 'auto', minHeight: 0, flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DetailRow label="Resource" value={record.resourceCode ?? record.resourceId} />
            <DetailRow label="Activity" value={record.activityType} />
            <DetailRow label="Status" value={record.status.replace('_', ' ')} />
            <DetailRow label="Priority" value={record.priority} />
            <DetailRow label="Due Date" value={fmtDate(record.dueDate)} />
            <DetailRow label="Estimated Duration" value={record.estimatedDuration ?? '—'} />
            <DetailRow label="Start Date" value={fmtDate(record.startDate)} />
            <DetailRow label="Estimated Completion" value={fmtDate(record.estimatedCompletion)} />
            <DetailRow label="Completed Date" value={fmtDate(record.completedDate)} />
            <DetailRow label="Technician" value={record.technician ?? '—'} />
            <DetailRow label="Contractor" value={record.contractor ?? '—'} />
            {fieldLabel && <DetailRow label={fieldLabel} value={record.customFieldValue ?? '—'} />}
            <DetailRow label="Progress" value={`${record.progressPct}%`} />
            <DetailRow label="Remarks" value={record.remarks ?? '—'} />
          </div>
        </div>
      </motion.div>
    </>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
      <span style={{ fontSize: 13.5, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function RescheduleModal({ record, onClose, onDone }: { record: MaintenanceRecord; onClose: () => void; onDone: () => void }) {
  const [dueDate, setDueDate] = useState(record.dueDate ?? '')
  const [submitting, setSubmitting] = useState(false)
  const submit = async () => {
    if (!dueDate) { toast('Due date is required', 'error'); return }
    setSubmitting(true)
    try {
      const result = await rescheduleMaintenance(record.id, dueDate)
      if (!result) { toast('Could not reschedule. Please try again.', 'error'); return }
      toast('Maintenance rescheduled', 'success')
      onDone()
    } catch {
      toast('Could not reschedule. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 'var(--r-lg)', padding: 24, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.20)' }} onClick={e => e.stopPropagation()}>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', marginBottom: 16 }}>Reschedule Maintenance</p>
        <Field label="Due Date">
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={INPUT} />
        </Field>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={onClose} disabled={submitting}
            style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={submitting}
            style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ScheduleMaintenanceModal({ onClose, onCreated, fieldLabel, fieldType, docked = false }: { onClose: () => void; onCreated: () => void; fieldLabel?: string | null; fieldType?: CustomFieldType; docked?: boolean }) {
  const [resourceType, setResourceType] = useState<'truck' | 'trailer'>('truck')
  const [resourceId, setResourceId] = useState('')
  const [activityType, setActivityType] = useState('')
  const [priority, setPriority] = useState<TripPriority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [estimatedDuration, setEstimatedDuration] = useState('')
  const [contractor, setContractor] = useState('')
  const [customFieldValue, setCustomFieldValue] = useState('')
  const [remarks, setRemarks] = useState('')
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [trailers, setTrailers] = useState<Trailer[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([getTrucks(), getTrailers()]).then(([t, tr]) => { setTrucks(t); setTrailers(tr) }).catch(() => {})
  }, [])

  const options = resourceType === 'truck' ? trucks : trailers

  const submit = async () => {
    if (!resourceId) { toast('Please select a resource', 'error'); return }
    if (!activityType.trim()) { toast('Activity type is required', 'error'); return }
    setSubmitting(true)
    try {
      const result = await scheduleMaintenance({
        resource_type: resourceType, resource_id: resourceId, activity_type: activityType.trim(),
        priority, due_date: dueDate || undefined, estimated_duration: estimatedDuration.trim() || undefined, remarks: remarks.trim() || undefined,
        contractor: contractor.trim() || undefined, custom_field_value: customFieldValue.trim() || undefined,
      })
      if (!result) { toast('Could not schedule maintenance. Please try again.', 'error'); return }
      toast('Maintenance scheduled', 'success')
      onCreated()
    } catch {
      toast('Could not schedule maintenance. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const panelStyle: React.CSSProperties = docked
    ? { position: 'relative', height: '100%', width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', boxShadow: '0 1px 3px rgba(0,0,0,0.04),0 6px 24px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9011, width: 'min(460px, 100vw)', background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }

  return (
    <>
      {!docked && (
        <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}
          style={{ position: 'fixed', inset: 0, zIndex: 9010, background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(2px)' }} />
      )}
      <motion.div style={panelStyle}
        initial={docked ? { opacity: 0, x: 16 } : { x: '100%' }} animate={docked ? { opacity: 1, x: 0 } : { x: 0 }}
        transition={docked ? { duration: 0.24, ease: [0.16, 1, 0.3, 1] } : { type: 'spring', stiffness: 400, damping: 40 }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', margin: 0 }}>Schedule Maintenance</p>
          <button type="button" onClick={onClose}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: '#F7F6F5', borderRadius: 'var(--r-full)', cursor: 'pointer', color: '#374151' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: 24, overflowY: 'auto', minHeight: 0, flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Resource Type">
                <CustomSelect value={resourceType} onChange={v => { setResourceType(v as typeof resourceType); setResourceId('') }}
                  options={[{ value: 'truck', label: 'Truck' }, { value: 'trailer', label: 'Trailer' }]} />
              </Field>
              <Field label="Resource">
                <CustomSelect value={resourceId} onChange={setResourceId} placeholder="Select…"
                  options={options.map(o => ({ value: o.id, label: o.resourceCode }))} />
              </Field>
            </div>
            <Field label="Activity Type">
              <input value={activityType} onChange={e => setActivityType(e.target.value)} placeholder="Oil change, brake inspection…" style={INPUT} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Priority">
                <CustomSelect value={priority} onChange={v => setPriority(v as TripPriority)}
                  options={[{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]} />
              </Field>
              <Field label="Due Date">
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={INPUT} />
              </Field>
            </div>
            <Field label="Estimated Duration">
              <input value={estimatedDuration} onChange={e => setEstimatedDuration(e.target.value)} placeholder="2 hours" style={INPUT} />
            </Field>
            <Field label="Contractor (optional)">
              <input value={contractor} onChange={e => setContractor(e.target.value)} placeholder="ABC Fleet Services" style={INPUT} />
            </Field>
            {fieldLabel && (
              <Field label={fieldLabel}>
                <input type={customFieldInputType(fieldType ?? 'text')} value={customFieldValue} onChange={e => setCustomFieldValue(e.target.value)} style={INPUT} />
              </Field>
            )}
            <Field label="Remarks">
              <textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Reason for maintenance" style={{ ...INPUT, height: 72, padding: '10px 12px', resize: 'vertical' }} />
            </Field>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 24px', borderTop: '1px solid rgba(0,0,0,0.06)', flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={submitting}
            style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: '#374151', background: '#F7F6F5', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={submitting}
            style={{ padding: '9px 18px', fontSize: 14.5, fontWeight: 600, color: 'var(--brand-text)', background: 'var(--brand-color)', border: 'none', borderRadius: 'var(--r-sm)', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Scheduling…' : 'Schedule Maintenance'}
          </button>
        </div>
      </motion.div>
    </>
  )
}

const INPUT: React.CSSProperties = { width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-sm)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>{label}</p>
      {children}
    </div>
  )
}
