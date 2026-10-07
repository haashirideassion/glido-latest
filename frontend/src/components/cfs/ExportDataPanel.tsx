import { useEffect, useState } from 'react'
import { Icon, ICONS } from '@/lib/Icon'
import { toast } from '@/lib/toast'
import { cfs, type CfsShipment, type ContainerDetail } from '@/lib/cfs'
import { Btn, CARD, Field, SectionTitle, TextInput } from './ui'

/**
 * Export (Packing) stage 1: staff key in the booking details and the house bills going
 * into the container. Nothing to reconcile — Confirm pushes the data to ICS.
 * The field list is provisional (pending the confirmed export data set).
 */

interface HeaderForm { vessel: string; voyage: string; lloyds_number: string; load_port: string; discharge_port: string; etd: string; seal_number: string; container_type: string }
interface Row { id?: string; key: number; house_bill_number: string; job_reference: string; consignee: string; consignor: string; goods_description: string; package_count: string; weight_kg: string; volume_cbm: string; marks_numbers: string; handling_instructions: string }

let k = 0
const blank = (): Row => ({ key: ++k, house_bill_number: '', job_reference: '', consignee: '', consignor: '', goods_description: '', package_count: '', weight_kg: '', volume_cbm: '', marks_numbers: '', handling_instructions: '' })
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const toRow = (x: CfsShipment): Row => ({ id: x.id, key: ++k, house_bill_number: s(x.house_bill_number), job_reference: s(x.job_reference), consignee: s(x.consignee), consignor: s(x.consignor), goods_description: s(x.goods_description), package_count: s(x.package_count), weight_kg: s(x.weight_kg), volume_cbm: s(x.volume_cbm), marks_numbers: s(x.marks_numbers), handling_instructions: s(x.handling_instructions) })

const HEADER_FIELDS: Array<[keyof HeaderForm, string, 'text' | 'date']> = [
  ['vessel', 'Vessel', 'text'], ['voyage', 'Voyage', 'text'], ['lloyds_number', "Lloyd's number", 'text'],
  ['load_port', 'Load port', 'text'], ['discharge_port', 'Discharge port', 'text'], ['etd', 'ETD', 'date'],
  ['seal_number', 'Seal number', 'text'], ['container_type', 'Container type', 'text'],
]

export default function ExportDataPanel({ detail, editable, onChanged, onDirty, errors }: {
  detail: ContainerDetail; editable: boolean; onChanged: () => Promise<void>; onDirty: (d: boolean) => void
  errors: Array<{ field: string; message: string }>
}) {
  const { container } = detail
  const initHeader = (): HeaderForm => ({
    vessel: s(container.vessel), voyage: s(container.voyage), lloyds_number: s(container.lloyds_number), load_port: s(container.load_port),
    discharge_port: s(container.discharge_port), etd: s(container.etd).slice(0, 10), seal_number: s(container.seal_number), container_type: s(container.container_type),
  })
  const [header, setHeader] = useState<HeaderForm>(initHeader)
  const [rows, setRows] = useState<Row[]>(() => (detail.shipments.length ? detail.shipments.map(toRow) : [blank()]))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Re-sync from the server only when nothing is being edited (live refresh must not eat typing).
  useEffect(() => {
    if (dirty) return
    setHeader(initHeader()); setRows(detail.shipments.length ? detail.shipments.map(toRow) : [blank()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail])
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])

  const setH = (f: keyof HeaderForm, v: string) => { setHeader(h => ({ ...h, [f]: v })); setDirty(true) }
  const setR = (key: number, f: keyof Row, v: string) => { setRows(rs => rs.map(r => (r.key === key ? { ...r, [f]: v } : r))); setDirty(true) }
  const errFor = (f: string) => errors.find(e => e.field === f)?.message

  const save = async () => {
    setSaving(true); setErr(null)
    try {
      await cfs.editContainer(container.id, Object.fromEntries(Object.entries(header).map(([a, b]) => [a, b.trim() === '' ? null : b.trim()])))
      const list = rows.filter(r => Object.entries(r).some(([f, v]) => f !== 'key' && f !== 'id' && String(v).trim() !== ''))
      await cfs.saveShipments(container.id, list.map(r => ({
        id: r.id, house_bill_number: r.house_bill_number.trim(), job_reference: r.job_reference.trim() || null,
        consignee: r.consignee.trim() || null, consignor: r.consignor.trim() || null, goods_description: r.goods_description.trim() || null,
        package_count: r.package_count.trim() === '' ? null : Number(r.package_count), weight_kg: r.weight_kg.trim() === '' ? null : Number(r.weight_kg),
        volume_cbm: r.volume_cbm.trim() === '' ? null : Number(r.volume_cbm), marks_numbers: r.marks_numbers.trim() || null,
        handling_instructions: r.handling_instructions.trim() || null,
      } as Partial<CfsShipment>)))
      setDirty(false); toast('Saved', 'success'); await onChanged()
    } catch (e: any) { setErr(e.message || 'Could not save') }
    finally { setSaving(false) }
  }

  const disabled = !editable
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={CARD}>
        <SectionTitle>Booking details</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          {HEADER_FIELDS.map(([f, label, type]) => (
            <Field key={f} label={label}>
              <TextInput type={type} value={header[f]} disabled={disabled} onChange={e => setH(f, e.target.value)} aria-invalid={!!errFor(f)} />
              {errFor(f) && <p role="alert" style={{ color: '#DC2626', fontSize: 12, margin: '4px 0 0' }}>{errFor(f)}</p>}
            </Field>
          ))}
        </div>
      </div>

      <div style={CARD}>
        <SectionTitle action={editable ? <Btn small onClick={() => { setRows(r => [...r, blank()]); setDirty(true) }}><Icon name={ICONS.add} size={16} /> Add shipment</Btn> : undefined}>
          Shipments going into the container
        </SectionTitle>
        {errFor('shipments') && <p role="alert" style={{ color: '#DC2626', fontSize: 13, margin: '0 0 10px' }}>{errFor('shipments')}</p>}
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((r, i) => {
            const rowErr = r.id ? errFor(`shipment:${r.id}`) : undefined
            return (
              <div key={r.key} style={{ border: `1px solid ${rowErr ? 'rgba(239,68,68,0.5)' : 'rgba(0,0,0,0.09)'}`, borderRadius: 'var(--r-md)', padding: 12, background: '#FAFAF9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Shipment {i + 1}</span>
                  {editable && rows.length > 1 && <Btn small variant="ghost" onClick={() => { setRows(rs => rs.filter(x => x.key !== r.key)); setDirty(true) }}><Icon name={ICONS.trash} size={16} /> Remove</Btn>}
                </div>
                {rowErr && <p role="alert" style={{ color: '#DC2626', fontSize: 12, margin: '0 0 8px' }}>{rowErr}</p>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                  <Field label="House bill *"><TextInput value={r.house_bill_number} disabled={disabled} onChange={e => setR(r.key, 'house_bill_number', e.target.value)} maxLength={60} /></Field>
                  <Field label="Job reference"><TextInput value={r.job_reference} disabled={disabled} onChange={e => setR(r.key, 'job_reference', e.target.value)} maxLength={100} /></Field>
                  <Field label="Consignee"><TextInput value={r.consignee} disabled={disabled} onChange={e => setR(r.key, 'consignee', e.target.value)} maxLength={200} /></Field>
                  <Field label="Consignor"><TextInput value={r.consignor} disabled={disabled} onChange={e => setR(r.key, 'consignor', e.target.value)} maxLength={200} /></Field>
                  <Field label="Packages"><TextInput type="number" min={0} value={r.package_count} disabled={disabled} onChange={e => setR(r.key, 'package_count', e.target.value)} /></Field>
                  <Field label="Weight (kg)"><TextInput type="number" min={0} step="any" value={r.weight_kg} disabled={disabled} onChange={e => setR(r.key, 'weight_kg', e.target.value)} /></Field>
                  <Field label="Volume (cbm)"><TextInput type="number" min={0} step="any" value={r.volume_cbm} disabled={disabled} onChange={e => setR(r.key, 'volume_cbm', e.target.value)} /></Field>
                  <Field label="Marks & numbers"><TextInput value={r.marks_numbers} disabled={disabled} onChange={e => setR(r.key, 'marks_numbers', e.target.value)} maxLength={500} /></Field>
                  <Field label="Goods description" span={2}><TextInput value={r.goods_description} disabled={disabled} onChange={e => setR(r.key, 'goods_description', e.target.value)} maxLength={1000} /></Field>
                  <Field label="Handling instructions" span={2}><TextInput value={r.handling_instructions} disabled={disabled} onChange={e => setR(r.key, 'handling_instructions', e.target.value)} maxLength={1000} /></Field>
                </div>
              </div>
            )
          })}
        </div>
        {err && <p role="alert" style={{ color: '#DC2626', fontSize: 13, margin: '12px 0 0' }}>{err}</p>}
        {editable && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 14 }}>
            {dirty && <span style={{ fontSize: 13, color: '#B45309' }}>Unsaved changes</span>}
            <Btn variant="primary" loading={saving} disabled={!dirty} onClick={save}>Save</Btn>
          </div>
        )}
      </div>
    </div>
  )
}
