/**
 * Reporting & analytics — step 8 of the chain (R-01 … R-13, N-01 … N-03).
 *
 *   GET /api/billing/reports                  R-01 report library
 *   GET /api/billing/reports/revenue-by-service   R-02   RP-01
 *   GET /api/billing/reports/revenue-by-customer  R-03   RP-02
 *   GET /api/billing/reports/gst-summary          R-04   RP-04, TX-04
 *   GET /api/billing/reports/storage-dwell        R-05   RP-05 — the leakage metric
 *   GET /api/billing/reports/concessions          R-07   RP-07
 *   GET /api/billing/reports/exceptions           R-08   RP-08
 *   GET /api/billing/reports/payment-mix          R-09   RP-09
 *   GET /api/billing/reports/dashboard            N-01   AN-01
 *   GET /api/billing/reports/leakage              N-03   AN-03
 *   GET /api/billing/reports/audit-log            B-11   NFR-B-04
 */

import { Router } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import { isoDate } from '../lib/billingRepo'
import { formatMoney, money } from '../lib/money'
import { badRequest, handler, ok, requireBilling } from '../lib/billingHttp'

const router = Router()

function amount(value: unknown, currency = 'AUD') {
  const n = Number(value ?? 0)
  return { amount: n.toFixed(2), currency, display: formatMoney(money(n.toFixed(2), currency)) }
}

/** Every report takes the same period window, defaulting to the current month. */
function period(req: any): { from: string; to: string } {
  const now = new Date()
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return {
    from: (req.query.from as string) ?? defaultFrom.toISOString().slice(0, 10),
    to: (req.query.to as string) ?? now.toISOString().slice(0, 10),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// R-01 — report library
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, requireBilling, handler('billing-reports library', async (req, res) => {
  return ok(res, {
    // RP-12: export is capability-gated, and the library says so up front
    // rather than letting the user reach a disabled button.
    canExport: !!req.billingCaps?.can_export,
    reports: [
      { id: 'revenue-by-service',  name: 'Revenue by service',            traces: 'RP-01', group: 'Revenue' },
      { id: 'revenue-by-customer', name: 'Revenue by customer',           traces: 'RP-02', group: 'Revenue' },
      { id: 'aged-receivables',    name: 'Aged receivables',              traces: 'RP-03', group: 'Receivables', path: '/api/billing/accounts/aged' },
      { id: 'gst-summary',         name: 'GST / BAS summary',             traces: 'RP-04', group: 'Compliance' },
      { id: 'storage-dwell',       name: 'Storage revenue & dwell',       traces: 'RP-05', group: 'Revenue' },
      { id: 'concessions',         name: 'Discount & waiver report',      traces: 'RP-07', group: 'Governance' },
      { id: 'exceptions',          name: 'Billing exception report',      traces: 'RP-08', group: 'Governance' },
      { id: 'payment-mix',         name: 'Payment mix & settlement timing', traces: 'RP-09', group: 'Payments' },
      { id: 'leakage',             name: 'Revenue leakage console',       traces: 'AN-03', group: 'Analytics' },
      { id: 'dashboard',           name: 'Revenue dashboard',             traces: 'AN-01', group: 'Analytics' },
      { id: 'audit-log',           name: 'Financial audit log',           traces: 'NFR-B-04', group: 'Governance' },
    ],
  })
}))

// ─────────────────────────────────────────────────────────────────────────────
// R-02 — revenue by service (RP-01)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/revenue-by-service', requireAuth, requireBilling,
  handler('billing-reports revenue-by-service', async (req, res) => {
    const { from, to } = period(req)
    const { rows } = await pool.query(
      `SELECT ci.id AS item_id, ci.code, ci.customer_name, ci.category, i.currency,
              COUNT(DISTINCT i.id)                        AS invoice_count,
              SUM(il.quantity)                            AS total_quantity,
              SUM(il.line_subtotal - il.discount_amount)  AS net_revenue,
              SUM(il.tax_amount)                          AS tax_collected,
              SUM(il.line_total)                          AS gross_revenue
         FROM billing_invoice_lines il
         JOIN billing_invoices i ON i.id = il.invoice_id
         LEFT JOIN billing_charge_lines cl ON cl.id = il.charge_line_id
         LEFT JOIN billing_catalogue_items ci ON ci.id = cl.item_id
        WHERE i.tenant_id = $1
          AND i.status NOT IN ('draft','void')
          AND i.issue_date BETWEEN $2::date AND $3::date
        GROUP BY ci.id, ci.code, ci.customer_name, ci.category, i.currency
        ORDER BY net_revenue DESC NULLS LAST`,
      [req.tenantId!, from, to],
    )

    // Period-on-period, which RP-01 asks for explicitly.
    const spanDays = Math.max(1, Math.round(
      (Date.parse(to) - Date.parse(from)) / 86_400_000) + 1)
    const priorTo = new Date(Date.parse(from) - 86_400_000).toISOString().slice(0, 10)
    const priorFrom = new Date(Date.parse(from) - spanDays * 86_400_000).toISOString().slice(0, 10)
    const { rows: prior } = await pool.query(
      `SELECT cl.item_id, SUM(il.line_subtotal - il.discount_amount) AS net_revenue
         FROM billing_invoice_lines il
         JOIN billing_invoices i ON i.id = il.invoice_id
         LEFT JOIN billing_charge_lines cl ON cl.id = il.charge_line_id
        WHERE i.tenant_id = $1 AND i.status NOT IN ('draft','void')
          AND i.issue_date BETWEEN $2::date AND $3::date
        GROUP BY cl.item_id`,
      [req.tenantId!, priorFrom, priorTo],
    )
    const priorByItem = new Map(prior.map(p => [p.item_id, Number(p.net_revenue)]))
    const currency = rows[0]?.currency ?? 'AUD'

    return ok(res, {
      period: { from, to },
      priorPeriod: { from: priorFrom, to: priorTo },
      rows: rows.map(r => {
        const net = Number(r.net_revenue ?? 0)
        const priorNet = priorByItem.get(r.item_id) ?? 0
        return {
          itemId: r.item_id,
          itemCode: r.code ?? '—',
          itemName: r.customer_name ?? 'Unmapped charge',
          category: r.category ?? 'other',
          invoiceCount: Number(r.invoice_count),
          totalQuantity: Number(r.total_quantity ?? 0),
          netRevenue: amount(net, r.currency),
          taxCollected: amount(r.tax_collected, r.currency),
          grossRevenue: amount(r.gross_revenue, r.currency),
          priorNetRevenue: amount(priorNet, r.currency),
          changePct: priorNet === 0 ? null : Number((((net - priorNet) / priorNet) * 100).toFixed(1)),
        }
      }),
      totals: {
        netRevenue: amount(rows.reduce((s, r) => s + Number(r.net_revenue ?? 0), 0), currency),
        taxCollected: amount(rows.reduce((s, r) => s + Number(r.tax_collected ?? 0), 0), currency),
        grossRevenue: amount(rows.reduce((s, r) => s + Number(r.gross_revenue ?? 0), 0), currency),
      },
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// R-03 — revenue by customer, with concentration (RP-02)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/revenue-by-customer', requireAuth, requireBilling,
  handler('billing-reports revenue-by-customer', async (req, res) => {
    const { from, to } = period(req)
    const { rows } = await pool.query(
      `SELECT a.id, a.account_code, a.legal_name, i.currency,
              COUNT(i.id)                        AS invoice_count,
              SUM(i.subtotal - i.discount_total) AS net_revenue,
              SUM(i.total)                       AS gross_revenue,
              SUM(i.balance_due)                 AS outstanding
         FROM billing_invoices i
         JOIN billing_accounts a ON a.id = i.account_id
        WHERE i.tenant_id = $1
          AND i.status NOT IN ('draft','void')
          AND i.issue_date BETWEEN $2::date AND $3::date
        GROUP BY a.id, a.account_code, a.legal_name, i.currency
        ORDER BY net_revenue DESC`,
      [req.tenantId!, from, to],
    )

    const currency = rows[0]?.currency ?? 'AUD'
    const total = rows.reduce((s, r) => s + Number(r.net_revenue ?? 0), 0)
    let running = 0

    return ok(res, {
      period: { from, to },
      rows: rows.map((r, idx) => {
        const net = Number(r.net_revenue ?? 0)
        running += net
        return {
          rank: idx + 1,
          accountId: r.id,
          accountCode: r.account_code,
          accountName: r.legal_name,
          invoiceCount: Number(r.invoice_count),
          netRevenue: amount(net, r.currency),
          grossRevenue: amount(r.gross_revenue, r.currency),
          outstanding: amount(r.outstanding, r.currency),
          sharePct: total ? Number(((net / total) * 100).toFixed(2)) : 0,
          cumulativeSharePct: total ? Number(((running / total) * 100).toFixed(2)) : 0,
        }
      }),
      concentration: {
        totalNetRevenue: amount(total, currency),
        // The number an owner actually wants: how exposed am I to a few customers?
        top1Pct: shareOfTop(rows, total, 1),
        top5Pct: shareOfTop(rows, total, 5),
        top10Pct: shareOfTop(rows, total, 10),
        customerCount: rows.length,
      },
    })
  }))

function shareOfTop(rows: any[], total: number, n: number): number | null {
  if (!total) return null
  const top = rows.slice(0, n).reduce((s, r) => s + Number(r.net_revenue ?? 0), 0)
  return Number(((top / total) * 100).toFixed(2))
}

// ─────────────────────────────────────────────────────────────────────────────
// R-04 — GST / BAS summary, reconcilable to the invoice register (RP-04, TX-04)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/gst-summary', requireAuth, requireBilling,
  handler('billing-reports gst-summary', async (req, res) => {
    const { from, to } = period(req)

    const [byCode, credits, register] = await Promise.all([
      pool.query(
        `SELECT il.taxability, il.tax_code, il.tax_rate, i.currency,
                SUM(il.line_subtotal - il.discount_amount) AS taxable_base,
                SUM(il.tax_amount)                         AS gst,
                COUNT(DISTINCT i.id)                       AS invoice_count
           FROM billing_invoice_lines il
           JOIN billing_invoices i ON i.id = il.invoice_id
          WHERE i.tenant_id = $1 AND i.status NOT IN ('draft','void')
            AND i.issue_date BETWEEN $2::date AND $3::date
          GROUP BY il.taxability, il.tax_code, il.tax_rate, i.currency
          ORDER BY il.taxability`,
        [req.tenantId!, from, to]),
      pool.query(
        `SELECT SUM(cn.subtotal) AS base, SUM(cn.tax_total) AS gst, cn.currency
           FROM billing_credit_notes cn
          WHERE cn.tenant_id = $1 AND cn.status = 'issued'
            AND cn.issue_date BETWEEN $2::date AND $3::date
          GROUP BY cn.currency`,
        [req.tenantId!, from, to]),
      pool.query(
        `SELECT COUNT(*) AS invoices,
                COALESCE(SUM(subtotal - discount_total), 0) AS subtotal,
                COALESCE(SUM(tax_total), 0) AS tax_total,
                COALESCE(SUM(total), 0) AS total,
                MIN(currency) AS currency
           FROM billing_invoices
          WHERE tenant_id = $1 AND status NOT IN ('draft','void')
            AND issue_date BETWEEN $2::date AND $3::date`,
        [req.tenantId!, from, to]),
    ])

    const reg = register.rows[0]
    const currency = reg.currency ?? 'AUD'
    const lineGst = byCode.rows.reduce((s, r) => s + Number(r.gst ?? 0), 0)
    const lineBase = byCode.rows.reduce((s, r) => s + Number(r.taxable_base ?? 0), 0)
    const creditGst = Number(credits.rows[0]?.gst ?? 0)
    const creditBase = Number(credits.rows[0]?.base ?? 0)

    const { rows: taxSettings } = await pool.query(
      `SELECT is_registered, abn, standard_rate FROM billing_tax_settings
        WHERE tenant_id = $1 ORDER BY effective_from DESC LIMIT 1`,
      [req.tenantId!],
    )

    return ok(res, {
      period: { from, to },
      registration: {
        isRegistered: taxSettings[0]?.is_registered ?? true,
        abn: taxSettings[0]?.abn ?? null,
        standardRate: taxSettings[0]?.standard_rate ?? '10.0000',
      },
      byTreatment: byCode.rows.map(r => ({
        taxability: r.taxability,
        taxCode: r.tax_code ?? '—',
        taxRate: Number(r.tax_rate),
        invoiceCount: Number(r.invoice_count),
        taxableBase: amount(r.taxable_base, r.currency),
        gst: amount(r.gst, r.currency),
      })),
      creditNotes: {
        base: amount(creditBase, currency),
        gst: amount(creditGst, currency),
      },
      summary: {
        salesExGst: amount(lineBase - creditBase, currency),
        gstOnSales: amount(lineGst - creditGst, currency),
        salesIncGst: amount(lineBase - creditBase + lineGst - creditGst, currency),
      },
      // TX-04 / RP-04: the report must reconcile to the invoice register, and
      // the variance is shown rather than assumed to be zero.
      reconciliation: {
        invoiceRegister: {
          invoices: Number(reg.invoices),
          subtotal: amount(reg.subtotal, currency),
          taxTotal: amount(reg.tax_total, currency),
          total: amount(reg.total, currency),
        },
        lineLevel: {
          subtotal: amount(lineBase, currency),
          taxTotal: amount(lineGst, currency),
        },
        subtotalVariance: amount(lineBase - Number(reg.subtotal), currency),
        taxVariance: amount(lineGst - Number(reg.tax_total), currency),
        agrees: Math.abs(lineBase - Number(reg.subtotal)) < 0.005
             && Math.abs(lineGst - Number(reg.tax_total)) < 0.005,
      },
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// R-05 — storage revenue & dwell: the leakage metric (RP-05, TF-06)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/storage-dwell', requireAuth, requireBilling,
  handler('billing-reports storage-dwell', async (req, res) => {
    const { from, to } = period(req)

    const { rows } = await pool.query(
      `SELECT cl.booking_id, b.reference_number, b.company_name, b.load_type,
              b.storage_start_date, cl.currency,
              SUM(cl.chargeable_quantity)  AS billed_units,
              SUM(cl.line_total)           AS billed_revenue,
              MAX((cl.working -> 'freeAllowance' ->> 'granted')::numeric)  AS free_granted,
              MAX((cl.working -> 'freeAllowance' ->> 'consumed')::numeric) AS free_consumed,
              MAX((cl.working -> 'formula' ->> 'result')::numeric)         AS measure,
              -- Value the free days at the tariff rate from the frozen snapshot,
              -- not at a line's unit_price: an accrual line's price is per unit
              -- of that night's measure, and using it would misvalue the
              -- give-away by the size of the consignment.
              MAX((cl.rate_snapshot ->> 'unitRate')::numeric)              AS tariff_rate,
              MAX(cl.unit_price)           AS unit_price
         FROM billing_charge_lines cl
         JOIN bookings b ON b.id = cl.booking_id
        WHERE cl.tenant_id = $1
          AND cl.line_kind IN ('storage','demurrage')
          AND cl.created_at::date BETWEEN $2::date AND $3::date
        GROUP BY cl.booking_id, b.reference_number, b.company_name, b.load_type,
                 b.storage_start_date, cl.currency
        ORDER BY billed_revenue DESC`,
      [req.tenantId!, from, to],
    )

    const currency = rows[0]?.currency ?? 'AUD'
    let storedUnits = 0
    let billedUnits = 0
    let givenAwayUnits = 0
    let givenAwayValue = 0

    const detail = rows.map(r => {
      const billed = Number(r.billed_units ?? 0)
      const freeConsumed = Number(r.free_consumed ?? 0)
      const measure = Number(r.measure ?? 1) || 1
      const rate = Number(r.tariff_rate ?? 0) || Number(r.unit_price ?? 0)
      // Free days are real units that were stored and not charged — that is the
      // leakage the FRS wants quantified, not a rounding artefact.
      const givenAway = freeConsumed * measure
      const givenAwayAmount = givenAway * rate

      storedUnits += billed + givenAway
      billedUnits += billed
      givenAwayUnits += givenAway
      givenAwayValue += givenAwayAmount

      return {
        bookingId: r.booking_id,
        reference: r.reference_number,
        customer: r.company_name,
        loadType: r.load_type,
        storageStartDate: r.storage_start_date ? isoDate(r.storage_start_date) : null,
        unitsStored: Number((billed + givenAway).toFixed(4)),
        unitsBilled: Number(billed.toFixed(4)),
        unitsGivenAway: Number(givenAway.toFixed(4)),
        freeDaysGranted: Number(r.free_granted ?? 0),
        freeDaysConsumed: freeConsumed,
        billedRevenue: amount(r.billed_revenue, r.currency),
        givenAwayValue: amount(givenAwayAmount, r.currency),
      }
    })

    return ok(res, {
      period: { from, to },
      rows: detail,
      totals: {
        cbmDaysStored: Number(storedUnits.toFixed(2)),
        cbmDaysBilled: Number(billedUnits.toFixed(2)),
        cbmDaysGivenAway: Number(givenAwayUnits.toFixed(2)),
        billedRevenue: amount(rows.reduce((s, r) => s + Number(r.billed_revenue ?? 0), 0), currency),
        // The single number this report exists to produce.
        revenueGivenAway: amount(givenAwayValue, currency),
        givenAwayPct: storedUnits
          ? Number(((givenAwayUnits / storedUnits) * 100).toFixed(1)) : 0,
      },
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// R-07 — every concession, with actor and reason (RP-07)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/concessions', requireAuth, requireBilling,
  handler('billing-reports concessions', async (req, res) => {
    const { from, to } = period(req)
    const { rows } = await pool.query(
      `SELECT c.*, b.reference_number, a.legal_name
         FROM billing_concessions c
         LEFT JOIN bookings b ON b.id = c.booking_id
         LEFT JOIN billing_charge_lines cl ON cl.id = c.charge_line_id
         LEFT JOIN billing_accounts a ON a.id = cl.account_id
        WHERE c.tenant_id = $1
          AND COALESCE(c.occurred_at::date, CURRENT_DATE) BETWEEN $2::date AND $3::date
        ORDER BY c.given_away DESC NULLS LAST`,
      [req.tenantId!, from, to],
    )

    const currency = rows[0]?.currency ?? 'AUD'
    const byReason = new Map<string, { count: number; value: number }>()
    const byActor = new Map<string, { count: number; value: number }>()
    for (const r of rows) {
      const value = Number(r.given_away ?? 0)
      const reason = r.reason_code ?? 'unspecified'
      const actor = r.actor_name ?? 'system'
      const rEntry = byReason.get(reason) ?? { count: 0, value: 0 }
      byReason.set(reason, { count: rEntry.count + 1, value: rEntry.value + value })
      const aEntry = byActor.get(actor) ?? { count: 0, value: 0 }
      byActor.set(actor, { count: aEntry.count + 1, value: aEntry.value + value })
    }

    return ok(res, {
      period: { from, to },
      rows: rows.map(r => ({
        chargeLineId: r.charge_line_id,
        bookingReference: r.reference_number,
        accountName: r.legal_name,
        description: r.description,
        status: r.status,
        originalTotal: r.original_total == null ? null : amount(r.original_total, r.currency),
        newTotal: amount(r.new_total, r.currency),
        givenAway: amount(r.given_away, r.currency),
        reasonCode: r.reason_code,
        reasonNote: r.reason_note,
        actor: r.actor_name,
        // S-10: a concession above the threshold with no approver is a finding.
        approver: r.approver_name,
        unapproved: Number(r.given_away ?? 0) > 0 && !r.approver_name,
        at: r.occurred_at,
      })),
      totals: {
        concessions: rows.length,
        totalGivenAway: amount(rows.reduce((s, r) => s + Number(r.given_away ?? 0), 0), currency),
        unapprovedCount: rows.filter(r => Number(r.given_away ?? 0) > 0 && !r.approver_name).length,
      },
      byReason: [...byReason.entries()]
        .map(([reason, v]) => ({ reason, count: v.count, value: amount(v.value, currency) }))
        .sort((a, b) => Number(b.value.amount) - Number(a.value.amount)),
      byActor: [...byActor.entries()]
        .map(([actor, v]) => ({ actor, count: v.count, value: amount(v.value, currency) }))
        .sort((a, b) => Number(b.value.amount) - Number(a.value.amount)),
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// R-08 — billing exception report (RP-08): the same dataset as B-02, standalone
// ─────────────────────────────────────────────────────────────────────────────

router.get('/exceptions', requireAuth, requireBilling,
  handler('billing-reports exceptions', async (req, res) => {
    const tenantId = req.tenantId!
    const [unrated, zeroValue, negative, unmapped, unbilledStorage, staleEstimates, unallocated] =
      await Promise.all([
        pool.query(
          `SELECT b.id, b.reference_number, b.completed_at
             FROM bookings b
            WHERE b.tenant_id = $1 AND b.status = 'completed'
              AND NOT EXISTS (SELECT 1 FROM billing_charge_lines cl WHERE cl.booking_id = b.id)
            ORDER BY b.completed_at DESC LIMIT 100`,
          [tenantId]),
        pool.query(
          `SELECT booking_id, reference_number, unbilled_total
             FROM billing_unbilled_charges
            WHERE tenant_id = $1 AND unbilled_total = 0 LIMIT 100`,
          [tenantId]),
        pool.query(
          `SELECT booking_id, reference_number, unbilled_total
             FROM billing_unbilled_charges
            WHERE tenant_id = $1 AND unbilled_total < 0 LIMIT 100`,
          [tenantId]),
        pool.query(
          `SELECT ci.id, ci.code, ci.customer_name,
                  (SELECT COUNT(*) FROM billing_charge_lines cl WHERE cl.item_id = ci.id) AS lines
             FROM billing_catalogue_items ci
            WHERE ci.tenant_id = $1 AND ci.status = 'active' AND ci.gl_account_code IS NULL`,
          [tenantId]),
        pool.query(
          `SELECT b.id, b.reference_number, b.storage_start_date,
                  (CURRENT_DATE - b.storage_start_date) AS days_on_site,
                  (SELECT MAX(cl.accrual_date) FROM billing_charge_lines cl
                    WHERE cl.booking_id = b.id AND cl.line_kind = 'storage') AS last_accrual
             FROM bookings b
            WHERE b.tenant_id = $1 AND b.storage_start_date IS NOT NULL
              AND b.status NOT IN ('cancelled','completed')
              AND (SELECT MAX(cl.accrual_date) FROM billing_charge_lines cl
                    WHERE cl.booking_id = b.id AND cl.line_kind = 'storage')
                  IS DISTINCT FROM CURRENT_DATE - 1
            ORDER BY days_on_site DESC LIMIT 100`,
          [tenantId]),
        pool.query(
          `SELECT cl.booking_id, b.reference_number, SUM(cl.line_total) AS total, MIN(cl.currency) AS currency
             FROM billing_charge_lines cl JOIN bookings b ON b.id = cl.booking_id
            WHERE cl.tenant_id = $1 AND cl.status = 'estimated'
              AND b.status = 'completed' AND cl.invoice_id IS NULL
            GROUP BY cl.booking_id, b.reference_number LIMIT 100`,
          [tenantId]),
        pool.query(
          `SELECT id, receipt_number, unallocated_amount, currency, received_date
             FROM billing_receipts
            WHERE tenant_id = $1 AND unallocated_amount > 0 AND status <> 'reversed'
            ORDER BY received_date LIMIT 100`,
          [tenantId]),
      ])

    return ok(res, {
      exceptions: [
        {
          code: 'unrated_completed_booking',
          severity: 'high',
          label: 'Completed booking with no charges',
          explanation: 'These bookings are finished but were never rated, so nothing will ever be invoiced for them.',
          remedy: 'rate_booking',
          count: unrated.rows.length,
          rows: unrated.rows.map(r => ({
            bookingId: r.id, reference: r.reference_number, completedAt: r.completed_at,
          })),
        },
        {
          code: 'unbilled_storage',
          severity: 'high',
          label: 'Storage not accrued to yesterday',
          explanation: 'Cargo is on site but the nightly accrual has not produced a storage charge for it. Every day this persists is revenue lost.',
          remedy: 'accrual_catchup',
          count: unbilledStorage.rows.length,
          rows: unbilledStorage.rows.map(r => ({
            bookingId: r.id, reference: r.reference_number,
            daysOnSite: Number(r.days_on_site ?? 0),
            lastAccrual: r.last_accrual ? isoDate(r.last_accrual) : null,
          })),
        },
        {
          code: 'unmapped_item',
          severity: 'high',
          label: 'Service with no revenue account',
          explanation: 'These services have no GL account, so any invoice containing them is blocked from syncing to the ledger and must never post to a default.',
          remedy: 'map_account',
          count: unmapped.rows.length,
          rows: unmapped.rows.map(r => ({
            itemId: r.id, itemCode: r.code, itemName: r.customer_name,
            chargeLines: Number(r.lines),
          })),
        },
        {
          code: 'negative_total',
          severity: 'high',
          label: 'Negative unbilled total',
          explanation: 'Credits exceed charges on these bookings. An invoice cannot be negative.',
          remedy: 'review_charges',
          count: negative.rows.length,
          rows: negative.rows,
        },
        {
          code: 'stale_estimate',
          severity: 'medium',
          label: 'Completed booking still holding estimates',
          explanation: 'The booking is complete but its charges were never re-rated to actuals, so the invoice would bill an estimate.',
          remedy: 'rerate_booking',
          count: staleEstimates.rows.length,
          rows: staleEstimates.rows.map(r => ({
            bookingId: r.booking_id, reference: r.reference_number,
            total: amount(r.total, r.currency ?? 'AUD'),
          })),
        },
        {
          code: 'unallocated_receipt',
          severity: 'medium',
          label: 'Receipt not fully allocated',
          explanation: 'Money has been received but is not applied to an invoice, so those invoices still show as owing.',
          remedy: 'allocate_receipt',
          count: unallocated.rows.length,
          rows: unallocated.rows.map(r => ({
            receiptId: r.id, receiptNumber: r.receipt_number,
            unallocated: amount(r.unallocated_amount, r.currency),
            receivedDate: isoDate(r.received_date),
          })),
        },
        {
          code: 'zero_value',
          severity: 'low',
          label: 'Zero-value unbilled booking',
          explanation: 'Nothing to invoice — usually a fully waived booking, occasionally a rating gap.',
          remedy: 'review_charges',
          count: zeroValue.rows.length,
          rows: zeroValue.rows,
        },
      ].filter(e => e.count > 0),
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// R-09 — payment mix & settlement timing (RP-09)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/payment-mix', requireAuth, requireBilling,
  handler('billing-reports payment-mix', async (req, res) => {
    const { from, to } = period(req)
    const [byMethod, byAccount] = await Promise.all([
      pool.query(
        `SELECT r.method, r.currency,
                COUNT(*) AS receipt_count,
                SUM(r.amount) AS total,
                SUM(r.surcharge_amount) AS surcharges,
                ROUND(AVG(EXTRACT(EPOCH FROM (al.created_at - i.issue_date::timestamptz)) / 86400)) AS avg_days_to_pay
           FROM billing_receipts r
           LEFT JOIN billing_allocations al ON al.receipt_id = r.id AND NOT al.reversed
           LEFT JOIN billing_invoices i ON i.id = al.invoice_id
          WHERE r.tenant_id = $1 AND r.status <> 'reversed'
            AND r.received_date BETWEEN $2::date AND $3::date
          GROUP BY r.method, r.currency
          ORDER BY total DESC`,
        [req.tenantId!, from, to]),
      pool.query(
        `SELECT a.account_code, a.legal_name, a.payment_terms_days, i.currency,
                COUNT(al.id) AS payments,
                ROUND(AVG(EXTRACT(EPOCH FROM (al.created_at - i.issue_date::timestamptz)) / 86400)) AS avg_days_to_pay,
                COUNT(*) FILTER (WHERE al.created_at::date > i.due_date) AS late_payments,
                SUM(al.amount) AS total
           FROM billing_allocations al
           JOIN billing_invoices i ON i.id = al.invoice_id
           JOIN billing_accounts a ON a.id = i.account_id
          WHERE i.tenant_id = $1 AND NOT al.reversed
            AND al.created_at::date BETWEEN $2::date AND $3::date
          GROUP BY a.id, a.account_code, a.legal_name, a.payment_terms_days, i.currency
          ORDER BY avg_days_to_pay DESC NULLS LAST`,
        [req.tenantId!, from, to]),
    ])

    const currency = byMethod.rows[0]?.currency ?? 'AUD'
    const grand = byMethod.rows.reduce((s, r) => s + Number(r.total), 0)

    return ok(res, {
      period: { from, to },
      byMethod: byMethod.rows.map(r => ({
        method: r.method,
        receiptCount: Number(r.receipt_count),
        total: amount(r.total, r.currency),
        surcharges: amount(r.surcharges, r.currency),
        sharePct: grand ? Number(((Number(r.total) / grand) * 100).toFixed(1)) : 0,
        avgDaysToPay: r.avg_days_to_pay == null ? null : Number(r.avg_days_to_pay),
      })),
      byAccount: byAccount.rows.map(r => ({
        accountCode: r.account_code,
        accountName: r.legal_name,
        termsDays: r.payment_terms_days,
        payments: Number(r.payments),
        total: amount(r.total, r.currency),
        avgDaysToPay: r.avg_days_to_pay == null ? null : Number(r.avg_days_to_pay),
        latePayments: Number(r.late_payments),
        // The comparison that matters: behaviour against the agreed terms.
        daysOverTerms: r.avg_days_to_pay == null ? null
          : Number(r.avg_days_to_pay) - Number(r.payment_terms_days),
      })),
      totals: { received: amount(grand, currency) },
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// N-01 — revenue dashboard (AN-01)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/dashboard', requireAuth, requireBilling,
  handler('billing-reports dashboard', async (req, res) => {
    const tenantId = req.tenantId!
    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString().slice(0, 10)
    const quarterStart = new Date(Date.UTC(
      now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1)).toISOString().slice(0, 10)
    // Australian financial year, since the module is GST/BAS-shaped.
    const fyStart = new Date(Date.UTC(
      now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1, 6, 1))
      .toISOString().slice(0, 10)
    const today = now.toISOString().slice(0, 10)

    const revenueFor = async (from: string, to: string) => {
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(subtotal - discount_total), 0) AS net,
                COALESCE(SUM(total), 0) AS gross,
                COUNT(*) AS invoices,
                MIN(currency) AS currency
           FROM billing_invoices
          WHERE tenant_id = $1 AND status NOT IN ('draft','void')
            AND issue_date BETWEEN $2::date AND $3::date`,
        [tenantId, from, to],
      )
      return rows[0]
    }

    const priorYear = (d: string) => {
      const dt = new Date(`${d}T00:00:00Z`)
      dt.setUTCFullYear(dt.getUTCFullYear() - 1)
      return dt.toISOString().slice(0, 10)
    }

    const [mtd, qtd, ytd, mtdPrior, qtdPrior, ytdPrior, receivables, unbilled, bySite] =
      await Promise.all([
        revenueFor(monthStart, today),
        revenueFor(quarterStart, today),
        revenueFor(fyStart, today),
        revenueFor(priorYear(monthStart), priorYear(today)),
        revenueFor(priorYear(quarterStart), priorYear(today)),
        revenueFor(priorYear(fyStart), priorYear(today)),
        pool.query(
          `SELECT COALESCE(SUM(balance_due), 0) AS outstanding,
                  COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE), 0) AS overdue,
                  COUNT(*) FILTER (WHERE balance_due > 0) AS open_invoices,
                  MIN(currency) AS currency
             FROM billing_invoices
            WHERE tenant_id = $1 AND balance_due > 0
              AND status IN ('issued','part_paid','overdue','disputed','part_credited')`,
          [tenantId]),
        pool.query(
          `SELECT COALESCE(SUM(unbilled_total), 0) AS unbilled, COUNT(*) AS bookings,
                  MIN(currency) AS currency
             FROM billing_unbilled_charges WHERE tenant_id = $1`,
          [tenantId]),
        pool.query(
          `SELECT ci.category, SUM(il.line_subtotal - il.discount_amount) AS net, i.currency
             FROM billing_invoice_lines il
             JOIN billing_invoices i ON i.id = il.invoice_id
             LEFT JOIN billing_charge_lines cl ON cl.id = il.charge_line_id
             LEFT JOIN billing_catalogue_items ci ON ci.id = cl.item_id
            WHERE i.tenant_id = $1 AND i.status NOT IN ('draft','void')
              AND i.issue_date >= $2::date
            GROUP BY ci.category, i.currency ORDER BY net DESC`,
          [tenantId, fyStart]),
      ])

    const currency = mtd.currency ?? receivables.rows[0]?.currency ?? 'AUD'
    const compare = (current: any, prior: any) => {
      const c = Number(current.net)
      const p = Number(prior.net)
      return {
        netRevenue: amount(c, currency),
        grossRevenue: amount(current.gross, currency),
        invoices: Number(current.invoices),
        priorYear: amount(p, currency),
        changePct: p === 0 ? null : Number((((c - p) / p) * 100).toFixed(1)),
      }
    }

    const rec = receivables.rows[0]
    return ok(res, {
      asOf: today,
      periods: {
        mtd: { from: monthStart, to: today, ...compare(mtd, mtdPrior) },
        qtd: { from: quarterStart, to: today, ...compare(qtd, qtdPrior) },
        ytd: { from: fyStart, to: today, ...compare(ytd, ytdPrior) },
      },
      receivables: {
        outstanding: amount(rec.outstanding, currency),
        overdue: amount(rec.overdue, currency),
        openInvoices: Number(rec.open_invoices),
        overduePct: Number(rec.outstanding) > 0
          ? Number(((Number(rec.overdue) / Number(rec.outstanding)) * 100).toFixed(1)) : 0,
      },
      unbilled: {
        value: amount(unbilled.rows[0].unbilled, currency),
        bookings: Number(unbilled.rows[0].bookings),
      },
      byCategory: bySite.rows.map(r => ({
        category: r.category ?? 'unmapped',
        netRevenue: amount(r.net, r.currency ?? currency),
      })),
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// N-03 — revenue leakage console (AN-03, F11)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/leakage', requireAuth, requireBilling,
  handler('billing-reports leakage', async (req, res) => {
    const tenantId = req.tenantId!

    const [uncharged, belowTariff, unbilledStorage, unapprovedDiscounts] = await Promise.all([
      // A mandatory service that attaches to a booking's shape but produced no
      // charge line — the service was delivered and never billed.
      pool.query(
        `SELECT b.id AS booking_id, b.reference_number, b.slot_date,
                ci.id AS item_id, ci.code, ci.customer_name,
                rl.unit_rate, rc.currency
           FROM bookings b
           JOIN billing_applicability_rules ar
             ON ar.tenant_id = b.tenant_id AND ar.active AND ar.attach_mode = 'mandatory'
            AND (ar.service_type IS NULL OR ar.service_type = b.service_type)
            AND (ar.load_type    IS NULL OR ar.load_type    = b.load_type)
           JOIN billing_catalogue_items ci ON ci.id = ar.item_id AND ci.status = 'active'
           LEFT JOIN billing_rate_cards rc
             ON rc.tenant_id = b.tenant_id AND rc.status = 'active' AND rc.is_site_default
           LEFT JOIN billing_rate_lines rl
             ON rl.rate_card_id = rc.id AND rl.item_id = ci.id
          WHERE b.tenant_id = $1
            AND b.status IN ('completed','checked_in')
            AND EXISTS (SELECT 1 FROM billing_charge_lines cl WHERE cl.booking_id = b.id)
            AND NOT EXISTS (
              SELECT 1 FROM billing_charge_lines cl
               WHERE cl.booking_id = b.id AND cl.item_id = ci.id)
          ORDER BY b.slot_date DESC LIMIT 100`,
        [tenantId]),
      // A charge line priced below the rate its own snapshot says it should be.
      pool.query(
        `SELECT cl.id, cl.booking_id, b.reference_number, cl.description,
                cl.unit_price, cl.chargeable_quantity, cl.line_subtotal, cl.currency,
                (cl.rate_snapshot ->> 'unitRate') AS snapshot_rate,
                cl.status, cl.reason_code
           FROM billing_charge_lines cl
           JOIN bookings b ON b.id = cl.booking_id
          WHERE cl.tenant_id = $1
            AND cl.rate_snapshot ->> 'rateType' = 'per_unit'
            AND (cl.rate_snapshot ->> 'unitRate') IS NOT NULL
            AND cl.unit_price < (cl.rate_snapshot ->> 'unitRate')::numeric - 0.0001
            AND cl.status NOT IN ('waived','adjusted','credited')
          ORDER BY (((cl.rate_snapshot ->> 'unitRate')::numeric - cl.unit_price)
                     * cl.chargeable_quantity) DESC
          LIMIT 100`,
        [tenantId]),
      pool.query(
        `SELECT b.id AS booking_id, b.reference_number, b.storage_start_date,
                (CURRENT_DATE - b.storage_start_date) AS days_on_site,
                (SELECT MAX(cl.accrual_date) FROM billing_charge_lines cl
                  WHERE cl.booking_id = b.id AND cl.line_kind = 'storage') AS last_accrual,
                (SELECT COUNT(*) FROM billing_charge_lines cl
                  WHERE cl.booking_id = b.id AND cl.line_kind = 'storage') AS accrual_count
           FROM bookings b
          WHERE b.tenant_id = $1 AND b.storage_start_date IS NOT NULL
            AND b.status NOT IN ('cancelled')
            AND (CURRENT_DATE - b.storage_start_date) > 0
          ORDER BY days_on_site DESC LIMIT 100`,
        [tenantId]),
      pool.query(
        `SELECT c.charge_line_id, c.booking_id, b.reference_number, c.description,
                c.given_away, c.currency, c.reason_code, c.actor_name, c.occurred_at
           FROM billing_concessions c
           LEFT JOIN bookings b ON b.id = c.booking_id
          WHERE c.tenant_id = $1 AND c.approver_name IS NULL AND c.given_away > 0
          ORDER BY c.given_away DESC LIMIT 100`,
        [tenantId]),
    ])

    const currency = 'AUD'
    const sumBelow = belowTariff.rows.reduce((s, r) =>
      s + (Number(r.snapshot_rate) - Number(r.unit_price)) * Number(r.chargeable_quantity), 0)
    const sumUncharged = uncharged.rows.reduce((s, r) => s + Number(r.unit_rate ?? 0), 0)
    const sumUnapproved = unapprovedDiscounts.rows.reduce((s, r) => s + Number(r.given_away), 0)

    const staleStorage = unbilledStorage.rows.filter(r => {
      const days = Number(r.days_on_site ?? 0)
      const accruals = Number(r.accrual_count ?? 0)
      return days > accruals + 1
    })

    return ok(res, {
      // F11: each category drills through and carries a one-click remedy.
      categories: [
        {
          code: 'uncharged_service',
          label: 'Uncharged service',
          explanation: 'A service that attaches to every booking of this shape produced no charge line here.',
          remedy: 'add_manual_charge',
          remedyScreen: 'O-03',
          estimatedValue: amount(sumUncharged, currency),
          count: uncharged.rows.length,
          rows: uncharged.rows.map(r => ({
            bookingId: r.booking_id,
            reference: r.reference_number,
            slotDate: r.slot_date ? isoDate(r.slot_date) : null,
            itemId: r.item_id,
            itemCode: r.code,
            itemName: r.customer_name,
            expectedRate: r.unit_rate == null ? null : amount(r.unit_rate, r.currency ?? currency),
            // AN-11: the derivation is displayable before any dollar moves.
            derivation: `"${r.customer_name}" is configured as a mandatory charge for ${r.code} bookings of this service/load type, but no charge line exists on booking ${r.reference_number}.`,
          })),
        },
        {
          code: 'below_tariff',
          label: 'Charged below tariff',
          explanation: 'The line was priced below the rate its own frozen snapshot specifies, with no adjustment or waiver recorded.',
          remedy: 'adjust_charge',
          remedyScreen: 'O-04',
          estimatedValue: amount(sumBelow, currency),
          count: belowTariff.rows.length,
          rows: belowTariff.rows.map(r => {
            const shortfall = (Number(r.snapshot_rate) - Number(r.unit_price)) * Number(r.chargeable_quantity)
            return {
              chargeLineId: r.id,
              bookingId: r.booking_id,
              reference: r.reference_number,
              description: r.description,
              chargedRate: amount(r.unit_price, r.currency),
              tariffRate: amount(r.snapshot_rate, r.currency),
              quantity: Number(r.chargeable_quantity),
              shortfall: amount(shortfall, r.currency),
              derivation: `Charged at ${Number(r.unit_price).toFixed(4)} against a snapshot rate of ${Number(r.snapshot_rate).toFixed(4)} over ${Number(r.chargeable_quantity)} units, and the line carries no adjustment or waiver reason.`,
            }
          }),
        },
        {
          code: 'unbilled_storage',
          label: 'Unbilled storage days',
          explanation: 'Cargo has been on site longer than the number of storage accruals recorded against it.',
          remedy: 'accrual_catchup',
          remedyScreen: 'Y-01',
          estimatedValue: null,
          count: staleStorage.length,
          rows: staleStorage.map(r => ({
            bookingId: r.booking_id,
            reference: r.reference_number,
            storageStartDate: r.storage_start_date ? isoDate(r.storage_start_date) : null,
            daysOnSite: Number(r.days_on_site ?? 0),
            accrualsRecorded: Number(r.accrual_count ?? 0),
            lastAccrual: r.last_accrual ? isoDate(r.last_accrual) : null,
            derivation: `${Number(r.days_on_site)} days on site but only ${Number(r.accrual_count)} storage accrual(s) recorded.`,
          })),
        },
        {
          code: 'unapproved_discount',
          label: 'Unapproved concession',
          explanation: 'Value was given away without a named approver against it.',
          remedy: 'route_to_approver',
          remedyScreen: 'S-10',
          estimatedValue: amount(sumUnapproved, currency),
          count: unapprovedDiscounts.rows.length,
          rows: unapprovedDiscounts.rows.map(r => ({
            chargeLineId: r.charge_line_id,
            bookingId: r.booking_id,
            reference: r.reference_number,
            description: r.description,
            givenAway: amount(r.given_away, r.currency),
            reasonCode: r.reason_code,
            actor: r.actor_name,
            at: r.occurred_at,
            derivation: `${r.actor_name ?? 'A user'} reduced this line by ${Number(r.given_away).toFixed(2)} ${r.currency} with reason "${r.reason_code}" and no approver recorded.`,
          })),
        },
      ].filter(c => c.count > 0),
      totalEstimatedLeakage: amount(sumUncharged + sumBelow + sumUnapproved, currency),
      // AN-11: nothing here writes a charge. Every remedy routes to a human screen.
      provenanceNote: 'These figures are derived from charge lines, rating snapshots and applicability rules. No amount here has been charged. Each remedy opens the screen where a person makes the decision.',
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// B-11 — financial audit log (TX-06, TX-07, NFR-B-04)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/audit-log', requireAuth, requireBilling,
  handler('billing-reports audit-log', async (req, res) => {
    const params: unknown[] = [req.tenantId!]
    const where = ['al.tenant_id = $1']
    if (req.query.entityType && req.query.entityType !== 'all') {
      params.push(String(req.query.entityType).split(','))
      where.push(`al.entity_type = ANY($${params.length}::text[])`)
    }
    if (req.query.action && req.query.action !== 'all') {
      params.push(String(req.query.action).split(','))
      where.push(`al.action = ANY($${params.length}::text[])`)
    }
    if (req.query.entityId) { params.push(req.query.entityId); where.push(`al.entity_id = $${params.length}`) }
    if (req.query.actorId)  { params.push(req.query.actorId);  where.push(`al.actor_id = $${params.length}`) }
    if (req.query.from) { params.push(req.query.from); where.push(`al.created_at >= $${params.length}::date`) }
    if (req.query.to)   { params.push(req.query.to);   where.push(`al.created_at < ($${params.length}::date + 1)`) }

    const limit = Math.min(Number(req.query.limit ?? 200), 2000)
    const { rows } = await pool.query(
      `SELECT al.*, u.name AS actor_name, u.email AS actor_email
         FROM billing_audit_log al
         LEFT JOIN app_users u ON u.id = al.actor_id
        WHERE ${where.join(' AND ')}
        ORDER BY al.created_at DESC, al.id DESC
        LIMIT ${limit}`,
      params,
    )

    return ok(res, {
      // RP-12: the export itself is gated, and the UI is told before it offers it.
      canExport: !!req.billingCaps?.can_export,
      appendOnly: true,
      retentionYears: 7,
      entries: rows.map(r => ({
        id: String(r.id),
        entityType: r.entity_type,
        entityId: r.entity_id,
        action: r.action,
        before: r.before_state,
        after: r.after_state,
        amountDelta: r.amount_delta == null ? null : amount(r.amount_delta, r.currency ?? 'AUD'),
        reasonCode: r.reason_code,
        reasonNote: r.reason_note,
        actor: r.actor_name ?? r.actor_label,
        actorEmail: r.actor_email,
        actorIp: r.actor_ip,
        at: r.created_at,
      })),
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// Y-02 — financial integrity check (NFR-B-08)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/integrity', requireAuth, requireBilling,
  handler('billing-reports integrity', async (req, res) => {
    const tenantId = req.tenantId!

    const checks = await Promise.all([
      // Do an invoice's own lines add up to its header totals?
      pool.query(
        `SELECT i.id, i.invoice_number, i.subtotal, i.tax_total, i.total, i.currency,
                COALESCE(SUM(il.line_subtotal), 0) AS line_subtotal,
                COALESCE(SUM(il.tax_amount), 0)    AS line_tax,
                COALESCE(SUM(il.line_total), 0)    AS line_total
           FROM billing_invoices i
           LEFT JOIN billing_invoice_lines il ON il.invoice_id = i.id
          WHERE i.tenant_id = $1 AND i.status NOT IN ('draft','void')
          GROUP BY i.id
         HAVING ABS(i.total - COALESCE(SUM(il.line_total), 0)) > 0.005
             OR ABS(i.tax_total - COALESCE(SUM(il.tax_amount), 0)) > 0.005
          LIMIT 100`,
        [tenantId]),
      // Does an invoice's paid amount match its live allocations?
      pool.query(
        `SELECT i.id, i.invoice_number, i.amount_paid, i.currency,
                COALESCE(SUM(al.amount), 0) AS allocated
           FROM billing_invoices i
           LEFT JOIN billing_allocations al ON al.invoice_id = i.id AND NOT al.reversed
          WHERE i.tenant_id = $1
          GROUP BY i.id
         HAVING ABS(i.amount_paid - COALESCE(SUM(al.amount), 0)) > 0.005
          LIMIT 100`,
        [tenantId]),
      // Does a receipt's allocated figure match its allocations?
      pool.query(
        `SELECT r.id, r.receipt_number, r.amount, r.allocated_amount,
                r.unallocated_amount, r.currency,
                COALESCE(SUM(al.amount), 0) AS allocated
           FROM billing_receipts r
           LEFT JOIN billing_allocations al ON al.receipt_id = r.id AND NOT al.reversed
          WHERE r.tenant_id = $1 AND r.status <> 'reversed'
          GROUP BY r.id
         HAVING ABS(r.allocated_amount - COALESCE(SUM(al.amount), 0)) > 0.005
             OR ABS(r.amount - r.allocated_amount - r.unallocated_amount) > 0.005
          LIMIT 100`,
        [tenantId]),
      // Is balance_due consistent with the components it is derived from?
      pool.query(
        `SELECT id, invoice_number, total, amount_paid, amount_credited,
                amount_written_off, balance_due, currency
           FROM billing_invoices
          WHERE tenant_id = $1
            AND ABS(balance_due - (total - amount_paid - amount_credited - amount_written_off)) > 0.005
          LIMIT 100`,
        [tenantId]),
    ])

    const [linesVsHeader, invoiceVsAllocations, receiptVsAllocations, balanceDerivation] = checks
    const result = [
      {
        name: 'lines_vs_invoice_total',
        label: 'Invoice line totals agree with the invoice header',
        passed: linesVsHeader.rows.length === 0,
        failures: linesVsHeader.rows.length,
        rows: linesVsHeader.rows,
      },
      {
        name: 'invoice_vs_receivable',
        label: 'Invoice paid amounts agree with their allocations',
        passed: invoiceVsAllocations.rows.length === 0,
        failures: invoiceVsAllocations.rows.length,
        rows: invoiceVsAllocations.rows,
      },
      {
        name: 'allocation_vs_receipt',
        label: 'Receipt allocated/unallocated figures agree with their allocations',
        passed: receiptVsAllocations.rows.length === 0,
        failures: receiptVsAllocations.rows.length,
        rows: receiptVsAllocations.rows,
      },
      {
        name: 'balance_derivation',
        label: 'Invoice balances equal total less payments, credits and write-offs',
        passed: balanceDerivation.rows.length === 0,
        failures: balanceDerivation.rows.length,
        rows: balanceDerivation.rows,
      },
    ]

    // Record the run so Y-02 has a history and can alert before tenant impact.
    for (const c of result) {
      await pool.query(
        `INSERT INTO billing_integrity_checks
           (tenant_id, check_name, passed, variance, detail)
         VALUES ($1,$2,$3,$4,$5)`,
        [tenantId, c.name, c.passed, c.failures, JSON.stringify({ failures: c.failures })],
      ).catch(() => { /* recording the check must not fail the check */ })
    }

    return ok(res, {
      checkedAt: new Date().toISOString(),
      allPassed: result.every(c => c.passed),
      checks: result,
    })
  }))

export default router
