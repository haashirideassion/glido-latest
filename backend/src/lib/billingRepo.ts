/**
 * Billing repository — the only place that turns database rows into the pure
 * engine's configuration types, and engine output back into rows.
 *
 * Keeping this separate from rating.ts is what lets the T-08 simulator, the
 * X-02 live quote and the F4 nightly accrual all run identical pricing logic.
 */

import { Pool, PoolClient } from 'pg'
import { pool } from '../db'
import {
  ApplicabilityRuleConfig, CatalogueItemConfig, DiscountConfig, RateCardConfig,
  RateLineConfig, RatedLine, RatingContext, RatingSnapshot, SurchargeConfig,
  TariffBundle, TaxSettingsConfig, toChargeLineRow,
} from './rating'
import { RoundingMode } from './money'

export const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

type Db = Pool | PoolClient

// ─────────────────────────────────────────────────────────────────────────────
// Tariff resolution (TF-02, TF-03)
// ─────────────────────────────────────────────────────────────────────────────

export interface TariffResolution {
  bundle: TariffBundle
  /** Why this card was chosen — surfaced in the UI's fallback indicator (T-07). */
  basis: 'customer_card' | 'site_default' | 'tenant_default'
  accountId: string | null
}

/**
 * Resolve which rate card prices this event:
 *   an authenticated account's assigned card, else the site default (TF-02, TF-03).
 * `asOfDate` selects the card that was effective then, so a historical booking
 * reprices against the card it was actually sold under (TF-13, SC-08).
 */
export async function resolveTariff(
  db: Db,
  opts: {
    tenantId: string
    accountId?: string | null
    siteId?: string | null
    asOfDate?: string | null
    /** Price against this exact card regardless of assignment — the simulator. */
    rateCardId?: string | null
  },
): Promise<TariffResolution | null> {
  const { tenantId, accountId = null, siteId = null } = opts
  const asOf = opts.asOfDate ?? new Date().toISOString().slice(0, 10)

  let cardRow: any = null
  let basis: TariffResolution['basis'] = 'tenant_default'

  if (opts.rateCardId) {
    const { rows } = await db.query(
      `SELECT * FROM billing_rate_cards WHERE id = $1 AND tenant_id = $2`,
      [opts.rateCardId, tenantId],
    )
    cardRow = rows[0] ?? null
    basis = 'customer_card'
  }

  if (!cardRow && accountId) {
    const { rows } = await db.query(
      `SELECT rc.*
         FROM billing_accounts a
         JOIN billing_rate_cards rc ON rc.id = a.rate_card_id
        WHERE a.id = $1
          AND a.tenant_id = $2
          AND rc.status = 'active'
          AND rc.effective_from <= $3::date
          AND (rc.effective_to IS NULL OR rc.effective_to >= $3::date)`,
      [accountId, tenantId, asOf],
    )
    if (rows[0]) { cardRow = rows[0]; basis = 'customer_card' }
  }

  if (!cardRow) {
    // Site default, then any active card for the tenant. Prefer the most
    // recently effective card so a mid-period publish takes over cleanly.
    const { rows } = await db.query(
      `SELECT *,
              (is_site_default AND site_id IS NOT DISTINCT FROM $2) AS site_match
         FROM billing_rate_cards
        WHERE tenant_id = $1
          AND status = 'active'
          AND effective_from <= $3::date
          AND (effective_to IS NULL OR effective_to >= $3::date)
        ORDER BY site_match DESC, is_site_default DESC, effective_from DESC
        LIMIT 1`,
      [tenantId, siteId, asOf],
    )
    cardRow = rows[0] ?? null
    basis = cardRow?.site_match ? 'site_default' : 'tenant_default'
  }

  if (!cardRow) return null

  const bundle = await loadBundle(db, tenantId, cardRow, asOf)
  return { bundle, basis, accountId }
}

/** Load every configuration row the engine needs for one card. */
async function loadBundle(
  db: Db,
  tenantId: string,
  cardRow: any,
  asOf: string,
): Promise<TariffBundle> {
  const [items, applicability, rateLines, surcharges, discounts, tax, holidays] =
    await Promise.all([
      db.query(
        `SELECT ci.*,
                (SELECT v.id FROM billing_catalogue_item_versions v
                  WHERE v.item_id = ci.id
                    AND v.effective_from <= $2::date
                  ORDER BY v.effective_from DESC, v.version_no DESC
                  LIMIT 1) AS current_version_id
           FROM billing_catalogue_items ci
          WHERE ci.tenant_id = $1
            AND ci.status = 'active'
          ORDER BY ci.sort_order, ci.customer_name`,
        [tenantId, asOf],
      ),
      db.query(
        `SELECT * FROM billing_applicability_rules
          WHERE tenant_id = $1 AND active
          ORDER BY priority`,
        [tenantId],
      ),
      db.query(
        `SELECT rl.*,
                f.id AS f_id, f.name AS f_name, f.expression AS f_expression, f.inputs AS f_inputs,
                COALESCE(
                  (SELECT json_agg(json_build_object(
                            'tierNo', t.tier_no, 'fromQty', t.from_qty, 'toQty', t.to_qty,
                            'unitRate', t.unit_rate, 'flatAmount', t.flat_amount)
                           ORDER BY t.from_qty)
                     FROM billing_rate_tiers t WHERE t.rate_line_id = rl.id),
                  '[]'::json) AS tiers
           FROM billing_rate_lines rl
           LEFT JOIN billing_qty_formulas f ON f.id = rl.formula_id
          WHERE rl.rate_card_id = $1`,
        [cardRow.id],
      ),
      db.query(
        `SELECT * FROM billing_surcharges
          WHERE tenant_id = $1
            AND active
            AND (rate_card_id IS NULL OR rate_card_id = $2)`,
        [tenantId, cardRow.id],
      ),
      db.query(
        `SELECT * FROM billing_discounts
          WHERE tenant_id = $1
            AND active
            AND (valid_from IS NULL OR valid_from <= $2::date)
            AND (valid_to   IS NULL OR valid_to   >= $2::date)`,
        [tenantId, asOf],
      ),
      db.query(
        `SELECT * FROM billing_tax_settings
          WHERE tenant_id = $1 AND effective_from <= $2::date
          ORDER BY effective_from DESC LIMIT 1`,
        [tenantId, asOf],
      ),
      db.query(
        `SELECT holiday_date FROM billing_holidays WHERE tenant_id = $1`,
        [tenantId],
      ),
    ])

  const card: RateCardConfig = {
    id: cardRow.id,
    name: cardRow.name,
    currency: cardRow.currency ?? 'AUD',
    versionNo: cardRow.version_no ?? 1,
    effectiveFrom: isoDate(cardRow.effective_from),
    roundingMode: (cardRow.rounding_mode ?? 'half_up') as RoundingMode,
    roundingDp: cardRow.rounding_dp ?? 2,
  }

  return {
    card,
    items: items.rows.map(mapItem),
    applicability: applicability.rows.map(mapApplicability),
    rateLines: rateLines.rows.map(mapRateLine),
    surcharges: surcharges.rows.map(mapSurcharge),
    discounts: discounts.rows.map(mapDiscount),
    tax: mapTax(tax.rows[0]),
    holidays: holidays.rows.map(r => isoDate(r.holiday_date)),
  }
}

// ── row → config mappers ─────────────────────────────────────────────────────

function mapItem(r: any): CatalogueItemConfig {
  return {
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
    currentVersionId: r.current_version_id ?? null,
    isBundle: r.is_bundle,
    sortOrder: r.sort_order,
  }
}

function mapApplicability(r: any): ApplicabilityRuleConfig {
  return {
    id: r.id,
    itemId: r.item_id,
    serviceType: r.service_type,
    loadType: r.load_type,
    cargoType: r.cargo_type,
    customerSegment: r.customer_segment,
    siteId: r.site_id,
    attachMode: r.attach_mode,
    triggerExpr: r.trigger_expr,
    defaultQuantity: numOrNull(r.default_quantity),
    priority: r.priority,
  }
}

function mapRateLine(r: any): RateLineConfig {
  return {
    id: r.id,
    itemId: r.item_id,
    rateType: r.rate_type,
    // Rates stay as strings all the way to money.toPips — parsing them through a
    // JS float first is exactly the precision loss this module exists to avoid.
    unitRate: r.unit_rate == null ? null : String(r.unit_rate),
    percentOf: r.percent_of == null ? null : String(r.percent_of),
    percentBaseItemId: r.percent_base_item,
    minQuantity: numOrNull(r.min_quantity),
    minCharge: r.min_charge == null ? null : String(r.min_charge),
    maxCap: r.max_cap == null ? null : String(r.max_cap),
    freeAllowance: numOrNull(r.free_allowance),
    freeAllowanceUnit: r.free_allowance_unit,
    formula: r.f_id
      ? {
          id: r.f_id,
          name: r.f_name,
          expression: r.f_expression,
          inputs: normaliseInputs(r.f_inputs),
        }
      : null,
    tiers: (r.tiers ?? []).map((t: any) => ({
      tierNo: t.tierNo,
      fromQty: Number(t.fromQty),
      toQty: t.toQty == null ? null : Number(t.toQty),
      unitRate: String(t.unitRate),
      flatAmount: t.flatAmount == null ? null : String(t.flatAmount),
    })),
  }
}

function mapSurcharge(r: any): SurchargeConfig {
  return {
    id: r.id,
    itemId: r.item_id,
    code: r.code,
    label: r.label,
    basis: r.basis,
    value: String(r.value),
    appliesTo: r.applies_to,
    appliesToRef: r.applies_to_ref,
    conditionKind: r.condition_kind,
    conditionConfig: r.condition_config ?? {},
    taxability: r.taxability,
  }
}

function mapDiscount(r: any): DiscountConfig {
  return {
    id: r.id,
    code: r.code,
    label: r.label,
    discountType: r.discount_type,
    value: String(r.value),
    scope: r.scope,
    scopeRef: r.scope_ref,
    approvalThreshold: r.approval_threshold == null ? null : String(r.approval_threshold),
  }
}

function mapTax(r: any): TaxSettingsConfig {
  // No tax row is not "no tax" — it is an unconfigured tenant. Default to GST
  // registered at 10% so an unconfigured tenant under-charges nobody, and the
  // settings screen (S-01) is where the truth gets recorded.
  if (!r) return { isRegistered: true, standardRate: '10.0000' }
  return {
    isRegistered: r.is_registered,
    standardRate: String(r.standard_rate),
    abn: r.abn,
    jurisdiction: r.jurisdiction,
  }
}

function normaliseInputs(inputs: unknown): Record<string, number> {
  if (!inputs || typeof inputs !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(inputs as Record<string, unknown>)) {
    const n = Number(v)
    if (Number.isFinite(n)) out[k] = n
  }
  return out
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function isoDate(v: unknown): string {
  if (!v) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────────────────
// Rating context from a booking
// ─────────────────────────────────────────────────────────────────────────────

export interface BookingRatingRow {
  id: string
  tenant_id: string
  reference_number: string
  service_type: string | null
  load_type: string | null
  slot_date: unknown
  slot_start_time: string | null
  weight_kg: unknown
  volume_cbm: unknown
  pallet_count: number | null
  package_count: number | null
  storage_start_date: unknown
  container_number: string | null
  container_size: string | null
  status: string
  user_id: string | null
  completed_at: unknown
  checked_in_at: unknown
}

/** Build a RatingContext from a booking row (F1, F3). */
export function contextFromBooking(
  b: BookingRatingRow,
  extra: Partial<RatingContext> = {},
): RatingContext {
  return {
    serviceType: b.service_type,
    loadType: b.load_type,
    customerSegment: b.user_id ? 'account' : 'guest',
    slotDate: isoDate(b.slot_date),
    slotStartTime: b.slot_start_time ? String(b.slot_start_time).slice(0, 5) : null,
    weightKg: numOrNull(b.weight_kg),
    volumeCbm: numOrNull(b.volume_cbm),
    palletCount: b.pallet_count,
    packageCount: b.package_count,
    containerCount: b.container_number ? 1 : (b.load_type === 'fcl' ? 1 : 0),
    containerSize: b.container_size,
    storageStartDate: b.storage_start_date ? isoDate(b.storage_start_date) : null,
    ...extra,
  }
}

export async function loadBookingForRating(
  db: Db,
  bookingId: string,
): Promise<BookingRatingRow | null> {
  const { rows } = await db.query(
    `SELECT id, tenant_id, reference_number, service_type, load_type, slot_date,
            slot_start_time, weight_kg, volume_cbm, pallet_count, package_count,
            storage_start_date, container_number, container_size, status, user_id,
            completed_at, checked_in_at
       FROM bookings WHERE id = $1`,
    [bookingId],
  )
  return rows[0] ?? null
}

/** The account a booking bills to, if any (AR-01). */
export async function accountForBooking(
  db: Db,
  tenantId: string,
  b: Pick<BookingRatingRow, 'user_id'>,
): Promise<{ id: string; currency: string; credit_hold: boolean } | null> {
  if (!b.user_id) return null
  const { rows } = await db.query(
    `SELECT id, currency, credit_hold FROM billing_accounts
      WHERE tenant_id = $1 AND user_id = $2 AND status IN ('active', 'on_hold')
      LIMIT 1`,
    [tenantId, b.user_id],
  )
  return rows[0] ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Persisting charge lines (RT-02, RT-04)
// ─────────────────────────────────────────────────────────────────────────────

export interface PersistChargeLinesOptions {
  tenantId: string
  bookingId: string
  accountId: string | null
  status: 'estimated' | 'actual'
  source?: 'rating' | 'accrual' | 'manual' | 'leakage_remedy' | 'import'
  actorId?: string | null
  /** Replace the booking's existing un-invoiced rated lines (a re-rate, F3). */
  replaceExisting?: boolean
}

export interface PersistResult {
  inserted: number
  removed: number
  varianceLines: number
}

/**
 * Write rated lines onto a booking.
 *
 * On a re-rate (F3) only un-invoiced lines from the rating engine are replaced —
 * manual charges, adjustments and waivers are somebody's deliberate decision and
 * survive (RT-08, RT-09). Where an estimate is being replaced by an actual, the
 * difference is recorded as a variance so O-02 can show estimate vs actual
 * rather than silently overwriting the number the customer was quoted (RT-04).
 */
export async function persistChargeLines(
  client: PoolClient,
  lines: RatedLine[],
  snapshot: RatingSnapshot,
  opts: PersistChargeLinesOptions,
): Promise<PersistResult> {
  const { tenantId, bookingId, accountId, status } = opts
  const source = opts.source ?? 'rating'
  let removed = 0
  let varianceLines = 0

  // Previous engine-produced estimates, so a variance can be computed per item.
  const priorByItem = new Map<string, { id: string; line_total: string }>()
  if (opts.replaceExisting) {
    const { rows } = await client.query(
      `SELECT id, item_id, line_total
         FROM billing_charge_lines
        WHERE booking_id = $1
          AND invoice_id IS NULL
          AND source = 'rating'
          AND status IN ('estimated', 'actual')`,
      [bookingId],
    )
    for (const r of rows) if (r.item_id) priorByItem.set(r.item_id, r)

    const del = await client.query(
      `DELETE FROM billing_charge_lines
        WHERE booking_id = $1
          AND invoice_id IS NULL
          AND source = 'rating'
          AND status IN ('estimated', 'actual')`,
      [bookingId],
    )
    removed = del.rowCount ?? 0
  }

  let inserted = 0
  for (const line of lines) {
    const row = toChargeLineRow(line, snapshot)
    const prior = priorByItem.get(line.itemId)
    const estimatedTotal = prior ? String(prior.line_total) : null
    const variance = prior
      ? (Number(row.line_total) - Number(prior.line_total)).toFixed(2)
      : null
    if (variance && Number(variance) !== 0) varianceLines++

    await client.query(
      `INSERT INTO billing_charge_lines (
         tenant_id, booking_id, account_id, item_id, item_version_id,
         rate_card_id, rate_card_version, rate_snapshot,
         description, unit_of_measure, quantity, chargeable_quantity, unit_price,
         line_subtotal, discount_amount, tax_rate, tax_amount, line_total, currency,
         line_kind, status, source, working, estimated_total, variance_amount, created_by
       ) VALUES (
         $1,$2,$3,$4,$5,
         $6,$7,$8,
         $9,$10,$11,$12,$13,
         $14,$15,$16,$17,$18,$19,
         $20,$21,$22,$23,$24,$25,$26
       )`,
      [
        tenantId, bookingId, accountId, row.item_id, row.item_version_id,
        row.rate_card_id, row.rate_card_version, JSON.stringify(row.rate_snapshot),
        row.description, row.unit_of_measure, row.quantity, row.chargeable_quantity, row.unit_price,
        row.line_subtotal, row.discount_amount, row.tax_rate, row.tax_amount, row.line_total, row.currency,
        row.line_kind, status, source, JSON.stringify(row.working), estimatedTotal, variance, opts.actorId ?? null,
      ],
    )
    inserted++
  }

  return { inserted, removed, varianceLines }
}

// ─────────────────────────────────────────────────────────────────────────────
// Document numbering (IN-03)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Allocate the next document number. Takes a row lock so two concurrent billing
 * runs cannot both read the same `next_value` — that is how a numbering sequence
 * develops a gap, and a gap in an invoice sequence is an audit finding.
 *
 * Must be called inside a transaction; the number is only real if that
 * transaction commits.
 */
export async function allocateDocumentNumber(
  client: PoolClient,
  tenantId: string,
  docKind: 'invoice' | 'credit_note' | 'receipt',
): Promise<string> {
  const { rows } = await client.query(
    `UPDATE billing_number_sequences
        SET next_value = next_value + 1
      WHERE tenant_id = $1 AND doc_kind = $2
      RETURNING prefix, next_value - 1 AS allocated, pad_width`,
    [tenantId, docKind],
  )

  if (!rows.length) {
    const defaults: Record<string, string> = {
      invoice: 'INV-', credit_note: 'CN-', receipt: 'RCT-',
    }
    const created = await client.query(
      `INSERT INTO billing_number_sequences (tenant_id, doc_kind, prefix, next_value, pad_width)
       VALUES ($1, $2, $3, 2, 6)
       ON CONFLICT (tenant_id, doc_kind) DO UPDATE SET next_value = billing_number_sequences.next_value + 1
       RETURNING prefix, next_value - 1 AS allocated, pad_width`,
      [tenantId, docKind, defaults[docKind] ?? 'DOC-'],
    )
    const r = created.rows[0]
    return `${r.prefix}${String(r.allocated).padStart(r.pad_width, '0')}`
  }

  const r = rows[0]
  return `${r.prefix}${String(r.allocated).padStart(r.pad_width, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit (SC-12, TX-06, TX-07, NFR-B-04)
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  tenantId: string
  entityType: string
  entityId?: string | null
  action: string
  before?: unknown
  after?: unknown
  amountDelta?: string | number | null
  currency?: string | null
  reasonCode?: string | null
  reasonNote?: string | null
  actorId?: string | null
  actorLabel?: string
  actorIp?: string | null
}

/**
 * Append a financial event. Deliberately never throws: an audit write failing
 * must not roll back the money it describes, but it must be loud in the log.
 */
export async function audit(db: Db, entry: AuditEntry): Promise<void> {
  try {
    await db.query(
      `INSERT INTO billing_audit_log (
         tenant_id, entity_type, entity_id, action, before_state, after_state,
         amount_delta, currency, reason_code, reason_note, actor_id, actor_label, actor_ip
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        entry.tenantId, entry.entityType, entry.entityId ?? null, entry.action,
        entry.before === undefined ? null : JSON.stringify(entry.before),
        entry.after === undefined ? null : JSON.stringify(entry.after),
        entry.amountDelta ?? null, entry.currency ?? null,
        entry.reasonCode ?? null, entry.reasonNote ?? null,
        entry.actorId ?? null, entry.actorLabel ?? 'system', entry.actorIp ?? null,
      ],
    )
  } catch (err) {
    console.error('[billing audit] failed to record event', entry.entityType, entry.action, err)
  }
}

/** Record an invoice state transition (IN-11). */
export async function recordInvoiceEvent(
  db: Db,
  opts: {
    invoiceId: string
    fromStatus?: string | null
    toStatus: string
    eventKind?: string
    detail?: unknown
    actorId?: string | null
    actorLabel?: string
  },
): Promise<void> {
  await db.query(
    `INSERT INTO billing_invoice_events
       (invoice_id, from_status, to_status, event_kind, detail, actor_id, actor_label)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      opts.invoiceId, opts.fromStatus ?? null, opts.toStatus,
      opts.eventKind ?? 'status_change',
      opts.detail === undefined ? null : JSON.stringify(opts.detail),
      opts.actorId ?? null, opts.actorLabel ?? 'system',
    ],
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Capabilities (S-11) and approval thresholds (S-10)
// ─────────────────────────────────────────────────────────────────────────────

export const BILLING_CAPABILITIES = [
  'can_manage_catalogue', 'can_manage_tariffs', 'can_publish_tariffs',
  'can_add_manual_charge', 'can_adjust_charge', 'can_waive_charge',
  'can_issue_invoice', 'can_run_billing', 'can_issue_credit_note',
  'can_confirm_eft_payment', 'can_refund', 'can_write_off',
  'can_override_credit_limit', 'can_approve', 'can_export', 'can_manage_integration',
] as const

export type BillingCapability = typeof BILLING_CAPABILITIES[number]

export type CapabilitySet = Record<BillingCapability, boolean>

const ALL_TRUE = (): CapabilitySet =>
  Object.fromEntries(BILLING_CAPABILITIES.map(c => [c, true])) as CapabilitySet
const ALL_FALSE = (): CapabilitySet =>
  Object.fromEntries(BILLING_CAPABILITIES.map(c => [c, false])) as CapabilitySet

export async function loadCapabilities(
  db: Db,
  tenantId: string,
  userId: string,
  role: string,
): Promise<CapabilitySet> {
  // A super_admin is not gated — there has to be someone who can fix a
  // misconfigured tenant.
  if (role === 'super_admin') return ALL_TRUE()

  const { rows } = await db.query(
    `SELECT * FROM billing_capabilities WHERE tenant_id = $1 AND user_id = $2`,
    [tenantId, userId],
  )
  if (!rows.length) return ALL_FALSE()

  const row = rows[0]
  return Object.fromEntries(
    BILLING_CAPABILITIES.map(c => [c, !!row[c]]),
  ) as CapabilitySet
}

export interface ApprovalRequirement {
  required: boolean
  threshold: number
  approverRole: string
  allowSelfApproval: boolean
}

/** Does this action, at this amount, need a second pair of eyes? (S-10) */
export async function approvalRequirement(
  db: Db,
  tenantId: string,
  action: string,
  amount: number,
): Promise<ApprovalRequirement> {
  const { rows } = await db.query(
    `SELECT threshold_amount, approver_role, allow_self_approval
       FROM billing_approval_thresholds
      WHERE tenant_id = $1 AND action = $2`,
    [tenantId, action],
  )
  if (!rows.length) {
    return { required: false, threshold: 0, approverRole: 'reception_admin', allowSelfApproval: false }
  }
  const t = Number(rows[0].threshold_amount)
  return {
    required: Math.abs(amount) >= t,
    threshold: t,
    approverRole: rows[0].approver_role,
    allowSelfApproval: rows[0].allow_self_approval,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Credit control (AR-03, AR-11)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreditDecision {
  outcome: 'ok' | 'over_limit' | 'on_hold' | 'inactive'
  exposure: number
  creditLimit: number
  headroom: number
  currency: string
  /** The FRS insists a refusal explains itself and offers the legal alternative. */
  message?: string
  alternative?: 'prepaid_checkout' | 'override_request'
}

/**
 * Can this account take on another `amount` of exposure? (F2)
 * An account on hold is refused for arrears booking but the prepaid path stays
 * open — the customer is not blocked from trading, only from trading on credit
 * (AR-11, AR-02).
 */
export async function checkCredit(
  db: Db,
  tenantId: string,
  accountId: string,
  amount: number,
): Promise<CreditDecision> {
  const { rows } = await db.query(
    `SELECT a.status, a.credit_hold, a.credit_hold_reason, a.currency,
            a.credit_limit, COALESCE(e.exposure, 0) AS exposure
       FROM billing_accounts a
       LEFT JOIN billing_account_exposure e ON e.account_id = a.id
      WHERE a.id = $1 AND a.tenant_id = $2`,
    [accountId, tenantId],
  )
  if (!rows.length) {
    return {
      outcome: 'inactive', exposure: 0, creditLimit: 0, headroom: 0, currency: 'AUD',
      message: 'No billing account found for this customer.',
      alternative: 'prepaid_checkout',
    }
  }

  const r = rows[0]
  const exposure = Number(r.exposure)
  const creditLimit = Number(r.credit_limit)
  const headroom = creditLimit - exposure
  const currency = r.currency ?? 'AUD'

  if (r.status === 'closed' || r.status === 'suspended') {
    return {
      outcome: 'inactive', exposure, creditLimit, headroom, currency,
      message: `This account is ${r.status} and cannot book on account.`,
      alternative: 'prepaid_checkout',
    }
  }

  if (r.credit_hold || r.status === 'on_hold') {
    return {
      outcome: 'on_hold', exposure, creditLimit, headroom, currency,
      message: r.credit_hold_reason
        ? `This account is on credit hold: ${r.credit_hold_reason}`
        : 'This account is on credit hold.',
      alternative: 'prepaid_checkout',
    }
  }

  if (creditLimit > 0 && exposure + amount > creditLimit) {
    return {
      outcome: 'over_limit', exposure, creditLimit, headroom, currency,
      message: `This booking would take the account to ${(exposure + amount).toFixed(2)} ${currency} against a ${creditLimit.toFixed(2)} ${currency} limit.`,
      alternative: 'override_request',
    }
  }

  return { outcome: 'ok', exposure, creditLimit, headroom, currency }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice recalculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recompute an invoice's payment/credit balances from its allocations and credit
 * notes, and move it to the state those numbers imply (IN-11).
 *
 * Derived rather than incremented on purpose: a state machine driven by running
 * totals drifts the first time a request is retried.
 */
export async function recalcInvoice(
  client: PoolClient,
  invoiceId: string,
  actorId?: string | null,
): Promise<{ status: string; balanceDue: number }> {
  const { rows } = await client.query(
    `SELECT i.*,
            COALESCE((SELECT SUM(al.amount) FROM billing_allocations al
                       WHERE al.invoice_id = i.id AND NOT al.reversed), 0) AS paid,
            COALESCE((SELECT SUM(cn.total) FROM billing_credit_notes cn
                       WHERE cn.invoice_id = i.id AND cn.status = 'issued'), 0) AS credited,
            COALESCE((SELECT SUM(wo.amount) FROM billing_write_offs wo
                       WHERE wo.invoice_id = i.id AND wo.approved_at IS NOT NULL), 0) AS written_off,
            EXISTS (SELECT 1 FROM billing_disputes d
                     WHERE d.invoice_id = i.id
                       AND d.status IN ('raised', 'under_review')) AS has_open_dispute
       FROM billing_invoices i
      WHERE i.id = $1`,
    [invoiceId],
  )
  if (!rows.length) throw new Error(`Invoice ${invoiceId} not found`)

  const inv = rows[0]
  const total = Number(inv.total)
  const paid = Number(inv.paid)
  const credited = Number(inv.credited)
  const writtenOff = Number(inv.written_off)
  const balance = round2(total - paid - credited - writtenOff)

  const next = nextInvoiceStatus({
    current: inv.status,
    total, paid, credited, writtenOff, balance,
    dueDate: inv.due_date ? isoDate(inv.due_date) : null,
    hasOpenDispute: inv.has_open_dispute,
  })

  await client.query(
    `UPDATE billing_invoices
        SET amount_paid = $2, amount_credited = $3, amount_written_off = $4,
            status = $5,
            dunning_paused = $6,
            dunning_pause_reason = CASE WHEN $6 THEN 'Disputed' ELSE NULL END
      WHERE id = $1`,
    [invoiceId, paid.toFixed(2), credited.toFixed(2), writtenOff.toFixed(2), next, inv.has_open_dispute],
  )

  if (next !== inv.status) {
    await recordInvoiceEvent(client, {
      invoiceId,
      fromStatus: inv.status,
      toStatus: next,
      eventKind: 'status_change',
      detail: { paid, credited, writtenOff, balance },
      actorId,
      actorLabel: actorId ? undefined : 'system',
    })
  }

  return { status: next, balanceDue: balance }
}

/**
 * The invoice state machine (§4). Only these transitions exist; nothing else can
 * put an invoice into a state (IN-11).
 */
export function nextInvoiceStatus(s: {
  current: string
  total: number
  paid: number
  credited: number
  writtenOff: number
  balance: number
  dueDate: string | null
  hasOpenDispute: boolean
}): string {
  // Terminal and pre-issue states are not repriced by payment arithmetic.
  if (s.current === 'draft' || s.current === 'void') return s.current

  if (s.writtenOff > 0 && s.balance <= 0) return 'written_off'
  if (s.balance <= 0) {
    // Fully settled. Which flavour depends on how it got there.
    if (s.credited >= s.total && s.paid <= 0) return 'credited'
    return 'paid'
  }
  // Still owing.
  if (s.hasOpenDispute) return 'disputed'
  if (s.credited > 0) return 'part_credited'
  if (s.paid > 0) {
    return 'part_paid'
  }
  if (s.dueDate && s.dueDate < new Date().toISOString().slice(0, 10)) return 'overdue'
  return 'issued'
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export { pool }
