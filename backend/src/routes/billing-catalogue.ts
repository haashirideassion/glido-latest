/**
 * Service catalogue — step 1 of the chain (C-01 … C-07).
 *
 *   GET    /api/billing/catalogue                 C-01 list
 *   POST   /api/billing/catalogue/seed            C-01 empty-state seed action  SC-02
 *   POST   /api/billing/catalogue                 C-02 create
 *   GET    /api/billing/catalogue/:id             C-02 detail with versions
 *   PATCH  /api/billing/catalogue/:id             C-02 edit → new version       SC-08
 *   DELETE /api/billing/catalogue/:id             refused if referenced         SC-09
 *   GET    /api/billing/catalogue/:id/versions    C-04 version history
 *   GET/POST/PATCH/DELETE .../applicability       C-03 rule builder             SC-03
 *   GET    /api/billing/catalogue/audit-log       C-07                          SC-12
 */

import { Router } from 'express'
import { pool } from '../db'
import { requireAuth } from '../middleware/auth'
import { audit, isoDate } from '../lib/billingRepo'
import { inspectFormula } from '../lib/formula'
import {
  badRequest, created, handler, notFound, ok, refuse, requireBilling, requireCapability,
} from '../lib/billingHttp'

const router = Router()

const CATEGORIES = [
  'handling', 'storage', 'transport', 'documentation', 'inspection', 'slot', 'surcharge', 'other',
]
const UNITS = [
  'each', 'cbm', 'cbm_day', 'tonne', 'kg', 'pallet', 'container', 'hour', 'day', 'booking', 'percent',
]

// ─────────────────────────────────────────────────────────────────────────────
// C-01 — list
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', requireAuth, requireBilling, handler('billing-catalogue list', async (req, res) => {
  const params: unknown[] = [req.tenantId!]
  const where = ['ci.tenant_id = $1']
  if (req.query.status && req.query.status !== 'all') {
    params.push(req.query.status); where.push(`ci.status = $${params.length}`)
  }
  if (req.query.category && req.query.category !== 'all') {
    params.push(req.query.category); where.push(`ci.category = $${params.length}`)
  }
  if (req.query.search) {
    params.push(`%${req.query.search}%`)
    where.push(`(ci.code ILIKE $${params.length} OR ci.customer_name ILIKE $${params.length} OR ci.internal_name ILIKE $${params.length})`)
  }

  const { rows } = await pool.query(
    `SELECT ci.*,
            (SELECT COUNT(*) FROM billing_charge_lines cl WHERE cl.item_id = ci.id) AS charge_line_count,
            (SELECT COUNT(*) FROM billing_rate_lines rl WHERE rl.item_id = ci.id)   AS rate_line_count,
            (SELECT COUNT(*) FROM billing_applicability_rules ar WHERE ar.item_id = ci.id) AS rule_count,
            (SELECT MAX(v.version_no) FROM billing_catalogue_item_versions v WHERE v.item_id = ci.id) AS version_no,
            (SELECT MIN(v.effective_from) FROM billing_catalogue_item_versions v
              WHERE v.item_id = ci.id AND v.effective_to IS NULL) AS active_from
       FROM billing_catalogue_items ci
      WHERE ${where.join(' AND ')}
      ORDER BY ci.category, ci.sort_order, ci.customer_name`,
    params,
  )

  return ok(res, {
    categories: CATEGORIES,
    units: UNITS,
    items: rows.map(r => ({
      id: r.id,
      code: r.code,
      customerName: r.customer_name,
      internalName: r.internal_name,
      description: r.description,
      category: r.category,
      unitOfMeasure: r.unit_of_measure,
      taxability: r.taxability,
      glAccountCode: r.gl_account_code,
      taxCode: r.tax_code,
      status: r.status,
      isBundle: r.is_bundle,
      sortOrder: r.sort_order,
      versionNo: Number(r.version_no ?? 0),
      activeFrom: r.active_from ? isoDate(r.active_from) : null,
      usage: {
        chargeLines: Number(r.charge_line_count),
        rateLines: Number(r.rate_line_count),
        rules: Number(r.rule_count),
      },
      // SC-09: the UI disables delete with a reason rather than failing on submit.
      deletable: Number(r.charge_line_count) === 0 && Number(r.rate_line_count) === 0,
      deleteBlockedReason: Number(r.charge_line_count) || Number(r.rate_line_count)
        ? `Referenced by ${r.charge_line_count} charge line(s) and ${r.rate_line_count} rate line(s). Deactivate it instead.`
        : null,
      // IG-04: unmapped items block ledger sync, so the list flags them.
      ledgerMapped: !!r.gl_account_code,
    })),
  })
}))

// ─────────────────────────────────────────────────────────────────────────────
// C-02 — create / detail / edit
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, requireBilling, requireCapability('can_manage_catalogue'),
  handler('billing-catalogue create', async (req, res) => {
    const tenantId = req.tenantId!
    const b = req.body ?? {}
    if (!b.code?.trim()) return badRequest(res, 'code is required')
    if (!b.customerName?.trim()) return badRequest(res, 'customerName is required')
    if (b.category && !CATEGORIES.includes(b.category)) {
      return badRequest(res, `category must be one of ${CATEGORIES.join(', ')}`)
    }
    if (b.unitOfMeasure && !UNITS.includes(b.unitOfMeasure)) {
      return badRequest(res, `unitOfMeasure must be one of ${UNITS.join(', ')}`)
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `INSERT INTO billing_catalogue_items (
           tenant_id, code, customer_name, internal_name, description, category,
           unit_of_measure, taxability, gl_account_code, tax_code, status, sort_order, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [
          tenantId, b.code.trim().toUpperCase(), b.customerName.trim(), b.internalName ?? null,
          b.description ?? null, b.category ?? 'other', b.unitOfMeasure ?? 'each',
          b.taxability ?? 'standard', b.glAccountCode ?? null, b.taxCode ?? null,
          b.status ?? 'draft', b.sortOrder ?? 0, req.user!.id,
        ],
      )
      await writeVersion(client, rows[0], req.user!.id, 'Created')
      await audit(client, {
        tenantId, entityType: 'catalogue_item', entityId: rows[0].id, action: 'create',
        after: rows[0], actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
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

router.get('/audit-log', requireAuth, requireBilling,
  handler('billing-catalogue audit', async (req, res) => {
    const params: unknown[] = [req.tenantId!]
    const where = [`al.tenant_id = $1`, `al.entity_type IN ('catalogue_item','rate_card','rate_line','discount')`]
    if (req.query.itemId) { params.push(req.query.itemId); where.push(`al.entity_id = $${params.length}`) }
    const limit = Math.min(Number(req.query.limit ?? 200), 1000)

    const { rows } = await pool.query(
      `SELECT al.*, u.name AS actor_name
         FROM billing_audit_log al
         LEFT JOIN app_users u ON u.id = al.actor_id
        WHERE ${where.join(' AND ')}
        ORDER BY al.created_at DESC
        LIMIT ${limit}`,
      params,
    )
    return ok(res, rows.map(r => ({
      id: String(r.id),
      entityType: r.entity_type,
      entityId: r.entity_id,
      action: r.action,
      before: r.before_state,
      after: r.after_state,
      reasonCode: r.reason_code,
      reasonNote: r.reason_note,
      actor: r.actor_name ?? r.actor_label,
      at: r.created_at,
    })))
  }))

router.get('/:id', requireAuth, requireBilling, handler('billing-catalogue detail', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM billing_catalogue_items WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, req.tenantId!],
  )
  if (!rows.length) return notFound(res, 'Service')

  const [versions, rules, rates] = await Promise.all([
    pool.query(
      `SELECT v.*, u.name AS changed_by_name,
              (SELECT COUNT(*) FROM billing_charge_lines cl WHERE cl.item_version_id = v.id) AS used_by
         FROM billing_catalogue_item_versions v
         LEFT JOIN app_users u ON u.id = v.changed_by
        WHERE v.item_id = $1 ORDER BY v.version_no DESC`,
      [req.params.id]),
    pool.query(
      `SELECT * FROM billing_applicability_rules WHERE item_id = $1 ORDER BY priority`,
      [req.params.id]),
    pool.query(
      `SELECT rl.*, rc.name AS card_name, rc.status AS card_status
         FROM billing_rate_lines rl JOIN billing_rate_cards rc ON rc.id = rl.rate_card_id
        WHERE rl.item_id = $1 ORDER BY rc.effective_from DESC`,
      [req.params.id]),
  ])

  return ok(res, {
    item: rows[0],
    versions: versions.rows.map(v => ({
      id: v.id,
      versionNo: v.version_no,
      effectiveFrom: isoDate(v.effective_from),
      effectiveTo: v.effective_to ? isoDate(v.effective_to) : null,
      current: !v.effective_to,
      snapshot: v.snapshot,
      changedBy: v.changed_by_name,
      changeNote: v.change_note,
      // "used by N charge lines" — the reason a version can never be deleted (C-04).
      usedByChargeLines: Number(v.used_by),
      at: v.created_at,
    })),
    applicability: rules.rows,
    pricedOn: rates.rows.map(r => ({
      rateCardId: r.rate_card_id, cardName: r.card_name, cardStatus: r.card_status,
      rateType: r.rate_type, unitRate: r.unit_rate,
    })),
  })
}))

/** An edit supersedes the current version rather than overwriting it (SC-08). */
router.patch('/:id', requireAuth, requireBilling, requireCapability('can_manage_catalogue'),
  handler('billing-catalogue patch', async (req, res) => {
    const tenantId = req.tenantId!
    const b = req.body ?? {}

    const FIELDS: Record<string, string> = {
      customerName: 'customer_name', internalName: 'internal_name', description: 'description',
      category: 'category', unitOfMeasure: 'unit_of_measure', taxability: 'taxability',
      glAccountCode: 'gl_account_code', taxCode: 'tax_code', status: 'status',
      sortOrder: 'sort_order',
    }
    const sets: string[] = []
    const params: unknown[] = []
    for (const [key, column] of Object.entries(FIELDS)) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`${column} = $${params.length}`) }
    }
    if (!sets.length) return badRequest(res, 'No fields to update')

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: before } = await client.query(
        `SELECT * FROM billing_catalogue_items WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [req.params.id, tenantId],
      )
      if (!before.length) { await client.query('ROLLBACK'); return notFound(res, 'Service') }

      params.push(req.params.id, tenantId)
      const { rows } = await client.query(
        `UPDATE billing_catalogue_items SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING *`,
        params,
      )
      await writeVersion(client, rows[0], req.user!.id, b.changeNote ?? 'Edited')
      await audit(client, {
        tenantId, entityType: 'catalogue_item', entityId: req.params.id, action: 'update',
        before: before[0], after: rows[0], reasonNote: b.changeNote ?? null,
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

/** SC-09 — refused with a reason, deactivation offered. */
router.delete('/:id', requireAuth, requireBilling, requireCapability('can_manage_catalogue'),
  handler('billing-catalogue delete', async (req, res) => {
    const tenantId = req.tenantId!
    const { rows: usage } = await pool.query(
      `SELECT ci.customer_name,
              (SELECT COUNT(*) FROM billing_charge_lines cl WHERE cl.item_id = ci.id) AS charge_lines,
              (SELECT COUNT(*) FROM billing_rate_lines rl WHERE rl.item_id = ci.id)   AS rate_lines
         FROM billing_catalogue_items ci WHERE ci.id = $1 AND ci.tenant_id = $2`,
      [req.params.id, tenantId],
    )
    if (!usage.length) return notFound(res, 'Service')

    const { customer_name, charge_lines, rate_lines } = usage[0]
    if (Number(charge_lines) > 0 || Number(rate_lines) > 0) {
      return refuse(
        res,
        `"${customer_name}" is referenced by ${charge_lines} charge line(s) and ${rate_lines} rate line(s) and cannot be deleted. Deactivate it instead.`,
        'deactivate',
      )
    }

    await pool.query(`DELETE FROM billing_catalogue_items WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId])
    await audit(pool, {
      tenantId, entityType: 'catalogue_item', entityId: req.params.id, action: 'delete',
      before: usage[0], actorId: req.user!.id, actorLabel: req.user!.name, actorIp: req.ip,
    })
    return ok(res, { deleted: true })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// C-03 — applicability rules
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/applicability', requireAuth, requireBilling,
  requireCapability('can_manage_catalogue'),
  handler('billing-catalogue applicability create', async (req, res) => {
    const b = req.body ?? {}
    const mode = b.attachMode ?? 'optional'
    if (!['mandatory', 'optional', 'conditional'].includes(mode)) {
      return badRequest(res, 'attachMode must be mandatory, optional or conditional')
    }
    // A conditional rule with a broken trigger would silently drop a charge, so
    // the expression is validated at save time rather than at rating time.
    if (mode === 'conditional') {
      if (!b.triggerExpr?.trim()) {
        return badRequest(res, 'A conditional rule needs a trigger expression.')
      }
      const inspection = inspectFormula(b.triggerExpr)
      if (!inspection.valid) {
        return badRequest(res, `Trigger expression is invalid: ${inspection.error}`)
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO billing_applicability_rules (
         tenant_id, item_id, service_type, load_type, cargo_type, customer_segment,
         site_id, attach_mode, trigger_expr, default_quantity, priority, active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        req.tenantId!, req.params.id,
        b.serviceType ?? null, b.loadType ?? null, b.cargoType ?? null,
        b.customerSegment ?? null, b.siteId ?? null, mode,
        mode === 'conditional' ? b.triggerExpr.trim() : null,
        b.defaultQuantity ?? null, b.priority ?? 100, b.active ?? true,
      ],
    )
    await audit(pool, {
      tenantId: req.tenantId!, entityType: 'catalogue_item', entityId: req.params.id,
      action: 'update', after: { applicabilityRule: rows[0] },
      actorId: req.user!.id, actorLabel: req.user!.name,
    })
    return created(res, rows[0])
  }))

router.patch('/applicability/:ruleId', requireAuth, requireBilling,
  requireCapability('can_manage_catalogue'),
  handler('billing-catalogue applicability patch', async (req, res) => {
    const b = req.body ?? {}
    if (b.triggerExpr) {
      const inspection = inspectFormula(b.triggerExpr)
      if (!inspection.valid) return badRequest(res, `Trigger expression is invalid: ${inspection.error}`)
    }
    const FIELDS: Record<string, string> = {
      serviceType: 'service_type', loadType: 'load_type', cargoType: 'cargo_type',
      customerSegment: 'customer_segment', siteId: 'site_id', attachMode: 'attach_mode',
      triggerExpr: 'trigger_expr', defaultQuantity: 'default_quantity',
      priority: 'priority', active: 'active',
    }
    const sets: string[] = []
    const params: unknown[] = []
    for (const [key, column] of Object.entries(FIELDS)) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`${column} = $${params.length}`) }
    }
    if (!sets.length) return badRequest(res, 'No fields to update')
    params.push(req.params.ruleId, req.tenantId!)
    const { rows } = await pool.query(
      `UPDATE billing_applicability_rules SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING *`,
      params,
    )
    if (!rows.length) return notFound(res, 'Rule')
    return ok(res, rows[0])
  }))

router.delete('/applicability/:ruleId', requireAuth, requireBilling,
  requireCapability('can_manage_catalogue'),
  handler('billing-catalogue applicability delete', async (req, res) => {
    const result = await pool.query(
      `DELETE FROM billing_applicability_rules WHERE id = $1 AND tenant_id = $2`,
      [req.params.ruleId, req.tenantId!],
    )
    if (!result.rowCount) return notFound(res, 'Rule')
    return ok(res, { deleted: true })
  }))

// ─────────────────────────────────────────────────────────────────────────────
// SC-02 — seed the standard catalogue from the C-01 empty state
// ─────────────────────────────────────────────────────────────────────────────

const STANDARD_CATALOGUE = [
  ['STOR-LCL', 'Storage (LCL)', 'storage', 'cbm_day', '4100', 10],
  ['STOR-FCL', 'Storage (FCL)', 'storage', 'container', '4100', 20],
  ['DEMUR', 'Demurrage', 'storage', 'day', '4110', 30],
  ['WRAP', 'Shrink wrapping', 'handling', 'pallet', '4200', 40],
  ['SLOT-PU', 'Slot fee — collection', 'slot', 'booking', '4300', 50],
  ['SLOT-DO', 'Slot fee — delivery', 'slot', 'booking', '4300', 60],
  ['UNPACK', 'Container unpack', 'handling', 'container', '4200', 70],
  ['INSPECT', 'Inspection attendance', 'inspection', 'hour', '4400', 80],
  ['DOC-FEE', 'Documentation fee', 'documentation', 'each', '4500', 90],
  ['AFTER-HRS', 'After-hours surcharge', 'surcharge', 'percent', '4600', 100],
  ['CANCEL-FEE', 'Cancellation fee', 'other', 'booking', '4700', 110],
] as const

router.post('/seed', requireAuth, requireBilling, requireCapability('can_manage_catalogue'),
  handler('billing-catalogue seed', async (req, res) => {
    const tenantId = req.tenantId!
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      let inserted = 0
      for (const [code, name, category, uom, gl, sort] of STANDARD_CATALOGUE) {
        const { rows } = await client.query(
          `INSERT INTO billing_catalogue_items (
             tenant_id, code, customer_name, category, unit_of_measure,
             taxability, gl_account_code, tax_code, status, sort_order, created_by
           ) VALUES ($1,$2,$3,$4,$5,'standard',$6,'GST','active',$7,$8)
           ON CONFLICT (tenant_id, code) DO NOTHING
           RETURNING *`,
          [tenantId, code, name, category, uom, gl, sort, req.user!.id],
        )
        if (rows.length) {
          await writeVersion(client, rows[0], req.user!.id, 'Seeded standard catalogue')
          inserted++
        }
      }
      await audit(client, {
        tenantId, entityType: 'catalogue_item', action: 'create',
        after: { seeded: inserted }, actorId: req.user!.id, actorLabel: req.user!.name,
      })
      await client.query('COMMIT')
      return ok(res, { seeded: inserted, skipped: STANDARD_CATALOGUE.length - inserted })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }))

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Close the current version and open a new one. The snapshot is the whole row,
 * so a charge line pointing at a version can always be explained even if the
 * item is later renamed or retired (SC-08, SC-12).
 */
async function writeVersion(
  client: any, item: any, actorId: string, note: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const { rows: last } = await client.query(
    `SELECT version_no, effective_from FROM billing_catalogue_item_versions
      WHERE item_id = $1 ORDER BY version_no DESC LIMIT 1`,
    [item.id],
  )
  const nextNo = (last[0]?.version_no ?? 0) + 1

  if (last.length) {
    // Two edits on the same day are one version, not two — otherwise an
    // afternoon typo fix creates a version with a zero-length effective window.
    if (isoDate(last[0].effective_from) === today) {
      await client.query(
        `UPDATE billing_catalogue_item_versions
            SET snapshot = $2, change_note = $3, changed_by = $4
          WHERE item_id = $1 AND version_no = $5`,
        [item.id, JSON.stringify(item), note, actorId, last[0].version_no],
      )
      return
    }
    await client.query(
      `UPDATE billing_catalogue_item_versions
          SET effective_to = ($2::date - INTERVAL '1 day')
        WHERE item_id = $1 AND effective_to IS NULL`,
      [item.id, today],
    )
  }

  await client.query(
    `INSERT INTO billing_catalogue_item_versions
       (item_id, version_no, effective_from, snapshot, changed_by, change_note)
     VALUES ($1,$2,$3::date,$4,$5,$6)`,
    [item.id, nextNo, today, JSON.stringify(item), actorId, note],
  )
}

export default router
