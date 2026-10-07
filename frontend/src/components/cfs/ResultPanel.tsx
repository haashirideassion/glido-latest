import { useState } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { cfs, fmtDateTime, fmtNum, type CfsResult, type ContainerDetail } from '@/lib/cfs'
import { Btn, CARD, Chip, ReasonModal, SectionTitle } from './ui'

/** Stage 4–5: compare what was planned with what the floor reported, then approve or send back. */

function Variance({ planned, actual, dp }: { planned: number | null; actual: number | null | undefined; dp: number }) {
  if (actual === null || actual === undefined) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>
  const p = planned === null ? null : Number(planned)
  const diff = p === null ? null : Math.round((Number(actual) - p) * 10 ** dp) / 10 ** dp
  const same = diff === 0
  return (
    <span>
      <strong>{fmtNum(actual, dp)}</strong>
      {p !== null && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: same ? '#15803D' : '#B91C1C' }}>{same ? '✓' : `${diff! > 0 ? '+' : ''}${fmtNum(diff, dp)}`}</span>}
    </span>
  )
}

export default function ResultPanel({ detail, onChanged }: { detail: ContainerDetail; onChanged: () => Promise<void> }) {
  const { container: c, shipments, results } = detail
  const latest: CfsResult | undefined = results[0]
  const [modal, setModal] = useState<'approve' | 'reject' | null>(null)
  const [busy, setBusy] = useState(false)
  const validating = c.status === 'result_validation'

  if (!latest) return null
  const byShip = new Map(latest.data.shipments.map(s => [s.shipmentId, s]))
  let diffs = 0
  for (const s of shipments) {
    const a = byShip.get(s.id); if (!a) continue
    if (a.actualPackageCount !== null && Number(a.actualPackageCount) !== Number(s.package_count ?? NaN)) diffs++
    if (a.actualWeightKg !== null && Number(a.actualWeightKg) !== Number(s.weight_kg ?? NaN)) diffs++
    if (a.actualVolumeCbm !== null && Number(a.actualVolumeCbm) !== Number(s.volume_cbm ?? NaN)) diffs++
  }

  const approve = async (notes: string) => {
    await cfs.approveResult(c.id, notes || undefined)
    toast(`${c.container_number} ${c.direction === 'import' ? 'unpacked' : 'packed'} — customer notified`, 'success')
    setModal(null); await onChanged()
  }
  const reject = async (notes: string) => {
    await cfs.rejectResult(c.id, notes)
    toast('Sent back to the floor team', 'info'); setModal(null); await onChanged()
  }
  const quickApprove = async () => { setBusy(true); try { await approve('') } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) } }

  return (
    <div style={CARD}>
      <SectionTitle action={
        c.status === 'completed' ? <Chip tone="green">Approved {fmtDateTime(c.completed_at)}</Chip>
          : validating ? (diffs === 0 ? <Chip tone="green">Matches the plan</Chip> : <Chip tone="amber">{diffs} difference{diffs === 1 ? '' : 's'} from plan</Chip>) : undefined}>
        {c.status === 'completed' ? 'Final record' : 'Result validation'}
      </SectionTitle>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620, fontSize: 13 }}>
          <thead><tr>
            {['House bill', 'Packages', 'Weight (kg)', 'Volume (cbm)', 'Note'].map(h => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {shipments.map(s => {
              const a = byShip.get(s.id)
              return (
                <tr key={s.id}>
                  <td style={{ padding: '7px 8px', fontWeight: 700, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>{s.house_bill_number}<div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>planned {fmtNum(s.package_count, 0)} · {fmtNum(s.weight_kg, 1)} kg · {fmtNum(s.volume_cbm)} cbm</div></td>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}><Variance planned={s.package_count} actual={a?.actualPackageCount} dp={0} /></td>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}><Variance planned={s.weight_kg} actual={a?.actualWeightKg} dp={1} /></td>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}><Variance planned={s.volume_cbm} actual={a?.actualVolumeCbm} dp={2} /></td>
                  <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(0,0,0,0.05)', color: 'var(--text-secondary)' }}>{a?.notes || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {latest.data.notes && <p style={{ fontSize: 13, margin: '12px 0 0' }}><strong>Floor notes:</strong> {latest.data.notes}</p>}
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 0 0' }}>Reported {fmtDateTime(latest.submitted_at)}</p>

      {results.filter(r => r.status === 'rejected').map(r => (
        <p key={r.id} style={{ fontSize: 12, color: '#B45309', margin: '6px 0 0' }}>Earlier result sent back {fmtDateTime(r.reviewed_at)}: {r.review_notes}</p>
      ))}

      {validating && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 16 }}>
          <Btn variant="danger" onClick={() => setModal('reject')}>Send back</Btn>
          <Btn variant="secondary" onClick={() => setModal('approve')}>Approve with note</Btn>
          <Btn variant="primary" loading={busy} onClick={quickApprove}><Icon name={ICONS.check} size={17} /> Approve</Btn>
        </div>
      )}
      {c.status === 'completed' && c.shared_with_customer_at && (
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '12px 0 0' }}>Shared with the customer on {fmtDateTime(c.shared_with_customer_at)}.</p>
      )}

      {modal === 'approve' && <ReasonModal title="Approve result" label="Note (optional)" confirmLabel="Approve" optional onSubmit={approve} onClose={() => setModal(null)} />}
      {modal === 'reject' && <ReasonModal title="Send back to the floor team" label="What needs to be redone?" confirmLabel="Send back" danger onSubmit={reject} onClose={() => setModal(null)} />}
    </div>
  )
}
