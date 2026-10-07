import { useEffect, useState } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { printJobSheet } from '@/lib/cfsPrint'
import { cfs, CfsApiError, fmtDate, fmtNum, fmtTime, type ContainerDetail } from '@/lib/cfs'
import { Btn, CARD, Chip, Field, KV, Modal, SectionTitle, Select, TextArea, TextInput, useLive } from './ui'

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')

/** Stage 2–3: assign location/team/time, confirm (send to the tablet), print, recall. */
export function PlanPanel({ detail, onChanged }: { detail: ContainerDetail; onChanged: () => Promise<void> }) {
  const { container: c, settings } = detail
  const { data } = useLive(() => cfs.settings(), [], 0)
  const confirmed = !!c.plan_confirmed_at
  const editable = !confirmed && (c.status === 'manifested' || c.status === 'planned')

  const [locationId, setLocationId] = useState(c.location_id ?? '')
  const [teamId, setTeamId] = useState(c.team_id ?? settings.default_team_id ?? '')
  const [date, setDate] = useState(c.planned_date ? String(c.planned_date).slice(0, 10) : '')
  const [start, setStart] = useState(hhmm(c.planned_start) || '08:00')
  const [end, setEnd] = useState(hhmm(c.planned_end) || '12:00')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [capacity, setCapacity] = useState<string | null>(null)

  useEffect(() => {
    setLocationId(c.location_id ?? ''); setTeamId(c.team_id ?? settings.default_team_id ?? '')
    setDate(c.planned_date ? String(c.planned_date).slice(0, 10) : ''); setStart(hhmm(c.planned_start) || '08:00'); setEnd(hhmm(c.planned_end) || '12:00')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id, c.status, c.plan_confirmed_at])

  const locations = (data?.locations ?? []).filter(l => l.active)
  const teams = (data?.teams ?? []).filter(t => t.active && (t.direction === 'both' || t.direction === c.direction))

  const act = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(key); setErr(null)
    try { await fn(); toast(okMsg, 'success'); await onChanged() }
    catch (e: any) { setErr(e.message || 'Something went wrong') }
    finally { setBusy(null) }
  }

  const savePlan = async (force = false) => {
    if (!locationId) { setErr('Choose a location'); return }
    if (!teamId) { setErr('Choose a team'); return }
    if (!date) { setErr('Choose a date'); return }
    if (start >= end) { setErr('End time must be after the start time'); return }
    setBusy('plan'); setErr(null)
    try {
      await cfs.plan(c.id, { locationId, teamId, plannedDate: date, startTime: start, endTime: end, force })
      toast('Plan saved', 'success'); setCapacity(null); await onChanged()
    } catch (e: any) {
      if (e instanceof CfsApiError && e.code === 'capacity_exceeded') setCapacity(e.message)
      else setErr(e.message || 'Could not save the plan')
    } finally { setBusy(null) }
  }

  const print = async () => {
    setBusy('print')
    try {
      const sheet = await cfs.infoSheet(c.id)
      if (!printJobSheet(sheet)) toast('Allow pop-ups to print the information sheet', 'error')
    } catch (e: any) { toast(e.message || 'Could not build the information sheet', 'error') }
    finally { setBusy(null) }
  }

  return (
    <div style={CARD}>
      <SectionTitle action={confirmed ? <Chip tone="green">Plan confirmed</Chip> : c.status === 'planned' ? <Chip tone="amber">Draft plan</Chip> : undefined}>Plan</SectionTitle>

      {editable ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
            <Field label="Location *">
              <Select value={locationId} onChange={setLocationId} placeholder="Choose…"
                options={locations.map(l => ({ value: l.id, label: `${l.name} (${l.capacity_per_day}/day)` }))} />
            </Field>
            <Field label="Team *">
              <Select value={teamId} onChange={setTeamId} placeholder="Choose…"
                options={teams.map(t => ({ value: t.id, label: t.name }))} />
            </Field>
            <Field label="Date *"><TextInput type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
            <Field label="Start *"><TextInput type="time" value={start} onChange={e => setStart(e.target.value)} /></Field>
            <Field label="End *"><TextInput type="time" value={end} onChange={e => setEnd(e.target.value)} /></Field>
          </div>
          {err && <p role="alert" style={{ color: '#DC2626', fontSize: 13, margin: '12px 0 0' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 14 }}>
            {c.status === 'planned' && <Btn variant="danger" loading={busy === 'unplan'} onClick={() => act('unplan', () => cfs.unplan(c.id), 'Plan removed')}>Remove plan</Btn>}
            <Btn loading={busy === 'plan'} onClick={() => savePlan(false)}>{c.status === 'planned' ? 'Update plan' : 'Save plan'}</Btn>
            {c.status === 'planned' && (
              <Btn variant="primary" loading={busy === 'confirm'} onClick={() => act('confirm', () => cfs.confirmPlan(c.id), 'Plan confirmed and sent to the tablet')}>
                <Icon name={ICONS.check} size={17} /> Confirm plan
              </Btn>
            )}
            {c.status === 'planned' && <Btn loading={busy === 'print'} onClick={print}><Icon name={ICONS.document} size={17} /> Print info sheet</Btn>}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
            <KV label="Location" value={c.location_name} />
            <KV label="Team" value={c.team_name} />
            <KV label="Date" value={fmtDate(c.planned_date)} />
            <KV label="Time" value={`${fmtTime(c.planned_start)} – ${fmtTime(c.planned_end)}`} />
          </div>
          {c.tablet_pushed_at && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '12px 0 0' }}>Sent to the tablet module on {fmtDate(c.tablet_pushed_at)}.</p>}
          {err && <p role="alert" style={{ color: '#DC2626', fontSize: 13, margin: '12px 0 0' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 14 }}>
            <Btn loading={busy === 'print'} onClick={print}><Icon name={ICONS.document} size={17} /> Print info sheet</Btn>
            {c.status === 'planned' && confirmed && (
              <Btn variant="danger" loading={busy === 'recall'} onClick={() => act('recall', () => cfs.recallPlan(c.id), 'Plan recalled')}>Recall plan</Btn>
            )}
          </div>
        </>
      )}

      {capacity && (
        <Modal title="Location is full" onClose={() => setCapacity(null)} footer={
          <>
            <Btn variant="ghost" onClick={() => setCapacity(null)}>Choose another slot</Btn>
            <Btn variant="primary" loading={busy === 'plan'} onClick={() => savePlan(true)}>Plan anyway</Btn>
          </>}>
          <p style={{ margin: 0, fontSize: 15 }}>{capacity}.</p>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>You can still go over capacity if you need to.</p>
        </Modal>
      )}
    </div>
  )
}

/**
 * Stand-in for the execution tablet (Phase 2): lets a supervisor key in what was actually
 * unpacked/packed so the validation step can be used end to end today.
 */
export function ResultEntryPanel({ detail, onChanged }: { detail: ContainerDetail; onChanged: () => Promise<void> }) {
  const { container: c, shipments } = detail
  const [rows, setRows] = useState(() => shipments.map(s => ({
    shipmentId: s.id, hbl: s.house_bill_number,
    w: s.weight_kg ?? '', v: s.volume_cbm ?? '', p: s.package_count ?? '', notes: '',
    plannedW: s.weight_kg, plannedV: s.volume_cbm, plannedP: s.package_count,
  })))
  const [notes, setNotes] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const patch = (i: number, f: 'w' | 'v' | 'p' | 'notes', val: string) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [f]: val } : r)))
  const num = (v: string | number) => (String(v).trim() === '' ? null : Number(v))

  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      await cfs.submitResult(c.id, {
        source: 'staff', notes: notes.trim() || undefined,
        shipments: rows.map(r => ({ shipmentId: r.shipmentId, actualWeightKg: num(r.w), actualVolumeCbm: num(r.v), actualPackageCount: num(r.p), notes: r.notes.trim() || undefined })),
      })
      toast('Result recorded — ready for validation', 'success'); await onChanged()
    } catch (e: any) { setErr(e.message || 'Could not record the result'); setBusy(false) }
  }

  if (!open) {
    return (
      <div style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Waiting for the floor team</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>The tablet app will report results here. Until it's live you can enter them yourself.</div>
        </div>
        <Btn onClick={() => setOpen(true)}>Enter result manually</Btn>
      </div>
    )
  }
  return (
    <div style={CARD}>
      <SectionTitle action={<Btn small variant="ghost" onClick={() => setOpen(false)}>Close</Btn>}>Enter result</SectionTitle>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, fontSize: 13 }}>
          <thead><tr>{['House bill', 'Packages', 'Weight (kg)', 'Volume (cbm)', 'Note'].map(h => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10.5, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.shipmentId}>
                <td style={{ padding: '6px 8px', fontWeight: 700 }}>{r.hbl}</td>
                <td style={{ padding: 4 }}><TextInput type="number" min={0} value={r.p} onChange={e => patch(i, 'p', e.target.value)} aria-label={`${r.hbl} packages`} /></td>
                <td style={{ padding: 4 }}><TextInput type="number" min={0} step="any" value={r.w} onChange={e => patch(i, 'w', e.target.value)} aria-label={`${r.hbl} weight`} /></td>
                <td style={{ padding: 4 }}><TextInput type="number" min={0} step="any" value={r.v} onChange={e => patch(i, 'v', e.target.value)} aria-label={`${r.hbl} volume`} /></td>
                <td style={{ padding: 4 }}><TextInput value={r.notes} onChange={e => patch(i, 'notes', e.target.value)} aria-label={`${r.hbl} note`} maxLength={1000} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12 }}><Field label="Overall notes"><TextArea value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} style={{ minHeight: 60 }} /></Field></div>
      {err && <p role="alert" style={{ color: '#DC2626', fontSize: 13, margin: '10px 0 0' }}>{err}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <Btn variant="primary" loading={busy} onClick={submit}>Submit for validation</Btn>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>Planned figures: {fmtNum(c.package_count, 0)} packages · {fmtNum(c.net_weight_kg, 1)} kg · {fmtNum(c.volume_cbm)} cbm</p>
    </div>
  )
}
