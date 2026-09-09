/**
 * Nightly accrual — flow F4, the job that turns dwell into revenue (RT-05, RT-06).
 *
 *   Per tenant, in tenant timezone, inside a 2-hour window        NFR-B-10
 *     → for each consignment still on site:
 *          days on site − free allowance = billable days           TF-06
 *          accrue storage at the snapshot rate, tier-aware         TF-05, RT-02
 *     → threshold crossed? → demurrage line at an escalating rate  RT-06
 *     → idempotency key per (consignment, date): a re-run creates
 *       nothing new                                               RT-05, NFR-B-02
 *     → failures are isolated per tenant
 *
 * Idempotency is the whole design here. This job is the one thing in the module
 * that runs unattended, and the two ways it can go wrong are both expensive:
 * not running (silent under-billing, which R-05 exists to measure) or running
 * twice (double-charging a customer). A unique index on
 * (tenant_id, accrual_key) makes the second impossible, so the job is safe to
 * retry blindly — which is what makes "just run it again" a valid fix.
 */

import { pool } from '../db'
import { audit, isoDate, persistChargeLines, resolveTariff } from './billingRepo'
import { rate, RatingContext, RatingError } from './rating'
import { toDecimalString } from './money'
import { createHash } from 'crypto'

export interface AccrualOptions {
  actorId?: string | null
  actorLabel?: string
  /** Recompute even where an accrual already exists — still cannot duplicate. */
  dryRun?: boolean
}

export interface AccrualResult {
  tenantId: string
  businessDate: string
  status: 'succeeded' | 'failed' | 'skipped'
  processed: number
  created: number
  skipped: number
  amountAccrued: string
  currency: string
  demurrageLines: number
  thresholdCrossings: Array<{
    bookingId: string
    reference: string
    daysOnSite: number
    amount: string
    notifyEmail: string | null
  }>
  errors: Array<{ bookingId: string; reference: string; error: string }>
  durationMs: number
  idempotencyKey: string
  note?: string
}

/**
 * Run the accrual for one tenant and one business date.
 *
 * `businessDate` is the date being accrued *for* — normally yesterday, since a
 * day of storage is only complete once it has ended.
 */
export async function runNightlyAccrual(
  tenantId: string,
  businessDate: string,
  opts: AccrualOptions = {},
): Promise<AccrualResult> {
  const startedAt = Date.now()
  const date = businessDate.slice(0, 10)
  const jobKey = `nightly_accrual:${tenantId}:${date}`

  const result: AccrualResult = {
    tenantId,
    businessDate: date,
    status: 'succeeded',
    processed: 0,
    created: 0,
    skipped: 0,
    amountAccrued: '0.00',
    currency: 'AUD',
    demurrageLines: 0,
    thresholdCrossings: [],
    errors: [],
    durationMs: 0,
    idempotencyKey: jobKey,
  }

  // Claim the run. A second concurrent invocation loses the insert and returns
  // 'skipped' rather than accruing in parallel with the first.
  let jobRunId: string | null = null
  try {
    const { rows } = await pool.query(
      `INSERT INTO billing_job_runs
         (tenant_id, job_name, business_date, status, idempotency_key)
       VALUES ($1, 'nightly_accrual', $2::date, 'running', $3)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [tenantId, date, jobKey],
    )
    if (!rows.length) {
      const { rows: existing } = await pool.query(
        `SELECT status, records_created, amount_accrued FROM billing_job_runs
          WHERE idempotency_key = $1`,
        [jobKey],
      )
      result.status = 'skipped'
      result.durationMs = Date.now() - startedAt
      result.note = existing[0]?.status === 'running'
        ? 'An accrual for this date is already running.'
        : `An accrual for ${date} has already completed and created ${existing[0]?.records_created ?? 0} line(s). Re-running creates nothing new.`
      return result
    }
    jobRunId = rows[0].id
  } catch (err) {
    result.status = 'failed'
    result.errors.push({ bookingId: '—', reference: '—', error: (err as Error).message })
    result.durationMs = Date.now() - startedAt
    return result
  }

  try {
    // Consignments still on site on the business date. A booking that completed
    // before the date being accrued did not occupy the floor that night.
    const { rows: consignments } = await pool.query(
      `SELECT b.id, b.tenant_id, b.reference_number, b.service_type, b.load_type,
              b.slot_date, b.slot_start_time, b.weight_kg, b.volume_cbm,
              b.pallet_count, b.package_count, b.storage_start_date,
              b.container_number, b.container_size, b.status, b.user_id,
              b.guest_email, b.company_name, b.completed_at, b.checked_in_at,
              ($2::date - b.storage_start_date) AS days_on_site
         FROM bookings b
        WHERE b.tenant_id = $1
          AND b.storage_start_date IS NOT NULL
          AND b.storage_start_date <= $2::date
          AND b.status NOT IN ('cancelled')
          AND (b.completed_at IS NULL OR b.completed_at::date >= $2::date)
        ORDER BY b.storage_start_date`,
      [tenantId, date],
    )

    let accrued = 0
    let currency = 'AUD'

    for (const c of consignments) {
      result.processed++

      // One accrual per consignment per date, forever. The key is the contract
      // the unique index enforces.
      const accrualKey = createHash('sha256')
        .update(`${c.id}|${date}`)
        .digest('hex')
        .slice(0, 40)

      const client = await pool.connect()
      try {
        const { rows: already } = await client.query(
          `SELECT id FROM billing_charge_lines
            WHERE tenant_id = $1 AND accrual_key = $2`,
          [tenantId, accrualKey],
        )
        if (already.length) { result.skipped++; continue }

        // Price against the card the booking was sold under, so a rate change
        // published mid-storage applies only to later days (TF-13). The card
        // comes off the booking's existing lines; a booking that was never
        // rated falls back to the card effective on its slot date.
        const { rows: pinned } = await client.query(
          `SELECT rate_card_id FROM billing_charge_lines
            WHERE booking_id = $1 AND rate_card_id IS NOT NULL
            ORDER BY created_at LIMIT 1`,
          [c.id],
        )

        const { rows: accountRows } = c.user_id
          ? await client.query(
              `SELECT id, currency FROM billing_accounts
                WHERE tenant_id = $1 AND user_id = $2 AND status IN ('active','on_hold') LIMIT 1`,
              [tenantId, c.user_id])
          : { rows: [] as any[] }
        const accountId = accountRows[0]?.id ?? null

        const resolution = await resolveTariff(client, {
          tenantId,
          accountId,
          asOfDate: date,
          // A mid-storage rate change must apply from its effective date, so the
          // accrual for a given night resolves the card effective that night —
          // unless the booking is pinned to a specific card.
          rateCardId: pinned[0]?.rate_card_id ?? null,
        })
        if (!resolution) {
          result.errors.push({
            bookingId: c.id,
            reference: c.reference_number,
            error: 'No active rate card covers this date',
          })
          continue
        }
        currency = resolution.bundle.card.currency

        // Accrue exactly one day: the engine is asked for the charge as at this
        // date, and the previous accruals are subtracted, so a missed night is
        // caught up rather than lost.
        const daysOnSite = Number(c.days_on_site ?? 0)
        const ctx: RatingContext = {
          serviceType: c.service_type,
          loadType: c.load_type,
          customerSegment: accountId ? 'account' : 'guest',
          slotDate: isoDate(c.slot_date),
          slotStartTime: c.slot_start_time ? String(c.slot_start_time).slice(0, 5) : null,
          weightKg: c.weight_kg == null ? null : Number(c.weight_kg),
          volumeCbm: c.volume_cbm == null ? null : Number(c.volume_cbm),
          palletCount: c.pallet_count,
          packageCount: c.package_count,
          containerCount: c.container_number ? 1 : (c.load_type === 'fcl' ? 1 : 0),
          containerSize: c.container_size,
          storageStartDate: isoDate(c.storage_start_date),
          asOfDate: date,
          daysOnSite,
          dwellThresholdDays: 7,
        }

        let rated
        try {
          rated = rate(resolution.bundle, ctx)
        } catch (err) {
          result.errors.push({
            bookingId: c.id,
            reference: c.reference_number,
            error: err instanceof RatingError ? err.message : 'Rating failed',
          })
          continue
        }

        // Only the time-based lines accrue nightly; a slot fee is charged once.
        const accruingLines = rated.lines.filter(
          l => l.lineKind === 'storage' || l.lineKind === 'demurrage')
        if (!accruingLines.length) { result.skipped++; continue }

        // What has already been accrued, so today's line is the delta rather
        // than the cumulative figure.
        const { rows: priorRows } = await client.query(
          `SELECT line_kind, COALESCE(SUM(line_subtotal), 0) AS total
             FROM billing_charge_lines
            WHERE booking_id = $1 AND line_kind IN ('storage','demurrage')
              AND source = 'accrual'
            GROUP BY line_kind`,
          [c.id],
        )
        const priorByKind = new Map(priorRows.map(r => [r.line_kind, Number(r.total)]))

        await client.query('BEGIN')
        let createdForThis = 0
        for (const line of accruingLines) {
          const cumulative = Number(toDecimalString(line.lineSubtotal))
          const prior = priorByKind.get(line.lineKind) ?? 0
          const delta = Math.round((cumulative - prior) * 100) / 100
          if (delta <= 0) continue

          const taxRate = line.taxRate
          const taxAmount = Math.round((delta * taxRate / 100) * 100) / 100

          // Record real units at the real tariff rate, not "1 × the day's total".
          // Every downstream report multiplies quantity by unit_price — R-05's
          // give-away metric especially — so a line whose unit_price is actually
          // a whole-day amount silently corrupts them. Deriving units from
          // delta ÷ rate keeps units × rate = subtotal exact even when a missed
          // night is being caught up across several days.
          const snapshotRate = Number(rated.snapshot.rateLines[line.itemId]?.unitRate ?? 0)
          const unitRate = snapshotRate > 0 ? snapshotRate : delta
          const units = snapshotRate > 0
            ? Math.round((delta / snapshotRate) * 10_000) / 10_000
            : 1

          const working = {
            ...line.working,
            steps: [
              ...line.working.steps,
              {
                label: `Accrued for ${date}`,
                detail: `Charge to date ${cumulative.toFixed(2)} less ${prior.toFixed(2)} already accrued`,
                value: delta.toFixed(2),
              },
            ],
          }

          await client.query(
            `INSERT INTO billing_charge_lines (
               tenant_id, booking_id, account_id, item_id, item_version_id,
               rate_card_id, rate_card_version, rate_snapshot,
               description, unit_of_measure, quantity, chargeable_quantity, unit_price,
               line_subtotal, tax_rate, tax_amount, line_total, currency,
               line_kind, status, source, working, accrual_date, accrual_key
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
               $19,'actual','accrual',$20,$21::date,$22
             )
             ON CONFLICT (tenant_id, accrual_key) WHERE accrual_key IS NOT NULL
               DO NOTHING`,
            [
              tenantId, c.id, accountId, line.itemId, line.itemVersionId,
              resolution.bundle.card.id, resolution.bundle.card.versionNo,
              JSON.stringify(rated.snapshot.rateLines[line.itemId] ?? null),
              `${line.description} — ${date}`,
              line.unitOfMeasure, units, units, unitRate.toFixed(4),
              delta.toFixed(2), taxRate, taxAmount.toFixed(2),
              (delta + taxAmount).toFixed(2), currency,
              line.lineKind, JSON.stringify(working), date,
              // One key per (consignment, date, kind) so storage and demurrage
              // can both accrue on the same night without colliding.
              `${accrualKey}:${line.lineKind}`,
            ],
          )
          createdForThis++
          accrued += delta

          if (line.lineKind === 'demurrage') {
            result.demurrageLines++
            // RT-06: the account holder is warned, and the review screen (O-06)
            // is where a human decides before it reaches an invoice.
            result.thresholdCrossings.push({
              bookingId: c.id,
              reference: c.reference_number,
              daysOnSite,
              amount: delta.toFixed(2),
              notifyEmail: c.guest_email ?? null,
            })
          }
        }
        await client.query('COMMIT')

        if (createdForThis) result.created += createdForThis
        else result.skipped++
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        result.errors.push({
          bookingId: c.id,
          reference: c.reference_number,
          error: (err as Error).message,
        })
      } finally {
        client.release()
      }
    }

    result.amountAccrued = accrued.toFixed(2)
    result.currency = currency
    result.durationMs = Date.now() - startedAt
    // Per-consignment failures do not fail the run — the rest of the tenant's
    // cargo must still accrue.
    result.status = 'succeeded'

    await pool.query(
      `UPDATE billing_job_runs
          SET status = $2, records_processed = $3, records_created = $4,
              records_skipped = $5, amount_accrued = $6,
              error_message = $7, finished_at = NOW(), duration_ms = $8
        WHERE id = $1`,
      [
        jobRunId, result.errors.length ? 'succeeded' : 'succeeded',
        result.processed, result.created, result.skipped, result.amountAccrued,
        result.errors.length
          ? `${result.errors.length} consignment(s) failed: ${result.errors.slice(0, 3).map(e => `${e.reference}: ${e.error}`).join('; ')}`
          : null,
        result.durationMs,
      ],
    )

    await audit(pool, {
      tenantId,
      entityType: 'charge_line',
      action: 'create',
      after: {
        job: 'nightly_accrual', businessDate: date,
        created: result.created, skipped: result.skipped,
        accrued: result.amountAccrued, errors: result.errors.length,
      },
      amountDelta: result.amountAccrued,
      currency: result.currency,
      actorId: opts.actorId ?? null,
      actorLabel: opts.actorLabel ?? 'nightly accrual',
    })

    return result
  } catch (err) {
    result.status = 'failed'
    result.durationMs = Date.now() - startedAt
    result.errors.push({ bookingId: '—', reference: '—', error: (err as Error).message })
    await pool.query(
      `UPDATE billing_job_runs
          SET status = 'failed', error_message = $2, finished_at = NOW(), duration_ms = $3
        WHERE id = $1`,
      [jobRunId, (err as Error).message, result.durationMs],
    ).catch(() => {})
    return result
  }
}

/**
 * Run the accrual for every tenant, isolating failures per tenant (NFR-B-10).
 * One tenant's broken tariff must not stop another tenant's storage accruing.
 */
export async function runNightlyAccrualAllTenants(
  businessDate?: string,
): Promise<AccrualResult[]> {
  const date = businessDate
    ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)  // yesterday

  const { rows: tenants } = await pool.query(`SELECT id, name FROM tenants ORDER BY name`)
  const results: AccrualResult[] = []

  for (const t of tenants) {
    try {
      results.push(await runNightlyAccrual(t.id, date, { actorLabel: 'nightly accrual' }))
    } catch (err) {
      console.error(`[billing accrual] tenant ${t.name} failed`, err)
      results.push({
        tenantId: t.id, businessDate: date, status: 'failed',
        processed: 0, created: 0, skipped: 0, amountAccrued: '0.00', currency: 'AUD',
        demurrageLines: 0, thresholdCrossings: [],
        errors: [{ bookingId: '—', reference: '—', error: (err as Error).message }],
        durationMs: 0, idempotencyKey: `nightly_accrual:${t.id}:${date}`,
      })
    }
  }

  return results
}
