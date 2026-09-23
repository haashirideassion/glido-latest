import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ChargeLine, addManualCharge, adjustCharge, getBookingFinancials, getCatalogue,
  rateBooking, rerateBooking,
} from '@/lib/db/billing'
import { useBillingCapabilities, approvalFor, reasonFor } from '@/lib/useBillingCapabilities'
import { ChargeWorkingPanel } from '@/components/billing/ChargeWorkingPanel'
import {
  Amount, DataTable, EmptyRow, Field, GatedButton, HeadRow, Loading, Modal, Note,
  Panel, REASON_CODES, ReasonFields, RefusalNotice, ScrollTable, Stat, StatusPill,
  TD, TH, TR, formatDate, humanise, inputStyle, useAsync,
} from '@/components/billing/BillingUI'

/**
 * O-02 Booking financials tab — the single source of truth per booking
 * (RT-02, RT-03, RT-04), with O-03 add manual charge and O-04 adjust/waive.
 *
 * Drop-in for the existing reception booking detail page:
 *   <BookingFinancialsTab bookingId={id} />
 *
 * The three things this screen exists to show, which no other screen can:
 *   · the rating snapshot the booking is frozen against  RT-02
 *   · estimate versus actual, with the variance named    RT-04
 *   · the working behind every line                      RT-11
 */
export default function BookingFinancialsTab({
  bookingId, bookingReference,
}: {
  bookingId: string
  bookingReference?: string
}) {
  const { caps, thresholds } = useBillingCapabilities()
  const fin = useAsync(() => getBookingFinancials(bookingId), [bookingId])
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [adjusting, setAdjusting] = useState<{ line: ChargeLine; waive: boolean } | null>(null)

  const d = fin.data
  const lines = d?.lines ?? []
  const hasVariance = lines.some(l => l.varianceAmount && Number(l.varianceAmount.amount) !== 0)

  async function doRate(mode: 'initial' | 'rerate') {
    setBusy(true); setError(null)
    try {
      const res = mode === 'initial'
        ? await rateBooking(bookingId)
        : await rerateBooking(bookingId)
      toast.success(
        mode === 'initial' ? 'Booking rated' : 'Booking re-rated to actuals',
        {
          description: `${res.persisted.inserted} line(s) · ${res.total.display}${
            res.persisted.varianceLines ? ` · ${res.persisted.varianceLines} variance(s)` : ''}`,
        },
      )
      if (res.warnings?.length) {
        for (const w of res.warnings) toast.warning(w)
      }
      fin.reload()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  if (fin.loading) return <Loading label="Loading charges…" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--card-gap)' }}>
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      {/* RT-02 — the snapshot banner. Staff need to know which tariff this
          booking is locked to before they argue with a customer about a price. */}
      {d?.ratingSnapshot ? (
        <Note>
          Priced against <strong>{d.ratingSnapshot.rateCardName ?? 'a rate card'}</strong>{' '}
          (version {d.ratingSnapshot.rateCardVersion}), frozen when this booking was rated.
          A later rate change does not move these charges.
        </Note>
      ) : lines.length === 0 ? (
        <Note tone="warn">
          This booking has no charges. Nothing will ever be invoiced for it until it is rated.
        </Note>
      ) : null}

      <div style={{ display: 'flex', gap: 'var(--card-gap)', flexWrap: 'wrap' }}>
        <Stat label="Net" value={<Amount value={d?.totals.subtotal} size={22} bold />} />
        <Stat label="GST" value={<Amount value={d?.totals.taxTotal} size={22} bold />} />
        <Stat label="Total" value={<Amount value={d?.totals.total} size={22} bold />} />
        {hasVariance && (
          <Stat
            label="Variance"
            value={<Amount value={d?.totals.varianceTotal} size={22} bold tone="auto" />}
            sub="actual versus the estimate quoted"
            tone="warn"
          />
        )}
        {d?.invoiced && (
          <Stat label="Invoiced" value="Yes" tone="good" sub="charges are on a document" />
        )}
      </div>

      <Panel
        title="Charge lines"
        subtitle="Every line expands to the working behind it"
        traces="RT-11"
        padded={false}
        actions={
          <>
            {!lines.length ? (
              <GatedButton variant="primary" busy={busy} onClick={() => doRate('initial')}>
                Rate this booking
              </GatedButton>
            ) : (
              <GatedButton
                busy={busy}
                onClick={() => doRate('rerate')}
                blockedReason={d?.invoiced
                  ? 'These charges are already invoiced. Re-rating would change a document — raise a credit note instead.'
                  : null}
              >
                Re-rate to actuals
              </GatedButton>
            )}
            <GatedButton
              variant="primary"
              onClick={() => setManualOpen(true)}
              blockedReason={reasonFor(caps, 'can_add_manual_charge')}
            >
              Add a charge
            </GatedButton>
          </>
        }
      >
        <ScrollTable>
          <DataTable>
            <HeadRow>
              <TH>Charge</TH>
              <TH>Kind</TH>
              <TH align="right">Qty</TH>
              <TH align="right">Unit</TH>
              <TH align="right">Net</TH>
              <TH align="right">GST</TH>
              <TH align="right">Total</TH>
              <TH>State</TH>
              <TH />
            </HeadRow>
            <tbody>
              {!lines.length && (
                <EmptyRow colSpan={9}>
                  No charges yet. Rating resolves which services apply and prices them against
                  the active tariff.
                </EmptyRow>
              )}
              {lines.map(l => (
                <TR key={l.id}>
                  <TD style={{ maxWidth: 360 }}>
                    <span style={{ fontWeight: 600, color: '#1C1917' }}>{l.description}</span>
                    {l.itemCode && (
                      <span style={{
                        display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)',
                      }}>
                        {l.itemCode}
                        {l.accrualDate && ` · accrued ${formatDate(l.accrualDate)}`}
                        {l.source !== 'rating' && ` · ${humanise(l.source)}`}
                      </span>
                    )}

                    {/* RT-09 — an adjustment or waiver always shows who and why */}
                    {(l.status === 'adjusted' || l.status === 'waived') && (
                      <span style={{
                        display: 'block', marginTop: 4, fontSize: 12, color: '#C2410C',
                      }}>
                        {l.originalTotal && (
                          <>was {l.originalTotal.display} · </>
                        )}
                        {humanise(l.reasonCode ?? 'no reason')}
                        {l.reasonNote && ` — ${l.reasonNote}`}
                        {l.adjustedBy && ` · by ${l.adjustedBy}`}
                        {l.approvedBy
                          ? ` · approved by ${l.approvedBy}`
                          : ' · no approver recorded'}
                      </span>
                    )}

                    <div style={{ marginTop: 5 }}>
                      <ChargeWorkingPanel working={l.working} variant="card" />
                    </div>
                  </TD>
                  <TD>{humanise(l.lineKind)}</TD>
                  <TD align="right">
                    {trim(l.chargeableQuantity)}
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {l.unitOfMeasure}
                    </span>
                  </TD>
                  <TD align="right"><Amount value={l.unitPrice} size={12.5} /></TD>
                  <TD align="right"><Amount value={l.lineSubtotal} /></TD>
                  <TD align="right"><Amount value={l.taxAmount} size={12.5} /></TD>
                  <TD align="right">
                    <Amount value={l.lineTotal} bold />
                    {/* RT-04 — estimate versus actual, spelled out rather than overwritten */}
                    {l.varianceAmount && Number(l.varianceAmount.amount) !== 0 && (
                      <span style={{
                        display: 'block', fontSize: 11.5, fontWeight: 600,
                        color: Number(l.varianceAmount.amount) > 0 ? '#C2410C' : '#15803D',
                      }}>
                        {Number(l.varianceAmount.amount) > 0 ? '+' : ''}
                        {l.varianceAmount.display} vs estimate
                      </span>
                    )}
                  </TD>
                  <TD>
                    <StatusPill status={l.status} />
                    {l.invoiceNumber && (
                      <Link to={`/billing/invoices/${l.invoiceId}`} style={{
                        display: 'block', marginTop: 3, fontSize: 11.5, fontWeight: 600,
                        color: 'var(--brand-color)', textDecoration: 'none',
                      }}>
                        {l.invoiceNumber}
                      </Link>
                    )}
                  </TD>
                  <TD align="right">
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <GatedButton
                        size="sm"
                        onClick={() => setAdjusting({ line: l, waive: false })}
                        blockedReason={
                          reasonFor(caps, 'can_adjust_charge')
                          ?? (!l.editable
                            ? 'This charge is on an issued invoice. Raise a credit note instead.'
                            : null)
                        }
                      >
                        Adjust
                      </GatedButton>
                      <GatedButton
                        size="sm"
                        variant="danger"
                        hideWhenBlocked
                        onClick={() => setAdjusting({ line: l, waive: true })}
                        blockedReason={
                          reasonFor(caps, 'can_waive_charge')
                          ?? (!l.editable
                            ? 'This charge is on an issued invoice.'
                            : l.status === 'waived' ? 'Already waived.' : null)
                        }
                      >
                        Waive
                      </GatedButton>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid rgba(0,0,0,0.14)' }}>
                  <td colSpan={4} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                    Total
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <Amount value={d?.totals.subtotal} bold />
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <Amount value={d?.totals.taxTotal} bold />
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <Amount value={d?.totals.total} bold size={14.5} />
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </DataTable>
        </ScrollTable>
      </Panel>

      {manualOpen && (
        <ManualChargeModal
          bookingId={bookingId}
          bookingReference={bookingReference}
          thresholds={thresholds}
          onClose={() => setManualOpen(false)}
          onDone={() => { setManualOpen(false); fin.reload() }}
        />
      )}
      {adjusting && (
        <AdjustChargeModal
          line={adjusting.line}
          waive={adjusting.waive}
          thresholds={thresholds}
          onClose={() => setAdjusting(null)}
          onDone={() => { setAdjusting(null); fin.reload() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// O-03 — add a manual charge (RT-08)
// ─────────────────────────────────────────────────────────────────────────────

function ManualChargeModal({
  bookingId, bookingReference, thresholds, onClose, onDone,
}: {
  bookingId: string
  bookingReference?: string
  thresholds: Record<string, any>
  onClose: () => void
  onDone: () => void
}) {
  const catalogue = useAsync(() => getCatalogue({ status: 'active' }), [])
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [reasonCode, setReasonCode] = useState('')
  const [reasonNote, setReasonNote] = useState('')
  const [approverId, setApproverId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const item = catalogue.data?.items.find(i => i.id === itemId)
  const preview = (Number(quantity) || 0) * (Number(unitPrice) || 0)
  const approval = approvalFor(thresholds, 'adjustment', preview)

  async function submit() {
    if (!itemId) { setFieldError(null); setError(new Error('Choose a service.')); return }
    if (!reasonCode) { setFieldError('A reason is required for a manual charge.'); return }
    setBusy(true); setError(null); setFieldError(null)
    try {
      const res = await addManualCharge({
        bookingId,
        itemId,
        quantity: Number(quantity) || 1,
        unitPrice: unitPrice || undefined,
        reasonCode,
        reasonNote: reasonNote || undefined,
        approvedBy: approverId || undefined,
      })
      toast.success(`Charge added — ${res.lineTotal.display}`)
      onDone()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Add a charge"
      subtitle={bookingReference ? `Booking ${bookingReference}` : undefined}
      traces="RT-08"
      onClose={onClose}
      footer={
        <>
          <GatedButton variant="ghost" onClick={onClose}>Cancel</GatedButton>
          <GatedButton variant="primary" onClick={submit} busy={busy}>Add charge</GatedButton>
        </>
      }
    >
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      <Note>
        A manual charge is recorded with your name, the reason, and the price you entered, and
        it appears in the discount &amp; waiver report alongside every other manual
        intervention.
      </Note>

      <div style={{ marginTop: 14 }}>
        <Field label="Service" required>
          <select value={itemId} onChange={e => setItemId(e.target.value)} style={inputStyle}>
            <option value="">Choose a service…</option>
            {catalogue.data?.items.map(i => (
              <option key={i.id} value={i.id}>
                {i.customerName} ({i.code}) · per {i.unitOfMeasure}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field
              label="Quantity"
              required
              hint={item ? `In ${item.unitOfMeasure}` : undefined}
            >
              <input type="number" step="0.01" min="0" value={quantity}
                onChange={e => setQuantity(e.target.value)} style={inputStyle} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field
              label="Unit price"
              hint="Leave blank to use the rate from the booking's tariff."
            >
              <input type="number" step="0.0001" min="0" value={unitPrice}
                onChange={e => setUnitPrice(e.target.value)}
                placeholder="tariff rate" style={inputStyle} />
            </Field>
          </div>
        </div>

        <ReasonFields
          codes={REASON_CODES.manualCharge as any}
          code={reasonCode}
          note={reasonNote}
          onCodeChange={v => { setReasonCode(v); setFieldError(null) }}
          onNoteChange={setReasonNote}
          error={fieldError}
        />

        {approval.required && (
          <>
            <Note tone="warn">{approval.message}</Note>
            <div style={{ marginTop: 12 }}>
              <Field label="Approver" required hint="Must not be you.">
                <input value={approverId} onChange={e => setApproverId(e.target.value)}
                  placeholder="Approver user id" style={inputStyle} />
              </Field>
            </div>
          </>
        )}

        {unitPrice && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            padding: '10px 12px', background: 'rgba(0,0,0,0.03)',
            borderRadius: 'var(--r-md)', marginTop: 4,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Net charge</span>
            <span style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
                .format(preview)}
            </span>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// O-04 — adjust or waive, with accountability (RT-09, TF-10)
// ─────────────────────────────────────────────────────────────────────────────

function AdjustChargeModal({
  line, waive, thresholds, onClose, onDone,
}: {
  line: ChargeLine
  waive: boolean
  thresholds: Record<string, any>
  onClose: () => void
  onDone: () => void
}) {
  const currentNet = Number(line.lineSubtotal.amount)
  const [newAmount, setNewAmount] = useState(line.lineSubtotal.amount)
  const [reasonCode, setReasonCode] = useState('')
  const [reasonNote, setReasonNote] = useState('')
  const [approverId, setApproverId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const target = waive ? 0 : Number(newAmount) || 0
  const givenAway = Math.round((currentNet - target) * 100) / 100
  const approval = approvalFor(
    thresholds, waive ? 'waiver' : 'adjustment', givenAway, line.lineSubtotal.currency)
  const fmt = (n: number) => new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: line.lineSubtotal.currency,
  }).format(n)

  async function submit() {
    if (!reasonCode) {
      setFieldError(`A reason is required to ${waive ? 'waive' : 'adjust'} a charge.`)
      return
    }
    setBusy(true); setError(null); setFieldError(null)
    try {
      const res = await adjustCharge(line.id, {
        newAmount: waive ? undefined : target,
        waive,
        reasonCode,
        reasonNote: reasonNote || undefined,
        approvedBy: approverId || undefined,
      })
      toast.success(waive ? 'Charge waived' : 'Charge adjusted', {
        description: `${res.originalTotal.display} → ${res.lineTotal.display} · ${res.givenAway.display} given away`,
      })
      onDone()
    } catch (err) {
      setError(err as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={waive ? 'Waive this charge' : 'Adjust this charge'}
      subtitle={line.description}
      traces="RT-09"
      onClose={onClose}
      footer={
        <>
          <GatedButton variant="ghost" onClick={onClose}>Cancel</GatedButton>
          <GatedButton variant={waive ? 'danger' : 'primary'} onClick={submit} busy={busy}>
            {waive ? 'Waive charge' : 'Apply adjustment'}
          </GatedButton>
        </>
      }
    >
      <RefusalNotice error={error} onDismiss={() => setError(null)} />

      {/* The original value, read-only — a concession is only accountable if
          what was given up is visible next to what replaced it. */}
      <div style={{
        display: 'flex', gap: 20, padding: '10px 12px',
        background: 'rgba(0,0,0,0.03)', borderRadius: 'var(--r-md)',
      }}>
        <div>
          <p style={{
            margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase', color: 'var(--text-tertiary)',
          }}>
            Current net
          </p>
          <Amount value={line.lineSubtotal} bold size={16} />
        </div>
        <div>
          <p style={{
            margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase', color: 'var(--text-tertiary)',
          }}>
            Quantity
          </p>
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            {trim(line.chargeableQuantity)} {line.unitOfMeasure}
          </span>
        </div>
        <div>
          <p style={{
            margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase', color: 'var(--text-tertiary)',
          }}>
            Giving away
          </p>
          <span style={{
            fontSize: 16, fontWeight: 700,
            color: givenAway > 0 ? '#B91C1C' : givenAway < 0 ? '#15803D' : '#1C1917',
          }}>
            {fmt(givenAway)}
          </span>
        </div>
      </div>

      {/* RT-11 — the working, so whoever adjusts can see what they are overriding */}
      <div style={{ marginTop: 12 }}>
        <ChargeWorkingPanel working={line.working} variant="card" defaultOpen />
      </div>

      <div style={{ marginTop: 14 }}>
        {!waive && (
          <Field
            label="New net amount"
            required
            hint="Excluding GST — tax is recalculated from this."
          >
            <input type="number" step="0.01" min="0" value={newAmount}
              onChange={e => setNewAmount(e.target.value)} style={inputStyle} />
          </Field>
        )}

        {waive && (
          <Note tone="warn">
            Waiving sets this line to zero. The original amount is retained, so the discount
            &amp; waiver report shows exactly what was given up and by whom.
          </Note>
        )}

        <div style={{ marginTop: waive ? 14 : 0 }}>
          <ReasonFields
            codes={(waive ? REASON_CODES.waiver : REASON_CODES.adjustment) as any}
            code={reasonCode}
            note={reasonNote}
            onCodeChange={v => { setReasonCode(v); setFieldError(null) }}
            onNoteChange={setReasonNote}
            error={fieldError}
          />
        </div>

        {approval.required && (
          <>
            <Note tone="warn">{approval.message}</Note>
            <div style={{ marginTop: 12 }}>
              <Field label="Approver" required hint="Must not be you.">
                <input value={approverId} onChange={e => setApproverId(e.target.value)}
                  placeholder="Approver user id" style={inputStyle} />
              </Field>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function trim(n: number): string {
  return String(Number(n.toFixed(4)))
}
