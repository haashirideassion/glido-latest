/**
 * Billing settings (S-01 … S-11) and the job monitor (Y-01, Y-03).
 *
 *   GET   /api/billing/settings/capabilities   S-11 what may this user do?
 *   GET   /api/billing/settings                S-01…S-05 all tenant settings
 *   PUT   /api/billing/settings/tax            S-01                    TX-01/02/03
 *   PUT   /api/billing/settings/invoice        S-02 numbering, branding IN-03/04/05
 *   PUT   /api/billing/settings/dunning        S-05 the ladder          AR-06
 *   PUT   /api/billing/settings/thresholds     S-10 approvals           TX-08
 *   PUT   /api/billing/settings/capabilities/:userId  S-11 grant
 *   GET   /api/billing/settings/jobs           Y-01 job monitor         RT-05
 *   POST  /api/billing/settings/jobs/accrual   Y-01 run accrual now
 */

import { Router } from 'express'
import { pool } from '../db'
import { requireAuth, requireRole } from '../middleware/auth'
import { audit, BILLING_CAPABILITIES, isoDate } from '../lib/billingRepo'
import { runNightlyAccrual } from '../lib/billingAccrual'
import { formatMoney, money } from '../lib/money'
import {
  badRequest, handler, notFound, ok, requireBilling, requireCapability,
} from '../lib/billingHttp'

const router = Router()

function amount(value: unknown, currency = 'AUD') {
  const n = Number(value ?? 0)
  return { amount: n.toFixed(2), currency, display: formatMoney(money(n.toFixed(2), currency)) }
}

/**
 * S-11 — the capability set for the signed-in user.
 *
 * The UI calls this before rendering so an action the user cannot perform is
 * absent or disabled with a reason, rather than failing on submit
 * (cross-cutting rule 4). The server still enforces each capability itself.
 */
router.get('/capabilities', requireAuth, requireBilling,
  handler('billing-settings capabilities', async (req, res) => {
    return ok(res, {
      userId: req.user!.id,
      role: req.user!.role,
      capabilities: req.billingCaps,
      // The thresholds matter to the UI too: it can warn before a user starts a
      // concession they will not be allowed to finish.
      thresholds: Object.fromEntries(
        (await pool.query(
          `SELECT action, threshold_amount, approver_role, allow_self_approval
             FROM billing_approval_thresholds WHERE tenant_id = $1`,
          [req.tenantId!],
        )).rows.map(r => [r.action, {
          threshold: Number(r.threshold_amount),
          approverRole: r.approver_role,
          allowSelfApproval: r.allow_self_approval,
        }]),
      ),
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// All settings in one read — the Settings screens hydrate from this
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, requireBilling, handler('billing-settings get', async (req, res) => {
  const tenantId = req.tenantId!
  const [tax, sequences, dunning, thresholds, capabilities, ledger] = await Promise.all([
    pool.query(
      `SELECT * FROM billing_tax_settings WHERE tenant_id = $1
        ORDER BY effective_from DESC`, [tenantId]),
    pool.query(
      `SELECT * FROM billing_number_sequences WHERE tenant_id = $1 ORDER BY doc_kind`, [tenantId]),
    pool.query(
      `SELECT * FROM billing_dunning_steps WHERE tenant_id = $1 ORDER BY step_no`, [tenantId]),
    pool.query(
      `SELECT * FROM billing_approval_thresholds WHERE tenant_id = $1 ORDER BY action`, [tenantId]),
    pool.query(
      `SELECT bc.*, u.name, u.email, u.role
         FROM billing_capabilities bc
         JOIN app_users u ON u.id = bc.user_id
        WHERE bc.tenant_id = $1 ORDER BY u.name`, [tenantId]),
    pool.query(
      `SELECT provider, status, external_org_name, sync_from_date, last_sync_at, last_error
         FROM billing_ledger_connections WHERE tenant_id = $1`, [tenantId]),
  ])

  return ok(res, {
    tax: {
      current: tax.rows[0] ? {
        id: tax.rows[0].id,
        isRegistered: tax.rows[0].is_registered,
        abn: tax.rows[0].abn,
        jurisdiction: tax.rows[0].jurisdiction,
        standardRate: tax.rows[0].standard_rate,
        effectiveFrom: isoDate(tax.rows[0].effective_from),
      } : null,
      // TX-02: rate versions by effective date, so a historical invoice is
      // explainable against the rate that applied then.
      history: tax.rows.map(r => ({
        id: r.id, isRegistered: r.is_registered, standardRate: r.standard_rate,
        effectiveFrom: isoDate(r.effective_from),
        effectiveTo: r.effective_to ? isoDate(r.effective_to) : null,
      })),
      treatments: ['standard', 'gst_free', 'input_taxed'],
    },
    numbering: sequences.rows.map(r => ({
      docKind: r.doc_kind, prefix: r.prefix, nextValue: Number(r.next_value),
      padWidth: r.pad_width,
      preview: `${r.prefix}${String(r.next_value).padStart(r.pad_width, '0')}`,
    })),
    dunning: dunning.rows.map(r => ({
      id: r.id, stepNo: r.step_no, offsetDays: r.offset_days, channel: r.channel,
      subject: r.subject, bodyTemplate: r.body_template,
      lateFeeType: r.late_fee_type, lateFeeValue: r.late_fee_value,
      escalate: r.escalate, active: r.active,
      timing: r.offset_days < 0
        ? `${Math.abs(r.offset_days)} day(s) before due`
        : r.offset_days === 0 ? 'on the due date' : `${r.offset_days} day(s) after due`,
    })),
    // AR-06 / AR-09, stated so the settings screen can show the two stop conditions.
    dunningRules: {
      stopsOnPayment: true,
      pausesOnDispute: true,
      note: 'The ladder stops the moment an invoice is paid, and pauses while a dispute is open.',
    },
    thresholds: thresholds.rows.map(r => ({
      action: r.action,
      thresholdAmount: amount(r.threshold_amount),
      approverRole: r.approver_role,
      allowSelfApproval: r.allow_self_approval,
    })),
    capabilities: capabilities.rows.map(r => ({
      userId: r.user_id, name: r.name, email: r.email, role: r.role,
      capabilities: Object.fromEntries(BILLING_CAPABILITIES.map(c => [c, !!r[c]])),
    })),
    capabilityKeys: BILLING_CAPABILITIES,
    ledger: ledger.rows,
  })
}))

// ─────────────────────────────────────────────────────────────────────────────
// S-01 — tax settings (TX-01, TX-02, TX-03, TX-05)
// ─────────────────────────────────────────────────────────────────────────────

router.put('/tax', requireAuth, requireBilling, requireRole('reception_admin', 'super_admin', 'billing'),
  handler('billing-settings tax', async (req, res) => {
    const tenantId = req.tenantId!
    const { isRegistered, abn, jurisdiction, standardRate, effectiveFrom, siteId } = req.body ?? {}

    if (isRegistered && !abn?.trim()) {
      // IN-04 requires an ABN on a tax invoice; refusing here stops a tenant
      // configuring themselves into issuing non-compliant documents.
      return badRequest(res, 'An ABN is required when the tenant is registered for GST.')
    }
    const rate = Number(standardRate ?? 10)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return badRequest(res, 'standardRate must be a percentage between 0 and 100.')
    }

    const from = effectiveFrom ?? new Date().toISOString().slice(0, 10)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: before } = await client.query(
        `SELECT * FROM billing_tax_settings WHERE tenant_id = $1
          ORDER BY effective_from DESC LIMIT 1`, [tenantId],
      )

      // A rate change is a new version, never an overwrite — otherwise a
      // historical BAS reconciliation silently changes (TX-02).
      if (before.length && isoDate(before[0].effective_from) !== from) {
        await client.query(
          `UPDATE billing_tax_settings SET effective_to = ($2::date - INTERVAL '1 day')
            WHERE id = $1`,
          [before[0].id, from],
        )
        await client.query(
          `INSERT INTO billing_tax_settings
             (tenant_id, site_id, is_registered, abn, jurisdiction, effective_from, standard_rate)
           VALUES ($1,$2,$3,$4,$5,$6::date,$7)`,
          [tenantId, siteId ?? null, !!isRegistered, abn?.trim() ?? null,
           jurisdiction ?? 'AU', from, rate.toFixed(4)],
        )
      } else if (before.length) {
        await client.query(
          `UPDATE billing_tax_settings
              SET is_registered = $2, abn = $3, jurisdiction = $4, standard_rate = $5
            WHERE id = $1`,
          [before[0].id, !!isRegistered, abn?.trim() ?? null, jurisdiction ?? 'AU', rate.toFixed(4)],
        )
      } else {
        await client.query(
          `INSERT INTO billing_tax_settings
             (tenant_id, site_id, is_registered, abn, jurisdiction, effective_from, standard_rate)
           VALUES ($1,$2,$3,$4,$5,$6::date,$7)`,
          [tenantId, siteId ?? null, !!isRegistered, abn?.trim() ?? null,
           jurisdiction ?? 'AU', from, rate.toFixed(4)],
        )
      }

      await audit(client, {
        tenantId, entityType: 'setting', action: 'update',
        before: before[0] ?? null,
        after: { isRegistered, abn, standardRate: rate, effectiveFrom: from },
        actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
      })
      await client.query('COMMIT')

      return ok(res, {
        effectiveFrom: from,
        // TX-03: the consequence for documents, spelled out.
        documentEffect: isRegistered
          ? 'Invoices will be titled "Tax Invoice", show the ABN, and state GST separately.'
          : 'Invoices will be titled "Invoice", will not show GST, and will state that the supplier is not registered for GST.',
        note: 'Invoices already issued are unaffected — they keep the tax treatment that applied when they were issued.',
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

// ─────────────────────────────────────────────────────────────────────────────
// S-02 — invoice numbering (IN-03)
// ─────────────────────────────────────────────────────────────────────────────

router.put('/invoice', requireAuth, requireBilling,
  requireRole('reception_admin', 'super_admin', 'billing'),
  handler('billing-settings invoice', async (req, res) => {
    const tenantId = req.tenantId!
    const { sequences } = req.body ?? {}
    if (!Array.isArray(sequences)) return badRequest(res, 'sequences must be an array')

    const results = []
    for (const s of sequences) {
      if (!['invoice', 'credit_note', 'receipt'].includes(s.docKind)) continue

      const { rows: current } = await pool.query(
        `SELECT next_value FROM billing_number_sequences
          WHERE tenant_id = $1 AND doc_kind = $2`,
        [tenantId, s.docKind],
      )
      // IN-03: numbers are gapless and immutable, so a sequence may only ever
      // move forward. Rewinding it would re-issue a number already on a document.
      if (current.length && s.nextValue != null && Number(s.nextValue) < Number(current[0].next_value)) {
        return badRequest(
          res,
          `The ${s.docKind} sequence is already at ${current[0].next_value} and cannot be moved backwards — a number already issued must never be reused.`,
        )
      }

      const { rows } = await pool.query(
        `INSERT INTO billing_number_sequences (tenant_id, doc_kind, prefix, next_value, pad_width)
         VALUES ($1,$2,$3,COALESCE($4, 1),COALESCE($5, 6))
         ON CONFLICT (tenant_id, doc_kind) DO UPDATE
           SET prefix = COALESCE(EXCLUDED.prefix, billing_number_sequences.prefix),
               next_value = GREATEST(EXCLUDED.next_value, billing_number_sequences.next_value),
               pad_width = COALESCE(EXCLUDED.pad_width, billing_number_sequences.pad_width)
         RETURNING *`,
        [tenantId, s.docKind, s.prefix ?? null, s.nextValue ?? null, s.padWidth ?? null],
      )
      results.push({
        docKind: rows[0].doc_kind,
        preview: `${rows[0].prefix}${String(rows[0].next_value).padStart(rows[0].pad_width, '0')}`,
      })
    }

    await audit(pool, {
      tenantId, entityType: 'setting', action: 'update',
      after: { numbering: results },
      actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
    })
    return ok(res, { sequences: results })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// S-05 — dunning ladder (AR-06)
// ─────────────────────────────────────────────────────────────────────────────

router.put('/dunning', requireAuth, requireBilling,
  requireRole('reception_admin', 'super_admin', 'billing'),
  handler('billing-settings dunning', async (req, res) => {
    const tenantId = req.tenantId!
    const { steps } = req.body ?? {}
    if (!Array.isArray(steps)) return badRequest(res, 'steps must be an array')

    // Two steps at the same offset means two emails on the same day, which is
    // how a chasing ladder turns into spam.
    const offsets = steps.filter(s => s.active !== false).map(s => Number(s.offsetDays))
    if (new Set(offsets).size !== offsets.length) {
      return badRequest(res, 'Two active steps cannot share the same offset — they would send on the same day.')
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`DELETE FROM billing_dunning_steps WHERE tenant_id = $1`, [tenantId])
      for (const [idx, s] of steps.entries()) {
        await client.query(
          `INSERT INTO billing_dunning_steps (
             tenant_id, step_no, offset_days, channel, subject, body_template,
             late_fee_type, late_fee_value, escalate, active
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            tenantId, s.stepNo ?? idx + 1, Number(s.offsetDays ?? 0),
            s.channel ?? 'email', s.subject ?? null, s.bodyTemplate ?? null,
            s.lateFeeType ?? null, s.lateFeeValue ?? null,
            !!s.escalate, s.active ?? true,
          ],
        )
      }
      await audit(client, {
        tenantId, entityType: 'setting', action: 'update',
        after: { dunningSteps: steps.length },
        actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
      })
      await client.query('COMMIT')
      return ok(res, { steps: steps.length })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

// ─────────────────────────────────────────────────────────────────────────────
// S-10 — approval thresholds & segregation of duties (TX-08)
// ─────────────────────────────────────────────────────────────────────────────

router.put('/thresholds', requireAuth, requireBilling,
  requireRole('reception_admin', 'super_admin'),
  handler('billing-settings thresholds', async (req, res) => {
    const tenantId = req.tenantId!
    const { thresholds } = req.body ?? {}
    if (!Array.isArray(thresholds)) return badRequest(res, 'thresholds must be an array')

    const VALID = ['discount', 'credit_note', 'write_off', 'adjustment',
                   'waiver', 'credit_override', 'refund']
    const results = []
    for (const t of thresholds) {
      if (!VALID.includes(t.action)) continue
      // Self-approval on a write-off or credit note removes the only control
      // there is, so it cannot be switched on from here.
      const allowSelf = ['write_off', 'credit_note', 'credit_override'].includes(t.action)
        ? false : !!t.allowSelfApproval
      const { rows } = await pool.query(
        `INSERT INTO billing_approval_thresholds
           (tenant_id, action, threshold_amount, approver_role, allow_self_approval)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id, action) DO UPDATE
           SET threshold_amount = EXCLUDED.threshold_amount,
               approver_role = EXCLUDED.approver_role,
               allow_self_approval = EXCLUDED.allow_self_approval
         RETURNING *`,
        [tenantId, t.action, Number(t.thresholdAmount ?? 0).toFixed(2),
         t.approverRole ?? 'reception_admin', allowSelf],
      )
      results.push({
        action: rows[0].action,
        thresholdAmount: amount(rows[0].threshold_amount),
        approverRole: rows[0].approver_role,
        allowSelfApproval: rows[0].allow_self_approval,
        selfApprovalLocked: ['write_off', 'credit_note', 'credit_override'].includes(t.action),
      })
    }

    await audit(pool, {
      tenantId, entityType: 'setting', action: 'update',
      after: { thresholds: results },
      actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
    })
    return ok(res, {
      thresholds: results,
      note: 'Write-offs, credit notes and credit overrides can never be self-approved.',
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// S-11 — grant capabilities
// ─────────────────────────────────────────────────────────────────────────────

router.put('/capabilities/:userId', requireAuth, requireBilling,
  requireRole('reception_admin', 'super_admin'),
  handler('billing-settings grant', async (req, res) => {
    const tenantId = req.tenantId!
    const grants = req.body?.capabilities ?? {}

    const { rows: userRows } = await pool.query(
      `SELECT id, name, role FROM app_users WHERE id = $1`, [req.params.userId],
    )
    if (!userRows.length) return notFound(res, 'User')

    const columns = BILLING_CAPABILITIES.filter(c => c in grants)
    if (!columns.length) return badRequest(res, 'No capabilities supplied')

    const setClauses = columns.map((c, i) => `${c} = $${i + 3}`)
    const values = columns.map(c => !!grants[c])

    const { rows } = await pool.query(
      `INSERT INTO billing_capabilities (tenant_id, user_id, ${columns.join(', ')}, updated_by)
       VALUES ($1, $2, ${columns.map((_, i) => `$${i + 3}`).join(', ')}, $${columns.length + 3})
       ON CONFLICT (tenant_id, user_id) DO UPDATE
         SET ${setClauses.join(', ')}, updated_by = $${columns.length + 3}, updated_at = NOW()
       RETURNING *`,
      [tenantId, req.params.userId, ...values, req.user!.id],
    )

    await audit(pool, {
      tenantId, entityType: 'setting', entityId: req.params.userId, action: 'update',
      after: { user: userRows[0].name, granted: grants },
      actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
    })

    return ok(res, {
      userId: req.params.userId,
      name: userRows[0].name,
      capabilities: Object.fromEntries(BILLING_CAPABILITIES.map(c => [c, !!rows[0][c]])),
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// Y-01 — job monitor (RT-05, NFR-B-10)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/jobs', requireAuth, requireBilling, handler('billing-settings jobs', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM billing_job_runs
      WHERE tenant_id = $1 OR tenant_id IS NULL
      ORDER BY started_at DESC LIMIT 100`,
    [req.tenantId!],
  )

  const { rows: integrity } = await pool.query(
    `SELECT check_name, passed, variance, checked_at FROM billing_integrity_checks
      WHERE tenant_id = $1 ORDER BY checked_at DESC LIMIT 20`,
    [req.tenantId!],
  )

  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const accruals = rows.filter(r => r.job_name === 'nightly_accrual')

  return ok(res, {
    runs: rows.map(r => ({
      id: r.id,
      jobName: r.job_name,
      businessDate: isoDate(r.business_date),
      status: r.status,
      recordsProcessed: r.records_processed,
      recordsCreated: r.records_created,
      recordsSkipped: r.records_skipped,
      amountAccrued: amount(r.amount_accrued),
      errorMessage: r.error_message,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      durationMs: r.duration_ms,
      // RT-05 / NFR-B-02: a re-run is safe because of the idempotency key.
      idempotencyKey: r.idempotency_key,
    })),
    accrualHealth: {
      lastRunDate: accruals[0] ? isoDate(accruals[0].business_date) : null,
      lastRunStatus: accruals[0]?.status ?? null,
      // The thing that actually loses money: a night the accrual did not run.
      ranYesterday: accruals.some(r => isoDate(r.business_date) === yesterday && r.status === 'succeeded'),
      ranToday: accruals.some(r => isoDate(r.business_date) === today && r.status === 'succeeded'),
      warning: accruals.some(r => isoDate(r.business_date) === yesterday && r.status === 'succeeded')
        ? null
        : 'The nightly accrual has not recorded a successful run for yesterday. Storage may be under-billed.',
    },
    integrityChecks: integrity.map(c => ({
      name: c.check_name, passed: c.passed,
      failures: c.variance == null ? null : Number(c.variance),
      checkedAt: c.checked_at,
    })),
    retention: {
      // NFR-B-09: the seven-year window, and the fact that purging inside it is refused.
      years: 7,
      purgeAllowedBefore: new Date(Date.now() - 7 * 365.25 * 86_400_000).toISOString().slice(0, 10),
      note: 'Financial records inside the seven-year window cannot be purged. The audit log is append-only.',
    },
  })
}))

router.post('/jobs/accrual', requireAuth, requireBilling, requireCapability('can_run_billing'),
  handler('billing-settings run accrual', async (req, res) => {
    const businessDate = req.body?.businessDate ?? new Date().toISOString().slice(0, 10)
    const result = await runNightlyAccrual(req.tenantId!, businessDate, {
      actorId: req.user!.id,
      actorLabel: req.user!.name,
    })
    return ok(res, result)
  }))

export default router
