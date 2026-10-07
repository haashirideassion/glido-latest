import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import RequestForm from '@/components/cfs/RequestForm'
import { Btn, CARD, CfsGlobalStyles, Chip, EmptyState, ErrorBanner, CELL_LABEL, PhotoThumb, Spinner, StagePill, useLive } from '@/components/cfs/ui'
import { cfs, fmtDate, fmtDateTime, fmtNum, fmtTime, serviceLabel } from '@/lib/cfs'

/** Customer-facing screens: submit a packing/unpacking request and follow its progress. */

const wrap: React.CSSProperties = { maxWidth: 880, margin: '0 auto', padding: '32px 16px 64px' }
const h1: React.CSSProperties = { margin: '0 0 6px', fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#1C1917' }

function LoginPrompt({ what }: { what: string }) {
  return (
    <div style={wrap}><CfsGlobalStyles />
      <EmptyState icon={ICONS.lock} title={`Sign in to ${what}`} body="You need an account to submit and track packing and unpacking requests."
        action={<Link to="/visitor-login"><Btn variant="primary">Sign in</Btn></Link>} />
    </div>
  )
}

const CONTAINER_STATUS: Record<string, { label: string; tone: 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'purple' }> = {
  new_request: { label: 'Received', tone: 'amber' },
  manifested: { label: 'Confirmed', tone: 'blue' },
  planned: { label: 'Scheduled', tone: 'blue' },
  result_validation: { label: 'In review', tone: 'purple' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
}
const REQUEST_STATUS: Record<string, { label: string; tone: 'neutral' | 'green' | 'amber' | 'red' }> = {
  submitted: { label: 'Awaiting acceptance', tone: 'amber' },
  accepted: { label: 'Accepted', tone: 'green' },
  declined: { label: 'Declined', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'red' },
}

// ── New request ──────────────────────────────────────────────────────────────

export function CustomerNewRequestPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const [done, setDone] = useState<{ id: string; ref: string } | null>(null)

  if (isLoading) return <Spinner />
  if (!isAuthenticated) return <LoginPrompt what="create a request" />

  if (done) {
    return (
      <div style={wrap}><CfsGlobalStyles />
        <EmptyState icon={ICONS.check} title={`Request ${done.ref} submitted`}
          body="We'll review it and confirm shortly. You can follow its progress under My Requests."
          action={<div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Btn onClick={() => setDone(null)}>Submit another</Btn>
            <Btn variant="primary" onClick={() => navigate(`/requests/${done.id}`)}>View request</Btn>
          </div>} />
      </div>
    )
  }
  return (
    <div style={wrap}><CfsGlobalStyles />
      <h1 style={h1}>Packing &amp; unpacking request</h1>
      <p style={{ margin: '0 0 20px', fontSize: 15, color: 'var(--text-secondary)' }}>Tell us which containers you'd like us to pack or unpack.</p>
      <RequestForm onCancel={() => navigate('/requests')}
        onCreated={r => { r.warnings.forEach(w => toast(w, 'info')); setDone({ id: r.id, ref: r.request_ref }) }} />
    </div>
  )
}

// ── My requests list ─────────────────────────────────────────────────────────

export function MyRequestsPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const { data, error, loading, refresh } = useLive(() => cfs.myRequests(), [isAuthenticated], 30000)

  if (isLoading) return <Spinner />
  if (!isAuthenticated) return <LoginPrompt what="see your requests" />

  return (
    <div style={wrap}><CfsGlobalStyles />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={h1}>My requests</h1>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--text-secondary)' }}>Packing and unpacking jobs you've asked us to do.</p>
        </div>
        <Link to="/requests/new"><Btn variant="primary"><Icon name={ICONS.add} size={18} /> New request</Btn></Link>
      </div>
      {error && <ErrorBanner message={error} onRetry={() => refresh()} />}
      {loading && !data && <Spinner />}
      {data && data.length === 0 && <EmptyState title="No requests yet" body="Submit your first packing or unpacking request." action={<Link to="/requests/new"><Btn variant="primary">New request</Btn></Link>} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(data ?? []).map((r: any) => {
          const st = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.submitted
          return (
            <Link key={r.id} to={`/requests/${r.id}`} className="cfs-card-hover" style={{ ...CARD, display: 'block', color: 'inherit', textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: '#1C1917' }}>{r.request_ref}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-tertiary)' }}>{r.direction === 'import' ? 'Unpacking' : 'Packing'}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StagePill status={r.status}>{st.label}</StagePill>
                  <span aria-hidden style={{ color: 'var(--brand-color)', display: 'flex' }}><Icon name={ICONS.arrowRight} size={15} /></span>
                </span>
              </div>
              <div style={{ display: 'flex', gap: '10px 28px', flexWrap: 'wrap', fontSize: 13.5 }}>
                <div style={{ minWidth: 100 }}><p style={{ ...CELL_LABEL, margin: '0 0 2px' }}>Submitted</p><p style={{ margin: 0, color: '#1C1917' }}>{fmtDate(r.created_at)}</p></div>
                <div style={{ minWidth: 80 }}><p style={{ ...CELL_LABEL, margin: '0 0 2px' }}>Containers</p><p style={{ margin: 0, color: '#1C1917' }}>{r.containers.length}</p></div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {r.containers.map((c: any) => {
                  const cs = CONTAINER_STATUS[c.status] ?? CONTAINER_STATUS.new_request
                  return <Chip key={c.id} tone={cs.tone}>{c.container_number} · {cs.label}</Chip>
                })}
              </div>
              {r.status === 'declined' && r.decline_reason && <p style={{ margin: '10px 0 0', fontSize: 13, color: '#B91C1C' }}>Reason: {r.decline_reason}</p>}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ── One request ──────────────────────────────────────────────────────────────

export function MyRequestDetailPage() {
  const { id = '' } = useParams()
  const { isAuthenticated, isLoading } = useAuth()
  const { data, error, loading, refresh } = useLive(() => cfs.myRequest(id), [id, isAuthenticated], 30000)

  if (isLoading) return <Spinner />
  if (!isAuthenticated) return <LoginPrompt what="see this request" />

  const req = data?.request
  const st = req ? (REQUEST_STATUS[req.status] ?? REQUEST_STATUS.submitted) : null

  return (
    <div style={wrap}><CfsGlobalStyles />
      <Link to="/requests" style={{ fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
        <Icon name={ICONS.arrowLeft} size={16} /> My requests
      </Link>
      {error && <ErrorBanner message={error} onRetry={() => refresh()} />}
      {loading && !data && <Spinner />}
      {req && st && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <h1 style={{ ...h1, margin: 0, fontFamily: 'ui-monospace,monospace', fontSize: 24 }}>{req.request_ref}</h1>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-tertiary)' }}>{req.direction === 'import' ? 'Unpacking' : 'Packing'}</span>
              <StagePill status={req.status}>{st.label}</StagePill>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--text-secondary)' }}>Submitted {fmtDateTime(req.created_at)}</p>
            {req.status === 'declined' && (
              <div role="alert" style={{ ...CARD, marginTop: 12, borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.05)', fontSize: 14, color: '#7F1D1D' }}>
                This request was declined{req.decline_reason ? `: ${req.decline_reason}` : '.'}
              </div>
            )}
            {req.related_services?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>{req.related_services.map((s: string) => <Chip key={s}>{serviceLabel(s)}</Chip>)}</div>
            )}
          </div>

          {data.containers.map((c: any) => {
            const cs = CONTAINER_STATUS[c.status] ?? CONTAINER_STATUS.new_request
            return (
              <div key={c.id} style={CARD}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                  <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, fontWeight: 700, color: '#1C1917' }}>{c.container_number}</span>
                  <span style={{ marginLeft: 'auto' }}><StagePill status={c.status}>{cs.label}</StagePill></span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, fontSize: 14 }}>
                  {c.vessel && <div><div style={lbl}>Vessel</div>{c.vessel}{c.voyage ? ` · ${c.voyage}` : ''}</div>}
                  {(c.eta || c.etd) && <div><div style={lbl}>{c.eta ? 'ETA' : 'ETD'}</div>{fmtDate(c.eta || c.etd)}</div>}
                  {c.planned_date && <div><div style={lbl}>Scheduled</div>{fmtDate(c.planned_date)} {fmtTime(c.planned_start)}–{fmtTime(c.planned_end)}{c.location_name ? ` · ${c.location_name}` : ''}</div>}
                  {c.inspection_status !== 'not_required' && <div><div style={lbl}>Inspection</div>{c.inspection_status}</div>}
                  {c.fumigation_status !== 'not_required' && <div><div style={lbl}>Fumigation</div>{c.fumigation_status}</div>}
                  {c.completed_at && <div><div style={lbl}>Completed</div>{fmtDateTime(c.completed_at)}</div>}
                </div>
                {Array.isArray(c.shipments) && c.shipments.length > 0 && (
                  <div style={{ marginTop: 14, overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                      <thead><tr>{['House bill', 'Consignee', 'Packages', 'Weight (kg)', 'Volume (cbm)'].map(h => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', ...lbl, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>{h}</th>)}</tr></thead>
                      <tbody>{c.shipments.map((s: any) => (
                        <tr key={s.house_bill_number}>
                          <td style={td}>{s.house_bill_number}</td><td style={td}>{s.consignee || '—'}</td>
                          <td style={td}>{fmtNum(s.package_count, 0)}</td><td style={td}>{fmtNum(s.weight_kg, 1)}</td><td style={td}>{fmtNum(s.volume_cbm)}</td>
                        </tr>))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}

          {data.photos.length > 0 && (
            <div style={CARD}>
              <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: '#1C1917' }}>Photos &amp; documents</h3>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{data.photos.map((p: any) => <PhotoThumb key={p.id} path={p.storage_path} name={p.file_name} />)}</div>
            </div>
          )}

          {data.messages.length > 0 && (
            <div style={CARD}>
              <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: '#1C1917' }}>Messages from us</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {data.messages.map((m: any) => (
                  <div key={m.id} style={{ background: '#FAFAF9', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 'var(--r-md)', padding: 12 }}>
                    {m.subject && <div style={{ fontWeight: 700, fontSize: 14 }}>{m.subject}</div>}
                    <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{m.sent_by_name ?? 'Team'} · {fmtDateTime(m.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const lbl: React.CSSProperties = { ...CELL_LABEL, marginBottom: 2 }
const td: React.CSSProperties = { padding: '7px 8px', borderBottom: '1px solid rgba(0,0,0,0.05)' }
