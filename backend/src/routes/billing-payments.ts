/**
 * Payments & reconciliation — step 6 of the chain (P-01 … P-08, F7).
 *
 *   GET   /api/billing/payments/receipts        P-01 all money in           PY-10
 *   POST  /api/billing/payments/receipts        P-02 manual receipt          PY-07
 *   POST  /api/billing/payments/import          P-03 bank statement import   PY-05
 *   GET   /api/billing/payments/match-queue     P-04 auto then human         PY-06
 *   POST  /api/billing/payments/match/:lineId   P-04 accept / reject
 *   POST  /api/billing/payments/allocate        P-05 split a receipt         AR-08
 *   POST  /api/billing/payments/:id/reverse     P-06 refund / reversal       PY-08
 *   GET   /api/billing/payments/:id/audit       P-07 reconstruct history     PY-10
 *   GET   /api/billing/payments/failures        P-08 failed card payments    PY-11
 */

import { Router } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import {
  allocateDocumentNumber, approvalRequirement, audit, isoDate, recalcInvoice,
  recordInvoiceEvent,
} from '../lib/billingRepo'
import { allocate, formatMoney, money, toDecimalString } from '../lib/money'
import { createHash } from 'crypto'
import {
  badRequest, created, handler, notFound, ok, refuse, requireBilling, requireCapability,
} from '../lib/billingHttp'

const router = Router()

function amount(value: unknown, currency: string) {
  const n = Number(value ?? 0)
  return { amount: n.toFixed(2), currency, display: formatMoney(money(n.toFixed(2), currency)) }
}

const METHODS = ['card', 'eft', 'compay', 'cash', 'manual', 'prepayment_drawdown']

// ─────────────────────────────────────────────────────────────────────────────
// P-01 — receipts list
// ─────────────────────────────────────────────────────────────────────────────

router.get('/receipts', requireAuth, requireBilling,
  handler('billing-payments receipts', async (req, res) => {
    const params: unknown[] = [req.tenantId!]
    const where = ['r.tenant_id = $1']
    if (req.query.method && req.query.method !== 'all') {
      params.push(req.query.method); where.push(`r.method = $${params.length}`)
    }
    if (req.query.allocation === 'unallocated') where.push('r.unallocated_amount > 0')
    if (req.query.allocation === 'allocated')   where.push("r.status = 'allocated'")
    if (req.query.from) { params.push(req.query.from); where.push(`r.received_date >= $${params.length}::date`) }
    if (req.query.to)   { params.push(req.query.to);   where.push(`r.received_date <= $${params.length}::date`) }

    const { rows } = await pool.query(
      `SELECT r.*, a.account_code, a.legal_name, u.name AS recorded_by_name,
              (SELECT COUNT(*) FROM billing_allocations al
                WHERE al.receipt_id = r.id AND NOT al.reversed) AS allocation_count
         FROM billing_receipts r
         LEFT JOIN billing_accounts a ON a.id = r.account_id
         LEFT JOIN app_users u ON u.id = r.recorded_by
        WHERE ${where.join(' AND ')}
        ORDER BY r.received_date DESC, r.created_at DESC
        LIMIT ${Math.min(Number(req.query.limit ?? 200), 1000)}`,
      params,
    )

    const currency = rows[0]?.currency ?? 'AUD'
    return ok(res, {
      methods: METHODS,
      receipts: rows.map(r => ({
        id: r.id,
        receiptNumber: r.receipt_number,
        accountId: r.account_id,
        accountCode: r.account_code,
        accountName: r.legal_name,
        method: r.method,
        source: r.source,
        receivedDate: isoDate(r.received_date),
        amount: amount(r.amount, r.currency),
        surchargeAmount: amount(r.surcharge_amount, r.currency),
        allocatedAmount: amount(r.allocated_amount, r.currency),
        unallocatedAmount: amount(r.unallocated_amount, r.currency),
        status: r.status,
        payerReference: r.payer_reference,
        bankReference: r.bank_reference,
        providerRef: r.provider_ref,
        allocationCount: Number(r.allocation_count),
        reversalOfId: r.reversal_of_id,
        reversalReason: r.reversal_reason,
        recordedBy: r.recorded_by_name,
        createdAt: r.created_at,
      })),
      totals: {
        received: amount(rows.reduce((s, r) => s + Number(r.amount), 0), currency),
        allocated: amount(rows.reduce((s, r) => s + Number(r.allocated_amount), 0), currency),
        unallocated: amount(rows.reduce((s, r) => s + Number(r.unallocated_amount), 0), currency),
      },
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// P-08 — failed payments (before /:id routes)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/failures', requireAuth, requireBilling,
  handler('billing-payments failures', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT pa.*, i.invoice_number, i.balance_due, i.status AS invoice_status,
              a.legal_name, a.billing_email
         FROM billing_payment_attempts pa
         LEFT JOIN billing_invoices i ON i.id = pa.invoice_id
         LEFT JOIN billing_accounts a ON a.id = i.account_id
        WHERE pa.tenant_id = $1 AND pa.outcome = 'failed'
        ORDER BY pa.created_at DESC LIMIT 200`,
      [req.tenantId!],
    )
    return ok(res, rows.map(r => ({
      id: r.id,
      invoiceId: r.invoice_id,
      invoiceNumber: r.invoice_number,
      // PY-11: the invoice does not become paid because a card was tried.
      invoiceStatus: r.invoice_status,
      balanceDue: r.balance_due == null ? null : amount(r.balance_due, 'AUD'),
      accountName: r.legal_name,
      notifyEmail: r.billing_email,
      method: r.method,
      amount: amount(r.amount, 'AUD'),
      failureCode: r.failure_code,
      failureMessage: r.failure_message,
      retryCount: r.retry_count,
      nextRetryAt: r.next_retry_at,
      attemptedAt: r.created_at,
    })))
  }))

// ─────────────────────────────────────────────────────────────────────────────
// P-04 — match queue (PY-06)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/match-queue', requireAuth, requireBilling,
  handler('billing-payments match-queue', async (req, res) => {
    const state = (req.query.state as string) ?? 'open'
    const stateFilter = state === 'open'
      ? `bl.match_state IN ('unmatched','suggested')`
      : state === 'all' ? 'TRUE' : `bl.match_state = $2`
    const params: unknown[] = [req.tenantId!]
    if (state !== 'open' && state !== 'all') params.push(state)

    const { rows } = await pool.query(
      `SELECT bl.*, i.invoice_number, i.balance_due, i.currency AS invoice_currency,
              a.account_code, a.legal_name
         FROM billing_bank_lines bl
         LEFT JOIN billing_invoices i ON i.id = bl.suggested_invoice_id
         LEFT JOIN billing_accounts a ON a.id = bl.suggested_account_id
        WHERE bl.tenant_id = $1 AND ${stateFilter}
        ORDER BY bl.value_date DESC, bl.amount DESC`,
      params,
    )

    // PY-06 asks for the match rate as a metric, not just a queue.
    const { rows: metric } = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE match_state = 'matched') AS matched,
              COUNT(*) FILTER (WHERE match_state = 'matched' AND match_basis = 'reference') AS auto_by_ref
         FROM billing_bank_lines WHERE tenant_id = $1`,
      [req.tenantId!],
    )
    const m = metric[0]
    const total = Number(m.total)

    return ok(res, {
      lines: rows.map(r => ({
        id: r.id,
        valueDate: isoDate(r.value_date),
        amount: amount(r.amount, r.invoice_currency ?? 'AUD'),
        narrative: r.narrative,
        reference: r.reference,
        matchState: r.match_state,
        matchConfidence: r.match_confidence == null ? null : Number(r.match_confidence),
        matchBasis: r.match_basis,
        suggestion: r.suggested_invoice_id ? {
          invoiceId: r.suggested_invoice_id,
          invoiceNumber: r.invoice_number,
          balanceDue: amount(r.balance_due, r.invoice_currency ?? 'AUD'),
          accountCode: r.account_code,
          accountName: r.legal_name,
        } : r.suggested_account_id ? {
          accountId: r.suggested_account_id,
          accountCode: r.account_code,
          accountName: r.legal_name,
        } : null,
        receiptId: r.receipt_id,
      })),
      metrics: {
        totalLines: total,
        matched: Number(m.matched),
        // The FRS target: ≥90% of correctly-referenced EFT auto-matches.
        matchRatePct: total ? Number(((Number(m.matched) / total) * 100).toFixed(1)) : null,
        autoByReference: Number(m.auto_by_ref),
        target: 90,
      },
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// P-03 — bank statement import (PY-05)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/import', requireAuth, requireBilling, requireCapability('can_confirm_eft_payment'),
  handler('billing-payments import', async (req, res) => {
    const tenantId = req.tenantId!
    const { filename, format = 'csv', lines } = req.body ?? {}
    if (!Array.isArray(lines) || !lines.length) {
      return badRequest(res, 'lines must be a non-empty array of { valueDate, amount, narrative, reference }')
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: imp } = await client.query(
        `INSERT INTO billing_bank_imports (tenant_id, filename, format, row_count, imported_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [tenantId, filename ?? null, format, lines.length, req.user!.id],
      )
      const importId = imp[0].id

      let inserted = 0
      let duplicates = 0
      let autoSuggested = 0

      for (const line of lines) {
        const valueDate = String(line.valueDate ?? '').slice(0, 10)
        const value = Number(line.amount)
        if (!valueDate || !Number.isFinite(value)) continue

        // Duplicate detection: the same date, amount and narrative from the same
        // account is the same transaction, however many times the file is loaded.
        const fingerprint = createHash('sha256')
          .update([valueDate, value.toFixed(2), line.narrative ?? '', line.reference ?? ''].join('|'))
          .digest('hex')

        // Match ladder: reference → amount → account (PY-06), in that order,
        // because a quoted reference is the only signal that is unambiguous.
        let suggestedInvoiceId: string | null = null
        let suggestedAccountId: string | null = null
        let basis: string | null = null
        let confidence: number | null = null

        const ref = String(line.reference ?? line.narrative ?? '')
          .replace(/[^A-Z0-9]/gi, '').toUpperCase()

        if (ref) {
          const { rows } = await client.query(
            `SELECT id, account_id, balance_due FROM billing_invoices
              WHERE tenant_id = $1 AND remittance_ref IS NOT NULL
                AND $2 LIKE '%' || remittance_ref || '%'
                AND balance_due > 0
              ORDER BY ABS(balance_due - $3::numeric) LIMIT 1`,
            [tenantId, ref, value.toFixed(2)],
          )
          if (rows.length) {
            suggestedInvoiceId = rows[0].id
            suggestedAccountId = rows[0].account_id
            basis = 'reference'
            confidence = Math.abs(Number(rows[0].balance_due) - value) < 0.005 ? 99 : 85
          }
        }

        if (!suggestedInvoiceId) {
          const { rows } = await client.query(
            `SELECT id, account_id FROM billing_invoices
              WHERE tenant_id = $1 AND balance_due = $2::numeric
                AND status IN ('issued','part_paid','overdue','part_credited')
              LIMIT 2`,
            [tenantId, value.toFixed(2)],
          )
          // An exact amount match is only a suggestion if it is unambiguous.
          if (rows.length === 1) {
            suggestedInvoiceId = rows[0].id
            suggestedAccountId = rows[0].account_id
            basis = 'amount'
            confidence = 70
          }
        }

        if (!suggestedInvoiceId && line.narrative) {
          const { rows } = await client.query(
            `SELECT id FROM billing_accounts
              WHERE tenant_id = $1
                AND (LOWER($2) LIKE '%' || LOWER(legal_name) || '%'
                  OR (trading_name IS NOT NULL AND LOWER($2) LIKE '%' || LOWER(trading_name) || '%'))
              LIMIT 2`,
            [tenantId, line.narrative],
          )
          if (rows.length === 1) {
            suggestedAccountId = rows[0].id
            basis = 'account'
            confidence = 50
          }
        }

        const result = await client.query(
          `INSERT INTO billing_bank_lines (
             import_id, tenant_id, value_date, amount, narrative, reference, fingerprint,
             match_state, match_confidence, suggested_invoice_id, suggested_account_id, match_basis
           ) VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (tenant_id, fingerprint) DO NOTHING
           RETURNING id`,
          [
            importId, tenantId, valueDate, value.toFixed(2),
            line.narrative ?? null, line.reference ?? null, fingerprint,
            basis ? 'suggested' : 'unmatched', confidence,
            suggestedInvoiceId, suggestedAccountId, basis,
          ],
        )
        if (result.rowCount) { inserted++; if (basis) autoSuggested++ }
        else duplicates++
      }

      await client.query(
        `UPDATE billing_bank_imports SET row_count = $2, duplicate_count = $3 WHERE id = $1`,
        [importId, inserted, duplicates],
      )
      await client.query('COMMIT')

      return created(res, {
        importId, inserted, duplicates, autoSuggested,
        note: duplicates
          ? `${duplicates} row(s) were already imported and were skipped.`
          : null,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

/** Accept or reject a suggested match, creating the receipt on accept. */
router.post('/match/:lineId', requireAuth, requireBilling,
  requireCapability('can_confirm_eft_payment'),
  handler('billing-payments match', async (req, res) => {
    const tenantId = req.tenantId!
    const { accept, invoiceId, accountId } = req.body ?? {}

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: lineRows } = await client.query(
        `SELECT * FROM billing_bank_lines WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.lineId, tenantId],
      )
      if (!lineRows.length) { await client.query('ROLLBACK'); return notFound(res, 'Bank line') }
      const line = lineRows[0]
      if (line.match_state === 'matched') {
        await client.query('ROLLBACK')
        return refuse(res, 'This bank line has already been matched.')
      }

      if (!accept) {
        await client.query(
          `UPDATE billing_bank_lines SET match_state = 'ignored' WHERE id = $1`,
          [req.params.lineId],
        )
        await client.query('COMMIT')
        return ok(res, { matchState: 'ignored' })
      }

      const targetInvoice = invoiceId ?? line.suggested_invoice_id
      const targetAccount = accountId ?? line.suggested_account_id
      if (!targetInvoice && !targetAccount) {
        await client.query('ROLLBACK')
        return badRequest(res, 'Supply an invoiceId or accountId to match against.')
      }

      const receiptNumber = await allocateDocumentNumber(client, tenantId, 'receipt')
      const { rows: receipt } = await client.query(
        `INSERT INTO billing_receipts (
           tenant_id, receipt_number, account_id, method, source, received_date,
           amount, unallocated_amount, status, payer_reference, bank_reference,
           narrative, recorded_by
         ) VALUES ($1,$2,$3,'eft','bank_import',$4::date,$5,$5,'received',$6,$7,$8,$9)
         RETURNING *`,
        [
          tenantId, receiptNumber, targetAccount, isoDate(line.value_date),
          Number(line.amount).toFixed(2), line.reference, line.reference,
          line.narrative, req.user!.id,
        ],
      )

      await client.query(
        `UPDATE billing_bank_lines
            SET match_state = 'matched', receipt_id = $2,
                suggested_invoice_id = COALESCE($3, suggested_invoice_id),
                suggested_account_id = COALESCE($4, suggested_account_id)
          WHERE id = $1`,
        [req.params.lineId, receipt[0].id, targetInvoice, targetAccount],
      )

      // Allocate straight away when an invoice was identified; otherwise the
      // money sits unallocated on the account for a human to split (AR-08).
      let allocated = null
      if (targetInvoice) {
        allocated = await allocateToInvoices(client, {
          receiptId: receipt[0].id,
          tenantId,
          allocations: [{ invoiceId: targetInvoice, amount: Number(line.amount) }],
          actorId: req.user!.id,
        })
      }

      await audit(client, {
        tenantId, entityType: 'receipt', entityId: receipt[0].id, action: 'create',
        after: receipt[0], amountDelta: line.amount, currency: receipt[0].currency,
        actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
      })
      await client.query('COMMIT')

      return created(res, {
        receiptId: receipt[0].id,
        receiptNumber,
        matchState: 'matched',
        allocation: allocated,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

// ─────────────────────────────────────────────────────────────────────────────
// P-02 — manual receipt (PY-07)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/receipts', requireAuth, requireBilling, requireCapability('can_confirm_eft_payment'),
  handler('billing-payments receipt create', async (req, res) => {
    const tenantId = req.tenantId!
    const b = req.body ?? {}
    const value = Number(b.amount)
    if (!Number.isFinite(value) || value <= 0) return badRequest(res, 'amount must be positive')
    if (b.method && !METHODS.includes(b.method)) {
      return badRequest(res, `method must be one of ${METHODS.join(', ')}`)
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const receiptNumber = await allocateDocumentNumber(client, tenantId, 'receipt')
      const { rows } = await client.query(
        `INSERT INTO billing_receipts (
           tenant_id, receipt_number, account_id, method, source, received_date,
           currency, amount, surcharge_amount, unallocated_amount, status,
           payer_reference, bank_reference, narrative, recorded_by
         ) VALUES ($1,$2,$3,$4,'manual',$5::date,$6,$7,$8,$7,'received',$9,$10,$11,$12)
         RETURNING *`,
        [
          tenantId, receiptNumber, b.accountId ?? null, b.method ?? 'eft',
          b.receivedDate ?? new Date().toISOString().slice(0, 10),
          b.currency ?? 'AUD', value.toFixed(2), Number(b.surchargeAmount ?? 0).toFixed(2),
          b.payerReference ?? null, b.bankReference ?? null, b.narrative ?? null,
          req.user!.id,
        ],
      )
      const receipt = rows[0]

      // The allocation step is part of P-02, not a separate chore.
      let allocation = null
      if (Array.isArray(b.allocations) && b.allocations.length) {
        allocation = await allocateToInvoices(client, {
          receiptId: receipt.id, tenantId,
          allocations: b.allocations.map((a: any) => ({
            invoiceId: a.invoiceId, amount: Number(a.amount), invoiceLineId: a.invoiceLineId ?? null,
          })),
          actorId: req.user!.id,
        })
      }

      await audit(client, {
        tenantId, entityType: 'receipt', entityId: receipt.id, action: 'create',
        after: receipt, amountDelta: value.toFixed(2), currency: receipt.currency,
        reasonNote: b.narrative ?? null,
        actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
      })
      await client.query('COMMIT')

      return created(res, {
        id: receipt.id, receiptNumber,
        amount: amount(receipt.amount, receipt.currency),
        unallocated: amount(receipt.unallocated_amount, receipt.currency),
        allocation,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

// ─────────────────────────────────────────────────────────────────────────────
// P-05 — allocation (AR-08)
// ─────────────────────────────────────────────────────────────────────────────

interface AllocationRequest {
  receiptId: string
  tenantId: string
  allocations: Array<{ invoiceId: string; amount: number; invoiceLineId?: string | null }>
  actorId: string
}

/**
 * Allocate a receipt across invoices, then let each invoice recompute its own
 * state. A part-payment leaves the balance owing and the invoice part_paid;
 * anything unallocated stays on the account rather than being forced onto an
 * invoice it does not belong to (AR-08).
 */
async function allocateToInvoices(client: any, req: AllocationRequest) {
  const { rows: receiptRows } = await client.query(
    `SELECT * FROM billing_receipts WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
    [req.receiptId, req.tenantId],
  )
  if (!receiptRows.length) throw new Error('Receipt not found')
  const receipt = receiptRows[0]
  if (receipt.status === 'reversed') throw new Error('A reversed receipt cannot be allocated')

  const requested = req.allocations.reduce((s, a) => s + a.amount, 0)
  const available = Number(receipt.unallocated_amount)
  if (requested > available + 0.005) {
    throw new Error(
      `Cannot allocate ${requested.toFixed(2)} — only ${available.toFixed(2)} ${receipt.currency} of this receipt is unallocated.`,
    )
  }

  const results = []
  for (const a of req.allocations) {
    if (!a.amount || a.amount <= 0) continue
    const { rows: invRows } = await client.query(
      `SELECT id, invoice_number, balance_due, currency, status
         FROM billing_invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [a.invoiceId, req.tenantId],
    )
    if (!invRows.length) throw new Error(`Invoice ${a.invoiceId} not found`)
    const inv = invRows[0]
    if (inv.status === 'draft') {
      throw new Error(`Invoice ${a.invoiceId} is still a draft and cannot take a payment.`)
    }
    if (inv.currency !== receipt.currency) {
      throw new Error(`Receipt is in ${receipt.currency} but invoice ${inv.invoice_number} is in ${inv.currency}.`)
    }
    // Overpaying an invoice pushes the excess back to the account, it does not
    // create a negative balance.
    if (a.amount > Number(inv.balance_due) + 0.005) {
      throw new Error(
        `Cannot allocate ${a.amount.toFixed(2)} to ${inv.invoice_number} — only ${Number(inv.balance_due).toFixed(2)} is outstanding. Leave the excess unallocated on the account instead.`,
      )
    }

    await client.query(
      `INSERT INTO billing_allocations (receipt_id, invoice_id, invoice_line_id, amount, allocated_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.receiptId, a.invoiceId, a.invoiceLineId ?? null, a.amount.toFixed(2), req.actorId],
    )

    const recalced = await recalcInvoice(client, a.invoiceId, req.actorId)
    await recordInvoiceEvent(client, {
      invoiceId: a.invoiceId,
      toStatus: recalced.status,
      eventKind: 'payment',
      detail: { receiptNumber: receipt.receipt_number, amount: a.amount.toFixed(2) },
      actorId: req.actorId,
    })

    results.push({
      invoiceId: a.invoiceId,
      invoiceNumber: inv.invoice_number,
      allocated: amount(a.amount, receipt.currency),
      invoiceStatus: recalced.status,
      balanceDue: amount(recalced.balanceDue, receipt.currency),
      // AR-06: payment stops the ladder immediately.
      dunningStopped: recalced.balanceDue <= 0,
    })
  }

  // Derive the receipt's own totals from its allocations rather than tracking them.
  const { rows: totals } = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS allocated FROM billing_allocations
      WHERE receipt_id = $1 AND NOT reversed`,
    [req.receiptId],
  )
  const allocatedTotal = Number(totals[0].allocated)
  const unallocated = Number(receipt.amount) - allocatedTotal
  const status = allocatedTotal === 0 ? 'received'
    : unallocated <= 0.005 ? 'allocated' : 'part_allocated'

  await client.query(
    `UPDATE billing_receipts
        SET allocated_amount = $2, unallocated_amount = $3, status = $4, updated_at = NOW()
      WHERE id = $1`,
    [req.receiptId, allocatedTotal.toFixed(2), Math.max(0, unallocated).toFixed(2), status],
  )

  return {
    receiptStatus: status,
    allocatedTotal: amount(allocatedTotal, receipt.currency),
    unallocatedBalance: amount(Math.max(0, unallocated), receipt.currency),
    invoices: results,
  }
}

router.post('/allocate', requireAuth, requireBilling, requireCapability('can_confirm_eft_payment'),
  handler('billing-payments allocate', async (req, res) => {
    const { receiptId, allocations } = req.body ?? {}
    if (!receiptId) return badRequest(res, 'receiptId is required')
    if (!Array.isArray(allocations) || !allocations.length) {
      return badRequest(res, 'allocations must be a non-empty array of { invoiceId, amount }')
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await allocateToInvoices(client, {
        receiptId, tenantId: req.tenantId!,
        allocations: allocations.map((a: any) => ({
          invoiceId: a.invoiceId, amount: Number(a.amount), invoiceLineId: a.invoiceLineId ?? null,
        })),
        actorId: req.user!.id,
      })
      await audit(client, {
        tenantId: req.tenantId!, entityType: 'allocation', entityId: receiptId,
        action: 'allocate', after: result,
        actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
      })
      await client.query('COMMIT')
      return ok(res, result)
    } catch (err: any) {
      await client.query('ROLLBACK')
      // Allocation failures are user errors about money, not server faults —
      // the message is the whole point.
      if (err.message?.startsWith('Cannot allocate') || err.message?.includes('is in ')) {
        return refuse(res, err.message)
      }
      throw err
    } finally {
      client.release()
    }
  }))

/** Suggest a split across an account's open invoices, oldest first. */
router.get('/allocate/suggest', requireAuth, requireBilling,
  handler('billing-payments allocate suggest', async (req, res) => {
    const { receiptId } = req.query
    if (!receiptId) return badRequest(res, 'receiptId is required')

    const { rows: receiptRows } = await pool.query(
      `SELECT * FROM billing_receipts WHERE id = $1 AND tenant_id = $2`,
      [receiptId, req.tenantId!],
    )
    if (!receiptRows.length) return notFound(res, 'Receipt')
    const receipt = receiptRows[0]

    const { rows: invoices } = await pool.query(
      `SELECT id, invoice_number, issue_date, due_date, total, balance_due, currency, status
         FROM billing_invoices
        WHERE tenant_id = $1
          AND ($2::uuid IS NULL OR account_id = $2)
          AND balance_due > 0
          AND status IN ('issued','part_paid','overdue','disputed','part_credited')
        ORDER BY due_date ASC NULLS LAST`,
      [req.tenantId!, receipt.account_id],
    )

    let remaining = Number(receipt.unallocated_amount)
    const suggestion = invoices.map(i => {
      const take = Math.min(remaining, Number(i.balance_due))
      remaining = Math.round((remaining - take) * 100) / 100
      return {
        invoiceId: i.id,
        invoiceNumber: i.invoice_number,
        dueDate: i.due_date ? isoDate(i.due_date) : null,
        status: i.status,
        balanceDue: amount(i.balance_due, i.currency),
        suggestedAmount: amount(take, i.currency),
        // A disputed invoice should not be paid off by an auto-split by default.
        excludeReason: i.status === 'disputed' ? 'This invoice is disputed.' : null,
      }
    }).filter(s => Number(s.suggestedAmount.amount) > 0)

    return ok(res, {
      receipt: {
        id: receipt.id, receiptNumber: receipt.receipt_number,
        amount: amount(receipt.amount, receipt.currency),
        unallocated: amount(receipt.unallocated_amount, receipt.currency),
      },
      suggestion,
      residual: amount(remaining, receipt.currency),
      residualNote: remaining > 0
        ? 'This amount exceeds the open invoices and will stay unallocated on the account.'
        : null,
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// P-06 — refund / reversal, never a deletion (PY-08)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/reverse', requireAuth, requireBilling, requireCapability('can_refund'),
  handler('billing-payments reverse', async (req, res) => {
    const tenantId = req.tenantId!
    const { reason, amount: requested, approvedBy } = req.body ?? {}
    if (!reason?.trim()) return badRequest(res, 'A reason is required for a reversal.')

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: original } = await client.query(
        `SELECT * FROM billing_receipts WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.id, tenantId],
      )
      if (!original.length) { await client.query('ROLLBACK'); return notFound(res, 'Receipt') }
      const receipt = original[0]

      if (receipt.status === 'reversed') {
        await client.query('ROLLBACK')
        return refuse(res, 'This receipt has already been reversed.')
      }
      if (receipt.reversal_of_id) {
        await client.query('ROLLBACK')
        return refuse(res, 'A reversal cannot itself be reversed.')
      }

      const value = requested != null ? Number(requested) : Number(receipt.amount)
      if (!Number.isFinite(value) || value <= 0) return badRequest(res, 'amount must be positive')
      if (value > Number(receipt.amount) + 0.005) {
        await client.query('ROLLBACK')
        return refuse(res, `Cannot reverse more than the original ${Number(receipt.amount).toFixed(2)} ${receipt.currency}.`)
      }

      const approval = await approvalRequirement(client, tenantId, 'refund', value)
      if (approval.required && !approvedBy) {
        await client.query('ROLLBACK')
        return res.status(403).json({
          success: false,
          error: {
            message: 'A refund requires a named approver.',
            approvalRequired: true,
            threshold: approval.threshold,
            approverRole: approval.approverRole,
          },
        })
      }

      // Reverse the allocations first so each invoice goes back to owing.
      const { rows: allocations } = await client.query(
        `SELECT * FROM billing_allocations WHERE receipt_id = $1 AND NOT reversed`,
        [req.params.id],
      )
      await client.query(
        `UPDATE billing_allocations SET reversed = TRUE WHERE receipt_id = $1 AND NOT reversed`,
        [req.params.id],
      )
      const affected = []
      for (const a of allocations) {
        const recalced = await recalcInvoice(client, a.invoice_id, req.user!.id)
        await recordInvoiceEvent(client, {
          invoiceId: a.invoice_id,
          toStatus: recalced.status,
          eventKind: 'payment',
          detail: { reversedReceipt: receipt.receipt_number, amount: a.amount, reason },
          actorId: req.user!.id,
        })
        affected.push({
          invoiceId: a.invoice_id,
          status: recalced.status,
          balanceDue: amount(recalced.balanceDue, receipt.currency),
        })
      }

      // The original is marked reversed; a mirror receipt records the outflow.
      // Nothing is deleted, so P-07 can still reconstruct the whole history.
      const reversalNumber = await allocateDocumentNumber(client, tenantId, 'receipt')
      const { rows: mirror } = await client.query(
        `INSERT INTO billing_receipts (
           tenant_id, receipt_number, account_id, method, source, received_date,
           currency, amount, unallocated_amount, status,
           reversal_of_id, reversal_reason, narrative, recorded_by
         ) VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,$6,$7,0,'allocated',$8,$9,$10,$11)
         RETURNING *`,
        [
          tenantId, reversalNumber, receipt.account_id, receipt.method, receipt.source,
          receipt.currency, (-value).toFixed(2),
          req.params.id, reason.trim(),
          `Reversal of ${receipt.receipt_number}`, req.user!.id,
        ],
      )

      await client.query(
        `UPDATE billing_receipts
            SET status = 'reversed', allocated_amount = 0, unallocated_amount = 0,
                reversal_reason = $2, updated_at = NOW()
          WHERE id = $1`,
        [req.params.id, reason.trim()],
      )

      await audit(client, {
        tenantId, entityType: 'receipt', entityId: req.params.id, action: 'reverse',
        before: receipt, after: mirror[0],
        amountDelta: (-value).toFixed(2), currency: receipt.currency,
        reasonNote: reason, actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
      })
      await client.query('COMMIT')

      return created(res, {
        reversalReceiptId: mirror[0].id,
        reversalReceiptNumber: reversalNumber,
        originalReceiptNumber: receipt.receipt_number,
        amount: amount(value, receipt.currency),
        affectedInvoices: affected,
        note: 'The original receipt is retained and marked reversed; the reversal is shown against it.',
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

// ─────────────────────────────────────────────────────────────────────────────
// P-07 — payment audit trail (PY-10)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:id/audit', requireAuth, requireBilling,
  handler('billing-payments audit', async (req, res) => {
    const { rows: receipt } = await pool.query(
      `SELECT r.*, a.legal_name, u.name AS recorded_by_name
         FROM billing_receipts r
         LEFT JOIN billing_accounts a ON a.id = r.account_id
         LEFT JOIN app_users u ON u.id = r.recorded_by
        WHERE r.id = $1 AND r.tenant_id = $2`,
      [req.params.id, req.tenantId!],
    )
    if (!receipt.length) return notFound(res, 'Receipt')
    const r = receipt[0]

    const [allocations, events, attempts, reversals] = await Promise.all([
      pool.query(
        `SELECT al.*, i.invoice_number, u.name AS allocated_by_name
           FROM billing_allocations al
           JOIN billing_invoices i ON i.id = al.invoice_id
           LEFT JOIN app_users u ON u.id = al.allocated_by
          WHERE al.receipt_id = $1 ORDER BY al.created_at`,
        [req.params.id]),
      pool.query(
        `SELECT al.*, u.name AS actor_name FROM billing_audit_log al
           LEFT JOIN app_users u ON u.id = al.actor_id
          WHERE al.entity_type = 'receipt' AND al.entity_id = $1
          ORDER BY al.created_at`,
        [req.params.id]),
      pool.query(
        `SELECT * FROM billing_payment_attempts
          WHERE tenant_id = $1 AND provider_ref = $2 ORDER BY created_at`,
        [req.tenantId!, r.provider_ref ?? '—']),
      pool.query(
        `SELECT id, receipt_number, amount, reversal_reason, created_at
           FROM billing_receipts WHERE reversal_of_id = $1`,
        [req.params.id]),
    ])

    return ok(res, {
      receipt: {
        id: r.id, receiptNumber: r.receipt_number, accountName: r.legal_name,
        method: r.method, source: r.source, status: r.status,
        receivedDate: isoDate(r.received_date),
        amount: amount(r.amount, r.currency),
        allocated: amount(r.allocated_amount, r.currency),
        unallocated: amount(r.unallocated_amount, r.currency),
        recordedBy: r.recorded_by_name,
        reversalReason: r.reversal_reason,
      },
      allocations: allocations.rows.map(a => ({
        id: a.id, invoiceNumber: a.invoice_number,
        amount: amount(a.amount, r.currency),
        reversed: a.reversed,
        allocatedBy: a.allocated_by_name, at: a.created_at,
      })),
      reversals: reversals.rows.map(v => ({
        id: v.id, receiptNumber: v.receipt_number,
        amount: amount(v.amount, r.currency),
        reason: v.reversal_reason, at: v.created_at,
      })),
      // PY-11: failed attempts and retries are part of the history.
      attempts: attempts.rows.map(t => ({
        outcome: t.outcome, failureCode: t.failure_code,
        failureMessage: t.failure_message, retryCount: t.retry_count, at: t.created_at,
      })),
      history: events.rows.map(e => ({
        action: e.action, before: e.before_state, after: e.after_state,
        amountDelta: e.amount_delta, reasonNote: e.reason_note,
        actor: e.actor_name ?? e.actor_label, at: e.created_at,
      })),
    })
  }))

export default router
