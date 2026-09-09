import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { usePageTitle } from '@/lib/usePageTitle'
import {
  CatalogueItem, RateCard, createCatalogueItem, getBillingSettings, getCatalogue,
  getFormulas, getJobMonitor, getRateCard, getRateCards, grantCapabilities,
  publishRateCard, runAccrual, seedCatalogue, simulateRateCard, testFormula,
  updateCatalogueItem, updateThresholds, updateTaxSettings,
} from '@/lib/db/billing'
import { useBillingCapabilities, reasonFor } from '@/lib/useBillingCapabilities'
import { ChargeWorkingPanel } from '@/components/billing/ChargeWorkingPanel'
import {
  Amount, DataTable, EmptyRow, Field, GatedButton, HeadRow, Loading, Modal, Note,
  Panel, RefusalNotice, ScrollTable, Stat, StatusPill, TD, TH, TR, formatDate,
  humanise, inputStyle, useAsync,
} from '@/components/billing/BillingUI'

/**
 * Billing settings: C-01/C-02 catalogue, T-01/T-03/T-04/T-08 tariff, S-01 tax,
 * S-10 approvals, S-11 roles, Y-01 job monitor.
 *
 * These are the screens that decide what everything downstream charges, so each
 * one states its consequence rather than leaving it implied — a tax change says
 * what happens to invoices, a publish says what happens to cargo already in
 * storage, a threshold says what can never be self-approved.
 */

const TABS = [
  { key: 'catalogue', label: 'Service catalogue' },
  { key: 'tariffs',   label: 'Rate cards' },
  { key: 'formulas',  label: 'Formulas' },
  { key: 'tax',       label: 'Tax' },
  { key: 'approvals', label: 'Approvals & roles' },
  { key: 'jobs',      label: 'System jobs' },
] as const

type TabKey = typeof TABS[number]['key']

export default function BillingSettingsPage() {
  usePageTitle('Billing Settings')
  const { hash } = useLocation()
  const initial = (hash.replace('#', '') || 'catalogue') as TabKey
  const [tab, setTab] = useState<TabKey>(TABS.some(t => t.key === initial) ? initial : 'catalogue')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--card-gap)' }}>
      <div className="billing-subnav">
        {TABS.map(t => (
          <a key={t.key} href={`#${t.key}`}
            className={tab === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}>
            {t.label}
          </a>
        ))}
      </div>

      {tab === 'catalogue' && <CatalogueTab />}
      {tab === 'tariffs'   && <TariffsTab />}
      {tab === 'formulas'  && <FormulasTab />}
      {tab === 'tax'       && <TaxTab />}
      {tab === 'approvals' && <ApprovalsTab />}
      {tab === 'jobs'      && <JobsTab />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// C-01 / C-02 — service catalogue
// ─────────────────────────────────────────────────────────────────────────────

function CatalogueTab() {
  const { caps } = useBillingCapabilities()
  const list = useAsync(() => getCatalogue(), [])
  const [editing, setEditing] = useState<CatalogueItem | null | 'new'>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const items = list.data?.items ?? []
  const unmapped = items.filter(i => !i.ledgerMapped)

  async function seed() {
    setBusy(true); setError(null)
    try {
      const res = await seedCatalogue()
      toast.success(`${res.seeded} service${res.seeded === 1 ? '' : 's'} added`, {
        description: res.skipped ? `${res.skipped} already existed and were left alone.` : undefined,
      })
      list.reload()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(item: CatalogueItem) {
    setError(null)
    try {
      await updateCatalogueItem(item.id, {
        status: item.status === 'active' ? 'inactive' : 'active',
      })
      toast.success(item.status === 'active' ? 'Service deactivated' : 'Service activated')
      list.reload()
    } catch (err) {
      setError(err as Error)
    }
  }

  return (
    <>
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      {unmapped.length > 0 && (
        <Note tone="warn">
          {unmapped.length} active service{unmapped.length === 1 ? ' has' : 's have'} no revenue
          account. Any invoice containing {unmapped.length === 1 ? 'it' : 'them'} is blocked from
          syncing to the ledger — it must never post to a default account.
        </Note>
      )}

      <div style={{ marginTop: unmapped.length ? 'var(--card-gap)' : 0 }}>
        <Panel
          title="Service catalogue"
          subtitle="What you sell. Everything downstream prices one of these."
          traces="SC-01"
          padded={false}
          actions={
            <>
              {!items.length && (
                <GatedButton variant="primary" onClick={seed} busy={busy}
                  blockedReason={reasonFor(caps, 'can_manage_catalogue')}>
                  Seed standard catalogue
                </GatedButton>
              )}
              <GatedButton onClick={() => setEditing('new')}
                blockedReason={reasonFor(caps, 'can_manage_catalogue')}>
                Add a service
              </GatedButton>
            </>
          }
        >
          {list.loading ? <Loading /> : !items.length ? (
            <div style={{ padding: 'var(--card-pad)' }}>
              <Note>
                No services yet. Seeding the standard catalogue gives you storage, demurrage,
                shrink wrapping, slot fees, unpacking, inspections, documentation, an
                after-hours surcharge and a cancellation fee — all editable afterwards.
              </Note>
            </div>
          ) : (
            <ScrollTable>
              <DataTable>
                <HeadRow>
                  <TH>Code</TH><TH>Customer-facing name</TH><TH>Category</TH>
                  <TH>Unit</TH><TH>Tax</TH><TH>Revenue account</TH>
                  <TH align="right">Version</TH><TH>Status</TH><TH>Used by</TH><TH />
                </HeadRow>
                <tbody>
                  {items.map(i => (
                    <TR key={i.id} highlight={!i.ledgerMapped && i.status === 'active'}>
                      <TD>
                        <code style={{ fontSize: 12, fontWeight: 600 }}>{i.code}</code>
                      </TD>
                      <TD>
                        <span style={{ fontWeight: 600, color: '#1C1917' }}>{i.customerName}</span>
                        {/* SC-10: the internal name never reaches a customer */}
                        {i.internalName && i.internalName !== i.customerName && (
                          <span style={{
                            display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)',
                          }}>
                            internally: {i.internalName}
                          </span>
                        )}
                      </TD>
                      <TD>{humanise(i.category)}</TD>
                      <TD>{i.unitOfMeasure}</TD>
                      <TD>{humanise(i.taxability)}</TD>
                      <TD>
                        {i.glAccountCode ?? (
                          <span style={{ color: '#B91C1C', fontWeight: 600, fontSize: 12 }}>
                            Not mapped
                          </span>
                        )}
                      </TD>
                      <TD align="right">v{i.versionNo}</TD>
                      <TD><StatusPill status={i.status} /></TD>
                      <TD>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {i.usage.chargeLines} charge{i.usage.chargeLines === 1 ? '' : 's'},{' '}
                          {i.usage.rateLines} rate{i.usage.rateLines === 1 ? '' : 's'}
                        </span>
                      </TD>
                      <TD align="right">
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <GatedButton size="sm" onClick={() => setEditing(i)}
                            blockedReason={reasonFor(caps, 'can_manage_catalogue')}>
                            Edit
                          </GatedButton>
                          {/* SC-09: deactivate is the alternative to deleting */}
                          <GatedButton size="sm" onClick={() => toggleActive(i)}
                            blockedReason={reasonFor(caps, 'can_manage_catalogue')}>
                            {i.status === 'active' ? 'Deactivate' : 'Activate'}
                          </GatedButton>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </DataTable>
            </ScrollTable>
          )}
        </Panel>
      </div>

      {editing && (
        <CatalogueItemModal
          item={editing === 'new' ? null : editing}
          categories={list.data?.categories ?? []}
          units={list.data?.units ?? []}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); list.reload() }}
        />
      )}
    </>
  )
}

function CatalogueItemModal({
  item, categories, units, onClose, onDone,
}: {
  item: CatalogueItem | null
  categories: string[]
  units: string[]
  onClose: () => void
  onDone: () => void
}) {
  const [form, setForm] = useState({
    code: item?.code ?? '',
    customerName: item?.customerName ?? '',
    internalName: item?.internalName ?? '',
    description: item?.description ?? '',
    category: item?.category ?? 'other',
    unitOfMeasure: item?.unitOfMeasure ?? 'each',
    taxability: item?.taxability ?? 'standard',
    glAccountCode: item?.glAccountCode ?? '',
    taxCode: item?.taxCode ?? '',
    status: item?.status ?? 'active',
    changeNote: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  async function submit() {
    if (!form.code.trim() || !form.customerName.trim()) {
      setError(new Error('A code and a customer-facing name are both required.'))
      return
    }
    setBusy(true); setError(null)
    try {
      if (item) {
        await updateCatalogueItem(item.id, form)
        toast.success('Service updated', {
          description: 'A new version was recorded — the previous one still explains existing charges.',
        })
      } else {
        await createCatalogueItem(form)
        toast.success('Service added')
      }
      onDone()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={item ? `Edit ${item.customerName}` : 'Add a service'}
      subtitle={item ? `Version ${item.versionNo} — editing creates version ${item.versionNo + 1}` : undefined}
      traces="SC-01"
      width={620}
      onClose={onClose}
      footer={
        <>
          <GatedButton variant="ghost" onClick={onClose}>Cancel</GatedButton>
          <GatedButton variant="primary" onClick={submit} busy={busy}>
            {item ? 'Save new version' : 'Add service'}
          </GatedButton>
        </>
      }
    >
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      {item && (
        <Note>
          Editing supersedes the current version rather than overwriting it. Charges already
          raised keep pointing at the version they were priced against, so any historical price
          question stays answerable.
        </Note>
      )}

      <div style={{ marginTop: item ? 14 : 0 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: '0 0 140px' }}>
            <Field label="Code" required hint="Internal. Never shown to a customer.">
              <input value={form.code} disabled={!!item}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                style={{ ...inputStyle, opacity: item ? 0.6 : 1 }} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Customer-facing name" required
              hint="This is the only name that appears on a quote, portal or invoice.">
              <input value={form.customerName}
                onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                style={inputStyle} />
            </Field>
          </div>
        </div>

        <Field label="Internal name" hint="Optional. What your team calls it.">
          <input value={form.internalName}
            onChange={e => setForm(f => ({ ...f, internalName: e.target.value }))}
            style={inputStyle} />
        </Field>

        <Field label="Description" hint="Shown to the customer when they choose add-ons.">
          <textarea value={form.description} rows={2}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            style={{ ...inputStyle, resize: 'vertical' }} />
        </Field>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Category" required>
              <select value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                style={inputStyle}>
                {categories.map(c => <option key={c} value={c}>{humanise(c)}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Unit of measure" required
              hint="Decides how a quantity is derived when rating.">
              <select value={form.unitOfMeasure}
                onChange={e => setForm(f => ({ ...f, unitOfMeasure: e.target.value }))}
                style={inputStyle}>
                {units.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Tax treatment" required>
              <select value={form.taxability}
                onChange={e => setForm(f => ({ ...f, taxability: e.target.value }))}
                style={inputStyle}>
                <option value="standard">Standard (GST applies)</option>
                <option value="gst_free">GST-free</option>
                <option value="input_taxed">Input taxed</option>
              </select>
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Revenue account"
              hint="Required before an invoice with this service can sync to the ledger.">
              <input value={form.glAccountCode}
                onChange={e => setForm(f => ({ ...f, glAccountCode: e.target.value }))}
                placeholder="e.g. 4100" style={inputStyle} />
            </Field>
          </div>
          <div style={{ flex: '0 0 110px' }}>
            <Field label="Tax code">
              <input value={form.taxCode}
                onChange={e => setForm(f => ({ ...f, taxCode: e.target.value }))}
                placeholder="GST" style={inputStyle} />
            </Field>
          </div>
        </div>

        {item && (
          <Field label="Change note" hint="Why this changed — kept with the version.">
            <input value={form.changeNote}
              onChange={e => setForm(f => ({ ...f, changeNote: e.target.value }))}
              style={inputStyle} />
          </Field>
        )}
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// T-01 / T-03 / T-08 / T-09 — rate cards
// ─────────────────────────────────────────────────────────────────────────────

function TariffsTab() {
  const list = useAsync(() => getRateCards(), [])
  const [openCard, setOpenCard] = useState<RateCard | null>(null)
  const [simulating, setSimulating] = useState<RateCard | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const cards = list.data?.cards ?? []

  return (
    <>
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      <Panel
        title="Rate cards"
        subtitle="A card prices the catalogue. Cards are versioned; a live one is never edited in place."
        traces="TF-01"
        padded={false}
      >
        {list.loading ? <Loading /> : !cards.length ? (
          <div style={{ padding: 'var(--card-pad)' }}>
            <Note tone="warn">
              No rate cards. Nothing can be priced until one is published — quotes and ratings
              will refuse rather than guess.
            </Note>
          </div>
        ) : (
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH>Name</TH><TH>Status</TH><TH>Effective</TH>
                <TH align="right">Lines</TH><TH align="right">Accounts</TH>
                <TH align="right">Priced</TH><TH>Default</TH><TH>Approver</TH><TH />
              </HeadRow>
              <tbody>
                {cards.map(c => (
                  <TR key={c.id}>
                    <TD>
                      <span style={{ fontWeight: 600, color: '#1C1917' }}>{c.name}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                        v{c.versionNo} · {c.currency} · rounding {humanise(c.roundingMode)}
                      </span>
                    </TD>
                    <TD><StatusPill status={c.status} /></TD>
                    <TD>
                      {formatDate(c.effectiveFrom)}
                      {c.effectiveTo && (
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                          to {formatDate(c.effectiveTo)}
                        </span>
                      )}
                    </TD>
                    <TD align="right">{c.lineCount}</TD>
                    <TD align="right">{c.assignedAccounts}</TD>
                    <TD align="right">{c.usedByChargeLines}</TD>
                    <TD>{c.isSiteDefault ? 'Yes' : '—'}</TD>
                    <TD>
                      {c.publishedBy ?? '—'}
                      {c.publishedAt && (
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                          {formatDate(c.publishedAt)}
                        </span>
                      )}
                    </TD>
                    <TD align="right">
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <GatedButton size="sm" onClick={() => setOpenCard(c)}>Open</GatedButton>
                        <GatedButton size="sm" onClick={() => setSimulating(c)}>Simulate</GatedButton>
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          </ScrollTable>
        )}
      </Panel>

      {openCard && (
        <RateCardModal
          card={openCard}
          onClose={() => setOpenCard(null)}
          onDone={() => { setOpenCard(null); list.reload() }}
        />
      )}
      {simulating && (
        <SimulatorModal card={simulating} onClose={() => setSimulating(null)} />
      )}
    </>
  )
}

function RateCardModal({
  card, onClose, onDone,
}: {
  card: RateCard; onClose: () => void; onDone: () => void
}) {
  const { caps } = useBillingCapabilities()
  const detail = useAsync(() => getRateCard(card.id), [card.id])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [effect, setEffect] = useState<string | null>(null)

  async function doPublish(acknowledgeCoverageGap = false) {
    setBusy(true); setError(null)
    try {
      const res = await publishRateCard(card.id, { acknowledgeCoverageGap })
      setEffect(res.effectNote)
      toast.success('Rate card published')
      detail.reload()
      // Refresh the list behind the modal too — the card's status just changed
      // from draft to active, and leaving that stale is confusing.
      onDone()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  const d = detail.data

  return (
    <Modal
      title={card.name}
      subtitle={`${humanise(card.status)} · effective from ${formatDate(card.effectiveFrom)}`}
      traces="TF-01"
      width={860}
      onClose={onClose}
      footer={
        <>
          <GatedButton variant="ghost" onClick={onClose}>Close</GatedButton>
          {(card.status === 'draft' || card.status === 'reviewed') && (
            <GatedButton variant="primary" busy={busy}
              onClick={() => doPublish(false)}
              blockedReason={reasonFor(caps, 'can_publish_tariffs')}>
              Publish
            </GatedButton>
          )}
        </>
      }
    >
      <RefusalNotice
        error={error}
        onDismiss={() => setError(null)}
      />
      {error && /Acknowledge to publish anyway/.test(error.message) && (
        <div style={{ marginTop: 8 }}>
          <GatedButton variant="danger" onClick={() => doPublish(true)} busy={busy}>
            Publish anyway, accepting the gap
          </GatedButton>
        </div>
      )}
      {effect && <div style={{ marginTop: 8 }}><Note tone="good">{effect}</Note></div>}

      {detail.loading ? <Loading /> : (
        <>
          {d && !d.coverage.complete && (
            <div style={{ marginTop: 12 }}>
              <Note tone="warn">
                {d.coverage.unpriced} active service{d.coverage.unpriced === 1 ? '' : 's'}{' '}
                {d.coverage.unpriced === 1 ? 'has' : 'have'} no rate on this card:{' '}
                {d.unpricedItems.map(u => u.customer_name).join(', ')}. If any of them attaches
                to a booking it will be charged nothing.
              </Note>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <ScrollTable>
              <DataTable>
                <HeadRow>
                  <TH>Service</TH><TH>Rate type</TH><TH align="right">Rate</TH>
                  <TH align="right">Min qty</TH><TH align="right">Min charge</TH>
                  <TH align="right">Free</TH><TH>Formula</TH><TH>Tiers</TH>
                </HeadRow>
                <tbody>
                  {!d?.lines.length && (
                    <EmptyRow colSpan={8}>
                      No rate lines. This card prices nothing.
                    </EmptyRow>
                  )}
                  {d?.lines.map(l => (
                    <TR key={l.id}>
                      <TD>
                        <span style={{ fontWeight: 600, color: '#1C1917' }}>{l.itemName}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                          {l.itemCode} · per {l.unitOfMeasure}
                        </span>
                      </TD>
                      <TD>{humanise(l.rateType)}</TD>
                      <TD align="right">
                        {l.unitRate ?? (l.percentOf ? `${l.percentOf}%` : '—')}
                      </TD>
                      <TD align="right">{l.minQuantity ?? '—'}</TD>
                      <TD align="right">{l.minCharge ?? '—'}</TD>
                      <TD align="right">
                        {l.freeAllowance
                          ? `${l.freeAllowance} ${l.freeAllowanceUnit ?? ''}`.trim()
                          : '—'}
                      </TD>
                      <TD>
                        {l.formulaName ? (
                          <span title={l.formulaExpression ?? undefined}
                            style={{ fontSize: 12 }}>
                            {l.formulaName}
                          </span>
                        ) : '—'}
                      </TD>
                      <TD>
                        {!l.tiers?.length ? '—' : (
                          <span style={{ fontSize: 12 }}>
                            {l.tiers.map(t => (
                              <span key={t.tierNo} style={{ display: 'block' }}>
                                {t.toQty == null ? `over ${t.fromQty}` : `${t.fromQty}–${t.toQty}`}
                                {' @ '}{t.unitRate}
                              </span>
                            ))}
                          </span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </DataTable>
            </ScrollTable>
          </div>

          {d && d.assignedAccounts.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{
                margin: '0 0 5px', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                textTransform: 'uppercase', color: 'var(--text-tertiary)',
              }}>
                Assigned accounts
              </p>
              <p style={{ margin: 0, fontSize: 13 }}>
                {d.assignedAccounts.map(a => a.legal_name).join(', ')}
              </p>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

/** T-08 — the simulator: price a scenario without touching anything (TF-11). */
function SimulatorModal({ card, onClose }: { card: RateCard; onClose: () => void }) {
  const [inputs, setInputs] = useState({
    serviceType: 'dropoff', loadType: 'lcl',
    slotDate: new Date().toISOString().slice(0, 10),
    slotStartTime: '10:00',
    weightKg: '2000', volumeCbm: '1.5', palletCount: '3',
    daysOnSite: '5', dwellThresholdDays: '7',
  })
  const [result, setResult] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  async function run(runAll = false) {
    setBusy(true); setError(null)
    try {
      const res = await simulateRateCard(card.id, runAll ? { runAll: true } : {
        name: 'Ad-hoc scenario',
        inputs: {
          serviceType: inputs.serviceType,
          loadType: inputs.loadType,
          slotDate: inputs.slotDate,
          slotStartTime: inputs.slotStartTime,
          weightKg: Number(inputs.weightKg) || null,
          volumeCbm: Number(inputs.volumeCbm) || null,
          palletCount: Number(inputs.palletCount) || null,
          daysOnSite: Number(inputs.daysOnSite) || null,
          dwellThresholdDays: Number(inputs.dwellThresholdDays) || null,
        },
      })
      setResult(res)
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Rate card simulator"
      subtitle={`${card.name} — prices a scenario without creating anything`}
      traces="TF-11"
      width={780}
      onClose={onClose}
      footer={
        <>
          <GatedButton variant="ghost" onClick={onClose}>Close</GatedButton>
          <GatedButton onClick={() => run(true)} busy={busy}>Run saved scenarios</GatedButton>
          <GatedButton variant="primary" onClick={() => run(false)} busy={busy}>Price it</GatedButton>
        </>
      }
    >
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
      }}>
        <Field label="Service"><select value={inputs.serviceType}
          onChange={e => setInputs(i => ({ ...i, serviceType: e.target.value }))}
          style={inputStyle}>
          <option value="dropoff">Dropoff</option><option value="pickup">Pickup</option>
        </select></Field>
        <Field label="Load"><select value={inputs.loadType}
          onChange={e => setInputs(i => ({ ...i, loadType: e.target.value }))}
          style={inputStyle}>
          <option value="lcl">LCL</option><option value="fcl">FCL</option>
        </select></Field>
        <Field label="Slot date"><input type="date" value={inputs.slotDate}
          onChange={e => setInputs(i => ({ ...i, slotDate: e.target.value }))}
          style={inputStyle} /></Field>
        <Field label="Slot time" hint="After hours triggers the surcharge">
          <input type="time" value={inputs.slotStartTime}
            onChange={e => setInputs(i => ({ ...i, slotStartTime: e.target.value }))}
            style={inputStyle} /></Field>
        <Field label="Weight (kg)"><input type="number" value={inputs.weightKg}
          onChange={e => setInputs(i => ({ ...i, weightKg: e.target.value }))}
          style={inputStyle} /></Field>
        <Field label="Volume (CBM)"><input type="number" step="0.01" value={inputs.volumeCbm}
          onChange={e => setInputs(i => ({ ...i, volumeCbm: e.target.value }))}
          style={inputStyle} /></Field>
        <Field label="Pallets"><input type="number" value={inputs.palletCount}
          onChange={e => setInputs(i => ({ ...i, palletCount: e.target.value }))}
          style={inputStyle} /></Field>
        <Field label="Days on site"><input type="number" value={inputs.daysOnSite}
          onChange={e => setInputs(i => ({ ...i, daysOnSite: e.target.value }))}
          style={inputStyle} /></Field>
        <Field label="Dwell threshold"><input type="number" value={inputs.dwellThresholdDays}
          onChange={e => setInputs(i => ({ ...i, dwellThresholdDays: e.target.value }))}
          style={inputStyle} /></Field>
      </div>

      {result && (
        <div style={{ marginTop: 6 }}>
          {result.summary.note && <Note tone="warn">{result.summary.note}</Note>}
          {result.results.map((r: any, i: number) => (
            <div key={i} style={{ marginTop: 12 }}>
              <Panel
                title={r.name}
                subtitle={r.ok ? undefined : r.error}
                actions={r.ok ? <Amount value={r.total} bold size={16} /> : undefined}
                padded={false}
              >
                {r.ok && (
                  <>
                    {r.regression && !r.regression.matches && (
                      <div style={{ padding: 'var(--card-pad)' }}>
                        <Note tone="warn">
                          Expected {r.regression.expected} but got {r.regression.actual} — this
                          saved scenario no longer prices as it did.
                        </Note>
                      </div>
                    )}
                    {r.warnings?.length > 0 && (
                      <div style={{ padding: 'var(--card-pad)' }}>
                        {r.warnings.map((w: string, j: number) => (
                          <Note key={j} tone="warn">{w}</Note>
                        ))}
                      </div>
                    )}
                    <ScrollTable>
                      <DataTable>
                        <HeadRow>
                          <TH>Line</TH><TH align="right">Qty</TH>
                          <TH align="right">Net</TH><TH align="right">Total</TH>
                        </HeadRow>
                        <tbody>
                          {r.lines.map((l: any, j: number) => (
                            <TR key={j}>
                              <TD>
                                <span style={{ fontWeight: 600 }}>{l.description}</span>
                                <div style={{ marginTop: 4 }}>
                                  <ChargeWorkingPanel working={l.working} variant="card" />
                                </div>
                              </TD>
                              <TD align="right">{l.chargeableQuantity}</TD>
                              <TD align="right"><Amount value={l.lineSubtotal} /></TD>
                              <TD align="right"><Amount value={l.lineTotal} bold /></TD>
                            </TR>
                          ))}
                        </tbody>
                      </DataTable>
                    </ScrollTable>
                  </>
                )}
              </Panel>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// T-04 — chargeable-quantity formulas (TF-08)
// ─────────────────────────────────────────────────────────────────────────────

function FormulasTab() {
  const list = useAsync(() => getFormulas(), [])
  const [expression, setExpression] = useState('MAX(weight_kg / 1000, volume_cbm)')
  const [test, setTest] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)

  async function runTest() {
    setBusy(true)
    try {
      setTest(await testFormula({ expression }))
    } catch {
      setTest({ valid: false, error: 'Could not evaluate', variables: [], result: null })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Note>
        The chargeable-quantity rule is configuration, not code. The Phase 1 behaviour — the
        greater of weight in tonnes and volume in CBM — is the seeded default and can be
        changed here without a release.
      </Note>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel title="Formulas" traces="TF-08" padded={false}>
          {list.loading ? <Loading /> : (
            <ScrollTable>
              <DataTable>
                <HeadRow>
                  <TH>Name</TH><TH>Expression</TH><TH>Constants</TH>
                  <TH>Default</TH><TH align="right">Used by</TH>
                </HeadRow>
                <tbody>
                  {!list.data?.formulas.length && (
                    <EmptyRow colSpan={5}>No formulas defined.</EmptyRow>
                  )}
                  {list.data?.formulas.map(f => (
                    <TR key={f.id}>
                      <TD>
                        <span style={{ fontWeight: 600 }}>{f.name}</span>
                        {f.description && (
                          <span style={{
                            display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)',
                          }}>
                            {f.description}
                          </span>
                        )}
                      </TD>
                      <TD>
                        <code style={{ fontSize: 12 }}>{f.expression}</code>
                      </TD>
                      <TD>
                        <code style={{ fontSize: 11.5 }}>
                          {Object.entries(f.inputs).map(([k, v]) => `${k}=${v}`).join(', ') || '—'}
                        </code>
                      </TD>
                      <TD>{f.isDefault ? 'Yes' : '—'}</TD>
                      <TD align="right">{f.usedByRateLines}</TD>
                    </TR>
                  ))}
                </tbody>
              </DataTable>
            </ScrollTable>
          )}
        </Panel>
      </div>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel
          title="Test panel"
          subtitle="Validate an expression and see the result for sample inputs before it prices anything"
          traces="T-04"
          actions={
            <GatedButton variant="primary" onClick={runTest} busy={busy}>Evaluate</GatedButton>
          }
        >
          <Field label="Expression">
            <input value={expression} onChange={e => setExpression(e.target.value)}
              style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace' }} />
          </Field>

          {test && (
            test.valid ? (
              <Note tone="good">
                Valid. Result for the sample inputs: <strong>{test.result}</strong>.
                {test.variables.length > 0 && (
                  <> Inputs used: {test.variables.map((v: string) =>
                    `${v}=${test.scopeUsed?.[v]}`).join(', ')}.</>
                )}
              </Note>
            ) : (
              <Note tone="warn">{test.error}</Note>
            )
          )}

          <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#1C1917' }}>
              Available functions
            </p>
            <code style={{ fontSize: 12 }}>
              {list.data?.availableFunctions.join(', ')}
            </code>
            <p style={{ margin: '10px 0 4px', fontWeight: 600, color: '#1C1917' }}>
              Available inputs
            </p>
            <code style={{ fontSize: 12 }}>
              {list.data?.availableInputs.join(', ')}
            </code>
          </div>
        </Panel>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// S-01 — tax settings (TX-01, TX-02, TX-03)
// ─────────────────────────────────────────────────────────────────────────────

function TaxTab() {
  const settings = useAsync(() => getBillingSettings(), [])
  const [form, setForm] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [effect, setEffect] = useState<{ documentEffect: string; note: string } | null>(null)

  const current = settings.data?.tax?.current
  const f = form ?? {
    isRegistered: current?.isRegistered ?? true,
    abn: current?.abn ?? '',
    jurisdiction: current?.jurisdiction ?? 'AU',
    standardRate: current?.standardRate ?? '10.0000',
    effectiveFrom: new Date().toISOString().slice(0, 10),
  }

  async function save() {
    setBusy(true); setError(null)
    try {
      const res = await updateTaxSettings(f)
      setEffect({ documentEffect: res.documentEffect, note: res.note })
      toast.success('Tax settings saved')
      settings.reload()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  if (settings.loading) return <Loading />

  return (
    <>
      <RefusalNotice error={error} onDismiss={() => setError(null)} />
      {effect && (
        <>
          <Note tone="good">{effect.documentEffect}</Note>
          <div style={{ marginTop: 8 }}><Note>{effect.note}</Note></div>
        </>
      )}

      <div style={{ marginTop: effect ? 'var(--card-gap)' : 0 }}>
        <Panel
          title="GST registration"
          subtitle="Decides invoice wording, whether GST is charged, and what the BAS report shows"
          traces="TX-01"
          actions={
            <GatedButton variant="primary" onClick={save} busy={busy}>Save</GatedButton>
          }
        >
          <label style={{
            display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14,
            fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}>
            <input type="checkbox" checked={f.isRegistered}
              onChange={e => setForm({ ...f, isRegistered: e.target.checked })} />
            Registered for GST
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <Field label="ABN" required={f.isRegistered}
                hint="A tax invoice must show the supplier's ABN.">
                <input value={f.abn} onChange={e => setForm({ ...f, abn: e.target.value })}
                  style={inputStyle} />
              </Field>
            </div>
            <div style={{ flex: '0 0 140px' }}>
              <Field label="GST rate (%)" required>
                <input type="number" step="0.0001" value={f.standardRate}
                  onChange={e => setForm({ ...f, standardRate: e.target.value })}
                  style={inputStyle} />
              </Field>
            </div>
            <div style={{ flex: '0 0 160px' }}>
              <Field label="Effective from" required
                hint="A rate change creates a new version.">
                <input type="date" value={f.effectiveFrom}
                  onChange={e => setForm({ ...f, effectiveFrom: e.target.value })}
                  style={inputStyle} />
              </Field>
            </div>
          </div>

          <Note>
            {f.isRegistered
              ? 'Invoices will be titled "Tax Invoice", show the ABN, and state GST separately.'
              : 'Invoices will be titled "Invoice", will not show GST, and will state that the supplier is not registered for GST.'}
            {' '}Invoices already issued keep the treatment that applied when they were issued.
          </Note>
        </Panel>
      </div>

      {settings.data?.tax?.history?.length > 1 && (
        <div style={{ marginTop: 'var(--card-gap)' }}>
          <Panel title="Rate history" subtitle="So a historical BAS stays reconcilable" traces="TX-02" padded={false}>
            <ScrollTable>
              <DataTable>
                <HeadRow>
                  <TH>Effective from</TH><TH>Effective to</TH>
                  <TH align="right">Rate</TH><TH>Registered</TH>
                </HeadRow>
                <tbody>
                  {settings.data.tax.history.map((h: any) => (
                    <TR key={h.id}>
                      <TD>{formatDate(h.effectiveFrom)}</TD>
                      <TD>{h.effectiveTo ? formatDate(h.effectiveTo) : 'current'}</TD>
                      <TD align="right">{h.standardRate}%</TD>
                      <TD>{h.isRegistered ? 'Yes' : 'No'}</TD>
                    </TR>
                  ))}
                </tbody>
              </DataTable>
            </ScrollTable>
          </Panel>
        </div>
      )}

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel title="Document numbering" subtitle="Gapless and immutable — a sequence can only move forward" traces="IN-03" padded={false}>
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH>Document</TH><TH>Prefix</TH>
                <TH align="right">Next</TH><TH>Next number</TH>
              </HeadRow>
              <tbody>
                {settings.data?.numbering?.map((n: any) => (
                  <TR key={n.docKind}>
                    <TD>{humanise(n.docKind)}</TD>
                    <TD><code>{n.prefix}</code></TD>
                    <TD align="right">{n.nextValue}</TD>
                    <TD><code style={{ fontWeight: 600 }}>{n.preview}</code></TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          </ScrollTable>
        </Panel>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// S-10 / S-11 — approvals and capabilities
// ─────────────────────────────────────────────────────────────────────────────

function ApprovalsTab() {
  const settings = useAsync(() => getBillingSettings(), [])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  async function saveThresholds() {
    const list = (settings.data?.thresholds ?? []).map((t: any) => ({
      action: t.action,
      thresholdAmount: edits[t.action] ?? t.thresholdAmount.amount,
      approverRole: t.approverRole,
      allowSelfApproval: t.allowSelfApproval,
    }))
    setBusy(true); setError(null)
    try {
      const res = await updateThresholds(list)
      toast.success('Thresholds saved', { description: res.note })
      setEdits({})
      settings.reload()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  async function toggleCap(userId: string, key: string, value: boolean) {
    setError(null)
    try {
      await grantCapabilities(userId, { [key]: value } as any)
      toast.success('Capability updated')
      settings.reload()
    } catch (err) {
      setError(err as Error)
    }
  }

  if (settings.loading) return <Loading />
  const d = settings.data

  return (
    <>
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      <Panel
        title="Approval thresholds"
        subtitle="At or above the threshold, a second person must approve"
        traces="TX-08"
        padded={false}
        actions={
          <GatedButton variant="primary" onClick={saveThresholds} busy={busy}
            blockedReason={Object.keys(edits).length ? null : 'No changes to save.'}>
            Save
          </GatedButton>
        }
      >
        <ScrollTable>
          <DataTable>
            <HeadRow>
              <TH>Action</TH><TH align="right">Threshold</TH>
              <TH>Approver role</TH><TH>Self-approval</TH>
            </HeadRow>
            <tbody>
              {d?.thresholds?.map((t: any) => {
                const locked = ['write_off', 'credit_note', 'credit_override'].includes(t.action)
                return (
                  <TR key={t.action}>
                    <TD><span style={{ fontWeight: 600 }}>{humanise(t.action)}</span></TD>
                    <TD align="right">
                      <input type="number" step="0.01" min="0"
                        value={edits[t.action] ?? t.thresholdAmount.amount}
                        onChange={e => setEdits(x => ({ ...x, [t.action]: e.target.value }))}
                        style={{ ...inputStyle, width: 120, textAlign: 'right', padding: '5px 8px' }} />
                    </TD>
                    <TD>{humanise(t.approverRole)}</TD>
                    <TD>
                      {locked ? (
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          Never permitted
                        </span>
                      ) : t.allowSelfApproval ? 'Allowed' : 'Not allowed'}
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </DataTable>
        </ScrollTable>
        <div style={{ padding: 'var(--card-pad)' }}>
          <Note>
            Write-offs, credit notes and credit-limit overrides can never be self-approved,
            whatever the threshold. A threshold of zero means every one of that action needs an
            approver.
          </Note>
        </div>
      </Panel>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel
          title="Who can do what"
          subtitle="A user with a capability off sees the action disabled with the reason, not a failure on submit"
          traces="S-11"
          padded={false}
        >
          <ScrollTable>
            <table style={{ width: '100%', minWidth: 1100, borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.10)' }}>
                  <TH>User</TH>
                  {(d?.capabilityKeys ?? []).map((k: string) => (
                    <th key={k} style={{
                      padding: '8px 4px', fontSize: 10, fontWeight: 700,
                      color: 'var(--text-tertiary)', textTransform: 'uppercase',
                      writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                      whiteSpace: 'nowrap', height: 120,
                    }}>
                      {k.replace(/^can_/, '').replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!d?.capabilities?.length && (
                  <EmptyRow colSpan={(d?.capabilityKeys?.length ?? 0) + 1}>
                    No users have billing capabilities yet.
                  </EmptyRow>
                )}
                {d?.capabilities?.map((u: any) => (
                  <TR key={u.userId}>
                    <TD>
                      <span style={{ fontWeight: 600, color: '#1C1917' }}>{u.name}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                        {u.email} · {humanise(u.role)}
                      </span>
                    </TD>
                    {(d.capabilityKeys ?? []).map((k: string) => (
                      <td key={k} style={{ textAlign: 'center', padding: '6px 4px' }}>
                        <input
                          type="checkbox"
                          checked={!!u.capabilities[k]}
                          onChange={e => toggleCap(u.userId, k, e.target.checked)}
                        />
                      </td>
                    ))}
                  </TR>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        </Panel>
      </div>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel
          title="Dunning ladder"
          subtitle={d?.dunningRules?.note}
          traces="AR-06"
          padded={false}
        >
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH align="right">Step</TH><TH>Timing</TH><TH>Channel</TH>
                <TH>Subject</TH><TH>Late fee</TH><TH>Escalates</TH><TH>Active</TH>
              </HeadRow>
              <tbody>
                {!d?.dunning?.length && <EmptyRow colSpan={7}>No ladder configured.</EmptyRow>}
                {d?.dunning?.map((s: any) => (
                  <TR key={s.id}>
                    <TD align="right">{s.stepNo}</TD>
                    <TD>{s.timing}</TD>
                    <TD>{humanise(s.channel)}</TD>
                    <TD>{s.subject ?? '—'}</TD>
                    <TD>
                      {s.lateFeeType
                        ? `${s.lateFeeValue}${s.lateFeeType === 'percent' ? '%' : ''}`
                        : '—'}
                    </TD>
                    <TD>{s.escalate ? 'Yes' : '—'}</TD>
                    <TD>{s.active ? 'Yes' : 'No'}</TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          </ScrollTable>
        </Panel>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Y-01 — job monitor (RT-05, NFR-B-10)
// ─────────────────────────────────────────────────────────────────────────────

function JobsTab() {
  const { caps } = useBillingCapabilities()
  const jobs = useAsync(() => getJobMonitor(), [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [date, setDate] = useState(
    new Date(Date.now() - 86_400_000).toISOString().slice(0, 10))

  async function run() {
    setBusy(true); setError(null)
    try {
      const res = await runAccrual(date)
      if (res.status === 'skipped') {
        toast.info('Nothing to do', { description: res.note })
      } else {
        toast.success(`Accrued ${res.amountAccrued} ${res.currency}`, {
          description: `${res.created} line(s) created from ${res.processed} consignment(s)${res.errors.length ? `, ${res.errors.length} failed` : ''}`,
        })
      }
      jobs.reload()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  if (jobs.loading) return <Loading />
  const d = jobs.data

  return (
    <>
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      {d?.accrualHealth.warning && <Note tone="warn">{d.accrualHealth.warning}</Note>}

      <div style={{ marginTop: d?.accrualHealth.warning ? 'var(--card-gap)' : 0 }}>
        <Panel
          title="Nightly accrual"
          subtitle="Turns dwell into revenue. Safe to re-run — one accrual per consignment per day, forever."
          traces="RT-05"
          actions={
            <>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                style={{ ...inputStyle, width: 160, padding: '6px 10px', fontSize: 13 }} />
              <GatedButton variant="primary" onClick={run} busy={busy}
                blockedReason={reasonFor(caps, 'can_run_billing')}>
                Run for this date
              </GatedButton>
            </>
          }
        >
          <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
            <Stat label="Last run" value={d?.accrualHealth.lastRunDate ? formatDate(d.accrualHealth.lastRunDate) : 'Never'} />
            <Stat label="Outcome" value={d?.accrualHealth.lastRunStatus ? humanise(d.accrualHealth.lastRunStatus) : '—'} />
            <Stat
              label="Ran for yesterday"
              value={d?.accrualHealth.ranYesterday ? 'Yes' : 'No'}
              tone={d?.accrualHealth.ranYesterday ? 'good' : 'warn'}
            />
          </div>
        </Panel>
      </div>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel title="Run history" traces="NFR-B-10" padded={false}>
          <ScrollTable>
            <DataTable>
              <HeadRow>
                <TH>Job</TH><TH>Business date</TH><TH>Status</TH>
                <TH align="right">Processed</TH><TH align="right">Created</TH>
                <TH align="right">Skipped</TH><TH align="right">Accrued</TH>
                <TH align="right">Duration</TH><TH>Error</TH>
              </HeadRow>
              <tbody>
                {!d?.runs.length && <EmptyRow colSpan={9}>No job runs recorded.</EmptyRow>}
                {d?.runs.map(r => (
                  <TR key={r.id} highlight={r.status === 'failed'}>
                    <TD>{humanise(r.jobName)}</TD>
                    <TD>{formatDate(r.businessDate)}</TD>
                    <TD><StatusPill status={r.status} /></TD>
                    <TD align="right">{r.recordsProcessed}</TD>
                    <TD align="right">{r.recordsCreated}</TD>
                    <TD align="right">{r.recordsSkipped}</TD>
                    <TD align="right"><Amount value={r.amountAccrued} /></TD>
                    <TD align="right">{r.durationMs == null ? '—' : `${r.durationMs}ms`}</TD>
                    <TD style={{ maxWidth: 260, fontSize: 12, color: '#B91C1C' }}>
                      {r.errorMessage ?? ''}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </DataTable>
          </ScrollTable>
        </Panel>
      </div>

      <div style={{ marginTop: 'var(--card-gap)' }}>
        <Panel title="Retention" traces="NFR-B-09">
          <Note>
            {d?.retention.note} Records dated before {formatDate(d?.retention.purgeAllowedBefore)}{' '}
            fall outside the {d?.retention.years}-year window.
          </Note>
        </Panel>
      </div>
    </>
  )
}
