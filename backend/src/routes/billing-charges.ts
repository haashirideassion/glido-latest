/**
 * Charge lines — steps 3 and 4 of the chain, plus the operational surfaces.
 *
 *   POST /api/billing/charges/quote            F1  live quote for the wizard   X-02
 *   POST /api/billing/charges/rate/:bookingId  F2  freeze the snapshot         RT-02
 *   POST /api/billing/charges/rerate/:bookingId F3 re-rate on an event          RT-03
 *   GET  /api/billing/charges/booking/:id      O-02 booking financials tab
 *   POST /api/billing/charges/manual           O-03 add manual charge           RT-08
 *   PATCH /api/billing/charges/:id/adjust      O-04 adjust or waive             RT-09
 *   GET  /api/billing/charges/dwell            O-05 dwell & storage monitor     RT-05
 *   GET  /api/billing/charges/demurrage-review O-06 warn before charging        RT-06
 *   POST /api/billing/charges/credit-check     F2  credit decision              AR-03
 */

import { Router, Request, Response } from 'express'
import { pool } from '../db'
import { requireAuth, optionalAuth } from '../middleware/auth'
import {
  accountForBooking, allocateDocumentNumber, approvalRequirement, audit, checkCredit,
  contextFromBooking, isoDate, loadBookingForRating, persistChargeLines, resolveTariff,
} from '../lib/billingRepo'
import { rate, RatingContext, RatingError } from '../lib/rating'
import { formatMoney, money, toDecimalString } from '../lib/money'
import {
  badRequest, created, handler, notFound, ok, refuse, requireBilling, requireCapability,
  tenantOf, DEFAULT_TENANT_ID,
} from '../lib/billingHttp'

const router = Router()

/** Money in an API response always carries its currency (NFR-B-03). */
function amount(value: unknown, currency: string) {
  const n = Number(value ?? 0)
  return { amount: n.toFixed(2), currency, display: formatMoney(money(n.toFixed(2), currency)) }
}

// ─────────────────────────────────────────────────────────────────────────────
// F1 — live quote. Public: the booking wizard prices before anyone logs in.
// ─────────────────────────────────────────────────────────────────────────────

router.post('/quote', optionalAuth, handler('billing-charges quote', async (req, res) => {
  const tenantId = tenantOf(req)
  const body = req.body ?? {}

  if (!body.slotDate) return badRequest(res, 'slotDate is required')

  // An authenticated account gets its own card; a guest gets the site default
  // (TF-02, TF-03). The client cannot choose — that would be a pricing hole.
  let accountId: string | null = null
  if (req.user?.id) {
    const { rows } = await pool.query(
      `SELECT id FROM billing_accounts
        WHERE tenant_id = $1 AND user_id = $2 AND status IN ('active','on_hold') LIMIT 1`,
      [tenantId, req.user.id],
    )
    accountId = rows[0]?.id ?? null
  }

  const resolution = await resolveTariff(pool, {
    tenantId, accountId, siteId: body.siteId ?? null, asOfDate: body.slotDate,
  })
  if (!resolution) {
    return res.status(503).json({
      success: false,
      error: { message: 'No active rate card covers this date. Publish a rate card in Settings → Rate cards.' },
    })
  }

  const ctx: RatingContext = {
    serviceType: body.serviceType ?? null,
    loadType: body.loadType ?? null,
    cargoType: body.cargoType ?? null,
    customerSegment: accountId ? 'account' : 'guest',
    siteId: body.siteId ?? null,
    slotDate: body.slotDate,
    slotStartTime: body.slotStartTime ?? null,
    weightKg: num(body.weightKg),
    volumeCbm: num(body.volumeCbm),
    palletCount: num(body.palletCount),
    packageCount: num(body.packageCount),
    containerCount: num(body.containerCount),
    containerSize: body.containerSize ?? null,
    hoursOnSite: num(body.hoursOnSite),
    storageStartDate: body.storageStartDate ?? null,
    daysOnSite: num(body.daysOnSite),
    dwellThresholdDays: num(body.dwellThresholdDays),
    isHazardous: !!body.isHazardous,
    selectedItemIds: Array.isArray(body.selectedItemIds) ? body.selectedItemIds : [],
    quantities: body.quantities ?? {},
    discountCodes: Array.isArray(body.discountCodes) ? body.discountCodes : [],
  }

  let result
  try {
    result = rate(resolution.bundle, ctx)
  } catch (err) {
    if (err instanceof RatingError) return badRequest(res, err.message)
    throw err
  }

  return ok(res, serialiseQuote(result, resolution.basis))
}))

function serialiseQuote(result: ReturnType<typeof rate>, tariffBasis: string) {
  const c = result.currency
  return {
    currency: c,
    tariffBasis,
    rateCard: { id: result.snapshot.rateCardId, name: result.snapshot.rateCardName, version: result.snapshot.rateCardVersion },
    lines: result.lines.map(l => ({
      itemId: l.itemId,
      itemCode: l.itemCode,
      description: l.description,
      lineKind: l.lineKind,
      attachMode: l.attachMode,
      // A mandatory line is not removable in the wizard (SC-04).
      removable: l.attachMode === 'optional',
      unitOfMeasure: l.unitOfMeasure,
      quantity: l.quantity,
      chargeableQuantity: l.chargeableQuantity,
      unitPrice: amount(toDecimalString(l.unitPrice, 4), c),
      lineSubtotal: amount(toDecimalString(l.lineSubtotal), c),
      discountAmount: amount(toDecimalString(l.discountAmount), c),
      taxRate: l.taxRate,
      taxAmount: amount(toDecimalString(l.taxAmount), c),
      lineTotal: amount(toDecimalString(l.lineTotal), c),
      working: l.working,     // RT-11 — the UI expands this into plain language
    })),
    availableOptions: result.availableOptions.map(o => ({
      itemId: o.itemId,
      itemCode: o.itemCode,
      description: o.description,
      unitOfMeasure: o.unitOfMeasure,
      indicativeUnitPrice: amount(toDecimalString(o.indicativeUnitPrice, 4), c),
      indicativeTotal: amount(toDecimalString(o.indicativeTotal), c),
    })),
    subtotal: amount(toDecimalString(result.subtotal), c),
    discountTotal: amount(toDecimalString(result.discountTotal), c),
    taxTotal: amount(toDecimalString(result.taxTotal), c),
    total: amount(toDecimalString(result.total), c),
    taxNote: result.taxNote,
    warnings: result.warnings,
    snapshot: result.snapshot,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// F2 / F3 — rate a booking, freezing the tariff onto it
// ─────────────────────────────────────────────────────────────────────────────

async function rateBooking(
  req: Request,
  res: Response,
  mode: 'initial' | 'rerate',
) {
  const bookingId = req.params.bookingId
  const body = req.body ?? {}

  const booking = await loadBookingForRating(pool, bookingId)
  if (!booking) return notFound(res, 'Booking')

  const tenantId = booking.tenant_id
  const account = await accountForBooking(pool, tenantId, booking)

  // A re-rate must price against the card the booking was *sold* under, not
  // today's card — a published rate change must not move a confirmed booking
  // (TF-13). The original card comes off the existing lines' snapshot.
  let asOfDate = isoDate(booking.slot_date)
  let pinnedCardId: string | null = null
  if (mode === 'rerate') {
    const { rows } = await pool.query(
      `SELECT rate_card_id FROM billing_charge_lines
        WHERE booking_id = $1 AND rate_card_id IS NOT NULL
        ORDER BY created_at LIMIT 1`,
      [bookingId],
    )
    pinnedCardId = rows[0]?.rate_card_id ?? null
  }

  const resolution = await resolveTariff(pool, {
    tenantId,
    accountId: account?.id ?? null,
    asOfDate,
    rateCardId: pinnedCardId,
  })
  if (!resolution) {
    return res.status(503).json({
      success: false,
      error: { message: 'No active rate card covers this booking date.' },
    })
  }

  const ctx = contextFromBooking(booking, {
    // On a re-rate the actuals are whatever operations recorded, and dwell is
    // measured to today rather than to the slot date (F3's worked case: a
    // vehicle checked out two days late accrues two extra storage days).
    asOfDate: mode === 'rerate' ? new Date().toISOString().slice(0, 10) : undefined,
    selectedItemIds: Array.isArray(body.selectedItemIds) ? body.selectedItemIds : undefined,
    quantities: body.quantities ?? undefined,
    discountCodes: Array.isArray(body.discountCodes) ? body.discountCodes : undefined,
    hoursOnSite: num(body.hoursOnSite),
    dwellThresholdDays: num(body.dwellThresholdDays),
  })

  let result
  try {
    result = rate(resolution.bundle, ctx)
  } catch (err) {
    if (err instanceof RatingError) return badRequest(res, err.message)
    throw err
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const persisted = await persistChargeLines(client, result.lines, result.snapshot, {
      tenantId,
      bookingId,
      accountId: account?.id ?? null,
      status: mode === 'rerate' ? 'actual' : 'estimated',
      source: 'rating',
      actorId: req.user?.id ?? null,
      replaceExisting: true,
    })
    await audit(client, {
      tenantId,
      entityType: 'charge_line',
      entityId: bookingId,
      action: mode === 'rerate' ? 'adjust' : 'create',
      after: { lines: persisted.inserted, total: toDecimalString(result.total), snapshot: result.snapshot },
      amountDelta: toDecimalString(result.total),
      currency: result.currency,
      actorId: req.user?.id ?? null,
      actorLabel: req.user?.name ?? 'system',
    })
    await client.query('COMMIT')

    return ok(res, {
      ...serialiseQuote(result, resolution.basis),
      persisted,
      bookingReference: booking.reference_number,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

router.post('/rate/:bookingId', requireAuth, handler('billing-charges rate',
  (req, res) => rateBooking(req, res, 'initial')))

router.post('/rerate/:bookingId', requireAuth, handler('billing-charges rerate',
  (req, res) => rateBooking(req, res, 'rerate')))

// ─────────────────────────────────────────────────────────────────────────────
// O-02 — booking financials tab
// ─────────────────────────────────────────────────────────────────────────────

router.get('/booking/:bookingId', requireAuth, handler('billing-charges booking', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cl.*,
            ci.code AS item_code, ci.category,
            u1.name AS adjusted_by_name, u2.name AS approved_by_name,
            i.invoice_number, i.status AS invoice_status
       FROM billing_charge_lines cl
       LEFT JOIN billing_catalogue_items ci ON ci.id = cl.item_id
       LEFT JOIN app_users u1 ON u1.id = cl.adjusted_by
       LEFT JOIN app_users u2 ON u2.id = cl.approved_by
       LEFT JOIN billing_invoices i ON i.id = cl.invoice_id
      WHERE cl.booking_id = $1
      ORDER BY cl.line_kind, cl.created_at`,
    [req.params.bookingId],
  )

  const currency = rows[0]?.currency ?? 'AUD'
  const sumOf = (f: (r: any) => number) => rows.reduce((s, r) => s + f(r), 0)

  const snapshot = rows.find(r => r.rate_card_id)
  const { rows: cardRows } = snapshot
    ? await pool.query(`SELECT name, version_no FROM billing_rate_cards WHERE id = $1`, [snapshot.rate_card_id])
    : { rows: [] as any[] }

  return ok(res, {
    currency,
    // The banner that tells staff which tariff this booking is frozen against (RT-02).
    ratingSnapshot: snapshot ? {
      rateCardId: snapshot.rate_card_id,
      rateCardName: cardRows[0]?.name ?? null,
      rateCardVersion: snapshot.rate_card_version,
      frozen: true,
    } : null,
    lines: rows.map(r => ({
      id: r.id,
      itemId: r.item_id,
      itemCode: r.item_code,
      category: r.category,
      description: r.description,
      lineKind: r.line_kind,
      status: r.status,
      source: r.source,
      unitOfMeasure: r.unit_of_measure,
      quantity: Number(r.quantity),
      chargeableQuantity: Number(r.chargeable_quantity),
      unitPrice: amount(r.unit_price, r.currency),
      lineSubtotal: amount(r.line_subtotal, r.currency),
      discountAmount: amount(r.discount_amount, r.currency),
      taxAmount: amount(r.tax_amount, r.currency),
      lineTotal: amount(r.line_total, r.currency),
      // Estimate vs actual with the variance spelled out (RT-04).
      estimatedTotal: r.estimated_total == null ? null : amount(r.estimated_total, r.currency),
      varianceAmount: r.variance_amount == null ? null : amount(r.variance_amount, r.currency),
      originalTotal: r.original_total == null ? null : amount(r.original_total, r.currency),
      reasonCode: r.reason_code,
      reasonNote: r.reason_note,
      adjustedBy: r.adjusted_by_name,
      adjustedAt: r.adjusted_at,
      approvedBy: r.approved_by_name,
      accrualDate: r.accrual_date ? isoDate(r.accrual_date) : null,
      invoiceId: r.invoice_id,
      invoiceNumber: r.invoice_number,
      invoiceStatus: r.invoice_status,
      // Every line, anywhere it appears, can show its working (rule 1).
      working: r.working,
      editable: !r.invoice_id,
    })),
    totals: {
      subtotal: amount(sumOf(r => Number(r.line_subtotal)), currency),
      discountTotal: amount(sumOf(r => Number(r.discount_amount)), currency),
      taxTotal: amount(sumOf(r => Number(r.tax_amount)), currency),
      total: amount(sumOf(r => Number(r.line_total)), currency),
      estimatedTotal: amount(sumOf(r => Number(r.estimated_total ?? 0)), currency),
      varianceTotal: amount(sumOf(r => Number(r.variance_amount ?? 0)), currency),
    },
    invoiced: rows.some(r => r.invoice_id),
  })
}))

// ─────────────────────────────────────────────────────────────────────────────
// O-03 — add a manual charge (RT-08)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/manual', requireAuth, requireBilling, requireCapability('can_add_manual_charge'),
  handler('billing-charges manual', async (req, res) => {
    const tenantId = req.tenantId!
    const { bookingId, itemId, quantity, unitPrice, reasonCode, reasonNote, description } = req.body ?? {}

    // A reason is mandatory (rule 5). The database enforces it too; refusing
    // here means the user gets a field error rather than a constraint message.
    if (!reasonCode) return badRequest(res, 'A reason code is required for a manual charge.')
    if (!bookingId) return badRequest(res, 'bookingId is required')
    if (!itemId) return badRequest(res, 'itemId is required')

    const qty = Number(quantity ?? 1)
    if (!Number.isFinite(qty) || qty <= 0) return badRequest(res, 'quantity must be greater than zero')

    const { rows: itemRows } = await pool.query(
      `SELECT ci.*, (SELECT v.id FROM billing_catalogue_item_versions v
                      WHERE v.item_id = ci.id ORDER BY v.version_no DESC LIMIT 1) AS version_id
         FROM billing_catalogue_items ci WHERE ci.id = $1 AND ci.tenant_id = $2`,
      [itemId, tenantId],
    )
    if (!itemRows.length) return notFound(res, 'Service')
    const item = itemRows[0]

    const booking = await loadBookingForRating(pool, bookingId)
    if (!booking) return notFound(res, 'Booking')
    const account = await accountForBooking(pool, tenantId, booking)

    // Price from the rate card unless staff typed an explicit unit price.
    let rate4 = unitPrice != null && unitPrice !== '' ? String(unitPrice) : null
    let currency = account?.currency ?? 'AUD'
    if (!rate4) {
      const resolution = await resolveTariff(pool, {
        tenantId, accountId: account?.id ?? null, asOfDate: isoDate(booking.slot_date),
      })
      currency = resolution?.bundle.card.currency ?? currency
      const rl = resolution?.bundle.rateLines.find(l => l.itemId === itemId)
      rate4 = rl?.unitRate != null ? String(rl.unitRate) : '0'
    }

    const subtotal = round2(Number(rate4) * qty)
    const { rows: taxRows } = await pool.query(
      `SELECT is_registered, standard_rate FROM billing_tax_settings
        WHERE tenant_id = $1 ORDER BY effective_from DESC LIMIT 1`,
      [tenantId],
    )
    const taxRate = taxRows[0]?.is_registered && item.taxability === 'standard'
      ? Number(taxRows[0].standard_rate) : 0
    const taxAmount = round2(subtotal * taxRate / 100)

    // Above the threshold this needs a named approver (S-10).
    const approval = await approvalRequirement(pool, tenantId, 'adjustment', subtotal)
    const approverId = req.body?.approvedBy ?? null
    if (approval.required && !approverId && !req.billingCaps?.can_approve) {
      return res.status(403).json({
        success: false,
        error: {
          message: `A manual charge of ${subtotal.toFixed(2)} ${currency} is at or above the ${approval.threshold.toFixed(2)} ${currency} approval threshold and needs an approver.`,
          approvalRequired: true,
          threshold: approval.threshold,
          approverRole: approval.approverRole,
        },
      })
    }
    if (approverId && approverId === req.user!.id && !approval.allowSelfApproval) {
      return refuse(res, 'You cannot approve your own manual charge.', undefined, 403)
    }

    const working = {
      unitOfMeasure: item.unit_of_measure,
      rateType: 'flat',
      baseQuantity: qty,
      chargeableQuantity: qty,
      currency,
      steps: [
        {
          label: 'Manual charge entered at reception',
          detail: `${qty} × ${rate4} ${currency}${reasonNote ? ` — ${reasonNote}` : ''}`,
          value: subtotal.toFixed(2),
        },
        { label: 'Reason', detail: reasonCode, value: '' },
        { label: 'Entered by', detail: req.user!.name, value: '' },
      ],
    }

    const { rows } = await pool.query(
      `INSERT INTO billing_charge_lines (
         tenant_id, booking_id, account_id, item_id, item_version_id,
         description, unit_of_measure, quantity, chargeable_quantity, unit_price,
         line_subtotal, tax_rate, tax_amount, line_total, currency,
         line_kind, status, source, working, reason_code, reason_note,
         adjusted_by, adjusted_at, approved_by, approved_at, created_by
       ) VALUES (
         $1,$2,$3,$4,$5,
         $6,$7,$8,$9,$10,
         $11,$12,$13,$14,$15,
         'manual','actual','manual',$16,$17,$18,
         $19, NOW(), $20, CASE WHEN $20::uuid IS NULL THEN NULL ELSE NOW() END, $19
       ) RETURNING *`,
      [
        tenantId, bookingId, account?.id ?? null, itemId, item.version_id,
        description || item.customer_name, item.unit_of_measure, qty, qty, rate4,
        subtotal.toFixed(2), taxRate, taxAmount.toFixed(2), (subtotal + taxAmount).toFixed(2), currency,
        JSON.stringify(working), reasonCode, reasonNote ?? null,
        req.user!.id, approverId,
      ],
    )

    await audit(pool, {
      tenantId, entityType: 'charge_line', entityId: rows[0].id, action: 'create',
      after: rows[0], amountDelta: (subtotal + taxAmount).toFixed(2), currency,
      reasonCode, reasonNote, actorId: req.user!.id, actorLabel: req.user!.name,
      actorIp: req.ip,
    })

    return created(res, { id: rows[0].id, lineTotal: amount(rows[0].line_total, currency) })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// O-04 — adjust or waive a charge (RT-09)
// ─────────────────────────────────────────────────────────────────────────────

router.patch('/:id/adjust', requireAuth, requireBilling,
  handler('billing-charges adjust', async (req, res) => {
    const tenantId = req.tenantId!
    const { newAmount, waive, reasonCode, reasonNote, approvedBy } = req.body ?? {}

    if (!reasonCode) return badRequest(res, 'A reason code is required.')

    const capability = waive ? 'can_waive_charge' : 'can_adjust_charge'
    if (!req.billingCaps?.[capability]) {
      return res.status(403).json({
        success: false,
        error: {
          message: `You do not have permission to ${waive ? 'waive' : 'adjust'} a charge.`,
          capability,
        },
      })
    }

    const { rows: existing } = await pool.query(
      `SELECT * FROM billing_charge_lines WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    )
    if (!existing.length) return notFound(res, 'Charge line')
    const line = existing[0]

    // Once a line is on an issued invoice the document is the record; the
    // correction path is a credit note, not an edit (IN-06).
    if (line.invoice_id) {
      return refuse(
        res,
        'This charge is already on an issued invoice and cannot be edited. Raise a credit note instead.',
        'credit_note',
      )
    }

    const currency = line.currency
    const originalTotal = Number(line.original_total ?? line.line_total)
    const targetSubtotal = waive ? 0 : round2(Number(newAmount))
    if (!waive && (!Number.isFinite(targetSubtotal) || targetSubtotal < 0)) {
      return badRequest(res, 'newAmount must be a non-negative number.')
    }

    const givenAway = round2(Number(line.line_subtotal) - targetSubtotal)
    const approval = await approvalRequirement(
      pool, tenantId, waive ? 'waiver' : 'adjustment', givenAway,
    )
    if (approval.required && !approvedBy && !req.billingCaps?.can_approve) {
      return res.status(403).json({
        success: false,
        error: {
          message: `Giving away ${givenAway.toFixed(2)} ${currency} is at or above the ${approval.threshold.toFixed(2)} ${currency} approval threshold and needs an approver.`,
          approvalRequired: true,
          threshold: approval.threshold,
          approverRole: approval.approverRole,
        },
      })
    }
    if (approvedBy && approvedBy === req.user!.id && !approval.allowSelfApproval) {
      return refuse(res, 'You cannot approve your own adjustment.', undefined, 403)
    }

    const taxRate = Number(line.tax_rate)
    const taxAmount = round2(targetSubtotal * taxRate / 100)
    const working = {
      ...(line.working ?? {}),
      steps: [
        ...((line.working?.steps ?? []) as any[]),
        {
          label: waive ? 'Charge waived' : 'Charge adjusted',
          detail: `${Number(line.line_subtotal).toFixed(2)} → ${targetSubtotal.toFixed(2)} ${currency} · ${reasonCode}${reasonNote ? ` — ${reasonNote}` : ''}`,
          value: `−${givenAway.toFixed(2)}`,
        },
        { label: waive ? 'Waived by' : 'Adjusted by', detail: req.user!.name, value: '' },
      ],
    }

    const { rows } = await pool.query(
      `UPDATE billing_charge_lines
          SET original_total = COALESCE(original_total, line_total),
              line_subtotal = $2,
              tax_amount    = $3,
              line_total    = $4,
              unit_price    = CASE WHEN chargeable_quantity > 0
                                   THEN $2::numeric / chargeable_quantity ELSE 0 END,
              status        = $5,
              reason_code   = $6,
              reason_note   = $7,
              adjusted_by   = $8,
              adjusted_at   = NOW(),
              approved_by   = $9,
              approved_at   = CASE WHEN $9::uuid IS NULL THEN NULL ELSE NOW() END,
              working       = $10,
              updated_at    = NOW()
        WHERE id = $1
        RETURNING *`,
      [
        req.params.id, targetSubtotal.toFixed(2), taxAmount.toFixed(2),
        (targetSubtotal + taxAmount).toFixed(2),
        waive ? 'waived' : 'adjusted',
        reasonCode, reasonNote ?? null, req.user!.id, approvedBy ?? null,
        JSON.stringify(working),
      ],
    )

    await audit(pool, {
      tenantId, entityType: 'charge_line', entityId: req.params.id,
      action: waive ? 'waive' : 'adjust',
      before: line, after: rows[0],
      amountDelta: (-givenAway).toFixed(2), currency,
      reasonCode, reasonNote, actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
    })

    return ok(res, {
      id: rows[0].id,
      status: rows[0].status,
      lineTotal: amount(rows[0].line_total, currency),
      originalTotal: amount(rows[0].original_total, currency),
      givenAway: amount(givenAway, currency),
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// O-05 — dwell & storage monitor: what is accruing right now
// ─────────────────────────────────────────────────────────────────────────────

router.get('/dwell', requireAuth, requireBilling, handler('billing-charges dwell', async (req, res) => {
  const tenantId = req.tenantId!
  const threshold = Number(req.query.dwellThresholdDays ?? 7)

  const { rows } = await pool.query(
    `SELECT b.id, b.reference_number, b.company_name, b.container_number, b.load_type,
            b.storage_start_date, b.slot_date, b.status,
            (CURRENT_DATE - b.storage_start_date)          AS days_on_site,
            COALESCE(SUM(cl.line_total) FILTER (
              WHERE cl.line_kind IN ('storage','demurrage')), 0)  AS accrued_total,
            MAX(cl.accrual_date)                            AS last_accrual_date,
            MIN(cl.currency)                                AS currency,
            (SELECT rl.free_allowance FROM billing_rate_lines rl
               JOIN billing_rate_cards rc ON rc.id = rl.rate_card_id
               JOIN billing_catalogue_items ci ON ci.id = rl.item_id
              WHERE rc.tenant_id = b.tenant_id AND rc.status = 'active'
                AND ci.category = 'storage'
              ORDER BY rc.effective_from DESC LIMIT 1) AS free_allowance
       FROM bookings b
       LEFT JOIN billing_charge_lines cl ON cl.booking_id = b.id
      WHERE b.tenant_id = $1
        AND b.storage_start_date IS NOT NULL
        AND b.status NOT IN ('cancelled', 'completed')
      GROUP BY b.id
      ORDER BY days_on_site DESC NULLS LAST`,
    [tenantId],
  )

  const now = new Date()
  const nextAccrual = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 1, 0, 0,
  )).toISOString()

  return ok(res, {
    nextAccrualAt: nextAccrual,
    dwellThresholdDays: threshold,
    rows: rows.map(r => {
      const days = Number(r.days_on_site ?? 0)
      const free = Number(r.free_allowance ?? 0)
      const currency = r.currency ?? 'AUD'
      return {
        bookingId: r.id,
        reference: r.reference_number,
        customer: r.company_name,
        container: r.container_number,
        loadType: r.load_type,
        storageStartDate: r.storage_start_date ? isoDate(r.storage_start_date) : null,
        daysOnSite: days,
        freeAllowanceDays: free,
        billableDays: Math.max(0, days - free),
        // Colour is never the only encoding (rule 8) — the UI gets the numbers
        // and a named proximity band, not just a hue.
        thresholdProximity: days >= threshold ? 'breached'
          : days >= threshold - 2 ? 'approaching' : 'clear',
        daysToThreshold: threshold - days,
        accruedToDate: amount(r.accrued_total, currency),
        lastAccrualDate: r.last_accrual_date ? isoDate(r.last_accrual_date) : null,
      }
    }),
  })
}))

// ─────────────────────────────────────────────────────────────────────────────
// O-06 — demurrage notification review: warn before charging (RT-06)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/demurrage-review', requireAuth, requireBilling,
  handler('billing-charges demurrage', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT cl.id, cl.booking_id, cl.description, cl.line_total, cl.currency,
              cl.accrual_date, cl.working, cl.status,
              b.reference_number, b.company_name, b.guest_email, b.container_number,
              (CURRENT_DATE - b.storage_start_date) AS days_on_site
         FROM billing_charge_lines cl
         JOIN bookings b ON b.id = cl.booking_id
        WHERE cl.tenant_id = $1
          AND cl.line_kind = 'demurrage'
          AND cl.invoice_id IS NULL
        ORDER BY cl.accrual_date DESC NULLS LAST, cl.created_at DESC`,
      [req.tenantId!],
    )
    return ok(res, rows.map(r => ({
      chargeLineId: r.id,
      bookingId: r.booking_id,
      reference: r.reference_number,
      customer: r.company_name,
      notifyEmail: r.guest_email,
      container: r.container_number,
      daysOnSite: Number(r.days_on_site ?? 0),
      description: r.description,
      lineTotal: amount(r.line_total, r.currency),
      accrualDate: r.accrual_date ? isoDate(r.accrual_date) : null,
      working: r.working,
      status: r.status,
    })))
  }))

// ─────────────────────────────────────────────────────────────────────────────
// F2 — credit decision for the booking path (AR-03, AR-11)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/credit-check', requireAuth, handler('billing-charges credit-check', async (req, res) => {
  const tenantId = tenantOf(req)
  const { accountId, amount: requested } = req.body ?? {}
  if (!accountId) return badRequest(res, 'accountId is required')
  const decision = await checkCredit(pool, tenantId, accountId, Number(requested ?? 0))
  return ok(res, {
    ...decision,
    exposure: amount(decision.exposure, decision.currency),
    creditLimit: amount(decision.creditLimit, decision.currency),
    headroom: amount(decision.headroom, decision.currency),
  })
}))

// ─────────────────────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export default router
