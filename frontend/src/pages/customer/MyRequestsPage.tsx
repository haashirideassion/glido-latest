import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { Icon, ICONS } from '@/lib/Icon'
import { getServiceRequests } from '@/lib/db/service-requests'
import { RequestDetailsPanel } from '@/components/customer/RequestDetailsPanel'
import { fetcher } from '@/lib/fetcher'
import type { ServiceRequest, ServiceCategory, RequestStage, RequestStatus } from '@/data/types'

const STAGES: RequestStage[] = ['received', 'in_transit', 'arrived', 'completed']

// FR 2.3 — Status badge, distinct from the progress-stage dots above.
const STATUS_STYLE: Record<RequestStatus, React.CSSProperties> = {
  pending:     { background: 'rgba(0,0,0,0.05)',        color: 'var(--text-secondary)' },
  approved:    { background: 'rgba(59,130,246,0.10)',   color: '#2563EB' },
  in_progress: { background: 'rgba(var(--brand-rgb),0.10)', color: 'var(--brand-color)' },
  completed:   { background: 'rgba(34,197,94,0.10)',    color: '#16A34A' },
  rejected:    { background: 'rgba(239,68,68,0.10)',    color: '#DC2626' },
}
const STATUS_LABEL: Record<RequestStatus, string> = { pending: 'Pending', approved: 'Approved', in_progress: 'In Progress', completed: 'Completed', rejected: 'Rejected' }

type SortKey = 'newest' | 'oldest'
type Preset = 'today' | '7d' | '30d' | 'all'
const PRESET_LABEL: Record<Preset, string> = { today: 'Today', '7d': '7 Days', '30d': '30 Days', all: 'All Time' }

const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Australia/Sydney' })
const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Australia/Sydney' })

function presetDates(p: Preset): { from: string; to: string } {
  const to = todayIso()
  if (p === 'today') return { from: to, to }
  if (p === '7d')    return { from: daysAgoIso(6), to }
  if (p === '30d')   return { from: daysAgoIso(29), to }
  return { from: '', to: '' }
}

export default function MyRequestsPage() {
  usePageTitle('Glido | My Requests')
  const navigate = useNavigate()
  const [tab, setTab] = useState<ServiceCategory>('import')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [sortOpen, setSortOpen] = useState(false)
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [actionsMenuId, setActionsMenuId] = useState<string | null>(null)
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true))
  const [preset, setPreset] = useState<Preset>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const applyPreset = (p: Preset) => {
    setPreset(p)
    const { from, to } = presetDates(p)
    setDateFrom(from); setDateTo(to)
  }
  const hasFilters = !!(search || dateFrom || dateTo)
  const clearFilters = () => { setSearch(''); applyPreset('all') }

  // FR 2.2 — Import is the default landing tab unless the customer has set a preference in Settings.
  useEffect(() => {
    fetcher('/api/auth/me').then(res => {
      const pref = res?.data?.default_requests_tab
      if (pref === 'export' || pref === 'import') setTab(pref)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    getServiceRequests({ category: tab, search: search.trim() || undefined, sort, from: dateFrom || undefined, to: dateTo || undefined })
      .then(rows => { if (!cancelled) { setRequests(rows); setIsLoading(false) } })
      .catch(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [tab, search, sort, dateFrom, dateTo])

  const selected = useMemo(() => requests.find(r => r.id === selectedId) ?? null, [requests, selectedId])

  return (
    <div>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>

      {/* Back — history-back when there's somewhere in-app to return to (e.g. a request's detail
          view or a filtered link), falling back to the Dashboard for direct/bookmarked entry. */}
      <button type="button" onClick={() => { if (window.history.state?.idx > 0) navigate(-1); else navigate('/customer') }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 4px', marginBottom: 12, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5L4.5 7l4 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back
      </button>

      {/* Tabs + search + sort + date filters — single wrapping row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, background: '#F0F0EF', padding: 4, borderRadius: 'var(--r-full)', width: 'fit-content', flexShrink: 0 }}>
          {(['import', 'export'] as ServiceCategory[]).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              style={{ padding: '8px 20px', borderRadius: 'var(--r-full)', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', textTransform: 'capitalize', background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#1C1917' : 'var(--text-secondary)', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.10)' : 'none' }}>
              {t}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: 220, flexShrink: 0 }}>
          <Icon name={ICONS.search} size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input type="text" placeholder="Search by request, service or vessel" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 38, padding: '0 14px 0 36px', fontSize: 14, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }} />
        </div>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button type="button" onClick={() => setSortOpen(v => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', fontSize: 14, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Icon name={ICONS.sort} size={14} />Sort
          </button>
          {sortOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setSortOpen(false)} />
              <div style={{ position: 'absolute', top: 44, right: 0, zIndex: 101, width: 160, background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                {(['newest', 'oldest'] as SortKey[]).map(s => (
                  <button key={s} type="button" onClick={() => { setSort(s); setSortOpen(false) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 14, fontWeight: sort === s ? 700 : 500, color: sort === s ? 'var(--brand-color)' : '#374151', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <span style={{ width: 1, height: 24, background: 'rgba(0,0,0,0.08)', flexShrink: 0 }} />

        {(['today', '7d', '30d', 'all'] as Preset[]).map(p => {
          const active = preset === p
          return (
            <button key={p} type="button" onClick={() => applyPreset(p)}
              style={{ height: 38, padding: '0 14px', fontSize: 14, fontWeight: active ? 700 : 500, borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
                background: active ? 'rgba(var(--brand-rgb),0.10)' : '#F7F6F5',
                border: `1px solid ${active ? 'rgba(var(--brand-rgb),0.28)' : 'rgba(0,0,0,0.08)'}`,
                color: active ? 'var(--brand-color)' : 'var(--text-secondary)' }}>
              {PRESET_LABEL[p]}
            </button>
          )
        })}
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset('all') }}
          style={{ height: 38, padding: '0 10px', fontSize: 14, color: '#1C1917', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit', flexShrink: 0 }} />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset('all') }}
          style={{ height: 38, padding: '0 10px', fontSize: 14, color: '#1C1917', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', outline: 'none', fontFamily: 'inherit', flexShrink: 0 }} />
        {hasFilters && (
          <button onClick={clearFilters}
            style={{ height: 38, padding: '0 14px', fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)', background: 'none', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            Clear
          </button>
        )}
      </div>

      {/* List + detail split */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isLoading ? (
            [0, 1, 2].map(i => <div key={i} style={{ height: 120, borderRadius: 'var(--r-md)', background: '#F3F3F2', animation: 'pulse 1.5s ease-in-out infinite' }} />)
          ) : requests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0 48px' }}>
              <div style={{ width: 48, height: 48, borderRadius: 'var(--r-sm)', background: '#EBEBEA', border: '1px solid rgba(0,0,0,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Icon name={ICONS.bookings} size={22} style={{ color: 'var(--text-tertiary)' }} />
              </div>
              {search.trim() ? (
                // FR 2.2.1 — a search-with-no-matches state is distinct from an empty tab.
                <>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 6 }}>No requests match "{search.trim()}".</p>
                  <button type="button" onClick={() => setSearch('')}
                    style={{ fontSize: 14, fontWeight: 600, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                    Clear search
                  </button>
                </>
              ) : (
                // FR 2.2.3 — empty tab (no filters applied) offers a way to create a request.
                <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 6 }}>
                  No requests found for this type.{' '}
                  <button type="button" onClick={() => navigate('/customer/requests/new')}
                    style={{ fontSize: 15, fontWeight: 600, color: 'var(--brand-color)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, textDecoration: 'underline' }}>
                    Click here to create a new request
                  </button>
                </p>
              )}
            </div>
          ) : requests.map(r => {
            const stageIdx = STAGES.indexOf(r.stage)
            const isSel = selectedId === r.id
            const containerValue = r.containerNumber ? `${r.containerNumber}${r.containerType ? ` - ${r.containerType}` : ''}` : ''
            return (
              <div key={r.id} onClick={() => setSelectedId(r.id)}
                style={{ background: isSel ? 'rgba(var(--brand-rgb),0.04)' : '#FFFFFF', border: `1px solid ${isSel ? 'rgba(var(--brand-rgb),0.45)' : 'rgba(0,0,0,0.07)'}`, borderRadius: 'var(--r-md)', padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.15s ease' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                  <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: '#1C1917' }}>#{r.requestId}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* FR 2.3 — Status badge, distinct from the progress-stage dots below */}
                    <span style={{ fontSize: 12.5, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--r-full)', whiteSpace: 'nowrap', ...STATUS_STYLE[r.status] }}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    {/* '...' actions menu — placeholder for now, no actions wired up yet */}
                    <div style={{ position: 'relative' }}>
                      <button type="button" onClick={e => { e.stopPropagation(); setActionsMenuId(v => v === r.id ? null : r.id) }} aria-label="Request actions" aria-haspopup="true" aria-expanded={actionsMenuId === r.id}
                        style={{ width: 26, height: 26, borderRadius: 'var(--r-sm)', border: 'none', background: actionsMenuId === r.id ? 'rgba(0,0,0,0.06)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
                      </button>
                      {actionsMenuId === r.id && (
                        <>
                          <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={e => { e.stopPropagation(); setActionsMenuId(null) }} />
                          <div onClick={e => e.stopPropagation()}
                            style={{ position: 'absolute', top: 30, right: 0, zIndex: 101, width: 190, background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', padding: '10px 14px' }}>
                            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>No actions available yet</p>
                          </div>
                        </>
                      )}
                    </div>
                    {/* '→' navigate to details */}
                    <button type="button" onClick={e => { e.stopPropagation(); setSelectedId(r.id) }} aria-label="View request details"
                      style={{ width: 26, height: 26, borderRadius: 'var(--r-sm)', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--brand-color)' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                    </button>
                  </div>
                </div>

                {/* Progress stages */}
                <div style={{ display: 'flex', alignItems: 'center', maxWidth: 320, marginBottom: 12 }}>
                  {STAGES.map((s, i) => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STAGES.length - 1 ? 1 : undefined }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: i <= stageIdx ? 'var(--brand-color)' : 'rgba(0,0,0,0.12)', flexShrink: 0 }} />
                      {i < STAGES.length - 1 && <div style={{ flex: 1, height: 1.5, margin: '0 3px', background: i < stageIdx ? 'var(--brand-color)' : 'rgba(0,0,0,0.10)' }} />}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, max-content))', columnGap: 28, rowGap: 8, fontSize: 13.5 }}>
                  <InfoCell label="Container" value={containerValue} />
                  <InfoCell label="Vessel" value={r.vesselLine ?? ''} />
                  <InfoCell label="Voyage" value={r.voyageNumber ?? ''} />
                  <InfoCell label="Collection Date" value={r.collectionDate ?? ''} />
                  <InfoCell label="OOG" value={r.isOOG ? `Yes — ${r.oogLength || '—'} × ${r.oogWidth || '—'} × ${r.oogHeight || '—'} cm` : 'No'} />
                </div>
              </div>
            )
          })}
        </div>

        {selected && isWide && (
          <div style={{ width: 440, flexShrink: 0, position: 'sticky', top: 0, alignSelf: 'flex-start', height: 'calc(100vh - 140px)' }}>
            <RequestDetailsPanel requestId={selected.id} docked onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>

      {selected && !isWide && (
        <RequestDetailsPanel requestId={selected.id} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 110 }}>
      <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 2px' }}>{label}</p>
      <p style={{ color: '#1C1917', margin: 0 }}>{value}</p>
    </div>
  )
}
