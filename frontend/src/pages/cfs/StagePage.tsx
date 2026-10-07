import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { useCfs } from '@/components/cfs/CfsContext'
import { ContainerCard } from '@/components/cfs/ContainerCard'
import PlanBoard from '@/components/cfs/PlanBoard'
import { Btn, EmptyState, ErrorBanner, ReasonModal, Spinner, TextInput, useLive } from '@/components/cfs/ui'
import { cfs, isMode, isStageSlug, jobNoun, MODE_TO_DIRECTION, SLUG_TO_STAGE, stageLabel, type CfsContainer } from '@/lib/cfs'

type Acceptance = 'all' | 'awaiting' | 'accepted'
type Confirmed = 'all' | 'draft' | 'confirmed'

const STAGE_BLURB: Record<string, (verb: string) => string> = {
  new_request: v => `Requests waiting to be accepted and reconciled before ${v.toLowerCase()} can be planned.`,
  manifested: v => `Validated and ready to be scheduled for ${v.toLowerCase()}.`,
  planned: v => `Jobs with a location, team and time slot. Confirm a plan to send it to the tablet.`,
  result_validation: () => `Results reported from the floor, waiting for a supervisor to approve.`,
  completed: v => `${v} finished and signed off.`,
}

function Pills<T extends string>({ value, options, onChange }: { value: T; options: Array<{ v: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div role="tablist" style={{ display: 'inline-flex', background: '#F3F2F1', borderRadius: 999, padding: 3 }}>
      {options.map(o => (
        <button key={o.v} role="tab" aria-selected={value === o.v} type="button" onClick={() => onChange(o.v)}
          style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
            background: value === o.v ? '#fff' : 'transparent', color: value === o.v ? '#1C1917' : 'var(--text-secondary)',
            boxShadow: value === o.v ? '0 1px 3px rgba(0,0,0,0.12)' : 'none' }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function StagePage() {
  const { mode, stage: stageSlug } = useParams()
  const navigate = useNavigate()
  const ctx = useCfs()
  const { refreshSummary, setFocusStage } = ctx

  const valid = isMode(mode) && isStageSlug(stageSlug)
  const direction = valid ? MODE_TO_DIRECTION[mode as 'unpacking' | 'packing'] : 'import'
  const stage = valid ? SLUG_TO_STAGE[stageSlug as keyof typeof SLUG_TO_STAGE] : 'new_request'

  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [acceptance, setAcceptance] = useState<Acceptance>('all')
  const [confirmed, setConfirmed] = useState<Confirmed>('all')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [boardTick, setBoardTick] = useState(0)
  const [declining, setDeclining] = useState<CfsContainer | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => { setFocusStage(null) }, [stage, setFocusStage])
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t) }, [q])
  useEffect(() => { setQ(''); setAcceptance('all'); setConfirmed('all'); setView('list') }, [stage, direction])

  const { data, error, loading, refresh } = useLive(
    () => cfs.list({
      direction, stage,
      acceptance: stage === 'new_request' && acceptance !== 'all' ? acceptance : undefined,
      confirmed: stage === 'planned' && confirmed !== 'all' ? confirmed === 'confirmed' : undefined,
      q: debounced.trim() || undefined,
    }),
    [direction, stage, acceptance, confirmed, debounced],
  )

  const verb = jobNoun(direction)
  const rows = data ?? []
  const label = stageLabel(stage, direction)

  const accept = async (c: CfsContainer) => {
    setBusyId(c.id)
    try { await cfs.accept(c.request_id); toast(`${c.request_ref} accepted`, 'success'); await refresh(true); refreshSummary() }
    catch (e: any) { toast(e.message || 'Could not accept', 'error') }
    finally { setBusyId(null) }
  }

  if (!valid) return <Navigate to="/packing-unpacking/unpacking/new" replace />

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#1C1917' }}>{label}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-secondary)' }}>{STAGE_BLURB[stage](verb)}</p>
        </div>
        <Btn variant="primary" onClick={() => navigate(`/packing-unpacking/requests/new?mode=${mode}`)}>
          <Icon name={ICONS.add} size={18} /> Create request
        </Btn>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 420 }}>
          <Icon name={ICONS.search} size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <TextInput value={q} onChange={e => setQ(e.target.value)} placeholder={stage === 'planned' && view === 'calendar' ? 'Search container, request, customer…' : 'Search container, house bill, request, customer…'} aria-label="Search" style={{ paddingLeft: 38, borderRadius: 999 }} />
        </div>
        {stage === 'new_request' && (
          <Pills value={acceptance} onChange={setAcceptance} options={[
            { v: 'all', label: 'All' },
            { v: 'awaiting', label: `Awaiting acceptance${ctx.summary ? ` (${ctx.summary.new_request.awaiting_acceptance})` : ''}` },
            { v: 'accepted', label: `Accepted${ctx.summary ? ` (${ctx.summary.new_request.accepted})` : ''}` },
          ]} />
        )}
        {stage === 'planned' && (
          <>
            <Pills value={view} onChange={setView} options={[{ v: 'list', label: 'List' }, { v: 'calendar', label: 'Calendar' }]} />
            <Pills value={confirmed} onChange={setConfirmed} options={[{ v: 'all', label: 'All' }, { v: 'draft', label: 'Draft' }, { v: 'confirmed', label: 'Confirmed' }]} />
          </>
        )}
        <Btn small variant="ghost" onClick={() => { void refresh(); refreshSummary(); setBoardTick(t => t + 1) }} aria-label="Refresh"><Icon name={ICONS.refresh} size={16} /> Refresh</Btn>
      </div>

      {stage === 'planned' && view === 'calendar' ? (
        <PlanBoard q={debounced.trim()} confirmed={confirmed} refreshKey={boardTick} />
      ) : (
        <>
          {error && <ErrorBanner message={error} onRetry={() => refresh()} />}
          {loading && !data && <Spinner />}
          {data && rows.length === 0 && (
            <EmptyState
              title={debounced ? 'Nothing matches your search' : `No ${label.toLowerCase()} jobs`}
              body={debounced ? 'Try a container number, house bill, request ID or customer name.' : stage === 'new_request' ? 'New requests from customers or created by staff will appear here.' : 'Jobs move here as they progress.'}
              action={stage === 'new_request' && !debounced ? <Btn variant="primary" onClick={() => navigate(`/packing-unpacking/requests/new?mode=${mode}`)}>Create request</Btn> : undefined}
            />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map(c => (
              <ContainerCard key={c.id} c={c}
                actions={stage === 'new_request' && c.request_status === 'submitted' ? (
                  <>
                    <Btn small variant="danger" disabled={busyId === c.id} onClick={() => setDeclining(c)}>Decline</Btn>
                    <Btn small variant="primary" loading={busyId === c.id} onClick={() => accept(c)}>Accept</Btn>
                  </>
                ) : undefined} />
            ))}
          </div>
        </>
      )}

      {declining && (
        <ReasonModal title={`Decline ${declining.request_ref}`} label="Reason (shared with the customer)" confirmLabel="Decline request" danger
          onClose={() => setDeclining(null)}
          onSubmit={async reason => {
            await cfs.decline(declining.request_id, reason)
            toast(`${declining.request_ref} declined`, 'info')
            setDeclining(null); await refresh(true); refreshSummary()
          }} />
      )}
    </div>
  )
}
