import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { useCfs } from '@/components/cfs/CfsContext'
import { Btn, CARD, Chip, ComplianceBadges, ErrorBanner, KV, MatchBadge, ReasonModal, SectionTitle, Spinner, StagePill, useLive } from '@/components/cfs/ui'
import ReconcilePanel from '@/components/cfs/ReconcilePanel'
import ExportDataPanel from '@/components/cfs/ExportDataPanel'
import { PlanPanel, ResultEntryPanel } from '@/components/cfs/PlanPanel'
import ResultPanel from '@/components/cfs/ResultPanel'
import { ActivityPanel, CompliancePanel, ContactCustomerModal, MessagesPanel, NotesPanel, PhotosPanel } from '@/components/cfs/SidePanels'
import {
  cfs, CfsApiError, fmtDate, fmtNum, serviceLabel, stagePath, stageLabel,
  type ContainerDetail,
} from '@/lib/cfs'

function ShipmentsSummary({ detail }: { detail: ContainerDetail }) {
  const { shipments } = detail
  const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, borderBottom: '1px solid rgba(0,0,0,0.08)' }
  const td: React.CSSProperties = { padding: '7px 8px', borderBottom: '1px solid rgba(0,0,0,0.05)', verticalAlign: 'top' }
  return (
    <div style={CARD}>
      <SectionTitle>Shipments ({shipments.length})</SectionTitle>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, fontSize: 13 }}>
          <thead><tr>{['House bill', 'Consignee', 'Goods', 'Packages', 'Weight (kg)', 'Volume (cbm)'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {shipments.map(s => (
              <tr key={s.id}>
                <td style={{ ...td, fontWeight: 700 }}>{s.house_bill_number}</td><td style={td}>{s.consignee || '—'}</td><td style={td}>{s.goods_description || '—'}</td>
                <td style={td}>{fmtNum(s.package_count, 0)}</td><td style={td}>{fmtNum(s.weight_kg, 1)}</td><td style={td}>{fmtNum(s.volume_cbm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ContainerPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { refreshSummary, setFocusStage } = useCfs()
  const { data: detail, error, loading, refresh } = useLive(() => cfs.detail(id), [id], 20000)

  const [contact, setContact] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [confirmErr, setConfirmErr] = useState<{ message: string; errors: Array<{ field: string; message: string }> } | null>(null)

  const c = detail?.container
  useEffect(() => {
    setFocusStage(c && c.status !== 'cancelled' ? c.status : null)
    return () => setFocusStage(null)
  }, [c?.status, setFocusStage]) // eslint-disable-line react-hooks/exhaustive-deps

  const onChanged = useCallback(async () => { await refresh(true); refreshSummary() }, [refresh, refreshSummary])

  if (loading && !detail) return <Spinner />
  if (error || !detail || !c) return <ErrorBanner message={error ?? 'Container not found'} onRetry={() => refresh()} />

  const isImport = c.direction === 'import'
  const backTo = c.status === 'cancelled' ? stagePath(c.direction, 'new_request') : stagePath(c.direction, c.status)
  const accepted = c.request_status === 'accepted'
  const stage1 = c.status === 'new_request'
  const editableStage1 = stage1 && accepted

  const accept = async () => {
    setBusy('accept')
    try { await cfs.accept(c.request_id); toast(`${c.request_ref} accepted`, 'success'); await onChanged() }
    catch (e: any) { toast(e.message || 'Could not accept', 'error') } finally { setBusy(null) }
  }

  const confirmManifest = async () => {
    setBusy('confirm'); setConfirmErr(null)
    try {
      await cfs.confirmManifest(c.id)
      toast(isImport ? 'Manifest confirmed' : 'Submitted to ICS and confirmed', 'success'); await onChanged()
    } catch (e: any) {
      if (e instanceof CfsApiError) setConfirmErr({ message: e.message, errors: Array.isArray(e.details.errors) ? e.details.errors : [] })
      else setConfirmErr({ message: e.message || 'Could not confirm', errors: [] })
    } finally { setBusy(null) }
  }

  const doneWord = isImport ? 'Unpacked' : 'Packed'
  const canConfirm = detail.match.can_confirm && !dirty

  return (
    <div>
      <style>{`
        .cfs-detail-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 18px; align-items: start; }
        @media (max-width: 1100px) { .cfs-detail-grid { grid-template-columns: minmax(0, 1fr); } }
      `}</style>

      <Link to={backTo} style={{ fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
        <Icon name={ICONS.arrowLeft} size={16} /> {c.status === 'cancelled' ? 'Back' : stageLabel(c.status, c.direction)}
      </Link>

      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#1C1917' }}>{c.container_number}</h1>
            <StagePill status={c.status}>{c.status === 'cancelled' ? 'Cancelled' : c.status === 'completed' ? doneWord : stageLabel(c.status, c.direction)}</StagePill>
            {isImport && <MatchBadge pct={detail.match.overall_pct ?? c.match_pct} />}
          </div>
          <div style={{ marginTop: 4, fontSize: 14, color: 'var(--text-secondary)' }}>
            {c.request_ref} · {c.customer_name} · {isImport ? 'Unpacking' : 'Packing'}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}><ComplianceBadges c={c} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn onClick={() => setContact(true)}><Icon name={ICONS.email} size={17} /> Contact customer</Btn>
          {c.status !== 'completed' && c.status !== 'cancelled' && <Btn variant="danger" onClick={() => setCancelling(true)}>Cancel job</Btn>}
        </div>
      </div>

      {c.status === 'cancelled' && (
        <div role="status" style={{ ...CARD, marginBottom: 14, borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.04)', fontSize: 14 }}>This job was cancelled. It is kept for the record only.</div>
      )}

      {/* Awaiting acceptance */}
      {c.request_status === 'submitted' && stage1 && (
        <div style={{ ...CARD, marginBottom: 14, borderColor: 'rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.07)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Icon name={ICONS.pending} size={22} style={{ color: '#B45309' }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Awaiting acceptance</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{c.customer_name} submitted this request. Accept it to start validating the details.</div>
          </div>
          <Btn variant="danger" onClick={() => setDeclining(true)}>Decline</Btn>
          <Btn variant="primary" loading={busy === 'accept'} onClick={accept}>Accept request</Btn>
        </div>
      )}

      <div className="cfs-detail-grid">
        {/* Main column */}
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {/* Overview */}
          <div style={CARD}>
            <SectionTitle>Container</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
              <KV label="Seal" value={c.seal_number} />
              <KV label="Type" value={c.container_type} />
              <KV label="Vessel / voyage" value={c.vessel ? `${c.vessel}${c.voyage ? ` · ${c.voyage}` : ''}` : null} />
              <KV label="Lloyd's number" value={c.lloyds_number} />
              <KV label="Route" value={c.load_port || c.discharge_port ? `${c.load_port ?? '—'} → ${c.discharge_port ?? '—'}` : null} />
              <KV label={isImport ? 'ETA' : 'ETD'} value={fmtDate(isImport ? c.eta : c.etd)} />
              <KV label="Packages" value={fmtNum(c.package_count, 0)} />
              <KV label="Weight (kg)" value={fmtNum(c.net_weight_kg, 1)} />
              <KV label="Volume (cbm)" value={fmtNum(c.volume_cbm)} />
              <KV label="Customer email" value={c.customer_email} />
            </div>
            {c.related_services?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
                {c.related_services.map(s => <Chip key={s}>{serviceLabel(s)}</Chip>)}
              </div>
            )}
            {c.ics_push_status && <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>ICS: {c.ics_push_status}{c.ics_push_ref ? ` (${c.ics_push_ref})` : ''}{c.ics_push_status === 'stubbed' ? ' — integration not connected yet' : ''}</p>}
          </div>

          {/* Stage 1 */}
          {stage1 && (isImport
            ? <ReconcilePanel detail={detail} editable={editableStage1} onChanged={onChanged} />
            : <ExportDataPanel detail={detail} editable={editableStage1} onChanged={onChanged} onDirty={setDirty} errors={confirmErr?.errors ?? []} />)}

          {stage1 && (
            <div style={{ ...CARD, position: 'sticky', bottom: 12, zIndex: 5, borderColor: 'rgba(var(--brand-rgb),0.30)' }}>
              {confirmErr && (
                <div role="alert" style={{ marginBottom: 10, fontSize: 13, color: '#B91C1C' }}>
                  <strong>{confirmErr.message}</strong>
                  {confirmErr.errors.length > 0 && <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{confirmErr.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220, fontSize: 13, color: 'var(--text-secondary)' }}>
                  {!accepted ? 'Accept the request first.'
                    : dirty ? 'Save your changes before confirming.'
                      : isImport
                        ? (detail.match.unresolved > 0 && detail.settings.require_resolution ? `Resolve the ${detail.match.unresolved} remaining difference${detail.match.unresolved === 1 ? '' : 's'} to continue.` : 'Review the comparison, then confirm the manifest.')
                        : 'Confirming submits the data to ICS and moves the job to Manifested.'}
                </div>
                <Btn variant="primary" disabled={!canConfirm} loading={busy === 'confirm'} onClick={confirmManifest}>
                  <Icon name={ICONS.check} size={17} /> {isImport ? 'Confirm manifest' : 'Confirm & submit to ICS'}
                </Btn>
              </div>
            </div>
          )}

          {/* Stage 2–3 */}
          {!stage1 && c.status !== 'cancelled' && <ShipmentsSummary detail={detail} />}
          {(c.status === 'manifested' || c.status === 'planned') && <PlanPanel detail={detail} onChanged={onChanged} />}
          {c.status === 'planned' && c.plan_confirmed_at && <ResultEntryPanel key={c.id + (c.plan_confirmed_at ?? '')} detail={detail} onChanged={onChanged} />}

          {/* Stage 4–5 */}
          {(c.status === 'result_validation' || c.status === 'completed') && <ResultPanel detail={detail} onChanged={onChanged} />}
          {c.status === 'completed' && c.location_name && (
            <div style={CARD}>
              <SectionTitle>Job</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
                <KV label="Location" value={c.location_name} /><KV label="Team" value={c.team_name} /><KV label="Date" value={fmtDate(c.planned_date)} />
              </div>
            </div>
          )}
        </div>

        {/* Side column */}
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <CompliancePanel detail={detail} onChanged={onChanged} />
          <NotesPanel detail={detail} onChanged={onChanged} />
          <PhotosPanel detail={detail} onChanged={onChanged} />
          <MessagesPanel detail={detail} />
          <ActivityPanel detail={detail} />
        </div>
      </div>

      {contact && <ContactCustomerModal detail={detail} onClose={() => setContact(false)} onSent={async () => { setContact(false); await onChanged() }} />}
      {cancelling && (
        <ReasonModal title={`Cancel ${c.container_number}`} label="Reason" confirmLabel="Cancel job" danger onClose={() => setCancelling(false)}
          onSubmit={async reason => { await cfs.cancel(c.id, reason); toast('Job cancelled', 'info'); setCancelling(false); refreshSummary(); navigate(stagePath(c.direction, 'new_request')) }} />
      )}
      {declining && (
        <ReasonModal title={`Decline ${c.request_ref}`} label="Reason (shared with the customer)" confirmLabel="Decline request" danger onClose={() => setDeclining(false)}
          onSubmit={async reason => { await cfs.decline(c.request_id, reason); toast(`${c.request_ref} declined`, 'info'); setDeclining(false); refreshSummary(); navigate(stagePath(c.direction, 'new_request')) }} />
      )}
    </div>
  )
}
