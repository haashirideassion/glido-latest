/**
 * Customer accounts & credit control (A-01 … A-11, F12).
 *
 *   GET   /api/billing/accounts                  A-01 the account book
 *   POST  /api/billing/accounts                  A-03 onboarding                AR-01
 *   GET   /api/billing/accounts/aged             A-04 aged receivables           AR-05
 *   GET   /api/billing/accounts/collections      A-05 collections worklist       AR-06
 *   GET   /api/billing/accounts/disputes         A-07 dispute queue              AR-09
 *   PATCH /api/billing/accounts/disputes/:id     A-07 resolve
 *   GET   /api/billing/accounts/:id              A-02 one customer, whole picture
 *   PATCH /api/billing/accounts/:id              A-02 terms, limit, hold
 *   POST  /api/billing/accounts/:id/hold         A-10 credit hold                AR-11
 *   POST  /api/billing/accounts/:id/override     A-08 credit limit override      AR-03
 *   PATCH /api/billing/accounts/overrides/:id    A-08 approve / decline
 *   POST  /api/billing/accounts/statements       A-06 statement run              AR-07
 */

import { Router } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import { approvalRequirement, audit, isoDate, recalcInvoice } from '../lib/billingRepo'
import { formatMoney, money } from '../lib/money'
import {
  badRequest, created, handler, notFound, ok, refuse, requireBilling, requireCapability,
} from '../lib/billingHttp'

const router = Router()

function amount(value: unknown, currency: string) {
  const n = Number(value ?? 0)
  return { amount: n.toFixed(2), currency, display: formatMoney(money(n.toFixed(2), currency)) }
}

const TERMS = ['net_7', 'net_14', 'net_30', 'eom', 'custom']

// ─────────────────────────────────────────────────────────────────────────────
// A-01 — the account book
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, requireBilling, handler('billing-accounts list', async (req, res) => {
  const params: unknown[] = [req.tenantId!]
  const where = ['a.tenant_id = $1']
  if (req.query.status && req.query.status !== 'all') {
    params.push(String(req.query.status).split(','))
    where.push(`a.status = ANY($${params.length}::text[])`)
  }
  if (req.query.search) {
    params.push(`%${req.query.search}%`)
    where.push(`(a.account_code ILIKE $${params.length} OR a.legal_name ILIKE $${params.length} OR a.trading_name ILIKE $${params.length} OR a.abn ILIKE $${params.length})`)
  }
  if (req.query.onHold === 'true') where.push('a.credit_hold')

  const { rows } = await pool.query(
    `SELECT a.*, e.exposure, e.pct_of_limit, e.open_invoice_count, e.earliest_due_date,
            rc.name AS rate_card_name,
            -- Days-to-pay: how this account actually behaves, not what its terms say (AR-11).
            (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (al.created_at - i2.issue_date::timestamptz)) / 86400))
               FROM billing_allocations al
               JOIN billing_invoices i2 ON i2.id = al.invoice_id
              WHERE i2.account_id = a.id AND NOT al.reversed) AS avg_days_to_pay,
            (SELECT COUNT(*) FROM billing_invoices i3
              WHERE i3.account_id = a.id AND i3.balance_due > 0
                AND i3.due_date < CURRENT_DATE) AS overdue_count
       FROM billing_accounts a
       LEFT JOIN billing_account_exposure e ON e.account_id = a.id
       LEFT JOIN billing_rate_cards rc ON rc.id = a.rate_card_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.legal_name`,
    params,
  )

  return ok(res, {
    paymentTerms: TERMS,
    accounts: rows.map(r => {
      const currency = r.currency ?? 'AUD'
      const exposure = Number(r.exposure ?? 0)
      const limit = Number(r.credit_limit ?? 0)
      return {
        id: r.id,
        accountCode: r.account_code,
        legalName: r.legal_name,
        tradingName: r.trading_name,
        abn: r.abn,
        billingEmail: r.billing_email,
        status: r.status,
        paymentTerms: r.payment_terms,
        paymentTermsDays: r.payment_terms_days,
        invoiceCycle: r.invoice_cycle,
        creditLimit: amount(limit, currency),
        exposure: amount(exposure, currency),
        headroom: amount(limit - exposure, currency),
        pctOfLimit: r.pct_of_limit == null ? null : Number(r.pct_of_limit),
        // Colour is never the only encoding (rule 8) — a named band travels with the number.
        exposureBand: limit <= 0 ? 'no_limit'
          : exposure >= limit ? 'at_limit'
          : exposure >= limit * 0.8 ? 'near_limit' : 'within_limit',
        creditHold: r.credit_hold,
        creditHoldReason: r.credit_hold_reason,
        openInvoices: Number(r.open_invoice_count ?? 0),
        overdueInvoices: Number(r.overdue_count ?? 0),
        earliestDueDate: r.earliest_due_date ? isoDate(r.earliest_due_date) : null,
        avgDaysToPay: r.avg_days_to_pay == null ? null : Number(r.avg_days_to_pay),
        rateCardId: r.rate_card_id,
        rateCardName: r.rate_card_name,
        // T-07's fallback indicator.
        tariffBasis: r.rate_card_id ? 'assigned card' : 'site default',
      }
    }),
  })
}))

// ─────────────────────────────────────────────────────────────────────────────
// A-04 — aged receivables (must precede /:id)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/aged', requireAuth, requireBilling, handler('billing-accounts aged', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM billing_aged_receivables WHERE tenant_id = $1 ORDER BY total_due DESC`,
    [req.tenantId!],
  )
  const currency = rows[0]?.currency ?? 'AUD'
  const total = (field: string) => rows.reduce((s, r) => s + Number(r[field] ?? 0), 0)

  // The reconciliation total the FRS asks A-04 and A-06 to agree on (AR-07).
  const { rows: control } = await pool.query(
    `SELECT COALESCE(SUM(balance_due), 0) AS ledger_total
       FROM billing_invoices
      WHERE tenant_id = $1 AND balance_due > 0
        AND status IN ('issued','part_paid','overdue','disputed','part_credited')`,
    [req.tenantId!],
  )
  const bucketSum = total('total_due')
  const ledgerTotal = Number(control[0].ledger_total)

  return ok(res, {
    rows: rows.map(r => ({
      accountId: r.account_id,
      accountCode: r.account_code,
      accountName: r.legal_name,
      totalDue: amount(r.total_due, r.currency),
      buckets: {
        current: amount(r.bucket_current, r.currency),
        days1To30: amount(r.bucket_1_30, r.currency),
        days31To60: amount(r.bucket_31_60, r.currency),
        days61To90: amount(r.bucket_61_90, r.currency),
        days90Plus: amount(r.bucket_90_plus, r.currency),
      },
    })),
    totals: {
      totalDue: amount(bucketSum, currency),
      current: amount(total('bucket_current'), currency),
      days1To30: amount(total('bucket_1_30'), currency),
      days31To60: amount(total('bucket_31_60'), currency),
      days61To90: amount(total('bucket_61_90'), currency),
      days90Plus: amount(total('bucket_90_plus'), currency),
    },
    reconciliation: {
      buckets: amount(bucketSum, currency),
      invoiceRegister: amount(ledgerTotal, currency),
      variance: amount(bucketSum - ledgerTotal, currency),
      // NFR-B-08: an integrity failure is surfaced, not swallowed.
      agrees: Math.abs(bucketSum - ledgerTotal) < 0.005,
    },
  })
}))

// ─────────────────────────────────────────────────────────────────────────────
// A-05 — collections worklist
// ─────────────────────────────────────────────────────────────────────────────

router.get('/collections', requireAuth, requireBilling,
  handler('billing-accounts collections', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT i.id, i.invoice_number, i.due_date, i.total, i.balance_due, i.currency,
              i.status, i.dunning_step, i.dunning_next_at, i.dunning_paused,
              i.dunning_pause_reason,
              a.id AS account_id, a.account_code, a.legal_name, a.billing_email,
              a.credit_hold,
              (CURRENT_DATE - i.due_date) AS days_overdue,
              (SELECT dl.promise_to_pay_date FROM billing_dunning_log dl
                WHERE dl.invoice_id = i.id AND dl.promise_to_pay_date IS NOT NULL
                ORDER BY dl.created_at DESC LIMIT 1) AS promise_to_pay_date,
              (SELECT ds.subject FROM billing_dunning_steps ds
                WHERE ds.tenant_id = i.tenant_id AND ds.step_no = i.dunning_step + 1
                  AND ds.active LIMIT 1) AS next_step_subject
         FROM billing_invoices i
         JOIN billing_accounts a ON a.id = i.account_id
        WHERE i.tenant_id = $1
          AND i.balance_due > 0
          AND i.status IN ('issued','part_paid','overdue','disputed','part_credited')
        ORDER BY i.dunning_paused ASC, days_overdue DESC NULLS LAST`,
      [req.tenantId!],
    )

    return ok(res, rows.map(r => ({
      invoiceId: r.id,
      invoiceNumber: r.invoice_number,
      accountId: r.account_id,
      accountCode: r.account_code,
      accountName: r.legal_name,
      billingEmail: r.billing_email,
      dueDate: r.due_date ? isoDate(r.due_date) : null,
      daysOverdue: Math.max(0, Number(r.days_overdue ?? 0)),
      total: amount(r.total, r.currency),
      balanceDue: amount(r.balance_due, r.currency),
      status: r.status,
      dunningStep: r.dunning_step,
      nextActionAt: r.dunning_next_at,
      nextStepSubject: r.next_step_subject,
      // AR-09: a paused ladder always says why it is paused.
      paused: r.dunning_paused,
      pauseReason: r.dunning_pause_reason,
      promiseToPayDate: r.promise_to_pay_date ? isoDate(r.promise_to_pay_date) : null,
      creditHold: r.credit_hold,
    })))
  }))

/** Record a manual escalation or a promise to pay (A-05). */
router.post('/collections/:invoiceId/note', requireAuth, requireBilling,
  handler('billing-accounts collections note', async (req, res) => {
    const { promiseToPayDate, detail, escalate } = req.body ?? {}
    const { rows: inv } = await pool.query(
      `SELECT tenant_id, dunning_step FROM billing_invoices WHERE id = $1 AND tenant_id = $2`,
      [req.params.invoiceId, req.tenantId!],
    )
    if (!inv.length) return notFound(res, 'Invoice')

    const step = escalate ? Number(inv[0].dunning_step) + 1 : Number(inv[0].dunning_step)
    await pool.query(
      `INSERT INTO billing_dunning_log
         (tenant_id, invoice_id, step_no, channel, outcome, detail, promise_to_pay_date, actor_id)
       VALUES ($1,$2,$3,'manual',$4,$5,$6,$7)
       ON CONFLICT (invoice_id, step_no) DO UPDATE
         SET detail = EXCLUDED.detail,
             promise_to_pay_date = EXCLUDED.promise_to_pay_date,
             outcome = EXCLUDED.outcome`,
      [
        req.tenantId!, req.params.invoiceId, step,
        escalate ? 'sent' : 'skipped', detail ?? null,
        promiseToPayDate ?? null, req.user!.id,
      ],
    )
    if (escalate) {
      await pool.query(
        `UPDATE billing_invoices SET dunning_step = $2 WHERE id = $1`,
        [req.params.invoiceId, step],
      )
    }
    return ok(res, { dunningStep: step, promiseToPayDate: promiseToPayDate ?? null })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// A-07 — dispute queue
// ─────────────────────────────────────────────────────────────────────────────

router.get('/disputes', requireAuth, requireBilling,
  handler('billing-accounts disputes', async (req, res) => {
    const params: unknown[] = [req.tenantId!]
    const where = ['d.tenant_id = $1']
    if (req.query.status && req.query.status !== 'all') {
      params.push(String(req.query.status).split(','))
      where.push(`d.status = ANY($${params.length}::text[])`)
    }

    const { rows } = await pool.query(
      `SELECT d.*, i.invoice_number, i.total, i.balance_due, i.currency, i.status AS invoice_status,
              a.account_code, a.legal_name, u.name AS resolved_by_name,
              COALESCE((SELECT json_agg(json_build_object(
                          'id', il.id, 'lineNo', il.line_no, 'description', il.description,
                          'lineTotal', il.line_total, 'working', il.working))
                 FROM billing_dispute_lines dln
                 JOIN billing_invoice_lines il ON il.id = dln.invoice_line_id
                WHERE dln.dispute_id = d.id), '[]'::json) AS lines
         FROM billing_disputes d
         JOIN billing_invoices i ON i.id = d.invoice_id
         LEFT JOIN billing_accounts a ON a.id = d.account_id
         LEFT JOIN app_users u ON u.id = d.resolved_by
        WHERE ${where.join(' AND ')}
        ORDER BY d.status, d.created_at DESC`,
      params,
    )

    return ok(res, rows.map(r => ({
      id: r.id,
      invoiceId: r.invoice_id,
      invoiceNumber: r.invoice_number,
      invoiceStatus: r.invoice_status,
      accountCode: r.account_code,
      accountName: r.legal_name,
      status: r.status,
      reasonCode: r.reason_code,
      reasonNote: r.reason_note,
      disputedAmount: r.disputed_amount == null ? null : amount(r.disputed_amount, r.currency),
      invoiceTotal: amount(r.total, r.currency),
      balanceDue: amount(r.balance_due, r.currency),
      raisedBy: r.raised_by_label,
      lines: r.lines,
      resolution: r.resolution,
      resolutionNote: r.resolution_note,
      resolvedBy: r.resolved_by_name,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
      // F8: resolving an open dispute resumes the ladder.
      dunningResumesOnResolve: ['raised', 'under_review'].includes(r.status),
      availableResolutions: ['raised', 'under_review'].includes(r.status)
        ? ['uphold', 'credit', 'adjust'] : [],
    })))
  }))

router.patch('/disputes/:id', requireAuth, requireBilling,
  handler('billing-accounts dispute resolve', async (req, res) => {
    const { resolution, resolutionNote, status } = req.body ?? {}

    if (status === 'under_review') {
      const { rows } = await pool.query(
        `UPDATE billing_disputes SET status = 'under_review'
          WHERE id = $1 AND tenant_id = $2 AND status = 'raised' RETURNING *`,
        [req.params.id, req.tenantId!],
      )
      if (!rows.length) return refuse(res, 'Only a newly raised dispute can be moved to under review.')
      return ok(res, rows[0])
    }

    if (!['uphold', 'credit', 'adjust'].includes(resolution)) {
      return badRequest(res, "resolution must be 'uphold', 'credit' or 'adjust'")
    }
    if (!resolutionNote?.trim()) return badRequest(res, 'A resolution note is required.')

    const nextStatus = resolution === 'uphold' ? 'upheld'
      : resolution === 'credit' ? 'credited' : 'adjusted'

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `UPDATE billing_disputes
            SET status = $2, resolution = $3, resolution_note = $4,
                resolved_by = $5, resolved_at = NOW()
          WHERE id = $1 AND tenant_id = $6
            AND status IN ('raised','under_review')
          RETURNING *`,
        [req.params.id, nextStatus, resolution, resolutionNote.trim(),
         req.user!.id, req.tenantId!],
      )
      if (!rows.length) {
        await client.query('ROLLBACK')
        return refuse(res, 'This dispute is already resolved.')
      }

      // Closing the dispute lifts the pause; recalc decides the invoice's state.
      const recalced = await recalcInvoice(client, rows[0].invoice_id, req.user!.id)
      await audit(client, {
        tenantId: req.tenantId!, entityType: 'dispute', entityId: req.params.id,
        action: resolution === 'uphold' ? 'approve' : 'adjust',
        after: rows[0], reasonNote: resolutionNote,
        actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
      })
      await client.query('COMMIT')

      return ok(res, {
        dispute: rows[0],
        invoiceStatus: recalced.status,
        dunningResumed: true,
        // F8 spells out what happens next for each outcome.
        nextStep: resolution === 'uphold'
          ? 'The charge stands and payment reminders have resumed.'
          : resolution === 'credit'
            ? 'Raise a credit note against this invoice to give the credit effect.'
            : 'Adjust the underlying charge, then raise a credit note for the difference.',
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

// ─────────────────────────────────────────────────────────────────────────────
// A-08 — credit-limit override approval queue
// ─────────────────────────────────────────────────────────────────────────────

router.get('/overrides', requireAuth, requireBilling,
  handler('billing-accounts overrides', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT o.*, a.account_code, a.legal_name, a.credit_limit, a.currency,
              ru.name AS requested_by_name, du.name AS decided_by_name
         FROM billing_credit_overrides o
         JOIN billing_accounts a ON a.id = o.account_id
         LEFT JOIN app_users ru ON ru.id = o.requested_by
         LEFT JOIN app_users du ON du.id = o.decided_by
        WHERE o.tenant_id = $1
        ORDER BY o.status, o.created_at DESC`,
      [req.tenantId!],
    )
    return ok(res, rows.map(r => ({
      id: r.id,
      accountId: r.account_id,
      accountCode: r.account_code,
      accountName: r.legal_name,
      requestedAmount: amount(r.requested_amount, r.currency),
      currentLimit: amount(r.credit_limit, r.currency),
      exposureAtRequest: amount(r.exposure_at_request, r.currency),
      reason: r.reason,
      status: r.status,
      requestedBy: r.requested_by_name,
      decidedBy: r.decided_by_name,
      decidedAt: r.decided_at,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    })))
  }))

router.patch('/overrides/:id', requireAuth, requireBilling,
  requireCapability('can_override_credit_limit'),
  handler('billing-accounts override decide', async (req, res) => {
    const { decision, expiresAt } = req.body ?? {}
    if (!['approved', 'declined'].includes(decision)) {
      return badRequest(res, "decision must be 'approved' or 'declined'")
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: existing } = await client.query(
        `SELECT * FROM billing_credit_overrides
          WHERE id = $1 AND tenant_id = $2 AND status = 'pending' FOR UPDATE`,
        [req.params.id, req.tenantId!],
      )
      if (!existing.length) {
        await client.query('ROLLBACK')
        return refuse(res, 'This request is not pending.')
      }
      // Self-approval is refused in the database too; refusing here gives a
      // readable message instead of a constraint name.
      if (existing[0].requested_by === req.user!.id) {
        await client.query('ROLLBACK')
        return refuse(res, 'You cannot approve your own credit-limit override request.', undefined, 403)
      }

      const { rows } = await client.query(
        `UPDATE billing_credit_overrides
            SET status = $2, decided_by = $3, decided_at = NOW(), expires_at = $4
          WHERE id = $1 RETURNING *`,
        [req.params.id, decision, req.user!.id, expiresAt ?? null],
      )

      if (decision === 'approved') {
        await client.query(
          `UPDATE billing_accounts SET credit_limit = $2, updated_at = NOW() WHERE id = $1`,
          [existing[0].account_id, existing[0].requested_amount],
        )
      }

      await audit(client, {
        tenantId: req.tenantId!, entityType: 'account', entityId: existing[0].account_id,
        action: decision === 'approved' ? 'approve' : 'decline',
        before: existing[0], after: rows[0],
        amountDelta: existing[0].requested_amount,
        reasonNote: existing[0].reason,
        actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
      })
      await client.query('COMMIT')
      return ok(res, rows[0])
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

// ─────────────────────────────────────────────────────────────────────────────
// A-06 — statement run (AR-07)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/statements', requireAuth, requireBilling,
  handler('billing-accounts statements', async (req, res) => {
    const { accountIds, periodStart, periodEnd } = req.body ?? {}
    if (!periodStart || !periodEnd) return badRequest(res, 'periodStart and periodEnd are required')

    const params: unknown[] = [req.tenantId!, periodStart, periodEnd]
    let accountFilter = ''
    if (Array.isArray(accountIds) && accountIds.length) {
      params.push(accountIds)
      accountFilter = `AND a.id = ANY($${params.length}::uuid[])`
    }

    const { rows } = await pool.query(
      `SELECT a.id, a.account_code, a.legal_name, a.billing_email, a.currency,
              a.statement_frequency,
              COALESCE(SUM(i.total) FILTER (
                WHERE i.issue_date BETWEEN $2::date AND $3::date), 0) AS invoiced_in_period,
              COALESCE(SUM(i.amount_paid) FILTER (
                WHERE i.issue_date BETWEEN $2::date AND $3::date), 0) AS paid_in_period,
              COALESCE(SUM(i.balance_due), 0) AS closing_balance,
              COUNT(i.id) FILTER (WHERE i.balance_due > 0) AS open_invoices
         FROM billing_accounts a
         LEFT JOIN billing_invoices i ON i.account_id = a.id AND i.status <> 'draft'
        WHERE a.tenant_id = $1
          AND a.status IN ('active','on_hold')
          AND a.statement_frequency <> 'none'
          ${accountFilter}
        GROUP BY a.id
       HAVING COALESCE(SUM(i.balance_due), 0) <> 0
           OR COUNT(i.id) FILTER (WHERE i.issue_date BETWEEN $2::date AND $3::date) > 0
        ORDER BY a.legal_name`,
      params,
    )

    // Agreement check against A-04, which the FRS asks for explicitly (AR-07).
    const { rows: aged } = await pool.query(
      `SELECT COALESCE(SUM(total_due), 0) AS total FROM billing_aged_receivables WHERE tenant_id = $1`,
      [req.tenantId!],
    )
    const statementTotal = rows.reduce((s, r) => s + Number(r.closing_balance), 0)
    const agedTotal = Number(aged[0].total)
    const currency = rows[0]?.currency ?? 'AUD'

    return ok(res, {
      periodStart, periodEnd,
      statements: rows.map(r => ({
        accountId: r.id,
        accountCode: r.account_code,
        accountName: r.legal_name,
        billingEmail: r.billing_email,
        frequency: r.statement_frequency,
        invoicedInPeriod: amount(r.invoiced_in_period, r.currency),
        paidInPeriod: amount(r.paid_in_period, r.currency),
        closingBalance: amount(r.closing_balance, r.currency),
        openInvoices: Number(r.open_invoices),
        deliverable: !!r.billing_email,
        blockedReason: r.billing_email ? null : 'No billing email on the account.',
      })),
      reconciliation: {
        statementTotal: amount(statementTotal, currency),
        agedReceivablesTotal: amount(agedTotal, currency),
        variance: amount(statementTotal - agedTotal, currency),
        agrees: Math.abs(statementTotal - agedTotal) < 0.005,
      },
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// A-03 — onboarding (F12)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, requireBilling, handler('billing-accounts create', async (req, res) => {
  const tenantId = req.tenantId!
  const b = req.body ?? {}
  if (!b.legalName?.trim()) return badRequest(res, 'legalName is required')
  if (b.paymentTerms && !TERMS.includes(b.paymentTerms)) {
    return badRequest(res, `paymentTerms must be one of ${TERMS.join(', ')}`)
  }

  // A code the humans can read, derived from the name, uniqueness-checked.
  let code = (b.accountCode ?? b.legalName)
    .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'ACCT'
  const { rows: taken } = await pool.query(
    `SELECT account_code FROM billing_accounts WHERE tenant_id = $1 AND account_code LIKE $2`,
    [tenantId, `${code}%`],
  )
  if (taken.some(t => t.account_code === code)) code = `${code}${taken.length + 1}`

  const termsDays: Record<string, number> = { net_7: 7, net_14: 14, net_30: 30, eom: 30 }
  const terms = b.paymentTerms ?? 'net_30'

  const { rows } = await pool.query(
    `INSERT INTO billing_accounts (
       tenant_id, account_code, legal_name, trading_name, abn,
       billing_email, billing_contact, billing_phone, billing_address,
       status, payment_terms, payment_terms_days, credit_limit, currency,
       rate_card_id, statement_frequency, invoice_cycle, user_id,
       approved_by, approved_at, notes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
               CASE WHEN $19::uuid IS NULL THEN NULL ELSE NOW() END, $20)
     RETURNING *`,
    [
      tenantId, code, b.legalName.trim(), b.tradingName ?? null, b.abn ?? null,
      b.billingEmail ?? null, b.billingContact ?? null, b.billingPhone ?? null,
      b.billingAddress ?? null,
      // An account is only 'active' — able to book on account — once approved (AR-02).
      b.approve ? 'active' : 'prospect',
      terms, b.paymentTermsDays ?? termsDays[terms] ?? 30,
      b.creditLimit ?? 0, b.currency ?? 'AUD',
      b.rateCardId ?? null, b.statementFrequency ?? 'monthly',
      b.invoiceCycle ?? 'per_booking', b.userId ?? null,
      b.approve ? req.user!.id : null, b.notes ?? null,
    ],
  )

  await audit(pool, {
    tenantId, entityType: 'account', entityId: rows[0].id, action: 'create',
    after: rows[0], actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
  })

  return created(res, {
    ...rows[0],
    // F12: approval is what unlocks invoice-in-arrears booking.
    note: b.approve
      ? 'Account approved — this customer can now book on account and be invoiced in arrears.'
      : 'Account created as a prospect. Approve it to allow booking on account; until then bookings must be prepaid.',
  })
}))

// ─────────────────────────────────────────────────────────────────────────────
// A-02 — account detail
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:id', requireAuth, requireBilling, handler('billing-accounts detail', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, e.exposure, e.pct_of_limit, e.open_invoice_count, e.earliest_due_date,
            rc.name AS rate_card_name, rc.status AS rate_card_status,
            ap.name AS approved_by_name
       FROM billing_accounts a
       LEFT JOIN billing_account_exposure e ON e.account_id = a.id
       LEFT JOIN billing_rate_cards rc ON rc.id = a.rate_card_id
       LEFT JOIN app_users ap ON ap.id = a.approved_by
      WHERE a.id = $1 AND a.tenant_id = $2`,
    [req.params.id, req.tenantId!],
  )
  if (!rows.length) return notFound(res, 'Account')
  const a = rows[0]
  const currency = a.currency ?? 'AUD'

  const [invoices, aged, disputes, prepayments, overrides, behaviour] = await Promise.all([
    pool.query(
      `SELECT id, invoice_number, status, issue_date, due_date, total, amount_paid,
              balance_due, currency, delivery_state
         FROM billing_invoices WHERE account_id = $1 AND status <> 'draft'
        ORDER BY issue_date DESC NULLS FIRST LIMIT 100`,
      [req.params.id]),
    pool.query(
      `SELECT * FROM billing_aged_receivables WHERE account_id = $1`, [req.params.id]),
    pool.query(
      `SELECT d.*, i.invoice_number FROM billing_disputes d
         JOIN billing_invoices i ON i.id = d.invoice_id
        WHERE d.account_id = $1 ORDER BY d.created_at DESC`,
      [req.params.id]),
    pool.query(
      `SELECT * FROM billing_prepayments WHERE account_id = $1 ORDER BY created_at DESC`,
      [req.params.id]),
    pool.query(
      `SELECT * FROM billing_credit_overrides WHERE account_id = $1 ORDER BY created_at DESC`,
      [req.params.id]),
    // AN-09's inputs: how this account actually pays.
    pool.query(
      `SELECT COUNT(*) AS paid_count,
              ROUND(AVG(EXTRACT(EPOCH FROM (al.created_at - i.issue_date::timestamptz)) / 86400)) AS avg_days,
              ROUND(MAX(EXTRACT(EPOCH FROM (al.created_at - i.due_date::timestamptz)) / 86400)) AS worst_days_late,
              COUNT(*) FILTER (WHERE al.created_at::date > i.due_date) AS late_count
         FROM billing_allocations al
         JOIN billing_invoices i ON i.id = al.invoice_id
        WHERE i.account_id = $1 AND NOT al.reversed`,
      [req.params.id]),
  ])

  const bh = behaviour.rows[0] ?? {}
  const paidCount = Number(bh.paid_count ?? 0)
  const lateCount = Number(bh.late_count ?? 0)

  return ok(res, {
    profile: {
      id: a.id,
      accountCode: a.account_code,
      legalName: a.legal_name,
      tradingName: a.trading_name,
      abn: a.abn,
      billingEmail: a.billing_email,
      billingContact: a.billing_contact,
      billingPhone: a.billing_phone,
      billingAddress: a.billing_address,
      status: a.status,
      userId: a.user_id,
      approvedBy: a.approved_by_name,
      approvedAt: a.approved_at,
      notes: a.notes,
      createdAt: a.created_at,
    },
    termsAndCredit: {
      paymentTerms: a.payment_terms,
      paymentTermsDays: a.payment_terms_days,
      invoiceCycle: a.invoice_cycle,
      statementFrequency: a.statement_frequency,
      creditLimit: amount(a.credit_limit, currency),
      exposure: amount(a.exposure ?? 0, currency),
      headroom: amount(Number(a.credit_limit) - Number(a.exposure ?? 0), currency),
      pctOfLimit: a.pct_of_limit == null ? null : Number(a.pct_of_limit),
      creditHold: a.credit_hold,
      creditHoldReason: a.credit_hold_reason,
      creditHoldAt: a.credit_hold_at,
      openInvoices: Number(a.open_invoice_count ?? 0),
      earliestDueDate: a.earliest_due_date ? isoDate(a.earliest_due_date) : null,
      // AR-11 / AR-02: a hold suspends account booking but not prepaid booking.
      bookingRights: a.credit_hold || a.status !== 'active'
        ? { onAccount: false, prepaid: true,
            reason: a.credit_hold_reason ?? `Account is ${a.status}.` }
        : { onAccount: true, prepaid: true, reason: null },
    },
    tariff: {
      rateCardId: a.rate_card_id,
      rateCardName: a.rate_card_name,
      rateCardStatus: a.rate_card_status,
      basis: a.rate_card_id ? 'assigned card' : 'site default (no card assigned)',
    },
    invoices: invoices.rows.map(i => ({
      id: i.id, invoiceNumber: i.invoice_number, status: i.status,
      issueDate: i.issue_date ? isoDate(i.issue_date) : null,
      dueDate: i.due_date ? isoDate(i.due_date) : null,
      total: amount(i.total, i.currency),
      amountPaid: amount(i.amount_paid, i.currency),
      balanceDue: amount(i.balance_due, i.currency),
      deliveryState: i.delivery_state,
    })),
    aged: aged.rows[0] ? {
      totalDue: amount(aged.rows[0].total_due, currency),
      current: amount(aged.rows[0].bucket_current, currency),
      days1To30: amount(aged.rows[0].bucket_1_30, currency),
      days31To60: amount(aged.rows[0].bucket_31_60, currency),
      days61To90: amount(aged.rows[0].bucket_61_90, currency),
      days90Plus: amount(aged.rows[0].bucket_90_plus, currency),
    } : null,
    disputes: disputes.rows.map(d => ({
      id: d.id, invoiceNumber: d.invoice_number, status: d.status,
      reasonCode: d.reason_code, createdAt: d.created_at,
    })),
    prepayments: {
      // AR-12: the balance held on account, and where it went.
      balance: amount(
        prepayments.rows.reduce(
          (s, p) => s + (p.direction === 'in' ? Number(p.amount) : -Number(p.amount)), 0),
        currency),
      movements: prepayments.rows.map(p => ({
        id: p.id, direction: p.direction, amount: amount(p.amount, currency),
        invoiceId: p.invoice_id, note: p.note, at: p.created_at,
      })),
    },
    creditOverrides: overrides.rows,
    // AN-09's explanation, at behaviour level rather than as a bare score.
    paymentBehaviour: {
      invoicesPaid: paidCount,
      avgDaysToPay: bh.avg_days == null ? null : Number(bh.avg_days),
      worstDaysLate: bh.worst_days_late == null ? null : Number(bh.worst_days_late),
      paidLate: lateCount,
      onTimeRate: paidCount ? Number((((paidCount - lateCount) / paidCount) * 100).toFixed(1)) : null,
      explanation: paidCount === 0
        ? 'No payment history yet — this account has not settled an invoice.'
        : `${paidCount - lateCount} of ${paidCount} invoices were paid by the due date, averaging ${Number(bh.avg_days ?? 0)} days to pay against ${a.payment_terms_days}-day terms.`,
    },
  })
}))

router.patch('/:id', requireAuth, requireBilling, handler('billing-accounts patch', async (req, res) => {
  const tenantId = req.tenantId!
  const b = req.body ?? {}

  // Raising a credit limit is an override, not an edit — route it properly.
  if (b.creditLimit !== undefined && !req.billingCaps?.can_override_credit_limit) {
    const { rows: current } = await pool.query(
      `SELECT credit_limit FROM billing_accounts WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    )
    if (current.length && Number(b.creditLimit) > Number(current[0].credit_limit)) {
      return refuse(
        res,
        'Raising a credit limit needs the override-credit-limit capability. Raise an override request instead.',
        'override_request', 403,
      )
    }
  }

  const FIELDS: Record<string, string> = {
    legalName: 'legal_name', tradingName: 'trading_name', abn: 'abn',
    billingEmail: 'billing_email', billingContact: 'billing_contact',
    billingPhone: 'billing_phone', billingAddress: 'billing_address',
    status: 'status', paymentTerms: 'payment_terms', paymentTermsDays: 'payment_terms_days',
    creditLimit: 'credit_limit', currency: 'currency', rateCardId: 'rate_card_id',
    statementFrequency: 'statement_frequency', invoiceCycle: 'invoice_cycle',
    userId: 'user_id', notes: 'notes',
  }
  const sets: string[] = []
  const params: unknown[] = []
  for (const [key, column] of Object.entries(FIELDS)) {
    if (b[key] !== undefined) { params.push(b[key]); sets.push(`${column} = $${params.length}`) }
  }
  if (b.approve) {
    params.push(req.user!.id)
    sets.push(`status = 'active'`, `approved_by = $${params.length}`, `approved_at = NOW()`)
  }
  if (!sets.length) return badRequest(res, 'No fields to update')

  const { rows: before } = await pool.query(
    `SELECT * FROM billing_accounts WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, tenantId],
  )
  if (!before.length) return notFound(res, 'Account')

  params.push(req.params.id, tenantId)
  const { rows } = await pool.query(
    `UPDATE billing_accounts SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING *`,
    params,
  )
  await audit(pool, {
    tenantId, entityType: 'account', entityId: req.params.id, action: 'update',
    before: before[0], after: rows[0],
    actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
  })
  return ok(res, rows[0])
}))

// ─────────────────────────────────────────────────────────────────────────────
// A-10 — credit hold (AR-11)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/hold', requireAuth, requireBilling, handler('billing-accounts hold', async (req, res) => {
  const { hold, reason } = req.body ?? {}
  if (hold && !reason?.trim()) {
    return badRequest(res, 'A reason is required to place an account on credit hold.')
  }

  const { rows } = await pool.query(
    `UPDATE billing_accounts
        SET credit_hold = $2,
            credit_hold_reason = $3,
            credit_hold_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
            status = CASE WHEN $2 THEN 'on_hold'
                          WHEN status = 'on_hold' THEN 'active' ELSE status END,
            updated_at = NOW()
      WHERE id = $1 AND tenant_id = $4 RETURNING *`,
    [req.params.id, !!hold, hold ? reason.trim() : null, req.tenantId!],
  )
  if (!rows.length) return notFound(res, 'Account')

  await audit(pool, {
    tenantId: req.tenantId!, entityType: 'account', entityId: req.params.id,
    action: 'update', after: { creditHold: !!hold },
    reasonNote: hold ? reason : 'Hold released',
    actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
  })

  return ok(res, {
    account: rows[0],
    // AR-02: the prepaid path stays open, and the UI should say so.
    note: hold
      ? 'This account can no longer book on account. Prepaid booking remains available to them.'
      : 'Credit hold released. This account can book on account again.',
  })
}))

// ─────────────────────────────────────────────────────────────────────────────
// A-08 — request an override (AR-03)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/override', requireAuth, requireBilling,
  handler('billing-accounts override request', async (req, res) => {
    const { requestedAmount, reason, expiresAt } = req.body ?? {}
    if (!reason?.trim()) return badRequest(res, 'A reason is required for an override request.')
    const value = Number(requestedAmount)
    if (!Number.isFinite(value) || value <= 0) return badRequest(res, 'requestedAmount must be positive')

    const { rows: acct } = await pool.query(
      `SELECT a.credit_limit, a.currency, COALESCE(e.exposure, 0) AS exposure
         FROM billing_accounts a
         LEFT JOIN billing_account_exposure e ON e.account_id = a.id
        WHERE a.id = $1 AND a.tenant_id = $2`,
      [req.params.id, req.tenantId!],
    )
    if (!acct.length) return notFound(res, 'Account')

    const { rows } = await pool.query(
      `INSERT INTO billing_credit_overrides (
         tenant_id, account_id, requested_amount, exposure_at_request, reason,
         requested_by, expires_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        req.tenantId!, req.params.id, value.toFixed(2),
        Number(acct[0].exposure).toFixed(2), reason.trim(), req.user!.id, expiresAt ?? null,
      ],
    )

    return created(res, {
      ...rows[0],
      currentLimit: amount(acct[0].credit_limit, acct[0].currency),
      exposure: amount(acct[0].exposure, acct[0].currency),
      note: 'Override requested. A different user with the override capability must approve it.',
    })
  }))

export default router
