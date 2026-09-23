/**
 * Tariff — step 2 of the chain (T-01 … T-11, F9).
 *
 *   GET    /api/billing/tariffs                   T-01 rate card list
 *   POST   /api/billing/tariffs                   T-02 create card
 *   GET    /api/billing/tariffs/:id               T-02/T-03 card with lines
 *   PATCH  /api/billing/tariffs/:id               T-02 header edit (draft only)
 *   POST   /api/billing/tariffs/:id/lines         T-03 price an item
 *   PATCH  /api/billing/tariffs/lines/:lineId     T-03 edit a rate line
 *   DELETE /api/billing/tariffs/lines/:lineId
 *   POST   /api/billing/tariffs/:id/simulate      T-08 simulator                TF-11
 *   GET    /api/billing/tariffs/:id/compare/:otherId  T-10 diff                 TF-14
 *   POST   /api/billing/tariffs/:id/publish       T-09 draft → active           TF-12
 *   POST   /api/billing/tariffs/:id/uplift        T-11 bulk CPI uplift          TF-15
 *   GET/POST /api/billing/tariffs/formulas        T-04 chargeable quantity      TF-08
 *   POST   /api/billing/tariffs/formulas/test     T-04 test panel
 *   GET/POST /api/billing/tariffs/surcharges      T-05                          TF-09
 *   GET/POST /api/billing/tariffs/scenarios       T-08 saved scenarios
 */

import { Router } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import { audit, isoDate, resolveTariff } from '../lib/billingRepo'
import {
  AVAILABLE_FUNCTIONS, evaluateNumeric, FormulaError, inspectFormula,
} from '../lib/formula'
import { rate, RatingContext, RatingError } from '../lib/rating'
import { formatMoney, money, toDecimalString } from '../lib/money'
import {
  badRequest, created, handler, notFound, ok, refuse, requireBilling, requireCapability,
} from '../lib/billingHttp'

const router = Router()

const RATE_TYPES = ['flat', 'per_unit', 'graduated', 'volume_band', 'threshold', 'percent_of_base']

function amount(value: unknown, currency: string) {
  const n = Number(value ?? 0)
  return { amount: n.toFixed(2), currency, display: formatMoney(money(n.toFixed(2), currency)) }
}

/** Once a card has priced anything, its rates are history and must not move. */
async function assertEditable(cardId: string, tenantId: string) {
  const { rows } = await pool.query(
    `SELECT rc.status, rc.name,
            (SELECT COUNT(*) FROM billing_charge_lines cl WHERE cl.rate_card_id = rc.id) AS used
       FROM billing_rate_cards rc WHERE rc.id = $1 AND rc.tenant_id = $2`,
    [cardId, tenantId],
  )
  if (!rows.length) return { ok: false as const, notFound: true }
  const r = rows[0]
  if (r.status === 'draft' || r.status === 'reviewed') return { ok: true as const, row: r }
  return {
    ok: false as const,
    notFound: false,
    message: `"${r.name}" is ${r.status} and has priced ${r.used} charge line(s). Rates on a live card cannot be edited — create a new version instead.`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// T-01 — rate card list
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, requireBilling, handler('billing-tariffs list', async (req, res) => {
  const params: unknown[] = [req.tenantId!]
  const where = ['rc.tenant_id = $1']
  if (req.query.status && req.query.status !== 'all') {
    params.push(String(req.query.status).split(','))
    where.push(`rc.status = ANY($${params.length}::text[])`)
  }

  const { rows } = await pool.query(
    `SELECT rc.*,
            (SELECT COUNT(*) FROM billing_rate_lines rl WHERE rl.rate_card_id = rc.id) AS line_count,
            (SELECT COUNT(*) FROM billing_accounts a WHERE a.rate_card_id = rc.id)     AS account_count,
            (SELECT COUNT(*) FROM billing_charge_lines cl WHERE cl.rate_card_id = rc.id) AS used_count,
            up.name AS published_by_name, rv.name AS reviewed_by_name
       FROM billing_rate_cards rc
       LEFT JOIN app_users up ON up.id = rc.published_by
       LEFT JOIN app_users rv ON rv.id = rc.reviewed_by
      WHERE ${where.join(' AND ')}
      ORDER BY rc.status, rc.effective_from DESC`,
    params,
  )

  return ok(res, {
    rateTypes: RATE_TYPES,
    cards: rows.map(r => ({
      id: r.id,
      name: r.name,
      siteId: r.site_id,
      currency: r.currency,
      status: r.status,
      versionNo: r.version_no,
      effectiveFrom: isoDate(r.effective_from),
      effectiveTo: r.effective_to ? isoDate(r.effective_to) : null,
      isSiteDefault: r.is_site_default,
      roundingMode: r.rounding_mode,
      roundingDp: r.rounding_dp,
      lineCount: Number(r.line_count),
      assignedAccounts: Number(r.account_count),
      usedByChargeLines: Number(r.used_count),
      reviewedBy: r.reviewed_by_name,
      publishedBy: r.published_by_name,
      publishedAt: r.published_at,
      editable: r.status === 'draft' || r.status === 'reviewed',
      // Only legal transitions are offered (§4).
      availableActions: cardActions(r.status, req.billingCaps!),
    })),
  })
}))

function cardActions(status: string, caps: Record<string, boolean>): string[] {
  switch (status) {
    case 'draft':
      return caps.can_manage_tariffs
        ? ['edit', 'simulate', 'mark_reviewed', ...(caps.can_publish_tariffs ? ['publish'] : []), 'delete']
        : ['simulate']
    case 'reviewed':
      return [...(caps.can_publish_tariffs ? ['publish'] : []), 'simulate', 'back_to_draft']
    case 'active':
      return ['simulate', 'compare', ...(caps.can_manage_tariffs ? ['new_version', 'uplift', 'archive'] : [])]
    case 'superseded':
      return ['simulate', 'compare']
    default:
      return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// T-04 — chargeable-quantity formulas (must precede /:id)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/formulas', requireAuth, requireBilling,
  handler('billing-tariffs formulas', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT f.*, (SELECT COUNT(*) FROM billing_rate_lines rl WHERE rl.formula_id = f.id) AS used
         FROM billing_qty_formulas f WHERE f.tenant_id = $1 ORDER BY f.is_default DESC, f.name`,
      [req.tenantId!],
    )
    return ok(res, {
      availableFunctions: AVAILABLE_FUNCTIONS,
      // The named inputs a tenant may reference, so the editor can offer them.
      availableInputs: [
        'weight_kg', 'volume_cbm', 'pallet_count', 'package_count', 'container_count',
        'hours_on_site', 'days_on_site', 'dwell_threshold_days',
        'service_type', 'load_type', 'cargo_type', 'customer_segment',
        'is_weekend', 'is_after_hours', 'is_public_holiday', 'is_hazardous',
        'storage_start_date', 'slot_date',
      ],
      formulas: rows.map(r => ({
        id: r.id, name: r.name, expression: r.expression, inputs: r.inputs,
        description: r.description, isDefault: r.is_default, usedByRateLines: Number(r.used),
      })),
    })
  }))

/** T-04's test panel: validate and show the result for sample inputs. */
router.post('/formulas/test', requireAuth, requireBilling,
  handler('billing-tariffs formula test', async (req, res) => {
    const { expression, inputs = {}, sample = {} } = req.body ?? {}
    if (!expression?.trim()) return badRequest(res, 'expression is required')

    const inspection = inspectFormula(expression)
    if (!inspection.valid) {
      return ok(res, {
        valid: false, error: inspection.error, position: inspection.position,
        variables: [], result: null,
      })
    }

    const scope = { ...DEFAULT_SAMPLE, ...inputs, ...sample }
    const missing = inspection.variables.filter(v => !(v in scope))
    if (missing.length) {
      return ok(res, {
        valid: false,
        error: `No value supplied for: ${missing.join(', ')}`,
        variables: inspection.variables, result: null,
      })
    }

    try {
      const result = evaluateNumeric(expression, scope)
      return ok(res, {
        valid: true,
        variables: inspection.variables,
        functions: inspection.functions,
        scopeUsed: Object.fromEntries(inspection.variables.map(v => [v, scope[v]])),
        result,
      })
    } catch (err) {
      return ok(res, {
        valid: false,
        error: err instanceof FormulaError ? err.message : 'Evaluation failed',
        variables: inspection.variables, result: null,
      })
    }
  }))

const DEFAULT_SAMPLE: Record<string, number | string | boolean | null> = {
  weight_kg: 2000, volume_cbm: 1.5, pallet_count: 3, package_count: 12,
  container_count: 1, hours_on_site: 2, days_on_site: 5, dwell_threshold_days: 7,
  service_type: 'dropoff', load_type: 'lcl', cargo_type: null, customer_segment: 'account',
  is_weekend: false, is_after_hours: false, is_public_holiday: false, is_hazardous: false,
  storage_start_date: null, slot_date: null,
}

router.post('/formulas', requireAuth, requireBilling, requireCapability('can_manage_tariffs'),
  handler('billing-tariffs formula create', async (req, res) => {
    const { name, expression, inputs, description, isDefault } = req.body ?? {}
    if (!name?.trim()) return badRequest(res, 'name is required')
    if (!expression?.trim()) return badRequest(res, 'expression is required')

    const inspection = inspectFormula(expression)
    if (!inspection.valid) return badRequest(res, `Invalid expression: ${inspection.error}`)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      if (isDefault) {
        await client.query(
          `UPDATE billing_qty_formulas SET is_default = FALSE WHERE tenant_id = $1`,
          [req.tenantId!],
        )
      }
      const { rows } = await client.query(
        `INSERT INTO billing_qty_formulas (tenant_id, name, expression, inputs, description, is_default)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.tenantId!, name.trim(), expression.trim(),
         JSON.stringify(inputs ?? {}), description ?? null, !!isDefault],
      )
      await audit(client, {
        tenantId: req.tenantId!, entityType: 'setting', entityId: rows[0].id, action: 'create',
        after: rows[0], actorId: req.user!.id, actorLabel: req.user!.name,
      })
      await client.query('COMMIT')
      return created(res, rows[0])
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

// ─────────────────────────────────────────────────────────────────────────────
// T-05 — surcharges
// ─────────────────────────────────────────────────────────────────────────────

router.get('/surcharges', requireAuth, requireBilling,
  handler('billing-tariffs surcharges', async (req, res) => {
    const [surcharges, holidays] = await Promise.all([
      pool.query(
        `SELECT s.*, ci.customer_name AS item_name
           FROM billing_surcharges s
           LEFT JOIN billing_catalogue_items ci ON ci.id = s.item_id
          WHERE s.tenant_id = $1 ORDER BY s.code`,
        [req.tenantId!]),
      pool.query(
        `SELECT * FROM billing_holidays WHERE tenant_id = $1 ORDER BY holiday_date`,
        [req.tenantId!]),
    ])
    return ok(res, {
      surcharges: surcharges.rows,
      holidays: holidays.rows.map(h => ({ id: h.id, date: isoDate(h.holiday_date), label: h.label })),
      conditionKinds: ['always', 'after_hours', 'weekend', 'public_holiday',
                       'hazardous', 'date_range', 'expression'],
    })
  }))

router.post('/surcharges', requireAuth, requireBilling, requireCapability('can_manage_tariffs'),
  handler('billing-tariffs surcharge create', async (req, res) => {
    const b = req.body ?? {}
    if (!b.code?.trim() || !b.label?.trim()) return badRequest(res, 'code and label are required')
    if (b.conditionKind === 'expression') {
      const expr = b.conditionConfig?.expression
      if (!expr) return badRequest(res, 'An expression condition needs conditionConfig.expression')
      const inspection = inspectFormula(expr)
      if (!inspection.valid) return badRequest(res, `Invalid condition: ${inspection.error}`)
    }
    const { rows } = await pool.query(
      `INSERT INTO billing_surcharges (
         tenant_id, rate_card_id, item_id, code, label, basis, value,
         applies_to, applies_to_ref, condition_kind, condition_config, taxability, active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        req.tenantId!, b.rateCardId ?? null, b.itemId ?? null,
        b.code.trim().toUpperCase(), b.label.trim(), b.basis ?? 'percent', b.value ?? 0,
        b.appliesTo ?? 'subtotal', b.appliesToRef ?? null,
        b.conditionKind ?? 'always', JSON.stringify(b.conditionConfig ?? {}),
        b.taxability ?? 'standard', b.active ?? true,
      ],
    )
    return created(res, rows[0])
  }))

// ─────────────────────────────────────────────────────────────────────────────
// T-08 — saved scenarios
// ─────────────────────────────────────────────────────────────────────────────

router.get('/scenarios', requireAuth, requireBilling,
  handler('billing-tariffs scenarios', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM billing_rate_scenarios WHERE tenant_id = $1 ORDER BY created_at`,
      [req.tenantId!],
    )
    return ok(res, {
      scenarios: rows,
      // TF-11 wants at least ten scenarios before a card is published; say so.
      recommendedMinimum: 10,
      shortfall: Math.max(0, 10 - rows.length),
    })
  }))

router.post('/scenarios', requireAuth, requireBilling, requireCapability('can_manage_tariffs'),
  handler('billing-tariffs scenario create', async (req, res) => {
    const { name, inputs, expectedTotal } = req.body ?? {}
    if (!name?.trim()) return badRequest(res, 'name is required')
    if (!inputs?.slotDate) return badRequest(res, 'inputs.slotDate is required')
    const { rows } = await pool.query(
      `INSERT INTO billing_rate_scenarios (tenant_id, name, inputs, expected_total)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.tenantId!, name.trim(), JSON.stringify(inputs), expectedTotal ?? null],
    )
    return created(res, rows[0])
  }))

router.delete('/scenarios/:id', requireAuth, requireBilling,
  requireCapability('can_manage_tariffs'),
  handler('billing-tariffs scenario delete', async (req, res) => {
    const result = await pool.query(
      `DELETE FROM billing_rate_scenarios WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId!],
    )
    if (!result.rowCount) return notFound(res, 'Scenario')
    return ok(res, { deleted: true })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// T-02 — create / detail / edit a card
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, requireBilling, requireCapability('can_manage_tariffs'),
  handler('billing-tariffs create', async (req, res) => {
    const b = req.body ?? {}
    if (!b.name?.trim()) return badRequest(res, 'name is required')
    if (!b.effectiveFrom) return badRequest(res, 'effectiveFrom is required')

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `INSERT INTO billing_rate_cards (
           tenant_id, name, site_id, currency, effective_from, effective_to,
           status, is_site_default, rounding_mode, rounding_dp,
           supersedes_card_id, version_no, created_by
         ) VALUES ($1,$2,$3,$4,$5::date,$6,'draft',$7,$8,$9,$10,$11,$12) RETURNING *`,
        [
          req.tenantId!, b.name.trim(), b.siteId ?? null, b.currency ?? 'AUD',
          b.effectiveFrom, b.effectiveTo ?? null,
          !!b.isSiteDefault, b.roundingMode ?? 'half_up', b.roundingDp ?? 2,
          b.supersedesCardId ?? null, b.versionNo ?? 1, req.user!.id,
        ],
      )
      const card = rows[0]

      // "New version of an existing card" copies every rate line so the tenant
      // edits a delta rather than retyping a tariff (F9, TF-15's sibling path).
      if (b.copyFromCardId) {
        await copyRateLines(client, b.copyFromCardId, card.id, 1)
      }

      await audit(client, {
        tenantId: req.tenantId!, entityType: 'rate_card', entityId: card.id, action: 'create',
        after: card, actorId: req.user!.id, actorLabel: req.user!.name,
      })
      await client.query('COMMIT')
      return created(res, card)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

async function copyRateLines(
  client: any, fromCardId: string, toCardId: string, multiplier: number,
): Promise<number> {
  const { rows: lines } = await client.query(
    `SELECT * FROM billing_rate_lines WHERE rate_card_id = $1`, [fromCardId],
  )
  for (const l of lines) {
    const { rows: newLine } = await client.query(
      `INSERT INTO billing_rate_lines (
         rate_card_id, item_id, rate_type, unit_rate, percent_of, percent_base_item,
         min_quantity, min_charge, max_cap, free_allowance, free_allowance_unit,
         formula_id, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [
        toCardId, l.item_id, l.rate_type,
        l.unit_rate == null ? null : (Number(l.unit_rate) * multiplier).toFixed(4),
        l.percent_of, l.percent_base_item,
        l.min_quantity,
        l.min_charge == null ? null : (Number(l.min_charge) * multiplier).toFixed(2),
        l.max_cap == null ? null : (Number(l.max_cap) * multiplier).toFixed(2),
        l.free_allowance, l.free_allowance_unit, l.formula_id, l.notes,
      ],
    )
    const { rows: tiers } = await client.query(
      `SELECT * FROM billing_rate_tiers WHERE rate_line_id = $1 ORDER BY tier_no`, [l.id],
    )
    for (const t of tiers) {
      await client.query(
        `INSERT INTO billing_rate_tiers
           (rate_line_id, tier_no, from_qty, to_qty, unit_rate, flat_amount)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          newLine[0].id, t.tier_no, t.from_qty, t.to_qty,
          (Number(t.unit_rate) * multiplier).toFixed(4),
          t.flat_amount == null ? null : (Number(t.flat_amount) * multiplier).toFixed(2),
        ],
      )
    }
  }
  return lines.length
}

router.get('/:id', requireAuth, requireBilling, handler('billing-tariffs detail', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT rc.*, up.name AS published_by_name, rv.name AS reviewed_by_name
       FROM billing_rate_cards rc
       LEFT JOIN app_users up ON up.id = rc.published_by
       LEFT JOIN app_users rv ON rv.id = rc.reviewed_by
      WHERE rc.id = $1 AND rc.tenant_id = $2`,
    [req.params.id, req.tenantId!],
  )
  if (!rows.length) return notFound(res, 'Rate card')
  const card = rows[0]

  const [lines, accounts, unpriced] = await Promise.all([
    pool.query(
      `SELECT rl.*, ci.code AS item_code, ci.customer_name, ci.category, ci.unit_of_measure,
              f.name AS formula_name, f.expression AS formula_expression,
              COALESCE((SELECT json_agg(json_build_object(
                          'id', t.id, 'tierNo', t.tier_no, 'fromQty', t.from_qty,
                          'toQty', t.to_qty, 'unitRate', t.unit_rate, 'flatAmount', t.flat_amount)
                        ORDER BY t.from_qty)
                 FROM billing_rate_tiers t WHERE t.rate_line_id = rl.id), '[]'::json) AS tiers
         FROM billing_rate_lines rl
         JOIN billing_catalogue_items ci ON ci.id = rl.item_id
         LEFT JOIN billing_qty_formulas f ON f.id = rl.formula_id
        WHERE rl.rate_card_id = $1
        ORDER BY ci.category, ci.sort_order`,
      [req.params.id]),
    pool.query(
      `SELECT id, account_code, legal_name FROM billing_accounts
        WHERE rate_card_id = $1 ORDER BY legal_name`,
      [req.params.id]),
    // Active services with no rate on this card — the gap that makes a
    // mandatory item silently unpriced at rating time.
    pool.query(
      `SELECT ci.id, ci.code, ci.customer_name, ci.category, ci.unit_of_measure
         FROM billing_catalogue_items ci
        WHERE ci.tenant_id = $1 AND ci.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM billing_rate_lines rl
                           WHERE rl.rate_card_id = $2 AND rl.item_id = ci.id)
        ORDER BY ci.category, ci.sort_order`,
      [req.tenantId!, req.params.id]),
  ])

  return ok(res, {
    card: {
      id: card.id, name: card.name, siteId: card.site_id, currency: card.currency,
      status: card.status, versionNo: card.version_no,
      effectiveFrom: isoDate(card.effective_from),
      effectiveTo: card.effective_to ? isoDate(card.effective_to) : null,
      isSiteDefault: card.is_site_default,
      roundingMode: card.rounding_mode, roundingDp: card.rounding_dp,
      reviewedBy: card.reviewed_by_name, publishedBy: card.published_by_name,
      publishedAt: card.published_at,
      editable: card.status === 'draft' || card.status === 'reviewed',
      availableActions: cardActions(card.status, req.billingCaps!),
    },
    lines: lines.rows.map(l => ({
      id: l.id,
      itemId: l.item_id, itemCode: l.item_code, itemName: l.customer_name,
      category: l.category, unitOfMeasure: l.unit_of_measure,
      rateType: l.rate_type,
      unitRate: l.unit_rate,
      percentOf: l.percent_of, percentBaseItemId: l.percent_base_item,
      minQuantity: l.min_quantity, minCharge: l.min_charge, maxCap: l.max_cap,
      freeAllowance: l.free_allowance, freeAllowanceUnit: l.free_allowance_unit,
      formulaId: l.formula_id, formulaName: l.formula_name,
      formulaExpression: l.formula_expression,
      tiers: l.tiers, notes: l.notes,
    })),
    assignedAccounts: accounts.rows,
    unpricedItems: unpriced.rows,
    // TF-01's "assigned-customer count" and the coverage warning in one place.
    coverage: {
      priced: lines.rows.length,
      unpriced: unpriced.rows.length,
      complete: unpriced.rows.length === 0,
    },
  })
}))

router.patch('/:id', requireAuth, requireBilling, requireCapability('can_manage_tariffs'),
  handler('billing-tariffs patch', async (req, res) => {
    const guard = await assertEditable(req.params.id, req.tenantId!)
    if (!guard.ok) {
      if (guard.notFound) return notFound(res, 'Rate card')
      return refuse(res, guard.message!)
    }

    const FIELDS: Record<string, string> = {
      name: 'name', siteId: 'site_id', currency: 'currency',
      effectiveFrom: 'effective_from', effectiveTo: 'effective_to',
      isSiteDefault: 'is_site_default', roundingMode: 'rounding_mode', roundingDp: 'rounding_dp',
    }
    const sets: string[] = []
    const params: unknown[] = []
    for (const [key, column] of Object.entries(FIELDS)) {
      if (req.body?.[key] !== undefined) {
        params.push(req.body[key]); sets.push(`${column} = $${params.length}`)
      }
    }
    if (!sets.length) return badRequest(res, 'No fields to update')
    params.push(req.params.id, req.tenantId!)
    const { rows } = await pool.query(
      `UPDATE billing_rate_cards SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING *`,
      params,
    )
    return ok(res, rows[0])
  }))

// ─────────────────────────────────────────────────────────────────────────────
// T-03 — rate lines
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/lines', requireAuth, requireBilling, requireCapability('can_manage_tariffs'),
  handler('billing-tariffs line create', async (req, res) => {
    const guard = await assertEditable(req.params.id, req.tenantId!)
    if (!guard.ok) {
      if (guard.notFound) return notFound(res, 'Rate card')
      return refuse(res, guard.message!)
    }

    const b = req.body ?? {}
    if (!b.itemId) return badRequest(res, 'itemId is required')
    const rateType = b.rateType ?? 'flat'
    if (!RATE_TYPES.includes(rateType)) {
      return badRequest(res, `rateType must be one of ${RATE_TYPES.join(', ')}`)
    }
    const tiers = Array.isArray(b.tiers) ? b.tiers : []
    const needsTiers = ['graduated', 'volume_band', 'threshold'].includes(rateType)
    if (needsTiers && !tiers.length) {
      return badRequest(res, `A ${rateType} rate needs at least one tier.`)
    }
    if (!needsTiers && rateType !== 'percent_of_base' && (b.unitRate == null || b.unitRate === '')) {
      return badRequest(res, `A ${rateType} rate needs a unit rate.`)
    }
    if (rateType === 'percent_of_base' && (b.percentOf == null || b.percentOf === '')) {
      return badRequest(res, 'A percent-of-base rate needs percentOf.')
    }
    const tierError = validateTiers(tiers, rateType)
    if (tierError) return badRequest(res, tierError)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `INSERT INTO billing_rate_lines (
           rate_card_id, item_id, rate_type, unit_rate, percent_of, percent_base_item,
           min_quantity, min_charge, max_cap, free_allowance, free_allowance_unit,
           formula_id, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [
          req.params.id, b.itemId, rateType,
          b.unitRate ?? null, b.percentOf ?? null, b.percentBaseItemId ?? null,
          b.minQuantity ?? null, b.minCharge ?? null, b.maxCap ?? null,
          b.freeAllowance ?? null, b.freeAllowanceUnit ?? null,
          b.formulaId ?? null, b.notes ?? null,
        ],
      )
      for (const [idx, t] of tiers.entries()) {
        await client.query(
          `INSERT INTO billing_rate_tiers
             (rate_line_id, tier_no, from_qty, to_qty, unit_rate, flat_amount)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [rows[0].id, t.tierNo ?? idx + 1, t.fromQty ?? 0, t.toQty ?? null,
           t.unitRate ?? 0, t.flatAmount ?? null],
        )
      }
      await audit(client, {
        tenantId: req.tenantId!, entityType: 'rate_line', entityId: rows[0].id, action: 'create',
        after: rows[0], actorId: req.user!.id, actorLabel: req.user!.name,
      })
      await client.query('COMMIT')
      return created(res, rows[0])
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

/**
 * Tier tables are the easiest thing in a tariff to get subtly wrong. A gap or an
 * overlap does not error at rating time — it silently prices the wrong number,
 * so it is refused here.
 */
function validateTiers(tiers: any[], rateType: string): string | null {
  if (!tiers.length) return null
  const sorted = [...tiers].sort((a, b) => Number(a.fromQty ?? 0) - Number(b.fromQty ?? 0))
  for (const [i, t] of sorted.entries()) {
    const from = Number(t.fromQty ?? 0)
    const to = t.toQty == null || t.toQty === '' ? null : Number(t.toQty)
    if (!Number.isFinite(from) || from < 0) return `Tier ${i + 1}: "from" must be zero or more.`
    if (to != null && to <= from) return `Tier ${i + 1}: "to" must be greater than "from".`
    if (!Number.isFinite(Number(t.unitRate ?? 0))) return `Tier ${i + 1}: rate must be a number.`
    if (i > 0) {
      const prev = sorted[i - 1]
      const prevTo = prev.toQty == null || prev.toQty === '' ? null : Number(prev.toQty)
      if (prevTo == null) return `Tier ${i}: an unbounded tier must be the last one.`
      if (from < prevTo) return `Tiers ${i} and ${i + 1} overlap between ${from} and ${prevTo}.`
      if (from > prevTo) return `Tiers ${i} and ${i + 1} leave a gap between ${prevTo} and ${from}.`
    }
  }
  if (rateType !== 'threshold' && Number(sorted[0].fromQty ?? 0) !== 0) {
    return 'The first tier must start at zero, or quantities below it will not be priced.'
  }
  return null
}

router.patch('/lines/:lineId', requireAuth, requireBilling, requireCapability('can_manage_tariffs'),
  handler('billing-tariffs line patch', async (req, res) => {
    const { rows: found } = await pool.query(
      `SELECT rl.rate_card_id FROM billing_rate_lines rl WHERE rl.id = $1`, [req.params.lineId],
    )
    if (!found.length) return notFound(res, 'Rate line')
    const guard = await assertEditable(found[0].rate_card_id, req.tenantId!)
    if (!guard.ok) {
      if (guard.notFound) return notFound(res, 'Rate card')
      return refuse(res, guard.message!)
    }

    const b = req.body ?? {}
    if (Array.isArray(b.tiers)) {
      const err = validateTiers(b.tiers, b.rateType ?? 'graduated')
      if (err) return badRequest(res, err)
    }

    const FIELDS: Record<string, string> = {
      rateType: 'rate_type', unitRate: 'unit_rate', percentOf: 'percent_of',
      percentBaseItemId: 'percent_base_item', minQuantity: 'min_quantity',
      minCharge: 'min_charge', maxCap: 'max_cap', freeAllowance: 'free_allowance',
      freeAllowanceUnit: 'free_allowance_unit', formulaId: 'formula_id', notes: 'notes',
    }
    const sets: string[] = []
    const params: unknown[] = []
    for (const [key, column] of Object.entries(FIELDS)) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`${column} = $${params.length}`) }
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: before } = await client.query(
        `SELECT * FROM billing_rate_lines WHERE id = $1`, [req.params.lineId],
      )
      let updated = before[0]
      if (sets.length) {
        params.push(req.params.lineId)
        const { rows } = await client.query(
          `UPDATE billing_rate_lines SET ${sets.join(', ')}, updated_at = NOW()
            WHERE id = $${params.length} RETURNING *`,
          params,
        )
        updated = rows[0]
      }
      if (Array.isArray(b.tiers)) {
        await client.query(`DELETE FROM billing_rate_tiers WHERE rate_line_id = $1`, [req.params.lineId])
        for (const [idx, t] of b.tiers.entries()) {
          await client.query(
            `INSERT INTO billing_rate_tiers
               (rate_line_id, tier_no, from_qty, to_qty, unit_rate, flat_amount)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [req.params.lineId, t.tierNo ?? idx + 1, t.fromQty ?? 0, t.toQty ?? null,
             t.unitRate ?? 0, t.flatAmount ?? null],
          )
        }
      }
      await audit(client, {
        tenantId: req.tenantId!, entityType: 'rate_line', entityId: req.params.lineId,
        action: 'update', before: before[0], after: updated,
        actorId: req.user!.id, actorLabel: req.user!.name,
      })
      await client.query('COMMIT')
      return ok(res, updated)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

router.delete('/lines/:lineId', requireAuth, requireBilling, requireCapability('can_manage_tariffs'),
  handler('billing-tariffs line delete', async (req, res) => {
    const { rows: found } = await pool.query(
      `SELECT rate_card_id FROM billing_rate_lines WHERE id = $1`, [req.params.lineId],
    )
    if (!found.length) return notFound(res, 'Rate line')
    const guard = await assertEditable(found[0].rate_card_id, req.tenantId!)
    if (!guard.ok) {
      if (guard.notFound) return notFound(res, 'Rate card')
      return refuse(res, guard.message!)
    }
    await pool.query(`DELETE FROM billing_rate_lines WHERE id = $1`, [req.params.lineId])
    return ok(res, { deleted: true })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// T-08 — simulator: validate before publishing (TF-11)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/simulate', requireAuth, requireBilling,
  handler('billing-tariffs simulate', async (req, res) => {
    const tenantId = req.tenantId!
    const body = req.body ?? {}

    // Either an ad-hoc scenario, or "run all" over the saved library.
    let scenarios: Array<{ id?: string; name: string; inputs: any; expectedTotal?: string | null }>
    if (body.runAll) {
      const { rows } = await pool.query(
        `SELECT * FROM billing_rate_scenarios WHERE tenant_id = $1 ORDER BY created_at`,
        [tenantId],
      )
      scenarios = rows.map(r => ({
        id: r.id, name: r.name, inputs: r.inputs, expectedTotal: r.expected_total,
      }))
      if (!scenarios.length) {
        return badRequest(res, 'No saved scenarios. Save a scenario first, or supply inputs directly.')
      }
    } else {
      if (!body.inputs?.slotDate) return badRequest(res, 'inputs.slotDate is required')
      scenarios = [{ name: body.name ?? 'Ad-hoc scenario', inputs: body.inputs }]
    }

    const results = []
    for (const scenario of scenarios) {
      const resolution = await resolveTariff(pool, {
        tenantId,
        rateCardId: req.params.id,
        asOfDate: scenario.inputs.slotDate,
      })
      if (!resolution) {
        results.push({ name: scenario.name, ok: false, error: 'Rate card not found' })
        continue
      }

      const ctx: RatingContext = { ...scenario.inputs }
      try {
        const result = rate(resolution.bundle, ctx)
        const c = result.currency
        const total = toDecimalString(result.total)
        const expected = scenario.expectedTotal != null ? Number(scenario.expectedTotal).toFixed(2) : null
        results.push({
          scenarioId: scenario.id,
          name: scenario.name,
          ok: true,
          // A saved scenario doubles as a regression assertion.
          regression: expected == null ? null
            : { expected, actual: total, matches: expected === total },
          subtotal: amount(toDecimalString(result.subtotal), c),
          taxTotal: amount(toDecimalString(result.taxTotal), c),
          total: amount(total, c),
          warnings: result.warnings,
          // Per-line result with the working shown (T-08's stated requirement).
          lines: result.lines.map(l => ({
            itemCode: l.itemCode,
            description: l.description,
            quantity: l.quantity,
            chargeableQuantity: l.chargeableQuantity,
            lineSubtotal: amount(toDecimalString(l.lineSubtotal), c),
            lineTotal: amount(toDecimalString(l.lineTotal), c),
            working: l.working,
          })),
        })
      } catch (err) {
        results.push({
          scenarioId: scenario.id,
          name: scenario.name,
          ok: false,
          error: err instanceof RatingError || err instanceof FormulaError
            ? err.message : 'Rating failed',
        })
      }
    }

    const failed = results.filter(r => !r.ok).length
    const regressions = results.filter(r => r.ok && r.regression && !r.regression.matches).length
    return ok(res, {
      results,
      summary: {
        run: results.length,
        failed,
        regressions,
        readyToPublish: failed === 0 && regressions === 0 && results.length >= 10,
        note: results.length < 10
          ? `TF-11 recommends at least 10 saved scenarios before publishing; ${results.length} ran.`
          : null,
      },
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// T-10 — compare two cards (TF-14)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:id/compare/:otherId', requireAuth, requireBilling,
  handler('billing-tariffs compare', async (req, res) => {
    const load = async (cardId: string) => {
      const { rows } = await pool.query(
        `SELECT rl.*, ci.code AS item_code, ci.customer_name, rc.name AS card_name
           FROM billing_rate_lines rl
           JOIN billing_catalogue_items ci ON ci.id = rl.item_id
           JOIN billing_rate_cards rc ON rc.id = rl.rate_card_id
          WHERE rl.rate_card_id = $1 AND rc.tenant_id = $2`,
        [cardId, req.tenantId!],
      )
      return rows
    }
    const [a, b] = await Promise.all([load(req.params.id), load(req.params.otherId)])
    if (!a.length && !b.length) return notFound(res, 'Rate card')

    const byCode = (rows: any[]) => new Map(rows.map(r => [r.item_code, r]))
    const mapA = byCode(a)
    const mapB = byCode(b)
    const codes = [...new Set([...mapA.keys(), ...mapB.keys()])].sort()

    return ok(res, {
      left: { id: req.params.id, name: a[0]?.card_name ?? null },
      right: { id: req.params.otherId, name: b[0]?.card_name ?? null },
      rows: codes.map(code => {
        const l = mapA.get(code)
        const r = mapB.get(code)
        const lRate = l?.unit_rate == null ? null : Number(l.unit_rate)
        const rRate = r?.unit_rate == null ? null : Number(r.unit_rate)
        let change: 'added' | 'removed' | 'changed' | 'unchanged'
        if (!l) change = 'added'
        else if (!r) change = 'removed'
        else change = lRate !== rRate || l.rate_type !== r.rate_type ? 'changed' : 'unchanged'
        return {
          itemCode: code,
          itemName: (l ?? r).customer_name,
          change,
          left: l ? { rateType: l.rate_type, unitRate: l.unit_rate, minCharge: l.min_charge } : null,
          right: r ? { rateType: r.rate_type, unitRate: r.unit_rate, minCharge: r.min_charge } : null,
          deltaPct: lRate && rRate && lRate !== 0
            ? Number((((rRate - lRate) / lRate) * 100).toFixed(2)) : null,
        }
      }),
    })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// T-09 — publish (TF-12, TF-13)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/publish', requireAuth, requireBilling, requireCapability('can_publish_tariffs'),
  handler('billing-tariffs publish', async (req, res) => {
    const tenantId = req.tenantId!
    const { effectiveFrom, acknowledgeCoverageGap } = req.body ?? {}

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT * FROM billing_rate_cards WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.id, tenantId],
      )
      if (!rows.length) { await client.query('ROLLBACK'); return notFound(res, 'Rate card') }
      const card = rows[0]

      if (card.status !== 'draft' && card.status !== 'reviewed') {
        await client.query('ROLLBACK')
        return refuse(res, `A ${card.status} card cannot be published.`)
      }

      const { rows: lineCount } = await client.query(
        `SELECT COUNT(*)::int AS n FROM billing_rate_lines WHERE rate_card_id = $1`,
        [req.params.id],
      )
      if (!lineCount[0].n) {
        await client.query('ROLLBACK')
        return refuse(res, 'This card has no rate lines — publishing it would price nothing.')
      }

      // A mandatory service with no rate on the card being published is the
      // single most expensive misconfiguration available, so it is called out.
      const { rows: gaps } = await client.query(
        `SELECT ci.code, ci.customer_name
           FROM billing_applicability_rules ar
           JOIN billing_catalogue_items ci ON ci.id = ar.item_id
          WHERE ar.tenant_id = $1 AND ar.active AND ar.attach_mode = 'mandatory'
            AND ci.status = 'active'
            AND NOT EXISTS (SELECT 1 FROM billing_rate_lines rl
                             WHERE rl.rate_card_id = $2 AND rl.item_id = ci.id)`,
        [tenantId, req.params.id],
      )
      if (gaps.length && !acknowledgeCoverageGap) {
        await client.query('ROLLBACK')
        return refuse(
          res,
          `These services attach to every matching booking but have no rate on this card: ${gaps.map(g => g.customer_name).join(', ')}. They would be charged nothing. Acknowledge to publish anyway.`,
        )
      }

      const from = effectiveFrom ?? isoDate(card.effective_from);

      // Supersede the card this one replaces — never delete it, so historical
      // charge lines can still be explained (SC-08).
      if (card.supersedes_card_id) {
        await client.query(
          `UPDATE billing_rate_cards
              SET status = 'superseded', effective_to = ($2::date - INTERVAL '1 day')
            WHERE id = $1 AND status = 'active'`,
          [card.supersedes_card_id, from],
        )
      } else if (card.is_site_default) {
        await client.query(
          `UPDATE billing_rate_cards
              SET status = 'superseded', effective_to = ($3::date - INTERVAL '1 day')
            WHERE tenant_id = $1 AND id <> $2 AND status = 'active' AND is_site_default
              AND site_id IS NOT DISTINCT FROM $4`,
          [tenantId, req.params.id, from, card.site_id],
        )
      }

      const { rows: published } = await client.query(
        `UPDATE billing_rate_cards
            SET status = 'active', effective_from = $2::date,
                published_by = $3, published_at = NOW(),
                reviewed_by = COALESCE(reviewed_by, $3),
                reviewed_at = COALESCE(reviewed_at, NOW())
          WHERE id = $1 RETURNING *`,
        [req.params.id, from, req.user!.id],
      )

      await audit(client, {
        tenantId, entityType: 'rate_card', entityId: req.params.id, action: 'publish',
        before: card, after: published[0],
        actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
      })
      await client.query('COMMIT')

      return ok(res, {
        card: published[0],
        // TF-13, stated plainly because it is the thing tenants most fear.
        effectNote: `Effective from ${from}. Bookings already confirmed keep the rates they were quoted. Cargo already in storage is charged the old rate for days before ${from} and the new rate from ${from} onward, and the invoice will show both.`,
        coverageGaps: gaps.map(g => g.customer_name),
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

router.post('/:id/review', requireAuth, requireBilling, requireCapability('can_manage_tariffs'),
  handler('billing-tariffs review', async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE billing_rate_cards
          SET status = 'reviewed', reviewed_by = $2, reviewed_at = NOW()
        WHERE id = $1 AND tenant_id = $3 AND status = 'draft' RETURNING *`,
      [req.params.id, req.user!.id, req.tenantId!],
    )
    if (!rows.length) return refuse(res, 'Only a draft card can be marked reviewed.')
    return ok(res, rows[0])
  }))

// ─────────────────────────────────────────────────────────────────────────────
// T-11 — bulk uplift (TF-15)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/uplift', requireAuth, requireBilling, requireCapability('can_manage_tariffs'),
  handler('billing-tariffs uplift', async (req, res) => {
    const tenantId = req.tenantId!
    const { percent, effectiveFrom, name, preview = true } = req.body ?? {}
    const pct = Number(percent)
    if (!Number.isFinite(pct)) return badRequest(res, 'percent is required')
    if (!preview && !effectiveFrom) return badRequest(res, 'effectiveFrom is required to commit')

    const { rows: source } = await pool.query(
      `SELECT * FROM billing_rate_cards WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    )
    if (!source.length) return notFound(res, 'Rate card')
    const card = source[0]
    const multiplier = 1 + pct / 100
    const dp = card.rounding_dp ?? 2

    const { rows: lines } = await pool.query(
      `SELECT rl.*, ci.code AS item_code, ci.customer_name
         FROM billing_rate_lines rl JOIN billing_catalogue_items ci ON ci.id = rl.item_id
        WHERE rl.rate_card_id = $1 ORDER BY ci.category, ci.sort_order`,
      [req.params.id],
    )

    const previewRows = lines.map(l => ({
      itemCode: l.item_code,
      itemName: l.customer_name,
      rateType: l.rate_type,
      oldRate: l.unit_rate,
      newRate: l.unit_rate == null ? null : (Number(l.unit_rate) * multiplier).toFixed(4),
      oldMinCharge: l.min_charge,
      newMinCharge: l.min_charge == null ? null : (Number(l.min_charge) * multiplier).toFixed(2),
    }))

    if (preview) {
      return ok(res, {
        preview: true, percent: pct, affectedLines: lines.length, rows: previewRows,
      })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: newCard } = await client.query(
        `INSERT INTO billing_rate_cards (
           tenant_id, name, site_id, currency, effective_from, status, is_site_default,
           rounding_mode, rounding_dp, supersedes_card_id, version_no, created_by
         ) VALUES ($1,$2,$3,$4,$5::date,'draft',$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          tenantId,
          name?.trim() || `${card.name} +${pct}%`,
          card.site_id, card.currency, effectiveFrom, card.is_site_default,
          card.rounding_mode, dp, card.id, (card.version_no ?? 1) + 1, req.user!.id,
        ],
      )
      const copied = await copyRateLines(client, card.id, newCard[0].id, multiplier)
      await audit(client, {
        tenantId, entityType: 'rate_card', entityId: newCard[0].id, action: 'create',
        after: { upliftPercent: pct, from: card.id, lines: copied },
        reasonNote: `Bulk uplift of ${pct}% from "${card.name}"`,
        actorId: req.user!.id, actorLabel: req.user!.name,
      })
      await client.query('COMMIT')

      return created(res, {
        card: newCard[0],
        linesCopied: copied,
        // A draft, deliberately — an uplift still goes through simulate/publish.
        note: 'Created as a draft. Simulate it and publish when you are satisfied.',
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

// ─────────────────────────────────────────────────────────────────────────────
// T-07 — customer tariff assignment (TF-03)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/assign', requireAuth, requireBilling, requireCapability('can_manage_tariffs'),
  handler('billing-tariffs assign', async (req, res) => {
    const { accountIds, unassign } = req.body ?? {}
    if (!Array.isArray(accountIds) || !accountIds.length) {
      return badRequest(res, 'accountIds must be a non-empty array')
    }
    const { rows } = await pool.query(
      `UPDATE billing_accounts
          SET rate_card_id = $1, updated_at = NOW()
        WHERE id = ANY($2::uuid[]) AND tenant_id = $3
        RETURNING id, account_code, legal_name`,
      [unassign ? null : req.params.id, accountIds, req.tenantId!],
    )
    await audit(pool, {
      tenantId: req.tenantId!, entityType: 'rate_card', entityId: req.params.id,
      action: 'update',
      after: { [unassign ? 'unassigned' : 'assigned']: rows.map(r => r.account_code) },
      actorId: req.user!.id, actorLabel: req.user!.name,
    })
    return ok(res, {
      updated: rows,
      // T-07's fallback indicator: an unassigned account falls back to the default.
      note: unassign
        ? 'These accounts now fall back to the site default rate card.'
        : `${rows.length} account(s) now price against this card.`,
    })
  }))

export default router
