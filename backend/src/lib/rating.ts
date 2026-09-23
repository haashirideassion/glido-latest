/**
 * Rating engine — steps 3 and 4 of the FRS §5.1 information chain.
 *
 *   catalogue → tariff → **rating event → charge line** → invoice → payment → …
 *
 * This module is deliberately pure: it takes a resolved tariff bundle and a
 * rating context, and returns priced lines. Nothing here touches the database,
 * which is what makes the T-08 simulator, the X-02 live quote and the nightly
 * accrual all able to run the same code and get the same number (SC-05: the
 * total shown before payment equals the total invoiced, to the cent).
 *
 * Every line carries a `working` object — the machine-readable derivation the UI
 * renders in plain language (RT-11, X-03). A charge nobody can explain is a
 * charge that gets disputed, so producing it is not optional.
 *
 * ── Order of operations ─────────────────────────────────────────────────────
 * The order below determines the money, so it is stated once, here, and follows
 * flow F1:
 *
 *   1.  unit of measure          → base quantity                        SC-07
 *   2.  chargeable-qty formula   → chargeable quantity                  TF-08
 *   3.  free allowance           → deducted (days, or units)            TF-06
 *   4.  minimum quantity         → floor on units charged               TF-07
 *   5.  rate walk                → flat / per-unit / tiers / % of base   TF-04, TF-05
 *   6.  min charge, max cap      → floor and ceiling on the line         TF-07
 *   7.  discounts                → line- and invoice-scoped             TF-10
 *   8.  surcharges               → evaluated on the discounted subtotal  TF-09
 *   9.  tax                      → per line, from item taxability        TX-01
 *   10. rounding                 → at line, then at total                RT-10
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Money, add, allocate, formatMoney, isZero, minMoney, money, multiply, percentOf,
  rateTimesQty, round, RoundingMode, subtract, sum, toDecimalString, toNumber, zero,
} from './money'
import { evaluateCondition, evaluateNumeric, FormulaError, FormulaScope } from './formula'

// ─────────────────────────────────────────────────────────────────────────────
// Configuration — the shape the repository layer loads out of the database
// ─────────────────────────────────────────────────────────────────────────────

export type UnitOfMeasure =
  | 'each' | 'cbm' | 'cbm_day' | 'tonne' | 'kg' | 'pallet'
  | 'container' | 'hour' | 'day' | 'booking' | 'percent'

export type Taxability = 'standard' | 'gst_free' | 'input_taxed'

export type RateType =
  | 'flat' | 'per_unit' | 'graduated' | 'volume_band' | 'threshold' | 'percent_of_base'

export type AttachMode = 'mandatory' | 'optional' | 'conditional'

export interface CatalogueItemConfig {
  id: string
  code: string
  customerName: string        // the only name that reaches a customer (SC-10)
  internalName?: string | null
  description?: string | null
  category: string
  unitOfMeasure: UnitOfMeasure
  taxability: Taxability
  glAccountCode?: string | null
  taxCode?: string | null
  currentVersionId?: string | null
  isBundle?: boolean
  sortOrder?: number
}

export interface ApplicabilityRuleConfig {
  id: string
  itemId: string
  serviceType?: string | null
  loadType?: string | null
  cargoType?: string | null
  customerSegment?: string | null
  siteId?: string | null
  attachMode: AttachMode
  triggerExpr?: string | null
  defaultQuantity?: number | null
  priority: number
}

export interface RateTierConfig {
  tierNo: number
  fromQty: number
  toQty?: number | null       // exclusive; null = unbounded
  unitRate: string | number
  flatAmount?: string | number | null
}

export interface QtyFormulaConfig {
  id: string
  name: string
  expression: string
  inputs: Record<string, number>
}

export interface RateLineConfig {
  id: string
  itemId: string
  rateType: RateType
  unitRate?: string | number | null
  percentOf?: string | number | null
  percentBaseItemId?: string | null
  minQuantity?: number | null
  minCharge?: string | number | null
  maxCap?: string | number | null
  freeAllowance?: number | null
  freeAllowanceUnit?: 'day' | 'unit' | null
  formula?: QtyFormulaConfig | null
  tiers: RateTierConfig[]
}

export interface SurchargeConfig {
  id: string
  itemId?: string | null
  code: string
  label: string
  basis: 'percent' | 'fixed' | 'per_unit'
  value: string | number
  appliesTo: 'subtotal' | 'item' | 'category'
  appliesToRef?: string | null
  conditionKind:
    | 'always' | 'after_hours' | 'weekend' | 'public_holiday'
    | 'hazardous' | 'date_range' | 'expression'
  conditionConfig: Record<string, unknown>
  taxability: Taxability
}

export interface DiscountConfig {
  id: string
  code: string
  label: string
  discountType: 'percent' | 'fixed'
  value: string | number
  scope: 'invoice' | 'item' | 'category'
  scopeRef?: string | null
  approvalThreshold?: string | number | null
}

export interface TaxSettingsConfig {
  isRegistered: boolean       // TX-03 — changes invoice wording and totals
  standardRate: string | number
  abn?: string | null
  jurisdiction?: string
}

export interface RateCardConfig {
  id: string
  name: string
  currency: string
  versionNo: number
  effectiveFrom: string
  roundingMode: RoundingMode
  roundingDp: number
}

/** Everything the engine needs, resolved for one rating event. */
export interface TariffBundle {
  card: RateCardConfig
  items: CatalogueItemConfig[]
  applicability: ApplicabilityRuleConfig[]
  rateLines: RateLineConfig[]
  surcharges: SurchargeConfig[]
  discounts: DiscountConfig[]
  tax: TaxSettingsConfig
  holidays: string[]          // ISO dates
}

// ─────────────────────────────────────────────────────────────────────────────
// Rating context — the facts about the thing being priced
// ─────────────────────────────────────────────────────────────────────────────

export interface RatingContext {
  serviceType?: 'pickup' | 'dropoff' | string | null
  loadType?: 'fcl' | 'lcl' | string | null
  cargoType?: string | null
  customerSegment?: 'account' | 'guest' | string | null
  siteId?: string | null

  slotDate: string                    // ISO date
  slotStartTime?: string | null       // HH:MM

  weightKg?: number | null
  volumeCbm?: number | null
  palletCount?: number | null
  packageCount?: number | null
  containerCount?: number | null
  containerSize?: string | null
  hoursOnSite?: number | null

  /** Storage / dwell inputs (RT-05, RT-06, TF-06) */
  storageStartDate?: string | null
  asOfDate?: string | null            // defaults to slotDate; the accrual passes "today"
  daysOnSite?: number | null          // computed if absent
  dwellThresholdDays?: number | null

  isHazardous?: boolean | null

  /** Customer's optional selections and any overridden quantities (X-01) */
  selectedItemIds?: string[]
  quantities?: Record<string, number>

  /** Discount codes applied to this event (TF-10) */
  discountCodes?: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Output — priced lines plus the derivation behind each one
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkingStep {
  label: string
  detail: string
  value?: string
}

/** The RT-11 "show your working" payload, persisted onto the charge line. */
export interface ChargeWorking {
  unitOfMeasure: UnitOfMeasure
  rateType: RateType
  baseQuantity: number
  chargeableQuantity: number
  formula?: { name: string; expression: string; inputs: Record<string, number>; result: number }
  freeAllowance?: { granted: number; unit: 'day' | 'unit'; consumed: number; remaining: number }
  minimumQuantityApplied?: { minimum: number; raw: number }
  tierWalk?: Array<{
    tierNo: number
    fromQty: number
    toQty: number | null
    unitsInTier: number
    unitRate: string
    amount: string
  }>
  minChargeApplied?: { minCharge: string; calculated: string }
  maxCapApplied?: { maxCap: string; calculated: string }
  steps: WorkingStep[]
  currency: string
}

export interface RatedLine {
  itemId: string
  itemCode: string
  itemVersionId?: string | null
  /** Customer-facing description — internal codes never reach the customer (SC-10) */
  description: string
  lineKind: 'service' | 'storage' | 'demurrage' | 'surcharge' | 'discount' | 'manual' | 'cancellation'
  attachMode: AttachMode
  unitOfMeasure: UnitOfMeasure
  taxability: Taxability
  glAccountCode?: string | null
  taxCode?: string | null

  quantity: number
  chargeableQuantity: number
  unitPrice: Money
  lineSubtotal: Money
  discountAmount: Money
  taxRate: number
  taxAmount: Money
  lineTotal: Money

  rateLineId?: string | null
  working: ChargeWorking
}

export interface RatingResult {
  currency: string
  lines: RatedLine[]
  /** Items the customer may add but has not (X-01 must never render an empty step) */
  availableOptions: Array<{
    itemId: string
    itemCode: string
    description: string
    unitOfMeasure: UnitOfMeasure
    indicativeUnitPrice: Money
    indicativeTotal: Money
  }>
  subtotal: Money
  discountTotal: Money
  taxTotal: Money
  total: Money
  /** Snapshot to freeze onto the booking at confirmation (RT-02) */
  snapshot: RatingSnapshot
  /** Non-fatal problems a human should see rather than a silent mispricing */
  warnings: string[]
  taxNote: string
}

export interface RatingSnapshot {
  rateCardId: string
  rateCardName: string
  rateCardVersion: number
  currency: string
  roundingMode: RoundingMode
  roundingDp: number
  taxRegistered: boolean
  taxStandardRate: string
  ratedAt: string
  /** Verbatim rate lines used, so a superseded card still explains an old line (SC-08) */
  rateLines: Record<string, RateLineConfig>
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

export class RatingError extends Error {
  constructor(message: string, readonly itemCode?: string) {
    super(message)
    this.name = 'RatingError'
  }
}

export function rate(bundle: TariffBundle, ctx: RatingContext): RatingResult {
  const currency = bundle.card.currency
  const warnings: string[] = []
  const { roundingMode, roundingDp } = bundle.card

  const rateLineByItem = new Map(bundle.rateLines.map(rl => [rl.itemId, rl]))

  const scope = buildScope(bundle, ctx)
  const resolved = resolveApplicableItems(bundle, ctx, scope, warnings)

  // ── Pass 1: price everything that is attached ────────────────────────────
  const lines: RatedLine[] = []
  const deferredPercentLines: Array<{ item: CatalogueItemConfig; rl: RateLineConfig; attachMode: AttachMode }> = []

  for (const { item, attachMode } of resolved.attached) {
    const rl = rateLineByItem.get(item.id)
    if (!rl) {
      // A mandatory item with no price on the active card is a configuration
      // hole, not a free service. Surface it; never silently charge zero.
      warnings.push(
        `"${item.customerName}" is ${attachMode} for this booking but is not priced on rate card "${bundle.card.name}".`,
      )
      continue
    }
    if (rl.rateType === 'percent_of_base') {
      deferredPercentLines.push({ item, rl, attachMode })  // needs the other lines first
      continue
    }
    const line = priceLine(item, rl, bundle, ctx, scope, currency, warnings, { attachMode })
    if (line) lines.push(line)
  }

  // ── Pass 2: percent-of-base lines, now that their base exists ────────────
  for (const { item, rl, attachMode } of deferredPercentLines) {
    const line = pricePercentOfBase(item, rl, lines, bundle, currency, attachMode, warnings)
    if (line) lines.push(line)
  }

  // ── Discounts (TF-10) ────────────────────────────────────────────────────
  applyDiscounts(lines, bundle, ctx, currency, roundingMode, roundingDp, warnings)

  // ── Surcharges (TF-09) — on the discounted subtotal, and visible as lines ─
  const surchargeLines = buildSurchargeLines(lines, bundle, ctx, scope, currency, warnings)
  lines.push(...surchargeLines)

  // ── Tax and rounding (TX-01, RT-10) ──────────────────────────────────────
  const taxRate = bundle.tax.isRegistered ? Number(bundle.tax.standardRate) : 0
  for (const line of lines) {
    line.lineSubtotal = round(line.lineSubtotal, roundingDp, roundingMode)
    line.discountAmount = round(line.discountAmount, roundingDp, roundingMode)

    const taxable = subtract(line.lineSubtotal, line.discountAmount)
    line.taxRate = line.taxability === 'standard' ? taxRate : 0
    line.taxAmount = round(percentOf(taxable, line.taxRate), roundingDp, roundingMode)
    line.lineTotal = add(taxable, line.taxAmount)

    line.working.steps.push({
      label: line.taxRate > 0 ? `GST @ ${trimRate(line.taxRate)}%` : taxNoteForLine(line, bundle),
      detail: line.taxRate > 0
        ? `${formatMoney(taxable)} × ${trimRate(line.taxRate)}%`
        : 'No GST applied to this line.',
      value: formatMoney(line.taxAmount),
    })
    line.working.steps.push({
      label: 'Line total',
      detail: `${formatMoney(taxable)} + ${formatMoney(line.taxAmount)}`,
      value: formatMoney(line.lineTotal),
    })
  }

  // Totals are the sum of already-rounded lines, so no residual cent can appear
  // between what the customer was shown and what the invoice says (NFR-B-01).
  const subtotal      = sum(lines.map(l => l.lineSubtotal), currency)
  const discountTotal = sum(lines.map(l => l.discountAmount), currency)
  const taxTotal      = sum(lines.map(l => l.taxAmount), currency)
  const total         = sum(lines.map(l => l.lineTotal), currency)

  // ── Indicative pricing for the add-ons the customer has not taken ────────
  const availableOptions = resolved.available.map(item => {
    const rl = rateLineByItem.get(item.id)
    let unitPrice = zero(currency)
    let indicativeTotal = zero(currency)
    if (rl) {
      try {
        const probe = priceLine(item, rl, bundle, ctx, scope, currency, [], { probeQuantity: true })
        if (probe) {
          unitPrice = round(probe.unitPrice, roundingDp, roundingMode)
          const taxable = round(probe.lineSubtotal, roundingDp, roundingMode)
          const t = item.taxability === 'standard'
            ? round(percentOf(taxable, taxRate), roundingDp, roundingMode)
            : zero(currency)
          indicativeTotal = add(taxable, t)
        }
      } catch {
        /* an unpriceable add-on is simply shown without a price */
      }
    }
    return {
      itemId: item.id,
      itemCode: item.code,
      description: item.customerName,
      unitOfMeasure: item.unitOfMeasure,
      indicativeUnitPrice: unitPrice,
      indicativeTotal,
    }
  })

  return {
    currency,
    lines,
    availableOptions,
    subtotal,
    discountTotal,
    taxTotal,
    total,
    warnings,
    taxNote: bundle.tax.isRegistered
      ? 'Total includes GST.'
      : 'No GST has been charged — the supplier is not registered for GST.',
    snapshot: {
      rateCardId: bundle.card.id,
      rateCardName: bundle.card.name,
      rateCardVersion: bundle.card.versionNo,
      currency,
      roundingMode,
      roundingDp,
      taxRegistered: bundle.tax.isRegistered,
      taxStandardRate: String(bundle.tax.standardRate),
      ratedAt: new Date().toISOString(),
      rateLines: Object.fromEntries(
        lines
          .filter(l => l.rateLineId)
          .map(l => [l.itemId, rateLineByItem.get(l.itemId)!])
          .filter(([, rl]) => !!rl),
      ) as Record<string, RateLineConfig>,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Applicability resolution (SC-03, SC-04, X-01)
// ─────────────────────────────────────────────────────────────────────────────

function resolveApplicableItems(
  bundle: TariffBundle,
  ctx: RatingContext,
  scope: FormulaScope,
  warnings: string[],
): {
  attached: Array<{ item: CatalogueItemConfig; attachMode: AttachMode }>
  available: CatalogueItemConfig[]
} {
  const itemsById = new Map(bundle.items.map(i => [i.id, i]))
  const selected = new Set(ctx.selectedItemIds ?? [])

  // Lower priority wins when several rules hit the same item.
  const byItem = new Map<string, ApplicabilityRuleConfig>()
  for (const rule of [...bundle.applicability].sort((a, b) => a.priority - b.priority)) {
    if (!matchesContext(rule, ctx)) continue
    if (!byItem.has(rule.itemId)) byItem.set(rule.itemId, rule)
  }

  const attached: Array<{ item: CatalogueItemConfig; attachMode: AttachMode }> = []
  const available: CatalogueItemConfig[] = []

  for (const [itemId, rule] of byItem) {
    const item = itemsById.get(itemId)
    if (!item) continue

    if (rule.attachMode === 'mandatory') {
      // Mandatory items attach automatically and cannot be removed (SC-04).
      attached.push({ item, attachMode: 'mandatory' })
      continue
    }

    if (rule.attachMode === 'conditional') {
      let fires = false
      try {
        fires = rule.triggerExpr ? evaluateCondition(rule.triggerExpr, scope) : false
      } catch (err) {
        // A broken trigger must not silently drop a charge.
        warnings.push(
          `Conditional rule for "${item.customerName}" could not be evaluated: ${(err as Error).message}`,
        )
      }
      if (fires) attached.push({ item, attachMode: 'conditional' })
      else if (selected.has(itemId)) attached.push({ item, attachMode: 'optional' })
      continue
    }

    // optional
    if (selected.has(itemId)) attached.push({ item, attachMode: 'optional' })
    else available.push(item)
  }

  // Any explicitly selected item that no rule covered still gets priced — the
  // customer asked for it.
  for (const id of selected) {
    if (byItem.has(id)) continue
    const item = itemsById.get(id)
    if (item) attached.push({ item, attachMode: 'optional' })
  }

  attached.sort((a, b) => (a.item.sortOrder ?? 0) - (b.item.sortOrder ?? 0))
  available.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  return { attached, available }
}

function matchesContext(rule: ApplicabilityRuleConfig, ctx: RatingContext): boolean {
  // NULL in a dimension means "any" — the matrix is sparse on purpose (C-03).
  const dims: Array<[string | null | undefined, string | null | undefined]> = [
    [rule.serviceType, ctx.serviceType],
    [rule.loadType, ctx.loadType],
    [rule.cargoType, ctx.cargoType],
    [rule.customerSegment, ctx.customerSegment],
    [rule.siteId, ctx.siteId],
  ]
  return dims.every(([ruleValue, ctxValue]) =>
    ruleValue == null || String(ruleValue).toLowerCase() === String(ctxValue ?? '').toLowerCase())
}

// ─────────────────────────────────────────────────────────────────────────────
// Quantity derivation (SC-07, TF-06, TF-07, TF-08)
// ─────────────────────────────────────────────────────────────────────────────

/** Days on site, from explicit input or derived from the storage start date. */
function daysOnSite(ctx: RatingContext): number {
  if (ctx.daysOnSite != null) return Math.max(0, ctx.daysOnSite)
  if (!ctx.storageStartDate) return 0
  const from = Date.parse(ctx.storageStartDate)
  const to = Date.parse(ctx.asOfDate ?? ctx.slotDate)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.max(0, Math.floor((to - from) / 86_400_000))
}

/** The scope every tenant formula and trigger sees. */
function buildScope(bundle: TariffBundle, ctx: RatingContext): FormulaScope {
  const days = daysOnSite(ctx)
  const slot = ctx.slotDate ? new Date(ctx.slotDate) : null
  const dow = slot ? slot.getUTCDay() : null
  return {
    service_type: ctx.serviceType ?? null,
    load_type: ctx.loadType ?? null,
    cargo_type: ctx.cargoType ?? null,
    customer_segment: ctx.customerSegment ?? null,
    weight_kg: ctx.weightKg ?? 0,
    volume_cbm: ctx.volumeCbm ?? 0,
    pallet_count: ctx.palletCount ?? 0,
    package_count: ctx.packageCount ?? 0,
    container_count: ctx.containerCount ?? 0,
    container_size: ctx.containerSize ?? null,
    hours_on_site: ctx.hoursOnSite ?? 0,
    days_on_site: days,
    storage_start_date: ctx.storageStartDate ?? null,
    slot_date: ctx.slotDate ?? null,
    dwell_threshold_days: ctx.dwellThresholdDays ?? 7,
    is_hazardous: ctx.isHazardous ?? false,
    is_weekend: dow === 0 || dow === 6,
    is_after_hours: isAfterHours(ctx, bundle),
    is_public_holiday: !!ctx.slotDate && bundle.holidays.includes(ctx.slotDate.slice(0, 10)),
  }
}

/** Base quantity implied by the item's unit of measure (SC-07). */
function baseQuantityFor(
  item: CatalogueItemConfig,
  ctx: RatingContext,
  scope: FormulaScope,
): { quantity: number; basis: string } {
  const override = ctx.quantities?.[item.id]
  if (override != null) return { quantity: Math.max(0, override), basis: 'entered by staff' }

  switch (item.unitOfMeasure) {
    case 'each':
    case 'booking':
    case 'percent':
      return { quantity: 1, basis: 'one per booking' }
    case 'kg':
      return { quantity: ctx.weightKg ?? 0, basis: 'declared weight (kg)' }
    case 'tonne':
      return { quantity: (ctx.weightKg ?? 0) / 1000, basis: 'declared weight (tonnes)' }
    case 'cbm':
      return { quantity: ctx.volumeCbm ?? 0, basis: 'declared volume (CBM)' }
    case 'pallet':
      return { quantity: ctx.palletCount ?? 0, basis: 'pallet count' }
    case 'container':
      return { quantity: ctx.containerCount ?? 1, basis: 'container count' }
    case 'hour':
      return { quantity: ctx.hoursOnSite ?? 0, basis: 'hours on site' }
    case 'day':
      return { quantity: Number(scope.days_on_site ?? 0), basis: 'days on site' }
    case 'cbm_day':
      // Two dimensions: the volume measure comes from the formula, the day count
      // from dwell. Handled together in priceLine.
      return { quantity: Number(scope.days_on_site ?? 0), basis: 'days on site' }
    default:
      return { quantity: 1, basis: 'one per booking' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Line pricing
// ─────────────────────────────────────────────────────────────────────────────

function priceLine(
  item: CatalogueItemConfig,
  rl: RateLineConfig,
  bundle: TariffBundle,
  ctx: RatingContext,
  scope: FormulaScope,
  currency: string,
  warnings: string[],
  opts: { probeQuantity?: boolean; attachMode?: AttachMode } = {},
): RatedLine | null {
  const steps: WorkingStep[] = []
  const working: ChargeWorking = {
    unitOfMeasure: item.unitOfMeasure,
    rateType: rl.rateType,
    baseQuantity: 0,
    chargeableQuantity: 0,
    steps,
    currency,
  }

  // 1. Unit of measure → base quantity
  const { quantity: rawBase, basis } = baseQuantityFor(item, ctx, scope)
  let quantity = rawBase
  working.baseQuantity = rawBase
  steps.push({
    label: `Quantity from unit of measure (${labelForUom(item.unitOfMeasure)})`,
    detail: basis,
    value: formatQty(rawBase, item.unitOfMeasure),
  })

  // For cbm_day the priced measure is (measure × days). The measure itself comes
  // from the configurable formula, which is the whole point of TF-08.
  let measure = 1
  let measureLabel = ''

  // 2. Chargeable-quantity formula
  if (rl.formula) {
    const formulaScope: FormulaScope = { ...scope, ...rl.formula.inputs }
    try {
      measure = evaluateNumeric(rl.formula.expression, formulaScope)
      working.formula = {
        name: rl.formula.name,
        expression: rl.formula.expression,
        inputs: rl.formula.inputs,
        result: measure,
      }
      measureLabel = rl.formula.name
      steps.push({
        label: `Chargeable measure — ${rl.formula.name}`,
        detail: describeFormula(rl.formula, formulaScope),
        value: formatQty(measure, item.unitOfMeasure === 'cbm_day' ? 'cbm' : item.unitOfMeasure),
      })
    } catch (err) {
      const message = err instanceof FormulaError
        ? `Chargeable-quantity formula "${rl.formula.name}" failed: ${err.message}`
        : `Chargeable-quantity formula "${rl.formula.name}" failed.`
      warnings.push(message)
      throw new RatingError(message, item.code)
    }
  }

  // 3. Free allowance (TF-06)
  const freeAllowance = rl.freeAllowance ?? null
  if (freeAllowance != null && freeAllowance > 0) {
    const unit = rl.freeAllowanceUnit ?? (isTimeBased(item.unitOfMeasure) ? 'day' : 'unit')
    const before = quantity
    const consumed = Math.min(before, freeAllowance)
    quantity = Math.max(0, before - freeAllowance)
    working.freeAllowance = {
      granted: freeAllowance,
      unit,
      consumed,
      remaining: Math.max(0, freeAllowance - consumed),
    }
    steps.push({
      label: `Free allowance — ${freeAllowance} ${unit}${freeAllowance === 1 ? '' : 's'}`,
      detail: `${formatQty(before, item.unitOfMeasure)} less ${consumed} free ${unit}${consumed === 1 ? '' : 's'}`,
      value: formatQty(quantity, item.unitOfMeasure),
    })
  }

  // 4. Minimum quantity (TF-07)
  if (rl.minQuantity != null && quantity > 0 && quantity < rl.minQuantity) {
    working.minimumQuantityApplied = { minimum: rl.minQuantity, raw: quantity }
    steps.push({
      label: `Minimum quantity — ${rl.minQuantity}`,
      detail: `Charged quantity raised from ${formatQty(quantity, item.unitOfMeasure)} to the contracted minimum.`,
      value: formatQty(rl.minQuantity, item.unitOfMeasure),
    })
    quantity = rl.minQuantity
  }

  // A zero-quantity line is not a charge. Storage inside its free allowance is
  // the common case, and it should not clutter the quote with a $0.00 line —
  // but the free-days working still needs to reach the storage report (RP-05),
  // so the caller sees it via the returned warnings/working of other lines.
  if (quantity <= 0 && !opts.probeQuantity) return null
  if (opts.probeQuantity && quantity <= 0) quantity = 1

  const pricedQuantity = item.unitOfMeasure === 'cbm_day' ? quantity * measure : quantity
  working.chargeableQuantity = pricedQuantity
  if (item.unitOfMeasure === 'cbm_day') {
    steps.push({
      label: 'Chargeable units',
      detail: `${formatQty(measure, 'cbm')}${measureLabel ? ` (${measureLabel})` : ''} × ${quantity} day${quantity === 1 ? '' : 's'}`,
      value: `${trimQty(pricedQuantity)} CBM-days`,
    })
  }

  // 5. Rate walk
  const walk = walkRate(rl, pricedQuantity, currency, item, steps, working)

  // 6. Min charge / max cap (TF-07)
  let lineSubtotal = walk.amount
  if (rl.minCharge != null && rl.minCharge !== '') {
    const floor = money(rl.minCharge as number, currency)
    if (lineSubtotal.pips < floor.pips) {
      working.minChargeApplied = {
        minCharge: toDecimalString(floor),
        calculated: toDecimalString(lineSubtotal),
      }
      steps.push({
        label: 'Minimum charge applied',
        detail: `Calculated ${formatMoney(lineSubtotal)} is below the minimum charge of ${formatMoney(floor)}.`,
        value: formatMoney(floor),
      })
      lineSubtotal = floor
    }
  }
  if (rl.maxCap != null && rl.maxCap !== '') {
    const cap = money(rl.maxCap as number, currency)
    if (lineSubtotal.pips > cap.pips) {
      working.maxCapApplied = {
        maxCap: toDecimalString(cap),
        calculated: toDecimalString(lineSubtotal),
      }
      steps.push({
        label: 'Maximum cap applied',
        detail: `Calculated ${formatMoney(lineSubtotal)} exceeds the cap of ${formatMoney(cap)}.`,
        value: formatMoney(cap),
      })
      lineSubtotal = cap
    }
  }

  const unitPrice = pricedQuantity > 0
    ? multiply(lineSubtotal, 1 / pricedQuantity)
    : zero(currency)

  return {
    itemId: item.id,
    itemCode: item.code,
    itemVersionId: item.currentVersionId ?? null,
    description: item.customerName,
    lineKind: lineKindFor(item),
    attachMode: opts.attachMode ?? 'optional',
    unitOfMeasure: item.unitOfMeasure,
    taxability: item.taxability,
    glAccountCode: item.glAccountCode ?? null,
    taxCode: item.taxCode ?? null,
    quantity: rawBase,
    chargeableQuantity: pricedQuantity,
    unitPrice,
    lineSubtotal,
    discountAmount: zero(currency),
    taxRate: 0,
    taxAmount: zero(currency),
    lineTotal: zero(currency),
    rateLineId: rl.id,
    working,
  }
}

/** The tier / band / flat walk (TF-04, TF-05). */
function walkRate(
  rl: RateLineConfig,
  quantity: number,
  currency: string,
  item: CatalogueItemConfig,
  steps: WorkingStep[],
  working: ChargeWorking,
): { amount: Money } {
  switch (rl.rateType) {
    case 'flat': {
      const amount = money(rl.unitRate ?? 0, currency)
      steps.push({
        label: 'Flat rate',
        detail: `Fixed charge, independent of quantity.`,
        value: formatMoney(amount),
      })
      return { amount }
    }

    case 'per_unit': {
      const rateStr = String(rl.unitRate ?? 0)
      const amount = rateTimesQty(rateStr, quantity, currency)
      steps.push({
        label: 'Per-unit rate',
        detail: `${trimQty(quantity)} × ${formatMoney(money(rateStr, currency))} per ${labelForUom(item.unitOfMeasure)}`,
        value: formatMoney(amount),
      })
      return { amount }
    }

    case 'graduated': {
      // Each tier prices only the units that fall inside it.
      const tiers = sortTiers(rl.tiers)
      const walkRows: NonNullable<ChargeWorking['tierWalk']> = []
      let amount = zero(currency)
      let remaining = quantity

      for (const tier of tiers) {
        if (remaining <= 0) break
        const upper = tier.toQty ?? Infinity
        const width = upper - tier.fromQty
        const unitsInTier = Math.min(Math.max(0, quantity - tier.fromQty), width)
        if (unitsInTier <= 0) continue
        const tierAmount = add(
          rateTimesQty(String(tier.unitRate), unitsInTier, currency),
          money(tier.flatAmount ?? 0, currency),
        )
        amount = add(amount, tierAmount)
        remaining -= unitsInTier
        walkRows.push({
          tierNo: tier.tierNo,
          fromQty: tier.fromQty,
          toQty: tier.toQty ?? null,
          unitsInTier,
          unitRate: String(tier.unitRate),
          amount: toDecimalString(tierAmount),
        })
      }

      working.tierWalk = walkRows
      steps.push({
        label: 'Graduated tiers',
        detail: walkRows.length
          ? walkRows
              .map(r => `${trimQty(r.unitsInTier)} unit${r.unitsInTier === 1 ? '' : 's'} in tier ${r.tierNo} (${describeBand(r.fromQty, r.toQty)}) @ ${formatMoney(money(r.unitRate, currency))}`)
              .join('; ')
          : 'No tier matched the chargeable quantity.',
        value: formatMoney(amount),
      })
      return { amount }
    }

    case 'volume_band': {
      // The band the total quantity lands in prices every unit.
      const tier = findTier(rl.tiers, quantity)
      if (!tier) {
        steps.push({
          label: 'Volume band',
          detail: `No band covers a quantity of ${trimQty(quantity)}.`,
          value: formatMoney(zero(currency)),
        })
        return { amount: zero(currency) }
      }
      const amount = add(
        rateTimesQty(String(tier.unitRate), quantity, currency),
        money(tier.flatAmount ?? 0, currency),
      )
      working.tierWalk = [{
        tierNo: tier.tierNo,
        fromQty: tier.fromQty,
        toQty: tier.toQty ?? null,
        unitsInTier: quantity,
        unitRate: String(tier.unitRate),
        amount: toDecimalString(amount),
      }]
      steps.push({
        label: `Volume band ${tier.tierNo} (${describeBand(tier.fromQty, tier.toQty ?? null)})`,
        detail: `All ${trimQty(quantity)} unit${quantity === 1 ? '' : 's'} priced at the band rate of ${formatMoney(money(String(tier.unitRate), currency))}.`,
        value: formatMoney(amount),
      })
      return { amount }
    }

    case 'threshold': {
      // Escalating: the units above each threshold price at that tier's rate.
      // This is how demurrage escalates by dwell band (RT-06).
      const tiers = sortTiers(rl.tiers)
      const walkRows: NonNullable<ChargeWorking['tierWalk']> = []
      let amount = zero(currency)

      for (const tier of tiers) {
        const upper = Math.min(tier.toQty ?? Infinity, quantity)
        const unitsInTier = Math.max(0, upper - tier.fromQty)
        if (unitsInTier <= 0) continue
        const tierAmount = add(
          rateTimesQty(String(tier.unitRate), unitsInTier, currency),
          money(tier.flatAmount ?? 0, currency),
        )
        amount = add(amount, tierAmount)
        walkRows.push({
          tierNo: tier.tierNo,
          fromQty: tier.fromQty,
          toQty: tier.toQty ?? null,
          unitsInTier,
          unitRate: String(tier.unitRate),
          amount: toDecimalString(tierAmount),
        })
      }

      working.tierWalk = walkRows
      steps.push({
        label: 'Escalating thresholds',
        detail: walkRows.length
          ? walkRows
              .map(r => `${trimQty(r.unitsInTier)} × ${formatMoney(money(r.unitRate, currency))} above ${trimQty(r.fromQty)}`)
              .join('; ')
          : `Quantity of ${trimQty(quantity)} is below the first threshold — nothing charged.`,
        value: formatMoney(amount),
      })
      return { amount }
    }

    case 'percent_of_base':
      // Handled in pass 2; unreachable here.
      return { amount: zero(currency) }

    default:
      return { amount: zero(currency) }
  }
}

function pricePercentOfBase(
  item: CatalogueItemConfig,
  rl: RateLineConfig,
  existing: RatedLine[],
  bundle: TariffBundle,
  currency: string,
  attachMode: AttachMode,
  warnings: string[],
): RatedLine | null {
  const percent = Number(rl.percentOf ?? 0)
  const base = rl.percentBaseItemId
    ? existing.filter(l => l.itemId === rl.percentBaseItemId)
    : existing
  const baseAmount = sum(base.map(l => l.lineSubtotal), currency)

  if (isZero(baseAmount)) return null

  const amount = percentOf(baseAmount, percent)
  const baseLabel = rl.percentBaseItemId
    ? (bundle.items.find(i => i.id === rl.percentBaseItemId)?.customerName ?? 'base charge')
    : 'the charges on this booking'

  const steps: WorkingStep[] = [{
    label: `${trimRate(percent)}% of ${baseLabel}`,
    detail: `${formatMoney(baseAmount)} × ${trimRate(percent)}%`,
    value: formatMoney(amount),
  }]

  return {
    itemId: item.id,
    itemCode: item.code,
    itemVersionId: item.currentVersionId ?? null,
    description: item.customerName,
    lineKind: lineKindFor(item),
    attachMode,
    unitOfMeasure: item.unitOfMeasure,
    taxability: item.taxability,
    glAccountCode: item.glAccountCode ?? null,
    taxCode: item.taxCode ?? null,
    quantity: 1,
    chargeableQuantity: 1,
    unitPrice: amount,
    lineSubtotal: amount,
    discountAmount: zero(currency),
    taxRate: 0,
    taxAmount: zero(currency),
    lineTotal: zero(currency),
    rateLineId: rl.id,
    working: {
      unitOfMeasure: item.unitOfMeasure,
      rateType: 'percent_of_base',
      baseQuantity: 1,
      chargeableQuantity: 1,
      steps,
      currency,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Discounts (TF-10) and surcharges (TF-09)
// ─────────────────────────────────────────────────────────────────────────────

function applyDiscounts(
  lines: RatedLine[],
  bundle: TariffBundle,
  ctx: RatingContext,
  currency: string,
  roundingMode: RoundingMode,
  roundingDp: number,
  warnings: string[],
): void {
  const codes = new Set((ctx.discountCodes ?? []).map(c => c.toUpperCase()))
  if (!codes.size) return

  for (const discount of bundle.discounts) {
    if (!codes.has(discount.code.toUpperCase())) continue

    const targets = lines.filter(l => {
      if (discount.scope === 'invoice') return true
      if (discount.scope === 'item') return l.itemId === discount.scopeRef
      return itemCategory(bundle, l.itemId) === discount.scopeRef
    })
    if (!targets.length) {
      warnings.push(`Discount "${discount.label}" applied to nothing on this booking.`)
      continue
    }

    const targetTotal = sum(targets.map(l => l.lineSubtotal), currency)
    const gross = discount.discountType === 'percent'
      ? percentOf(targetTotal, discount.value)
      : minMoney(money(discount.value, currency), targetTotal)   // never discount below zero

    // Spread a fixed-amount discount across the lines it covers so the parts add
    // back to the discount exactly — no orphan cent.
    const shares = allocate(gross, targets.map(l => l.lineSubtotal.pips))
    targets.forEach((line, idx) => {
      line.discountAmount = add(line.discountAmount, shares[idx])
      line.working.steps.push({
        label: `Discount — ${discount.label}`,
        detail: discount.discountType === 'percent'
          ? `${trimRate(Number(discount.value))}% off ${formatMoney(line.lineSubtotal)}`
          : `Share of a ${formatMoney(money(discount.value, currency))} discount across ${targets.length} line${targets.length === 1 ? '' : 's'}`,
        value: `−${formatMoney(shares[idx])}`,
      })
    })

    const threshold = discount.approvalThreshold != null ? Number(discount.approvalThreshold) : null
    if (threshold != null && toNumber(gross) >= threshold) {
      // Above the threshold this needs a named approver before it reaches an
      // invoice (TF-10, S-10). The caller must not quietly issue it.
      warnings.push(
        `Discount "${discount.label}" of ${formatMoney(gross)} is at or above the ${formatMoney(money(threshold, currency))} approval threshold and requires an approver.`,
      )
    }
  }
}

function buildSurchargeLines(
  lines: RatedLine[],
  bundle: TariffBundle,
  ctx: RatingContext,
  scope: FormulaScope,
  currency: string,
  warnings: string[],
): RatedLine[] {
  if (!lines.length) return []
  const out: RatedLine[] = []

  for (const surcharge of bundle.surcharges) {
    if (!surchargeApplies(surcharge, ctx, scope, warnings)) continue

    const targets = lines.filter(l => {
      if (surcharge.appliesTo === 'subtotal') return true
      if (surcharge.appliesTo === 'item') return l.itemId === surcharge.appliesToRef
      return itemCategory(bundle, l.itemId) === surcharge.appliesToRef
    })
    if (!targets.length) continue

    const base = sum(targets.map(l => subtract(l.lineSubtotal, l.discountAmount)), currency)
    let amount: Money
    let detail: string

    switch (surcharge.basis) {
      case 'percent':
        amount = percentOf(base, surcharge.value)
        detail = `${trimRate(Number(surcharge.value))}% of ${formatMoney(base)}`
        break
      case 'fixed':
        amount = money(surcharge.value, currency)
        detail = 'Fixed levy'
        break
      case 'per_unit': {
        const units = targets.reduce((s, l) => s + l.chargeableQuantity, 0)
        amount = rateTimesQty(String(surcharge.value), units, currency)
        detail = `${trimQty(units)} × ${formatMoney(money(surcharge.value, currency))}`
        break
      }
    }

    if (isZero(amount)) continue

    const item = surcharge.itemId ? bundle.items.find(i => i.id === surcharge.itemId) : undefined

    out.push({
      itemId: surcharge.itemId ?? surcharge.id,
      itemCode: surcharge.code,
      itemVersionId: item?.currentVersionId ?? null,
      // The customer sees the surcharge as its own line, never buried in another
      // charge (X-02: surcharge lines visible).
      description: surcharge.label,
      lineKind: 'surcharge',
      attachMode: 'mandatory',
      unitOfMeasure: item?.unitOfMeasure ?? 'each',
      taxability: surcharge.taxability,
      glAccountCode: item?.glAccountCode ?? null,
      taxCode: item?.taxCode ?? null,
      quantity: 1,
      chargeableQuantity: 1,
      unitPrice: amount,
      lineSubtotal: amount,
      discountAmount: zero(currency),
      taxRate: 0,
      taxAmount: zero(currency),
      lineTotal: zero(currency),
      rateLineId: null,
      working: {
        unitOfMeasure: item?.unitOfMeasure ?? 'each',
        rateType: 'percent_of_base',
        baseQuantity: 1,
        chargeableQuantity: 1,
        currency,
        steps: [
          {
            label: `${surcharge.label} — ${describeCondition(surcharge)}`,
            detail,
            value: formatMoney(amount),
          },
        ],
      },
    })
  }

  return out
}

function surchargeApplies(
  surcharge: SurchargeConfig,
  ctx: RatingContext,
  scope: FormulaScope,
  warnings: string[],
): boolean {
  switch (surcharge.conditionKind) {
    case 'always':         return true
    case 'weekend':        return !!scope.is_weekend
    case 'public_holiday': return !!scope.is_public_holiday
    case 'after_hours':    return !!scope.is_after_hours
    case 'hazardous':      return !!scope.is_hazardous
    case 'date_range': {
      const { from, to } = surcharge.conditionConfig as { from?: string; to?: string }
      const d = ctx.slotDate?.slice(0, 10)
      if (!d) return false
      return (!from || d >= from) && (!to || d <= to)
    }
    case 'expression': {
      const expr = (surcharge.conditionConfig as { expression?: string }).expression
      if (!expr) return false
      try {
        return evaluateCondition(expr, scope)
      } catch (err) {
        warnings.push(`Surcharge "${surcharge.label}" condition could not be evaluated: ${(err as Error).message}`)
        return false
      }
    }
    default: return false
  }
}

/** After-hours is decided against the surcharge's own configured window. */
function isAfterHours(ctx: RatingContext, bundle: TariffBundle): boolean {
  if (!ctx.slotStartTime) return false
  const cfg = bundle.surcharges.find(s => s.conditionKind === 'after_hours')?.conditionConfig as
    | { start?: string; end?: string }
    | undefined
  const start = cfg?.start ?? '18:00'
  const end = cfg?.end ?? '06:00'
  const t = ctx.slotStartTime.slice(0, 5)
  // A window that wraps midnight (18:00 → 06:00) is the normal case.
  return start > end ? (t >= start || t < end) : (t >= start && t < end)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sortTiers(tiers: RateTierConfig[]): RateTierConfig[] {
  return [...tiers].sort((a, b) => a.fromQty - b.fromQty)
}

function findTier(tiers: RateTierConfig[], quantity: number): RateTierConfig | undefined {
  return sortTiers(tiers).find(t => quantity >= t.fromQty && (t.toQty == null || quantity < t.toQty))
}

function itemCategory(bundle: TariffBundle, itemId: string): string | undefined {
  return bundle.items.find(i => i.id === itemId)?.category
}

function lineKindFor(item: CatalogueItemConfig): RatedLine['lineKind'] {
  if (item.code === 'DEMUR' || /demurrage/i.test(item.customerName)) return 'demurrage'
  if (item.category === 'storage') return 'storage'
  if (item.category === 'surcharge') return 'surcharge'
  if (/cancel|no.?show/i.test(item.code)) return 'cancellation'
  return 'service'
}

function isTimeBased(uom: UnitOfMeasure): boolean {
  return uom === 'day' || uom === 'cbm_day' || uom === 'hour'
}

function labelForUom(uom: UnitOfMeasure): string {
  const labels: Record<UnitOfMeasure, string> = {
    each: 'each', cbm: 'CBM', cbm_day: 'CBM-day', tonne: 'tonne', kg: 'kg',
    pallet: 'pallet', container: 'container', hour: 'hour', day: 'day',
    booking: 'booking', percent: 'percent',
  }
  return labels[uom] ?? uom
}

function formatQty(n: number, uom: UnitOfMeasure): string {
  return `${trimQty(n)} ${labelForUom(uom)}${Math.abs(n) === 1 ? '' : 's'}`.replace(/CBMs/, 'CBM')
}

/** Quantities display at up to 4dp with trailing zeros removed. */
function trimQty(n: number): string {
  return String(Number(n.toFixed(4)))
}

function trimRate(n: number): string {
  return String(Number(n.toFixed(4)))
}

function describeBand(from: number, to: number | null): string {
  return to == null ? `over ${trimQty(from)}` : `${trimQty(from)}–${trimQty(to)}`
}

function describeFormula(formula: QtyFormulaConfig, scope: FormulaScope): string {
  // Substitute the actual values in so the customer sees arithmetic, not algebra.
  const substituted = formula.expression.replace(/[A-Za-z_][A-Za-z0-9_]*/g, name => {
    const upper = name.toUpperCase()
    if (['MAX', 'MIN', 'ABS', 'CEIL', 'FLOOR', 'ROUND', 'IF', 'COALESCE', 'DAYS_BETWEEN'].includes(upper)) {
      return name
    }
    const v = scope[name]
    return v == null ? name : trimQty(Number(v) || 0)
  })
  return `${formula.expression}  =  ${substituted}`
}

function describeCondition(surcharge: SurchargeConfig): string {
  switch (surcharge.conditionKind) {
    case 'after_hours': {
      const c = surcharge.conditionConfig as { start?: string; end?: string }
      return `booking outside ${c.start ?? '18:00'}–${c.end ?? '06:00'}`
    }
    case 'weekend':        return 'weekend booking'
    case 'public_holiday': return 'public holiday'
    case 'hazardous':      return 'hazardous cargo'
    case 'date_range':     return 'within a surcharge period'
    case 'expression':     return 'rule matched'
    default:               return 'always applies'
  }
}

function taxNoteForLine(line: RatedLine, bundle: TariffBundle): string {
  if (!bundle.tax.isRegistered) return 'No GST — supplier not registered'
  if (line.taxability === 'gst_free') return 'GST-free'
  if (line.taxability === 'input_taxed') return 'Input taxed'
  return 'No GST'
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence shape — how a rated line becomes a billing_charge_lines row
// ─────────────────────────────────────────────────────────────────────────────

export interface ChargeLineRow {
  item_id: string | null
  item_version_id: string | null
  rate_card_id: string
  rate_card_version: number
  rate_snapshot: unknown
  description: string
  unit_of_measure: string
  quantity: string
  chargeable_quantity: string
  unit_price: string
  line_subtotal: string
  discount_amount: string
  tax_rate: string
  tax_amount: string
  line_total: string
  currency: string
  line_kind: string
  working: ChargeWorking
}

/**
 * Convert a rated line to the column values for billing_charge_lines. Amounts go
 * out as exact decimal strings so the NUMERIC column receives what the engine
 * computed, not a float's nearest approximation.
 */
export function toChargeLineRow(
  line: RatedLine,
  snapshot: RatingSnapshot,
): ChargeLineRow {
  return {
    item_id: line.itemId,
    item_version_id: line.itemVersionId ?? null,
    rate_card_id: snapshot.rateCardId,
    rate_card_version: snapshot.rateCardVersion,
    rate_snapshot: line.rateLineId ? snapshot.rateLines[line.itemId] ?? null : null,
    description: line.description,
    unit_of_measure: line.unitOfMeasure,
    quantity: trimQty(line.quantity),
    chargeable_quantity: trimQty(line.chargeableQuantity),
    unit_price: toDecimalString(line.unitPrice, 4),
    line_subtotal: toDecimalString(line.lineSubtotal, 2),
    discount_amount: toDecimalString(line.discountAmount, 2),
    tax_rate: trimRate(line.taxRate),
    tax_amount: toDecimalString(line.taxAmount, 2),
    line_total: toDecimalString(line.lineTotal, 2),
    currency: line.lineTotal.currency,
    line_kind: line.lineKind,
    working: line.working,
  }
}
