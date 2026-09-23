/**
 * Invoices — step 5 of the chain, plus corrections (F5, F6).
 *
 *   GET   /api/billing/invoices/workbench        B-01 the unbilled queue      IN-01
 *   POST  /api/billing/invoices/preflight        B-02 nothing issues blind    IN-13
 *   POST  /api/billing/invoices/run              B-03 execute a cycle         IN-02
 *   GET   /api/billing/invoices                  B-05 invoice list            IN-11
 *   POST  /api/billing/invoices                  create a draft from charges
 *   GET   /api/billing/invoices/:id              B-06 the document of record
 *   POST  /api/billing/invoices/:id/issue        draft → issued               IN-03/04
 *   PATCH /api/billing/invoices/:id              refuses once issued          IN-06
 *   POST  /api/billing/invoices/:id/credit-note  B-08 the only correction     IN-06
 *   POST  /api/billing/invoices/:id/deliver      IN-09 delivery state
 *   POST  /api/billing/invoices/:id/dispute      X-09 / A-07 pauses dunning   AR-09
 *   POST  /api/billing/invoices/:id/write-off    A-09                         AR-10
 */

import { Router, Request, Response } from 'express'
import { PoolClient } from 'pg'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import {
  allocateDocumentNumber, approvalRequirement, audit, isoDate, recalcInvoice,
  recordInvoiceEvent,
} from '../lib/billingRepo'
import { formatMoney, money } from '../lib/money'
import {
  badRequest, created, handler, notFound, ok, refuse, requireBilling, requireCapability,
} from '../lib/billingHttp'
import { randomBytes } from 'crypto'

const router = Router()

function amount(value: unknown, currency: string) {
  const n = Number(value ?? 0)
  return { amount: n.toFixed(2), currency, display: formatMoney(money(n.toFixed(2), currency)) }
}

const PAYMENT_TERM_DAYS: Record<string, number> = {
  net_7: 7, net_14: 14, net_30: 30, eom: 0,
}

function dueDateFor(issueDate: string, terms: string, days: number): string {
  const d = new Date(`${issueDate}T00:00:00Z`)
  if (terms === 'eom') {
    // End of the month following the issue month.
    const eom = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0))
    return eom.toISOString().slice(0, 10)
  }
  const n = PAYMENT_TERM_DAYS[terms] ?? days ?? 30
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────────────────
// B-01 — the unbilled queue
// ─────────────────────────────────────────────────────────────────────────────

router.get('/workbench', requireAuth, requireBilling,
  handler('billing-invoices workbench', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM billing_unbilled_charges
        WHERE tenant_id = $1
        ORDER BY oldest_line_at ASC`,
      [req.tenantId!],
    )

    const today = new Date()
    return ok(res, {
      rows: rows.map(r => {
        const currency = r.currency ?? 'AUD'
        const oldest = r.oldest_line_at ? new Date(r.oldest_line_at) : null
        const ageDays = oldest
          ? Math.floor((today.getTime() - oldest.getTime()) / 86_400_000) : 0
        return {
          bookingId: r.booking_id,
          reference: r.reference_number,
          bookingStatus: r.booking_status,
          completedAt: r.completed_at,
          slotDate: r.slot_date ? isoDate(r.slot_date) : null,
          accountId: r.account_id,
          accountCode: r.account_code,
          accountName: r.account_name ?? 'Guest / no account',
          invoiceCycle: r.invoice_cycle ?? 'per_booking',
          lineCount: Number(r.line_count),
          unbilledTotal: amount(r.unbilled_total, currency),
          ageDays,
          // Exceptions surfaced inline rather than discovered at issue time (B-01).
          exceptions: [
            ...(r.has_estimates ? ['Charges are still estimates — the booking has not been finalised.'] : []),
            ...(Number(r.unbilled_total) === 0 ? ['Zero-value: nothing to invoice.'] : []),
            ...(Number(r.unbilled_total) < 0 ? ['Negative total: credits exceed charges.'] : []),
            ...(!r.account_id ? ['No billing account — this bills as a guest / prepaid booking.'] : []),
          ],
        }
      }),
      totals: {
        bookings: rows.length,
        value: amount(rows.reduce((s, r) => s + Number(r.unbilled_total), 0), rows[0]?.currency ?? 'AUD'),
      },
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// B-02 — pre-flight. Every case either blocks or must be acknowledged (IN-13).
// ─────────────────────────────────────────────────────────────────────────────

interface PreflightCase {
  code: string
  severity: 'block' | 'acknowledge'
  label: string
  explanation: string
  bookingIds: string[]
  count: number
}

async function buildPreflight(
  db: PoolClient | typeof pool,
  tenantId: string,
  scope: { accountIds?: string[]; periodStart?: string; periodEnd?: string; cycle?: string },
): Promise<{ cases: PreflightCase[]; candidates: any[] }> {
  const params: unknown[] = [tenantId]
  const where = ['cl.tenant_id = $1', 'cl.invoice_id IS NULL',
                 `cl.status IN ('estimated','actual','adjusted')`]

  if (scope.accountIds?.length) {
    params.push(scope.accountIds)
    where.push(`cl.account_id = ANY($${params.length}::uuid[])`)
  }
  if (scope.periodStart) { params.push(scope.periodStart); where.push(`b.slot_date >= $${params.length}::date`) }
  if (scope.periodEnd)   { params.push(scope.periodEnd);   where.push(`b.slot_date <= $${params.length}::date`) }
  if (scope.cycle && scope.cycle !== 'all') {
    params.push(scope.cycle)
    where.push(`COALESCE(a.invoice_cycle, 'per_booking') = $${params.length}`)
  }

  const { rows: candidates } = await db.query(
    `SELECT cl.booking_id, cl.account_id, cl.currency,
            b.reference_number, b.status AS booking_status, b.storage_start_date,
            a.legal_name AS account_name, a.invoice_cycle,
            a.payment_terms, a.payment_terms_days, a.credit_hold,
            COUNT(cl.id)                                  AS line_count,
            SUM(cl.line_total)                            AS total,
            BOOL_OR(cl.status = 'estimated')              AS has_estimates,
            BOOL_OR(ci.gl_account_code IS NULL)           AS has_unmapped_item,
            BOOL_OR(cl.line_kind = 'storage')             AS has_storage
       FROM billing_charge_lines cl
       JOIN bookings b ON b.id = cl.booking_id
       LEFT JOIN billing_accounts a ON a.id = cl.account_id
       LEFT JOIN billing_catalogue_items ci ON ci.id = cl.item_id
      WHERE ${where.join(' AND ')}
      GROUP BY cl.booking_id, cl.account_id, cl.currency, b.reference_number,
               b.status, b.storage_start_date, a.legal_name, a.invoice_cycle,
               a.payment_terms, a.payment_terms_days, a.credit_hold
      ORDER BY a.legal_name NULLS LAST, b.reference_number`,
    params,
  )

  const cases: PreflightCase[] = []
  const pushCase = (
    code: string, severity: PreflightCase['severity'], label: string,
    explanation: string, matches: any[],
  ) => {
    if (!matches.length) return
    cases.push({
      code, severity, label, explanation,
      bookingIds: matches.map(m => m.booking_id),
      count: matches.length,
    })
  }

  // The five pre-flight cases the FRS names (IN-13, RP-08, IG-04).
  pushCase('no_charge', 'block', 'Completed booking with no charge lines',
    'These bookings are billable but carry no charges. Rate them before invoicing.',
    [])  // populated below from a separate query

  pushCase('zero_value', 'acknowledge', 'Zero-value invoice',
    'A zero-value invoice is legitimate for a fully waived booking, but it is rarely intended. Acknowledge to issue it anyway.',
    candidates.filter(c => Number(c.total) === 0))

  pushCase('negative_total', 'block', 'Negative invoice total',
    'Credits exceed charges. An invoice cannot be negative — raise a credit note against the original invoice instead.',
    candidates.filter(c => Number(c.total) < 0))

  pushCase('unbilled_storage', 'acknowledge', 'Cargo still on site with accruing storage',
    'Storage is still accruing on these bookings. Invoicing now bills only what has accrued so far.',
    candidates.filter(c => c.has_storage && c.storage_start_date && c.booking_status !== 'completed'))

  pushCase('unmapped_item', 'block', 'Service not mapped to a revenue account',
    'These bookings include a service with no GL account. The invoice would not sync to the ledger, and it must never post to a default account.',
    candidates.filter(c => c.has_unmapped_item))

  pushCase('estimates_only', 'acknowledge', 'Charges are still estimates',
    'These bookings have not been finalised, so the charges are estimates rather than actuals.',
    candidates.filter(c => c.has_estimates))

  pushCase('no_account', 'acknowledge', 'No billing account',
    'These bookings have no account to invoice. They are prepaid/guest bookings and are normally settled at checkout.',
    candidates.filter(c => !c.account_id))

  pushCase('credit_hold', 'acknowledge', 'Account is on credit hold',
    'Invoicing an account on credit hold is allowed, but collections will not chase it until the hold is lifted.',
    candidates.filter(c => c.credit_hold))

  // Bookings that are billable but were never rated at all.
  const { rows: unrated } = await db.query(
    `SELECT b.id AS booking_id, b.reference_number
       FROM bookings b
      WHERE b.tenant_id = $1
        AND b.status = 'completed'
        AND NOT EXISTS (SELECT 1 FROM billing_charge_lines cl WHERE cl.booking_id = b.id)
      ORDER BY b.completed_at DESC NULLS LAST
      LIMIT 200`,
    [tenantId],
  )
  const noChargeCase = cases.find(c => c.code === 'no_charge')
  if (unrated.length) {
    if (noChargeCase) {
      noChargeCase.bookingIds = unrated.map(r => r.booking_id)
      noChargeCase.count = unrated.length
    } else {
      cases.unshift({
        code: 'no_charge', severity: 'block',
        label: 'Completed booking with no charge lines',
        explanation: 'These bookings are billable but carry no charges. Rate them before invoicing.',
        bookingIds: unrated.map(r => r.booking_id), count: unrated.length,
      })
    }
  }

  return { cases: cases.filter(c => c.count > 0), candidates }
}

router.post('/preflight', requireAuth, requireBilling, requireCapability('can_run_billing'),
  handler('billing-invoices preflight', async (req, res) => {
    const tenantId = req.tenantId!
    const scope = req.body?.scope ?? {}
    const { cases, candidates } = await buildPreflight(pool, tenantId, scope)

    const blocked = cases.filter(c => c.severity === 'block')
    const currency = candidates[0]?.currency ?? 'AUD'

    const { rows } = await pool.query(
      `INSERT INTO billing_runs (tenant_id, scope, status, preflight_report, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        tenantId, JSON.stringify(scope),
        blocked.length ? 'preflight' : 'ready',
        JSON.stringify({ cases, candidateCount: candidates.length }),
        req.user!.id,
      ],
    )

    return ok(res, {
      runId: rows[0].id,
      status: blocked.length ? 'preflight' : 'ready',
      canProceed: blocked.length === 0,
      cases,
      summary: {
        bookings: candidates.length,
        accounts: new Set(candidates.map(c => c.account_id).filter(Boolean)).size,
        value: amount(candidates.reduce((s, c) => s + Number(c.total), 0), currency),
        blockingCases: blocked.length,
        acknowledgeableCases: cases.length - blocked.length,
      },
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// B-03 — execute the run
// ─────────────────────────────────────────────────────────────────────────────

router.post('/run', requireAuth, requireBilling, requireCapability('can_run_billing'),
  handler('billing-invoices run', async (req, res) => {
    const tenantId = req.tenantId!
    const { runId, acknowledgedCases = [], issue = false } = req.body ?? {}
    if (!runId) return badRequest(res, 'runId is required — run the pre-flight first.')

    const { rows: runRows } = await pool.query(
      `SELECT * FROM billing_runs WHERE id = $1 AND tenant_id = $2`,
      [runId, tenantId],
    )
    if (!runRows.length) return notFound(res, 'Billing run')
    const run = runRows[0]
    if (run.status === 'completed' || run.status === 'completed_with_errors') {
      return refuse(res, 'This billing run has already been executed.')
    }

    const scope = run.scope ?? {}
    const { cases, candidates } = await buildPreflight(pool, tenantId, scope)

    // A blocking case cannot be acknowledged away — that is the point of the
    // distinction (IN-13).
    const stillBlocked = cases.filter(c => c.severity === 'block')
    if (stillBlocked.length) {
      return refuse(res, `Cannot proceed: ${stillBlocked.map(c => c.label).join('; ')}.`)
    }
    const unacknowledged = cases.filter(
      c => c.severity === 'acknowledge' && !acknowledgedCases.includes(c.code),
    )
    if (unacknowledged.length) {
      return refuse(
        res,
        `These cases must be acknowledged before the run proceeds: ${unacknowledged.map(c => c.label).join('; ')}.`,
      )
    }

    // Group by account and cycle. per_booking → one invoice per booking;
    // anything else consolidates the period onto one invoice (IN-02, B-04).
    const groups = new Map<string, any[]>()
    for (const c of candidates) {
      if (Number(c.total) <= 0) continue
      if (!c.account_id) continue      // guest bookings settle at checkout, not on an invoice
      const cycle = c.invoice_cycle ?? 'per_booking'
      const key = cycle === 'per_booking'
        ? `${c.account_id}:booking:${c.booking_id}`
        : `${c.account_id}:${cycle}`
      const list = groups.get(key) ?? []
      list.push(c)
      groups.set(key, list)
    }

    const client = await pool.connect()
    const outcomes: Array<{ ok: boolean; accountName: string; invoiceNumber?: string; invoiceId?: string; total?: any; error?: string }> = []

    try {
      await client.query(`UPDATE billing_runs SET status = 'running', started_at = NOW(), acknowledged_by = $2 WHERE id = $1`,
        [runId, req.user!.id])

      for (const [, bookings] of groups) {
        // Each invoice is its own transaction: one failure must not lose the
        // rest of the run, and the run must be re-drivable (IN-13).
        try {
          await client.query('BEGIN')
          const invoice = await createInvoiceFromBookings(client, {
            tenantId,
            accountId: bookings[0].account_id,
            bookingIds: bookings.map(b => b.booking_id),
            periodStart: scope.periodStart ?? null,
            periodEnd: scope.periodEnd ?? null,
            actorId: req.user!.id,
            actorName: req.user!.name,
          })
          if (issue) {
            await issueInvoice(client, invoice.id, tenantId, req.user!.id, req.user!.name)
          }
          await client.query('COMMIT')
          const { rows } = await pool.query(
            `SELECT invoice_number, total, currency FROM billing_invoices WHERE id = $1`,
            [invoice.id],
          )
          outcomes.push({
            ok: true,
            accountName: bookings[0].account_name,
            invoiceId: invoice.id,
            invoiceNumber: rows[0]?.invoice_number ?? null,
            total: amount(rows[0]?.total, rows[0]?.currency ?? 'AUD'),
          })
        } catch (err: any) {
          await client.query('ROLLBACK')
          outcomes.push({ ok: false, accountName: bookings[0].account_name, error: err.message })
        }
      }

      const failed = outcomes.filter(o => !o.ok).length
      await client.query(
        `UPDATE billing_runs
            SET status = $2, invoices_created = $3, invoices_failed = $4,
                result = $5, finished_at = NOW()
          WHERE id = $1`,
        [
          runId,
          failed ? 'completed_with_errors' : 'completed',
          outcomes.length - failed, failed, JSON.stringify(outcomes),
        ],
      )

      await audit(pool, {
        tenantId, entityType: 'invoice', entityId: runId, action: 'issue',
        after: { created: outcomes.length - failed, failed },
        actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
      })

      return ok(res, {
        runId,
        status: failed ? 'completed_with_errors' : 'completed',
        created: outcomes.length - failed,
        failed,
        outcomes,
      })
    } finally {
      client.release()
    }
  }))

// ─────────────────────────────────────────────────────────────────────────────
// Draft creation — shared by the run and the single-invoice path
// ─────────────────────────────────────────────────────────────────────────────

async function createInvoiceFromBookings(
  client: PoolClient,
  opts: {
    tenantId: string
    accountId: string
    bookingIds: string[]
    periodStart?: string | null
    periodEnd?: string | null
    actorId: string
    actorName: string
    docType?: 'invoice' | 'proforma'
  },
): Promise<{ id: string }> {
  const { rows: accountRows } = await client.query(
    `SELECT * FROM billing_accounts WHERE id = $1 AND tenant_id = $2`,
    [opts.accountId, opts.tenantId],
  )
  if (!accountRows.length) throw new Error('Billing account not found')
  const account = accountRows[0]

  const { rows: tenantRows } = await client.query(
    `SELECT name, address FROM tenants WHERE id = $1`, [opts.tenantId],
  )
  const { rows: taxRows } = await client.query(
    `SELECT is_registered, abn FROM billing_tax_settings
      WHERE tenant_id = $1 ORDER BY effective_from DESC LIMIT 1`,
    [opts.tenantId],
  )
  const isRegistered = taxRows[0]?.is_registered ?? true

  const { rows: lines } = await client.query(
    `SELECT cl.*, ci.gl_account_code, ci.tax_code, ci.taxability
       FROM billing_charge_lines cl
       LEFT JOIN billing_catalogue_items ci ON ci.id = cl.item_id
      WHERE cl.booking_id = ANY($1::uuid[])
        AND cl.invoice_id IS NULL
        AND cl.status IN ('estimated','actual','adjusted')
      ORDER BY cl.booking_id, cl.line_kind, cl.created_at`,
    [opts.bookingIds],
  )
  if (!lines.length) throw new Error('No un-invoiced charge lines for these bookings')

  const currency = lines[0].currency ?? account.currency ?? 'AUD'
  const subtotal = lines.reduce((s, l) => s + Number(l.line_subtotal), 0)
  const discountTotal = lines.reduce((s, l) => s + Number(l.discount_amount), 0)
  const taxTotal = lines.reduce((s, l) => s + Number(l.tax_amount), 0)
  const total = lines.reduce((s, l) => s + Number(l.line_total), 0)

  if (total < 0) throw new Error('Invoice total would be negative — raise a credit note instead')

  const { rows: invoiceRows } = await client.query(
    `INSERT INTO billing_invoices (
       tenant_id, account_id, booking_id, doc_type, status,
       period_start, period_end, currency,
       subtotal, discount_total, tax_total, total,
       is_tax_invoice, supplier_abn, supplier_name,
       bill_to_name, bill_to_address, terms_text, created_by
     ) VALUES (
       $1,$2,$3,$4,'draft',
       $5,$6,$7,
       $8,$9,$10,$11,
       $12,$13,$14,
       $15,$16,$17,$18
     ) RETURNING id`,
    [
      opts.tenantId, opts.accountId,
      opts.bookingIds.length === 1 ? opts.bookingIds[0] : null,
      opts.docType ?? 'invoice',
      opts.periodStart, opts.periodEnd, currency,
      subtotal.toFixed(2), discountTotal.toFixed(2), taxTotal.toFixed(2), total.toFixed(2),
      // TX-03: a tenant that is not GST-registered does not issue a "Tax Invoice".
      isRegistered, taxRows[0]?.abn ?? null, tenantRows[0]?.name ?? null,
      account.trading_name || account.legal_name, account.billing_address,
      `Payment terms: ${String(account.payment_terms ?? 'net_30').replace('_', ' ').toUpperCase()}`,
      opts.actorId,
    ],
  )
  const invoiceId = invoiceRows[0].id

  // Materialise the lines onto the document, then bind the charge lines to it.
  let lineNo = 1
  for (const l of lines) {
    await client.query(
      `INSERT INTO billing_invoice_lines (
         invoice_id, charge_line_id, booking_id, line_no, description,
         unit_of_measure, quantity, unit_price, line_subtotal, discount_amount,
         tax_rate, tax_amount, line_total, taxability, gl_account_code, tax_code, working
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        invoiceId, l.id, l.booking_id, lineNo++, l.description,
        l.unit_of_measure, l.chargeable_quantity, l.unit_price, l.line_subtotal, l.discount_amount,
        l.tax_rate, l.tax_amount, l.line_total, l.taxability ?? 'standard',
        l.gl_account_code, l.tax_code, JSON.stringify(l.working ?? null),
      ],
    )
  }

  await client.query(
    `UPDATE billing_charge_lines
        SET invoice_id = $1, status = 'invoiced', updated_at = NOW()
      WHERE id = ANY($2::uuid[])`,
    [invoiceId, lines.map(l => l.id)],
  )

  await recordInvoiceEvent(client, {
    invoiceId, toStatus: 'draft', eventKind: 'status_change',
    detail: { bookings: opts.bookingIds.length, lines: lines.length, total: total.toFixed(2) },
    actorId: opts.actorId,
  })

  return { id: invoiceId }
}

/** draft → issued: allocate the number, stamp the dates, assert the tax fields. */
async function issueInvoice(
  client: PoolClient,
  invoiceId: string,
  tenantId: string,
  actorId: string,
  actorName: string,
): Promise<{ invoiceNumber: string; dueDate: string }> {
  const { rows } = await client.query(
    `SELECT i.*, a.payment_terms, a.payment_terms_days
       FROM billing_invoices i
       LEFT JOIN billing_accounts a ON a.id = i.account_id
      WHERE i.id = $1 AND i.tenant_id = $2
      FOR UPDATE OF i`,
    [invoiceId, tenantId],
  )
  if (!rows.length) throw new Error('Invoice not found')
  const inv = rows[0]
  if (inv.status !== 'draft') {
    const e: any = new Error(`Invoice is already ${inv.status} and cannot be issued again.`)
    e.hint = 'credit_note'
    throw e
  }
  if (Number(inv.total) < 0) {
    throw new Error('An invoice total cannot be negative — raise a credit note instead.')
  }

  const invoiceNumber = await allocateDocumentNumber(client, tenantId, 'invoice')
  const issueDate = new Date().toISOString().slice(0, 10)
  const dueDate = dueDateFor(issueDate, inv.payment_terms ?? 'net_30', inv.payment_terms_days ?? 30)
  // PY-02: the remittance reference is what makes EFT auto-matching work, so it
  // is derived from the invoice number rather than chosen by a human.
  const remittanceRef = invoiceNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase()
  const payToken = randomBytes(24).toString('base64url')

  await client.query(
    `UPDATE billing_invoices
        SET status = 'issued', invoice_number = $2, issue_date = $3::date, due_date = $4::date,
            remittance_ref = $5, pay_link_token = $6, issued_by = $7,
            delivery_state = 'queued', dunning_step = 0,
            dunning_next_at = ($4::date - INTERVAL '3 days')
      WHERE id = $1`,
    [invoiceId, invoiceNumber, issueDate, dueDate, remittanceRef, payToken, actorId],
  )

  await recordInvoiceEvent(client, {
    invoiceId, fromStatus: 'draft', toStatus: 'issued',
    detail: { invoiceNumber, issueDate, dueDate, remittanceRef },
    actorId,
  })
  await audit(client, {
    tenantId, entityType: 'invoice', entityId: invoiceId, action: 'issue',
    after: { invoiceNumber, issueDate, dueDate },
    amountDelta: inv.total, currency: inv.currency,
    actorId, actorLabel: actorName,
  })

  return { invoiceNumber, dueDate }
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-invoice creation and issue
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, requireBilling, requireCapability('can_issue_invoice'),
  handler('billing-invoices create', async (req, res) => {
    const tenantId = req.tenantId!
    const { accountId, bookingIds, periodStart, periodEnd, docType, issue } = req.body ?? {}
    if (!accountId) return badRequest(res, 'accountId is required')
    if (!Array.isArray(bookingIds) || !bookingIds.length) {
      return badRequest(res, 'bookingIds must be a non-empty array')
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const invoice = await createInvoiceFromBookings(client, {
        tenantId, accountId, bookingIds,
        periodStart: periodStart ?? null, periodEnd: periodEnd ?? null,
        actorId: req.user!.id, actorName: req.user!.name,
        docType: docType === 'proforma' ? 'proforma' : 'invoice',
      })
      let issued: { invoiceNumber: string; dueDate: string } | null = null
      if (issue) {
        issued = await issueInvoice(client, invoice.id, tenantId, req.user!.id, req.user!.name)
      }
      await client.query('COMMIT')
      return created(res, { id: invoice.id, ...(issued ?? {}) })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

router.post('/:id/issue', requireAuth, requireBilling, requireCapability('can_issue_invoice'),
  handler('billing-invoices issue', async (req, res) => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await issueInvoice(
        client, req.params.id, req.tenantId!, req.user!.id, req.user!.name,
      )
      await client.query('COMMIT')
      return ok(res, result)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

/** IN-06 — editing an issued invoice is refused and the alternative offered. */
router.patch('/:id', requireAuth, requireBilling,
  handler('billing-invoices patch', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT status, invoice_number FROM billing_invoices WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId!],
    )
    if (!rows.length) return notFound(res, 'Invoice')
    if (rows[0].status !== 'draft') {
      return refuse(
        res,
        `Invoice ${rows[0].invoice_number} has been issued and cannot be edited. Raise a credit note instead.`,
        'credit_note',
      )
    }

    const allowed = ['notes', 'terms_text', 'bill_to_name', 'bill_to_address', 'period_start', 'period_end']
    const sets: string[] = []
    const params: unknown[] = []
    for (const field of allowed) {
      if (req.body?.[field] !== undefined) {
        params.push(req.body[field])
        sets.push(`${field} = $${params.length}`)
      }
    }
    if (!sets.length) return badRequest(res, 'No editable fields supplied')
    params.push(req.params.id)
    const { rows: updated } = await pool.query(
      `UPDATE billing_invoices SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    )
    return ok(res, updated[0])
  }))

// ─────────────────────────────────────────────────────────────────────────────
// B-05 — invoice list
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, requireBilling, handler('billing-invoices list', async (req, res) => {
  const tenantId = req.tenantId!
  const params: unknown[] = [tenantId]
  const where = ['i.tenant_id = $1']

  if (req.query.status && req.query.status !== 'all') {
    params.push(String(req.query.status).split(','))
    where.push(`i.status = ANY($${params.length}::text[])`)
  }
  if (req.query.accountId) { params.push(req.query.accountId); where.push(`i.account_id = $${params.length}`) }
  if (req.query.from) { params.push(req.query.from); where.push(`i.issue_date >= $${params.length}::date`) }
  if (req.query.to)   { params.push(req.query.to);   where.push(`i.issue_date <= $${params.length}::date`) }
  if (req.query.search) {
    params.push(`%${req.query.search}%`)
    where.push(`(i.invoice_number ILIKE $${params.length} OR a.legal_name ILIKE $${params.length})`)
  }

  const limit = Math.min(Number(req.query.limit ?? 100), 500)
  const { rows } = await pool.query(
    `SELECT i.*, a.account_code, a.legal_name AS account_name,
            (SELECT COUNT(*) FROM billing_disputes d
              WHERE d.invoice_id = i.id AND d.status IN ('raised','under_review')) AS open_disputes
       FROM billing_invoices i
       LEFT JOIN billing_accounts a ON a.id = i.account_id
      WHERE ${where.join(' AND ')}
      ORDER BY i.issue_date DESC NULLS FIRST, i.created_at DESC
      LIMIT ${limit}`,
    params,
  )

  return ok(res, rows.map(r => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    docType: r.doc_type,
    status: r.status,
    accountId: r.account_id,
    accountCode: r.account_code,
    accountName: r.account_name,
    issueDate: r.issue_date ? isoDate(r.issue_date) : null,
    dueDate: r.due_date ? isoDate(r.due_date) : null,
    daysOverdue: r.due_date && Number(r.balance_due) > 0
      ? Math.max(0, Math.floor((Date.now() - new Date(r.due_date).getTime()) / 86_400_000))
      : 0,
    total: amount(r.total, r.currency),
    amountPaid: amount(r.amount_paid, r.currency),
    balanceDue: amount(r.balance_due, r.currency),
    deliveryState: r.delivery_state,
    peppolState: r.peppol_state,
    dunningStep: r.dunning_step,
    dunningPaused: r.dunning_paused,
    openDisputes: Number(r.open_disputes),
  })))
}))

// ─────────────────────────────────────────────────────────────────────────────
// B-06 — the document of record
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:id', requireAuth, requireBilling, handler('billing-invoices detail', async (req, res) => {
  const tenantId = req.tenantId!
  const { rows } = await pool.query(
    `SELECT i.*, a.account_code, a.legal_name, a.trading_name, a.abn AS account_abn,
            a.billing_email, a.payment_terms,
            t.name AS supplier_display_name, t.address AS supplier_address,
            t.eft_bank_name, t.eft_account_name, t.eft_bsb, t.eft_account_number,
            t.compay_client_number
       FROM billing_invoices i
       LEFT JOIN billing_accounts a ON a.id = i.account_id
       LEFT JOIN tenants t ON t.id = i.tenant_id
      WHERE i.id = $1 AND i.tenant_id = $2`,
    [req.params.id, tenantId],
  )
  if (!rows.length) return notFound(res, 'Invoice')
  const inv = rows[0]
  const currency = inv.currency

  const [lines, events, credits, allocations, disputes] = await Promise.all([
    pool.query(
      `SELECT il.*, b.reference_number
         FROM billing_invoice_lines il
         LEFT JOIN bookings b ON b.id = il.booking_id
        WHERE il.invoice_id = $1 ORDER BY il.line_no`,
      [req.params.id]),
    pool.query(
      `SELECT e.*, u.name AS actor_name FROM billing_invoice_events e
         LEFT JOIN app_users u ON u.id = e.actor_id
        WHERE e.invoice_id = $1 ORDER BY e.created_at DESC`,
      [req.params.id]),
    pool.query(
      `SELECT * FROM billing_credit_notes WHERE invoice_id = $1 ORDER BY created_at DESC`,
      [req.params.id]),
    pool.query(
      `SELECT al.*, r.receipt_number, r.method, r.received_date
         FROM billing_allocations al
         JOIN billing_receipts r ON r.id = al.receipt_id
        WHERE al.invoice_id = $1 AND NOT al.reversed
        ORDER BY al.created_at DESC`,
      [req.params.id]),
    pool.query(
      `SELECT * FROM billing_disputes WHERE invoice_id = $1 ORDER BY created_at DESC`,
      [req.params.id]),
  ])

  return ok(res, {
    id: inv.id,
    invoiceNumber: inv.invoice_number,
    docType: inv.doc_type,
    status: inv.status,
    // IN-04: the tax-invoice assertions, or the non-registered wording (TX-03).
    documentTitle: inv.doc_type === 'proforma'
      ? 'Proforma Invoice'
      : inv.is_tax_invoice ? 'Tax Invoice' : 'Invoice',
    isTaxInvoice: inv.is_tax_invoice,
    taxNote: inv.is_tax_invoice
      ? 'Total includes GST.'
      : 'No GST has been charged — the supplier is not registered for GST.',
    supplier: {
      name: inv.supplier_name ?? inv.supplier_display_name,
      abn: inv.supplier_abn,
      address: inv.supplier_address,
    },
    billTo: {
      accountId: inv.account_id,
      accountCode: inv.account_code,
      name: inv.bill_to_name ?? inv.trading_name ?? inv.legal_name,
      abn: inv.account_abn,
      address: inv.bill_to_address,
      email: inv.billing_email,
    },
    issueDate: inv.issue_date ? isoDate(inv.issue_date) : null,
    dueDate: inv.due_date ? isoDate(inv.due_date) : null,
    periodStart: inv.period_start ? isoDate(inv.period_start) : null,
    periodEnd: inv.period_end ? isoDate(inv.period_end) : null,
    paymentTerms: inv.payment_terms,
    remittanceRef: inv.remittance_ref,
    payLinkToken: inv.pay_link_token,
    // PY-03: the rails a payer can actually use, straight off the invoice.
    paymentRails: {
      eft: inv.eft_bsb ? {
        bankName: inv.eft_bank_name, accountName: inv.eft_account_name,
        bsb: inv.eft_bsb, accountNumber: inv.eft_account_number,
        reference: inv.remittance_ref,
      } : null,
      compay: inv.compay_client_number
        ? { billerCode: inv.compay_client_number, reference: inv.remittance_ref }
        : null,
      payLink: inv.pay_link_token ? `/pay/${inv.pay_link_token}` : null,
    },
    lines: lines.rows.map(l => ({
      id: l.id,
      lineNo: l.line_no,
      bookingReference: l.reference_number,
      description: l.description,
      unitOfMeasure: l.unit_of_measure,
      quantity: Number(l.quantity),
      unitPrice: amount(l.unit_price, currency),
      lineSubtotal: amount(l.line_subtotal, currency),
      discountAmount: amount(l.discount_amount, currency),
      taxRate: Number(l.tax_rate),
      taxAmount: amount(l.tax_amount, currency),
      lineTotal: amount(l.line_total, currency),
      taxability: l.taxability,
      glAccountCode: l.gl_account_code,
      working: l.working,        // the working travels with the document (rule 1)
    })),
    totals: {
      subtotal: amount(inv.subtotal, currency),
      discountTotal: amount(inv.discount_total, currency),
      taxTotal: amount(inv.tax_total, currency),
      total: amount(inv.total, currency),
      amountPaid: amount(inv.amount_paid, currency),
      amountCredited: amount(inv.amount_credited, currency),
      amountWrittenOff: amount(inv.amount_written_off, currency),
      balanceDue: amount(inv.balance_due, currency),
    },
    delivery: {
      state: inv.delivery_state,
      deliveredAt: inv.delivered_at,
      peppolState: inv.peppol_state,
      peppolMessageId: inv.peppol_message_id,
    },
    dunning: {
      step: inv.dunning_step,
      nextAt: inv.dunning_next_at,
      paused: inv.dunning_paused,
      pauseReason: inv.dunning_pause_reason,
    },
    // Only legal transitions are offered (§4, IN-11).
    availableActions: availableActions(inv.status, req.billingCaps!),
    history: events.rows.map(e => ({
      id: e.id, fromStatus: e.from_status, toStatus: e.to_status,
      eventKind: e.event_kind, detail: e.detail,
      actor: e.actor_name ?? e.actor_label, at: e.created_at,
    })),
    creditNotes: credits.rows.map(c => ({
      id: c.id, number: c.credit_note_number, status: c.status,
      scope: c.scope, reasonCode: c.reason_code,
      total: amount(c.total, c.currency), issueDate: c.issue_date ? isoDate(c.issue_date) : null,
    })),
    payments: allocations.rows.map(a => ({
      id: a.id, receiptNumber: a.receipt_number, method: a.method,
      receivedDate: a.received_date ? isoDate(a.received_date) : null,
      amount: amount(a.amount, currency),
    })),
    disputes: disputes.rows.map(d => ({
      id: d.id, status: d.status, reasonCode: d.reason_code,
      reasonNote: d.reason_note, raisedBy: d.raised_by_label,
      disputedAmount: d.disputed_amount == null ? null : amount(d.disputed_amount, currency),
      createdAt: d.created_at,
    })),
  })
}))

/**
 * The transition table. An action absent from this list is not merely hidden —
 * the corresponding endpoint refuses it too.
 */
function availableActions(status: string, caps: Record<string, boolean>): string[] {
  const actions: string[] = []
  switch (status) {
    case 'draft':
      if (caps.can_issue_invoice) actions.push('issue', 'edit', 'void')
      break
    case 'issued':
    case 'overdue':
    case 'part_paid':
    case 'part_credited':
      actions.push('deliver', 'record_payment')
      if (caps.can_issue_credit_note) actions.push('credit_note')
      if (caps.can_write_off) actions.push('write_off')
      actions.push('raise_dispute')
      break
    case 'disputed':
      actions.push('resolve_dispute')
      if (caps.can_issue_credit_note) actions.push('credit_note')
      break
    case 'paid':
      if (caps.can_issue_credit_note) actions.push('credit_note')
      if (caps.can_refund) actions.push('refund')
      break
    case 'credited':
    case 'written_off':
    case 'void':
      break
  }
  return actions
}

// ─────────────────────────────────────────────────────────────────────────────
// B-08 — credit note: the only correction path (IN-06, F6)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/credit-note', requireAuth, requireBilling,
  requireCapability('can_issue_credit_note'),
  handler('billing-invoices credit-note', async (req, res) => {
    const tenantId = req.tenantId!
    const { scope, invoiceLineIds, reasonCode, reasonNote, approvedBy, issue = true } = req.body ?? {}

    if (!reasonCode) return badRequest(res, 'A reason code is required for a credit note.')
    if (scope !== 'full' && scope !== 'partial') {
      return badRequest(res, "scope must be 'full' or 'partial'")
    }
    if (scope === 'partial' && (!Array.isArray(invoiceLineIds) || !invoiceLineIds.length)) {
      return badRequest(res, 'Select at least one line to credit.')
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const { rows: invRows } = await client.query(
        `SELECT * FROM billing_invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.id, tenantId],
      )
      if (!invRows.length) { await client.query('ROLLBACK'); return notFound(res, 'Invoice') }
      const inv = invRows[0]

      if (inv.status === 'draft') {
        await client.query('ROLLBACK')
        return refuse(res, 'This invoice is still a draft — edit it directly rather than crediting it.')
      }
      if (inv.status === 'void') {
        await client.query('ROLLBACK')
        return refuse(res, 'A void invoice cannot be credited.')
      }

      const { rows: lines } = await client.query(
        scope === 'full'
          ? `SELECT * FROM billing_invoice_lines WHERE invoice_id = $1 ORDER BY line_no`
          : `SELECT * FROM billing_invoice_lines WHERE invoice_id = $1 AND id = ANY($2::uuid[]) ORDER BY line_no`,
        scope === 'full' ? [req.params.id] : [req.params.id, invoiceLineIds],
      )
      if (!lines.length) { await client.query('ROLLBACK'); return badRequest(res, 'No matching invoice lines') }

      const subtotal = lines.reduce((s, l) => s + Number(l.line_subtotal) - Number(l.discount_amount), 0)
      const taxTotal = lines.reduce((s, l) => s + Number(l.tax_amount), 0)
      const total = subtotal + taxTotal

      // A credit note cannot exceed what is still standing on the invoice.
      const alreadyCredited = Number(inv.amount_credited)
      if (alreadyCredited + total > Number(inv.total) + 0.005) {
        await client.query('ROLLBACK')
        return refuse(
          res,
          `Crediting ${total.toFixed(2)} ${inv.currency} would exceed the invoice total. ${(Number(inv.total) - alreadyCredited).toFixed(2)} ${inv.currency} remains creditable.`,
        )
      }

      // Above the threshold a second approver is required, and self-approval is
      // refused (TX-08, S-10). The database enforces the latter as well.
      const approval = await approvalRequirement(client, tenantId, 'credit_note', total)
      if (approval.required && !approvedBy) {
        await client.query('ROLLBACK')
        return res.status(403).json({
          success: false,
          error: {
            message: `A credit note of ${total.toFixed(2)} ${inv.currency} is at or above the ${approval.threshold.toFixed(2)} ${inv.currency} approval threshold and needs a second approver.`,
            approvalRequired: true,
            threshold: approval.threshold,
            approverRole: approval.approverRole,
          },
        })
      }
      if (approvedBy && approvedBy === req.user!.id && !approval.allowSelfApproval) {
        await client.query('ROLLBACK')
        return refuse(res, 'You cannot approve your own credit note.', undefined, 403)
      }

      const number = issue ? await allocateDocumentNumber(client, tenantId, 'credit_note') : null
      const { rows: cnRows } = await client.query(
        `INSERT INTO billing_credit_notes (
           tenant_id, credit_note_number, invoice_id, account_id, scope,
           reason_code, reason_note, currency, subtotal, tax_total, total,
           status, issue_date, requested_by, approved_by, approved_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
                   CASE WHEN $15::uuid IS NULL THEN NULL ELSE NOW() END)
         RETURNING *`,
        [
          tenantId, number, req.params.id, inv.account_id, scope,
          reasonCode, reasonNote ?? null, inv.currency,
          subtotal.toFixed(2), taxTotal.toFixed(2), total.toFixed(2),
          issue ? 'issued' : 'draft',
          issue ? new Date().toISOString().slice(0, 10) : null,
          req.user!.id, approvedBy ?? null,
        ],
      )
      const creditNote = cnRows[0]

      for (const l of lines) {
        await client.query(
          `INSERT INTO billing_credit_note_lines (
             credit_note_id, invoice_line_id, description, quantity, unit_price,
             line_subtotal, tax_rate, tax_amount, line_total
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            creditNote.id, l.id, l.description, l.quantity, l.unit_price,
            (Number(l.line_subtotal) - Number(l.discount_amount)).toFixed(2),
            l.tax_rate, l.tax_amount, l.line_total,
          ],
        )
      }

      // The underlying charge lines are marked credited — never deleted, so the
      // history stays reconstructable (NFR-B-04).
      await client.query(
        `UPDATE billing_charge_lines SET status = 'credited', updated_at = NOW()
          WHERE id = ANY($1::uuid[])`,
        [lines.map(l => l.charge_line_id).filter(Boolean)],
      )

      const recalced = await recalcInvoice(client, req.params.id, req.user!.id)
      await recordInvoiceEvent(client, {
        invoiceId: req.params.id,
        fromStatus: inv.status,
        toStatus: recalced.status,
        eventKind: 'credit',
        detail: { creditNoteNumber: number, scope, reasonCode, total: total.toFixed(2) },
        actorId: req.user!.id,
      })
      await audit(client, {
        tenantId, entityType: 'credit_note', entityId: creditNote.id, action: 'credit',
        after: creditNote, amountDelta: (-total).toFixed(2), currency: inv.currency,
        reasonCode, reasonNote, actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
      })

      await client.query('COMMIT')
      return created(res, {
        id: creditNote.id,
        creditNoteNumber: number,
        total: amount(total, inv.currency),
        invoiceStatus: recalced.status,
        invoiceBalance: amount(recalced.balanceDue, inv.currency),
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

// ─────────────────────────────────────────────────────────────────────────────
// IN-09 — delivery state. A bounce raises an exception, never "delivered".
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/deliver', requireAuth, requireBilling,
  handler('billing-invoices deliver', async (req, res) => {
    const { state = 'sent', channel = 'email', detail } = req.body ?? {}
    const valid = ['queued', 'sent', 'delivered', 'opened', 'bounced', 'failed']
    if (!valid.includes(state)) return badRequest(res, `state must be one of ${valid.join(', ')}`)

    const { rows } = await pool.query(
      `UPDATE billing_invoices
          SET delivery_state = $2,
              delivered_at = CASE WHEN $2 IN ('delivered','opened') THEN NOW() ELSE delivered_at END
        WHERE id = $1 AND tenant_id = $3 AND status <> 'draft'
        RETURNING id, invoice_number, status, delivery_state`,
      [req.params.id, state, req.tenantId!],
    )
    if (!rows.length) return notFound(res, 'Issued invoice')

    await recordInvoiceEvent(pool, {
      invoiceId: req.params.id,
      toStatus: rows[0].status,
      eventKind: 'delivery',
      detail: { channel, state, detail },
      actorId: req.user!.id,
    })

    return ok(res, {
      ...rows[0],
      // A bounce is an exception for someone to work, not a silent state (IN-09).
      exception: state === 'bounced' || state === 'failed'
        ? `Delivery ${state} — this invoice must not be assumed delivered.`
        : null,
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// AR-09 — disputes pause the dunning ladder
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/dispute', requireAuth, handler('billing-invoices dispute', async (req, res) => {
  const { reasonCode, reasonNote, invoiceLineIds, disputedAmount } = req.body ?? {}
  if (!reasonCode) return badRequest(res, 'A reason is required to raise a dispute.')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: invRows } = await client.query(
      `SELECT * FROM billing_invoices WHERE id = $1`, [req.params.id],
    )
    if (!invRows.length) { await client.query('ROLLBACK'); return notFound(res, 'Invoice') }
    const inv = invRows[0]
    if (inv.status === 'draft') {
      await client.query('ROLLBACK')
      return refuse(res, 'A draft invoice cannot be disputed.')
    }

    const { rows } = await client.query(
      `INSERT INTO billing_disputes (
         tenant_id, invoice_id, account_id, reason_code, reason_note,
         disputed_amount, raised_by_label, raised_by_user
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        inv.tenant_id, req.params.id, inv.account_id, reasonCode, reasonNote ?? null,
        disputedAmount ?? null, req.user?.name ?? 'Customer', req.user?.id ?? null,
      ],
    )
    if (Array.isArray(invoiceLineIds)) {
      for (const lineId of invoiceLineIds) {
        await client.query(
          `INSERT INTO billing_dispute_lines (dispute_id, invoice_line_id)
           VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [rows[0].id, lineId],
        )
      }
    }

    // The ladder pauses immediately — chasing a disputed invoice is the fastest
    // way to lose the customer (AR-09).
    const recalced = await recalcInvoice(client, req.params.id, req.user?.id ?? null)
    await recordInvoiceEvent(client, {
      invoiceId: req.params.id, fromStatus: inv.status, toStatus: recalced.status,
      eventKind: 'dispute',
      detail: { reasonCode, disputedAmount, dunningPaused: true },
      actorId: req.user?.id ?? null,
      actorLabel: req.user?.name ?? 'customer',
    })
    await audit(client, {
      tenantId: inv.tenant_id, entityType: 'dispute', entityId: rows[0].id, action: 'create',
      after: rows[0], reasonCode, reasonNote,
      actorId: req.user?.id ?? null, actorLabel: req.user?.name ?? 'customer', actorIp: req.ip,
    })
    await client.query('COMMIT')

    return created(res, {
      id: rows[0].id,
      invoiceStatus: recalced.status,
      dunningPaused: true,
      confirmation: 'This invoice is now marked as disputed and payment reminders have been paused while it is reviewed.',
    })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}))

// ─────────────────────────────────────────────────────────────────────────────
// A-09 — write-off, with a name on it (AR-10)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/write-off', requireAuth, requireBilling, requireCapability('can_write_off'),
  handler('billing-invoices write-off', async (req, res) => {
    const tenantId = req.tenantId!
    const { amount: requested, reasonCode, reasonNote, approvedBy } = req.body ?? {}
    if (!reasonCode) return badRequest(res, 'A reason code is required for a write-off.')

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: invRows } = await client.query(
        `SELECT * FROM billing_invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.id, tenantId],
      )
      if (!invRows.length) { await client.query('ROLLBACK'); return notFound(res, 'Invoice') }
      const inv = invRows[0]
      if (inv.status === 'draft') {
        await client.query('ROLLBACK')
        return refuse(res, 'A draft invoice cannot be written off — delete or void it instead.')
      }

      const value = requested != null ? Number(requested) : Number(inv.balance_due)
      if (!Number.isFinite(value) || value <= 0) return badRequest(res, 'amount must be positive')
      if (value > Number(inv.balance_due) + 0.005) {
        await client.query('ROLLBACK')
        return refuse(res, `Only ${Number(inv.balance_due).toFixed(2)} ${inv.currency} remains outstanding.`)
      }

      // A write-off always needs a named approver — the seeded threshold is 0.
      const approval = await approvalRequirement(client, tenantId, 'write_off', value)
      if (approval.required && !approvedBy) {
        await client.query('ROLLBACK')
        return res.status(403).json({
          success: false,
          error: {
            message: 'A write-off requires a named approver.',
            approvalRequired: true,
            threshold: approval.threshold,
            approverRole: approval.approverRole,
          },
        })
      }

      const { rows } = await client.query(
        `INSERT INTO billing_write_offs (
           tenant_id, invoice_id, amount, reason_code, reason_note,
           requested_by, approved_by, approved_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $7::uuid IS NULL THEN NULL ELSE NOW() END)
         RETURNING *`,
        [tenantId, req.params.id, value.toFixed(2), reasonCode, reasonNote ?? null,
         req.user!.id, approvedBy ?? null],
      )

      const recalced = await recalcInvoice(client, req.params.id, req.user!.id)
      await audit(client, {
        tenantId, entityType: 'write_off', entityId: rows[0].id, action: 'approve',
        after: rows[0], amountDelta: (-value).toFixed(2), currency: inv.currency,
        reasonCode, reasonNote, actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
      })
      await client.query('COMMIT')

      return created(res, {
        id: rows[0].id,
        amount: amount(value, inv.currency),
        invoiceStatus: recalced.status,
        // The ledger consequence, stated rather than implied (A-09).
        ledgerNote: `This write-off posts ${value.toFixed(2)} ${inv.currency} to bad debt expense and clears the receivable.`,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

export default router
