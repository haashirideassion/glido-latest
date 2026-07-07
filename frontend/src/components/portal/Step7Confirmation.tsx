import { useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { useWizard, useHoldTimer, calcCharges } from '@/contexts/WizardContext'
import { Icon, ICONS } from '@/lib/Icon'
import timerImg from '@/assets/timer.png'
import { createBooking } from '@/lib/db/bookings'
import { postFetcher } from '@/lib/fetcher'
const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'
import { useTenantInfo } from '@/lib/useTenantInfo'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/lib/toast'
import { upsertSavedDriver } from '@/lib/useSavedDrivers'

// EFT details are fetched live from tenant — see useTenantInfo() call inside the component

function comboSuffix(serviceType: string, loadType: string): string {
  const s = serviceType?.toLowerCase()
  const l = loadType?.toLowerCase()
  if (s === 'pickup'  && l === 'lcl') return 'PL'
  if (s === 'pickup'  && l === 'fcl') return 'PF'
  if (s === 'dropoff' && l === 'lcl') return 'DL'
  if (s === 'dropoff' && l === 'fcl') return 'DF'
  return 'XX'
}

export function Step7Confirmation() {
  const { state, dispatch } = useWizard()
  const { user } = useAuth()

  useEffect(() => {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    dispatch({ type: 'STOP_HOLD_TIMER' })
    // Auto-simulate ICS status for any slot that doesn't already have one
    const ICS_STATUSES = ['cleared', 'held', 'examination', 'pending', 'unavailable'] as const
    for (const cfg of state.slotConfigs) {
      if (!cfg.icsStatus) {
        const status = ICS_STATUSES[Math.floor(Math.random() * ICS_STATUSES.length)]
        dispatch({ type: 'SET_SLOT_DETAIL', slotIndex: cfg.index, field: 'icsStatus', value: status })
      }
    }
  }, [])
  const tenant = useTenantInfo()
  const { holdActive, holdLabel, expiring } = useHoldTimer()
  const charges = calcCharges(state)
  console.log('[Charges Debug]', {
    tenantPricing: state.tenantPricing,
    slotCount: state.slotCount,
    charges: calcCharges(state),
  })
  const sd = state.shipmentData
  const showChep = sd?.palletType === 'chep'
  const totalWithGst = charges.total.toFixed(2)

  const set = (f: 'paymentMethod' | 'cardNumber' | 'cardExpiry' | 'cardCvv', v: string) =>
    dispatch({ type: 'SET', field: f, value: v })

  const canSubmit = state.termsAccepted && !!state.paymentMethod &&
    (state.paymentMethod === 'eft' ? state.eftConfirmed : true) && !state.submitting

  const submit = async () => {
    if (!canSubmit) return
    const multi = state.slotCount > 1

    // Single-slot: require the top-level selectedSlotId
    if (!multi) {
      const slot = state.slots.find(s => s.id === state.selectedSlotId)
      if (!slot) return
    }

    dispatch({ type: 'SET', field: 'submitting', value: true })
    dispatch({ type: 'SET', field: 'submitError', value: null })
    try {
      const slotFeeUnit = charges.slotFee / state.slotCount

      // Each slot gets its own fully independent reference — no group linking
      const generateRef = () => {
        const year = new Date().getFullYear()
        const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
        return `GLD-${year}-${rand}`
      }

      const slotRefMap = new Map<number, string>()
      for (const cfg of state.slotConfigs) {
        slotRefMap.set(cfg.index, generateRef())
      }

      const refs: Array<{ ref: string; slotLabel: string; date: string }> = []
      for (const cfg of state.slotConfigs) {
        // Per-slot: use per-slot fields if multi-slot, else top-level fields
        const slotDate        = multi ? cfg.selectedDate      : state.selectedDate
        const slotLabel       = multi ? cfg.selectedSlotLabel : state.selectedSlotLabel
        const slotStartTime   = slotLabel?.split('–')[0]?.trim() ?? ''
        const slotEndTime     = slotLabel?.split('–')[1]?.trim() ?? ''
        const slotIdForUpsert = multi ? cfg.selectedSlotId    : state.selectedSlotId

        const hbl              = multi ? cfg.hbl              : state.hbl
        const containerNumber  = multi ? cfg.containerNumber  : state.containerNumber
        const containerSize    = multi ? cfg.containerSize    : state.containerSize
        const entryNumber      = multi ? cfg.entryNumber      : state.entryNumber
        const purpose          = multi ? cfg.purpose          : state.purpose
        const consolidator     = multi ? cfg.consolidator     : state.consolidator
        const bookingReference = multi ? cfg.bookingReference : state.bookingReference
        const uploadedDocs     = (multi ? cfg.documentFiles   : state.documentFiles).filter(d => d.storagePath)

        let slotRef = slotRefMap.get(cfg.index) ?? generateRef()
        const bookingParams = {
          reference_number: slotRef,
          serviceType: cfg.serviceType!, loadType: cfg.loadType!,
          slotDate, slotStartTime, slotEndTime,
          driverName: (multi ? cfg.driverName : state.driverName) || state.guestName,
          guestName: state.guestName || undefined,
          // Only save guestEmail for unauthenticated bookings
          ...(!user && state.guestEmail ? { guestEmail: state.guestEmail } : {}),
          guestPhone: state.guestPhone || undefined,
          companyName: state.companyName.trim() || undefined,
          houseBillNumber: hbl || undefined,
          containerNumber: containerNumber || undefined,
          weightKg: sd?.weightKg, volumeCbm: sd?.volumeCbm,
          packageCount: sd?.packageCount, palletCount: sd?.palletCount,
          storageStartDate: sd?.storageStartDate,
          storageDays: charges.storageDays || undefined,
          storageCharge: charges.storageCharge || undefined,
          shrinkWrapCharge: charges.shrinkWrapCharge || undefined,
          slotFee: slotFeeUnit,
          subtotal: charges.subtotal / state.slotCount,
          gstAmount: charges.gst / state.slotCount,
          totalAmount: charges.total / state.slotCount,
          paymentMethod: state.paymentMethod as 'card' | 'eft',
          paymentStatus: state.paymentMethod === 'eft' ? 'pending_eft' : 'pending',
          icsStatus: (cfg.icsStatus ?? sd?.icsStatus ?? undefined) as any,
          tenantId: DEFAULT_TENANT_ID,
          userId: user?.id ?? undefined,
          booking_source: !user
            ? 'guest'
            : (user.role === 'reception_staff' || user.role === 'reception_admin' || user.role === 'super_admin')
              ? 'reception_booking'
              : 'self_booking',
          container_size:       containerSize       || undefined,
          entry_number:         entryNumber         || undefined,
          purpose:              purpose             || undefined,
          consolidator:         consolidator        || undefined,
          booking_reference:    bookingReference    || undefined,
          vehicle_registration: (multi ? cfg.vehicleRegistration : state.vehicleRegistration) || undefined,
        }

        // Attempt createBooking with retry on duplicate key (23505)
        let booking
        try {
          booking = await createBooking(bookingParams as any)
        } catch (err: any) {
          if (err?.code === '23505') {
            // Duplicate reference_number — regenerate and retry
            slotRef = generateRef()
            booking = await createBooking({ ...bookingParams, reference_number: slotRef } as any)
          } else {
            throw err
          }
        }

        console.log('[Submit Debug] booking result:', booking)
        console.log('[Submit Debug] booking.referenceNumber:', booking?.referenceNumber)
        const resolvedRef = booking?.referenceNumber || slotRef
        refs.push({ ref: resolvedRef, slotLabel, date: slotDate })
        console.log('[Submit Debug] refs so far:', refs)

        // Slot confirmed count is managed by the backend on booking creation — no-op here

        // Insert booking_documents — best-effort via backend
        if (uploadedDocs.length > 0) {
          ;(async (bid: string) => {
            try {
              await postFetcher('/api/booking-documents', {
                booking_id: bid,
                tenant_id:  DEFAULT_TENANT_ID,
                documents:  uploadedDocs.map(d => ({
                  document_type:   d.docType ?? 'general',
                  filename:        d.name,
                  file_size_bytes: d.size ?? null,
                  storage_path:    d.storagePath!,
                })),
              })
            } catch { /* noop */ }
          })(booking.id)
        }
      }

      // Save drivers for future autofill — best-effort, non-blocking
      for (const cfg of state.slotConfigs) {
        const name    = (cfg.driverName?.trim() || state.driverName?.trim()) ?? ''
        const vehicle = cfg.vehicleRegistration?.trim() || state.vehicleRegistration?.trim() || ''
        const phone   = cfg.driverPhone?.trim() || state.driverPhone?.trim() || ''
        if (name && vehicle) await upsertSavedDriver({ name, phone, vehicle_registration: vehicle })
      }

      // Deduplicate by ref string, preserving object shape
      const _seenRefs = new Set<string>()
      const uniqueRefs = refs.filter(r => !!r.ref).filter(r => { if (_seenRefs.has(r.ref)) return false; _seenRefs.add(r.ref); return true })
      console.log('[Submit Debug] final refs:', uniqueRefs)
      // flushSync forces React to commit these dispatches synchronously before any
      // user interaction can fire. Without this, React 18's async batching means
      // useBlocker in BookingWizard is still registered (shouldBlock=true from the
      // last committed render) when the user clicks a nav link, silently blocking
      // all navigation on the confirmation screen.
      flushSync(() => {
        dispatch({ type: 'SET', field: 'confirmationRef',  value: uniqueRefs[0]?.ref ?? null })
        dispatch({ type: 'SET', field: 'confirmationRefs', value: uniqueRefs })
        dispatch({ type: 'SET', field: 'bookingConfirmed', value: true })
        dispatch({ type: 'SET', field: 'submitting', value: false })
        dispatch({ type: 'SET', field: 'step', value: 8 })
      })
      toast('Booking confirmed! Check your email for details.', 'success')
    } catch (err: any) {
      console.log('[Submit Debug] createBooking error:', err)
      dispatch({ type: 'SET', field: 'submitError', value: err?.message ?? 'Booking failed. Please try again.' })
      dispatch({ type: 'SET', field: 'submitting', value: false })
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ width: 52, height: 52, borderRadius: 'var(--r-md)', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <img src={timerImg} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
        </div>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1C1917', letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0 }}>
            {state.paymentMethod === 'eft' ? 'Review & Confirm' : 'Review & Pay'}
          </h2>
          <p style={{ fontSize: 15, color: '#4F4F4F', lineHeight: 1.5, margin: '4px 0 0' }}>
            {state.paymentMethod === 'eft'
              ? 'Confirm your booking details. You will receive bank transfer instructions by email.'
              : 'Confirm your booking details and complete payment to secure your slot.'}
          </p>
        </div>
      </div>


      {/* Booking summary — accordion */}
      <BookingSummaryAccordion state={state} charges={charges} user={user} />

      {/* ICS status */}
      {sd && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, marginBottom: 20 }}>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>ICS Status:</span>
          {(() => {
            const m: Record<string, [string, string, string]> = {
              cleared: ['rgba(34,197,94,0.12)', '#22C55E', 'rgba(34,197,94,0.22)'],
              held: ['rgba(239,68,68,0.12)', '#EF4444', 'rgba(239,68,68,0.22)'],
              examination: ['rgba(251,191,36,0.10)', '#FBBF24', 'rgba(251,191,36,0.22)'],
            }
            const [bg, color, border] = m[sd.icsStatus ?? ''] ?? ['rgba(0,0,0,0.04)', '#78716C', 'rgba(0,0,0,0.10)']
            const label = { cleared: 'Cleared', held: 'Held', examination: 'Examination', pending: 'Pending', unavailable: 'N/A' }[sd.icsStatus ?? ''] ?? 'Unknown'
            return <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--r-full)', background: bg, color, border: `1px solid ${border}` }}>{label}</span>
          })()}
        </div>
      )}

      {/* CHEP */}
      {showChep && (
        <div style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 'var(--r-sm)', padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Icon name={ICONS.warning} size={16} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 14, color: '#92400E', fontWeight: 500, lineHeight: 1.5 }}>Reminder: CHEP pallet exchange required at collection. Bring your CHEP pallets.</p>
        </div>
      )}

      {/* Payment method */}
      <p style={{ fontSize: 15, fontWeight: 600, color: '#1C1917', marginBottom: 12 }}>Payment Method</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          { val: 'card',   icon: ICONS.shield,   title: 'Credit / Debit Card',   sub: 'Visa, Mastercard, Amex'            },
          { val: 'eft',    icon: ICONS.document,  title: 'Bank Transfer (EFT)',   sub: 'Transfer before slot date'         },
          { val: 'compay', icon: ICONS.bookings,  title: 'ComPay',                sub: 'Port community payment system'     },
        ].map(opt => {
          const sel = state.paymentMethod === opt.val
          return (
            <button key={opt.val} type="button" onClick={() => dispatch({ type: 'SET', field: 'paymentMethod', value: opt.val })}
              style={{ textAlign: 'left', cursor: 'pointer', borderRadius: 'var(--r-lg)', padding: 16, transition: 'all 0.15s ease', background: sel ? 'rgba(var(--brand-rgb),0.03)' : '#fff', border: `1.5px solid ${sel ? 'var(--brand-color)' : 'rgba(0,0,0,0.08)'}` }}>
              <Icon name={opt.icon} size={20} style={{ color: 'var(--brand-color)', marginBottom: 8, display: 'block' }} />
              <div style={{ fontWeight: 600, fontSize: 15, color: '#1C1917' }}>{opt.title}</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>{opt.sub}</div>
            </button>
          )
        })}
      </div>

      {/* Card panel */}
      {state.paymentMethod === 'card' && (
        <CardPaymentPanel />
      )}

      {/* EFT panel */}
      {state.paymentMethod === 'eft' && (
        <div style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', padding: 20, marginBottom: 20 }}>
          <p style={{ fontWeight: 600, color: '#1C1917', fontSize: 15, marginBottom: 14 }}>Bank Transfer Details</p>
          {[
            ['Bank',         tenant?.eftBankName      || '—'],
            ['Account Name', tenant?.eftAccountName   || '—'],
            ['BSB',          tenant?.eftBsb           || '—'],
            ['Account No.',  tenant?.eftAccountNumber || '—'],
          ].map(([k, v], i, arr) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{k}</span>
              <span style={{ fontFamily: 'ui-monospace,monospace', fontWeight: 600, color: '#1C1917', fontSize: 14 }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <input type="checkbox" id="eft-confirm" checked={state.eftConfirmed} onChange={e => dispatch({ type: 'SET', field: 'eftConfirmed', value: e.target.checked })} style={{ marginTop: 3, accentColor: 'var(--brand-color)' }} />
            <label htmlFor="eft-confirm" style={{ fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer', lineHeight: 1.5 }}>
              I confirm I will transfer <strong style={{ color: '#1C1917' }}>${totalWithGst} AUD</strong> to the above account using my booking reference as the payment reference.
            </label>
          </div>
        </div>
      )}

      {/* ComPay panel */}
      {state.paymentMethod === 'compay' && (() => {
        const clientNum = tenant?.compayClientNumber
        const ref = state.confirmationRef || state.confirmationRefs?.[0]?.ref || ''
        const amt = totalWithGst
        const compayUrl = clientNum
          ? `https://compay.1-stop.biz/AdhocCCWebPages/Payment.aspx?CN=${encodeURIComponent(clientNum)}&PayType=STORAGE&REF1=${encodeURIComponent(ref)}&AMT=${encodeURIComponent(amt)}`
          : null
        return (
          <div style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', padding: 20, marginBottom: 20 }}>
            <p style={{ fontWeight: 600, color: '#1C1917', fontSize: 15, marginBottom: 8 }}>ComPay — Port Community Payments</p>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
              Pay your freight and storage charges through the ComPay port community payment system.
            </p>
            {compayUrl ? (
              <a
                href={compayUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--brand-color)', color: 'var(--brand-text)', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 15, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}
              >
                <Icon name={ICONS.bookings} size={16} />
                Pay via ComPay →
              </a>
            ) : (
              <button
                type="button"
                onClick={() => toast('ComPay online payments — coming soon. Please pay at reception.', 'info')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--brand-color)', color: 'var(--brand-text)', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <Icon name={ICONS.bookings} size={16} />
                Pay via ComPay →
              </button>
            )}
            {ref && (
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.5 }}>
                Reference your booking number: <strong style={{ fontFamily: 'ui-monospace,monospace', color: '#1C1917' }}>{ref}</strong> when paying.
              </p>
            )}
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 12, lineHeight: 1.5 }}>
              ComPay is used by freight forwarders and transport companies at Australian ports. Settlement next business day.
            </p>
          </div>
        )
      })()}

      {/* Terms */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
        <input type="checkbox" id="terms" checked={state.termsAccepted} onChange={e => dispatch({ type: 'SET', field: 'termsAccepted', value: e.target.checked })} style={{ marginTop: 3, accentColor: 'var(--brand-color)' }} />
        <label htmlFor="terms" style={{ fontSize: 15, color: 'var(--text-secondary)', cursor: 'pointer', lineHeight: 1.5 }}>
          I agree to the <a href="#" style={{ color: 'var(--brand-color)', textDecoration: 'underline', textUnderlineOffset: 2 }}>booking terms</a>{' '}
          and <a href="#" style={{ color: 'var(--brand-color)', textDecoration: 'underline', textUnderlineOffset: 2 }}>cancellation policy</a>.
        </label>
      </div>

      {/* Error */}
      {state.submitError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 'var(--r-sm)', padding: '12px 16px', marginBottom: 16, fontSize: 15, color: '#DC2626', fontWeight: 500 }}>
          {state.submitError}
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        className="btn-primary"
        onClick={submit}
        disabled={!canSubmit}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, padding: '14px 24px', border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.50, borderRadius: 'var(--r-md)', pointerEvents: canSubmit ? 'auto' : 'none' }}
      >
        {state.submitting
          ? <><Spinner /> Submitting…</>
          : <><Icon name={ICONS.check} size={18} /> {state.paymentMethod === 'eft' ? 'Confirm Booking' : `Confirm & Pay $${totalWithGst} AUD`}</>}
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function CR({ label, val, bold, small }: { label: string; val: string; bold?: boolean; small?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', color: bold ? '#1C1917' : '#78716C', fontWeight: bold ? 600 : 400, fontSize: small ? 12 : 13 }}>
      <span>{label}</span><span>{val}</span>
    </div>
  )
}

// ─── Booking Summary Accordion ───────────────────────────────────────────────
function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value || value === '—') return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', fontFamily: mono ? 'ui-monospace,monospace' : undefined }}>{value}</span>
    </div>
  )
}

function BookingSummaryAccordion({ state, charges, user }: { state: ReturnType<typeof useWizard>['state']; charges: ReturnType<typeof calcCharges>; user: ReturnType<typeof useAuth>['user'] }) {
  const [openSlot, setOpenSlot] = useState(0)

  const tp = state.tenantPricing
  const multi = state.slotCount > 1

  return (
    <div style={{ border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 20, background: '#fff' }}>
      {/* Header label */}
      <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Booking Summary</p>
      </div>

      {/* Guest / driver — always visible */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          ['Name',          user ? (user.name || user.email) : state.guestName],
          ['Email',         user ? user.email : state.guestEmail],
          ['Phone',         user ? '' : state.guestPhone],
          ['Company',       user ? '' : state.companyName],
          // Single-slot driver fields live in top-level state; multi-slot shows per-slot below
          ['Driver Name',   state.driverName],
          ['Driver Phone',  state.driverPhone],
          ['Vehicle Rego',  state.vehicleRegistration],
        ].filter(([, val]) => !!val).map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ fontWeight: 600, color: '#1C1917' }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Slot accordion rows */}
      {state.slotConfigs.map((cfg, i) => {
        const isOpen    = openSlot === i
        const isPickup  = cfg.serviceType === 'pickup'
        const isDropoff = cfg.serviceType === 'dropoff'
        const isFCL     = cfg.loadType === 'fcl'
        const isLCL     = cfg.loadType === 'lcl'
        const perSlotFee = cfg.serviceType === 'pickup'
          ? (tp?.slot_fee_pickup  ?? 5.00)
          : (tp?.slot_fee_dropoff ?? 5.00)
        const perSlotStorage    = charges.storageCharge    / state.slotCount
        const perSlotShrinkWrap = charges.shrinkWrapCharge / state.slotCount

        // Single-slot mode stores shipment fields in top-level state (via SET dispatch),
        // not in cfg (SET_SLOT_DETAIL). Fall back to state.* for single-slot.
        const slotHbl            = multi ? cfg.hbl            : state.hbl
        const slotContainerNum   = multi ? cfg.containerNumber : state.containerNumber
        const slotContainerSize  = multi ? cfg.containerSize   : state.containerSize
        const slotEntryNumber    = multi ? cfg.entryNumber     : state.entryNumber
        const slotPurpose        = multi ? cfg.purpose         : state.purpose
        const slotBookingRef     = multi ? cfg.bookingReference : state.bookingReference
        const slotConsolidator   = multi ? cfg.consolidator    : state.consolidator
        const slotDocs           = ((multi ? cfg.documentFiles : state.documentFiles) ?? []).filter(d => d.storagePath || d.name)

        return (
          <div key={cfg.index}>
            {/* Collapsed header row */}
            <div
              onClick={() => setOpenSlot(isOpen ? -1 : i)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.06)', background: isOpen ? '#FAFAFA' : '#fff', transition: 'background 0.15s' }}
            >
              <Icon name={isOpen ? ICONS.arrowDown : ICONS.arrowRight} size={13} style={{ color: '#1C1917', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#9CA3AF', whiteSpace: 'nowrap', flexShrink: 0 }}>SLOT {i + 1}</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--brand-color)' }}>
                {cfg.serviceType === 'pickup' ? 'Pick Up' : 'Drop Off'} · {(cfg.loadType ?? '').toUpperCase()}
              </span>
              {cfg.icsStatus && (() => {
                const m: Record<string, [string, string, string]> = {
                  cleared: ['rgba(34,197,94,0.12)', '#22C55E', 'rgba(34,197,94,0.22)'],
                  held: ['rgba(239,68,68,0.12)', '#EF4444', 'rgba(239,68,68,0.22)'],
                  examination: ['rgba(251,191,36,0.10)', '#FBBF24', 'rgba(251,191,36,0.22)'],
                }
                const [bg, color, border] = m[cfg.icsStatus] ?? ['rgba(0,0,0,0.04)', '#78716C', 'rgba(0,0,0,0.10)']
                const label = { cleared: 'Cleared', held: 'Held', examination: 'Examination', pending: 'Pending', unavailable: 'N/A' }[cfg.icsStatus] ?? cfg.icsStatus
                return <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-full)', background: bg, color, border: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{label}</span>
              })()}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 14, color: 'var(--text-mid)', whiteSpace: 'nowrap' }}>{cfg.selectedDate} · {cfg.selectedSlotLabel}</span>
            </div>

            {/* Expanded panel */}
            {isOpen && (
              <div style={{ padding: '16px 20px 18px', background: '#FAFAFA', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 32px' }}>
                  <SummaryRow label="Service Type" value={isPickup ? 'Pick Up' : isDropoff ? 'Drop Off' : '—'} />
                  <SummaryRow label="Load Type"    value={(cfg.loadType || '—').toUpperCase()} />
                  <SummaryRow label="Date"         value={cfg.selectedDate || '—'} />
                  <SummaryRow label="Time Slot"    value={cfg.selectedSlotLabel || '—'} />
                  {cfg.icsStatus && (() => {
                    const m: Record<string, [string, string, string]> = {
                      cleared: ['rgba(34,197,94,0.12)', '#22C55E', 'rgba(34,197,94,0.22)'],
                      held: ['rgba(239,68,68,0.12)', '#EF4444', 'rgba(239,68,68,0.22)'],
                      examination: ['rgba(251,191,36,0.10)', '#FBBF24', 'rgba(251,191,36,0.22)'],
                    }
                    const [bg, color, border] = m[cfg.icsStatus] ?? ['rgba(0,0,0,0.04)', '#78716C', 'rgba(0,0,0,0.10)']
                    const label = { cleared: 'Cleared', held: 'Held', examination: 'Examination', pending: 'Pending', unavailable: 'N/A' }[cfg.icsStatus] ?? cfg.icsStatus
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ICS Status</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 'var(--r-full)', background: bg, color, border: `1px solid ${border}`, width: 'fit-content' }}>{label}</span>
                      </div>
                    )
                  })()}
                  {isPickup  && isLCL && <SummaryRow label="HBL Number"            value={slotHbl           || '—'} mono />}
                  {isFCL              && <SummaryRow label="Container Number"       value={slotContainerNum  || '—'} mono />}
                  {isFCL              && <SummaryRow label="Container Size"         value={slotContainerSize || '—'} />}
                  {isDropoff          && <SummaryRow label="Entry Number"           value={slotEntryNumber   || '—'} mono />}
                  {isDropoff          && <SummaryRow label="Purpose"                value={slotPurpose       || '—'} />}
                  {isDropoff && isLCL && <SummaryRow label="Booking Confirmation #" value={slotBookingRef    || '—'} />}
                  {isDropoff && isLCL && <SummaryRow label="Consolidator"           value={slotConsolidator  || '—'} />}
                  {/* Driver fields: only populated in multi-slot cfg; single-slot shows in header */}
                  {cfg.driverName          && <SummaryRow label="Driver Name"   value={cfg.driverName} />}
                  {cfg.driverPhone         && <SummaryRow label="Driver Phone"  value={cfg.driverPhone} />}
                  {cfg.vehicleRegistration && <SummaryRow label="Vehicle Rego"  value={cfg.vehicleRegistration} mono />}
                  {/* Uploaded documents */}
                  {slotDocs.length > 0 && (
                    <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Uploaded Documents</span>
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {slotDocs.map((doc, di) => (
                          <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9CA3AF', flexShrink: 0, display: 'inline-block' }} />
                            <span style={{ fontWeight: 500 }}>{doc.name}</span>
                            {doc.docType && <span style={{ fontSize: 11, color: '#9CA3AF' }}>· {doc.docType}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {/* Per-slot fee */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.06)', fontSize: 15, color: 'var(--text-mid)' }}>
                  <span>Slot fee</span>
                  <span style={{ fontWeight: 600, color: '#1C1917' }}>${perSlotFee.toFixed(2)}</span>
                </div>
                {perSlotStorage > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#9CA3AF', marginTop: 4 }}>
                    <span>Storage</span><span>${perSlotStorage.toFixed(2)}</span>
                  </div>
                )}
                {perSlotShrinkWrap > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#9CA3AF', marginTop: 4 }}>
                    <span>Shrink wrap</span><span>${perSlotShrinkWrap.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Totals — always visible at bottom */}
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: 'var(--text-mid)', marginBottom: 6 }}>
          <span>Slot fee × {state.slotCount}</span>
          <span>${charges.subtotal.toFixed(2)}</span>
        </div>
        {charges.storageCharge > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: 'var(--text-mid)', marginBottom: 6 }}>
            <span>Storage</span><span>${charges.storageCharge.toFixed(2)}</span>
          </div>
        )}
        {charges.shrinkWrapCharge > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: 'var(--text-mid)', marginBottom: 6 }}>
            <span>Shrink wrap</span><span>${charges.shrinkWrapCharge.toFixed(2)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: 'var(--text-mid)', marginBottom: 10 }}>
          <span>GST (10%)</span>
          <span>${charges.gst.toFixed(2)}</span>
        </div>
        <div style={{ height: 1, background: 'rgba(0,0,0,0.07)', marginBottom: 10 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: '#1C1917' }}>
          <span>Total Amount</span>
          <span style={{ color: 'var(--brand-color)' }}>${charges.total.toFixed(2)} AUD</span>
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ animation: 'spin 0.7s linear infinite', flexShrink: 0 }}>
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round"/>
  </svg>
}

// ─── Card type detection ──────────────────────────────────────────────────────
function detectCard(digits: string): 'visa' | 'mastercard' | 'amex' | null {
  if (!digits) return null
  if (digits.startsWith('4')) return 'visa'
  const n = parseInt(digits.substring(0, 2))
  if (n >= 51 && n <= 55) return 'mastercard'
  if (digits.startsWith('34') || digits.startsWith('37')) return 'amex'
  return null
}

const CARD_LOGOS: Record<string, React.ReactNode> = {
  visa:       <span style={{ fontSize: 13, fontWeight: 800, color: '#1a1f71', letterSpacing: '-0.02em', fontStyle: 'italic' }}>VISA</span>,
  mastercard: <span style={{ fontSize: 10, fontWeight: 700, color: '#eb001b' }}>MC</span>,
  amex:       <span style={{ fontSize: 10, fontWeight: 700, color: '#007bc1' }}>AMEX</span>,
}

// ─── Validated card panel ─────────────────────────────────────────────────────
function CardPaymentPanel() {
  const { state, dispatch } = useWizard()
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [errors, setErrors]   = useState<Record<string, string>>({})

  const set = (f: string, v: string) => dispatch({ type: 'SET', field: f as any, value: v })
  const touch = (f: string) => setTouched(p => ({ ...p, [f]: true }))

  const digits   = state.cardNumber.replace(/\s/g, '')
  const cardType = detectCard(digits)
  const isAmex   = cardType === 'amex'

  // ── Formatters ──────────────────────────────────────────────────────────────

  const handleCardNumber = (raw: string) => {
    const d = raw.replace(/\D/g, '')
    let formatted: string
    if (isAmex || d.startsWith('34') || d.startsWith('37')) {
      // Amex: 4-6-5
      const p1 = d.slice(0, 4)
      const p2 = d.slice(4, 10)
      const p3 = d.slice(10, 15)
      formatted = [p1, p2, p3].filter(Boolean).join(' ')
    } else {
      // Standard: 4-4-4-4
      formatted = d.slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
    }
    set('cardNumber', formatted)
  }

  const handleExpiry = (raw: string) => {
    const d    = raw.replace(/\D/g, '').slice(0, 4)
    let result = d
    if (d.length > 2) result = d.slice(0, 2) + '/' + d.slice(2)
    set('cardExpiry', result)
  }

  const handleCvv = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(0, isAmex ? 4 : 3)
    set('cardCvv', d)
  }

  const handleName = (raw: string) => {
    const cleaned = raw.replace(/[^a-zA-Z \-']/g, '').slice(0, 60)
    set('cardName', cleaned)
  }

  // ── Validators ──────────────────────────────────────────────────────────────

  const validateCard = () => {
    const d = state.cardNumber.replace(/\s/g, '')
    const ct = detectCard(d)
    const expected = ct === 'amex' ? 15 : 16
    const err = d.length !== expected ? 'Please enter a valid ' + expected + '-digit card number' : ''
    setErrors(p => ({ ...p, cardNumber: err }))
  }

  const validateExpiry = () => {
    const parts = state.cardExpiry.split('/')
    if (parts.length !== 2 || parts[0].length !== 2 || parts[1].length !== 2) {
      setErrors(p => ({ ...p, cardExpiry: 'Invalid expiry date' })); return
    }
    const mm = parseInt(parts[0]), yy = parseInt(parts[1])
    if (mm < 1 || mm > 12) { setErrors(p => ({ ...p, cardExpiry: 'Invalid expiry date' })); return }
    const now = new Date()
    const expMs = new Date(2000 + yy, mm, 1).getTime()
    if (expMs < now.getTime()) { setErrors(p => ({ ...p, cardExpiry: 'Card has expired' })); return }
    setErrors(p => ({ ...p, cardExpiry: '' }))
  }

  const validateCvv = () => {
    const expected = isAmex ? 4 : 3
    const err = state.cardCvv.length !== expected ? 'Invalid CVV' : ''
    setErrors(p => ({ ...p, cardCvv: err }))
  }

  const validateName = () => {
    const err = state.cardName.trim().length < 2 ? 'Please enter the cardholder name as it appears on the card' : ''
    setErrors(p => ({ ...p, cardName: err }))
  }

  // ── Shared label style (matching existing wizard style) ──────────────────────
  const LBL: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }
  const ERR: React.CSSProperties = { fontSize: 13, color: '#EF4444', marginTop: 4 }
  const fieldStyle = (hasErr: boolean): React.CSSProperties => ({
    borderColor: hasErr ? '#EF4444' : undefined,
    boxShadow:   hasErr ? '0 0 0 2px rgba(239,68,68,0.15)' : undefined,
  })

  return (
    <div style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 'var(--r-lg)', padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Icon name={ICONS.shield} size={15} style={{ color: '#22C55E' }} />
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>Secure card payment powered by Stripe</p>
      </div>

      {/* Cardholder name */}
      <div style={{ marginBottom: 14 }}>
        <label style={LBL}>Cardholder Name</label>
        <input
          type="text"
          placeholder="As it appears on the card"
          maxLength={60}
          className="wizard-field"
          value={state.cardName}
          onChange={e => handleName(e.target.value)}
          onBlur={() => { touch('cardName'); validateName() }}
          style={touched.cardName && errors.cardName ? fieldStyle(true) : {}}
        />
        {touched.cardName && errors.cardName && <p style={ERR}>{errors.cardName}</p>}
      </div>

      {/* Card number */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <label style={{ ...LBL, marginBottom: 0 }}>Card Number</label>
          {cardType && CARD_LOGOS[cardType] && (
            <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 6px', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-xs)', background: '#fff' }}>
              {CARD_LOGOS[cardType]}
            </span>
          )}
        </div>
        <input
          type="text"
          inputMode="numeric"
          placeholder={isAmex ? '3782 822463 10005' : '•••• •••• •••• ••••'}
          maxLength={isAmex ? 17 : 19}
          className="wizard-field"
          value={state.cardNumber}
          onChange={e => handleCardNumber(e.target.value)}
          onBlur={() => { touch('cardNumber'); validateCard() }}
          style={{ letterSpacing: '0.08em', fontFamily: 'ui-monospace,monospace', ...(touched.cardNumber && errors.cardNumber ? fieldStyle(true) : {}) }}
        />
        {touched.cardNumber && errors.cardNumber && <p style={ERR}>{errors.cardNumber}</p>}
      </div>

      {/* Expiry + CVV */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={LBL}>Expiry</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="MM/YY"
            maxLength={5}
            className="wizard-field"
            value={state.cardExpiry}
            onChange={e => handleExpiry(e.target.value)}
            onBlur={() => { touch('cardExpiry'); validateExpiry() }}
            style={touched.cardExpiry && errors.cardExpiry ? fieldStyle(true) : {}}
          />
          {touched.cardExpiry && errors.cardExpiry && <p style={ERR}>{errors.cardExpiry}</p>}
        </div>
        <div>
          <label style={LBL}>CVV</label>
          <input
            type="password"
            inputMode="numeric"
            placeholder={isAmex ? '••••' : '•••'}
            maxLength={isAmex ? 4 : 3}
            className="wizard-field"
            value={state.cardCvv}
            onChange={e => handleCvv(e.target.value)}
            onBlur={() => { touch('cardCvv'); validateCvv() }}
            style={touched.cardCvv && errors.cardCvv ? fieldStyle(true) : {}}
          />
          {touched.cardCvv && errors.cardCvv && <p style={ERR}>{errors.cardCvv}</p>}
        </div>
      </div>
    </div>
  )
}
