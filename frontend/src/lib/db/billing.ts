/**
 * Billing, Rating & Revenue — API layer.
 *
 * Two conventions worth knowing before reading the rest of the module:
 *
 *  1. Every monetary value crosses the wire as a `Money` object, never a bare
 *     number (NFR-B-03). `display` is already formatted with its currency by
 *     the server, so the UI renders that rather than re-formatting and risking
 *     a mismatch with the invoice.
 *
 *  2. A refusal is not an error to swallow. The server answers with a message
 *     and, where one exists, the legal alternative (`deactivate`,
 *     `credit_note`, `prepaid_checkout`, `override_request`) so the UI can
 *     offer it as an action (cross-cutting rule 6). `BillingRefusal` carries
 *     that through, which is why the mutating helpers here throw it rather
 *     than returning null.
 */

const BASE = '/api/billing'

// ─────────────────────────────────────────────────────────────────────────────
// Shared shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface Money {
  amount: string
  currency: string
  display: string
}

export const ZERO_MONEY: Money = { amount: '0.00', currency: 'AUD', display: '$0.00' }

/** A step in the RT-11 "show your working" derivation. */
export interface WorkingStep {
  label: string
  detail: string
  value?: string
}

export interface ChargeWorking {
  unitOfMeasure: string
  rateType: string
  baseQuantity: number
  chargeableQuantity: number
  formula?: { name: string; expression: string; inputs: Record<string, number>; result: number }
  freeAllowance?: { granted: number; unit: string; consumed: number; remaining: number }
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

export type BillingAlternative =
  | 'deactivate' | 'credit_note' | 'prepaid_checkout' | 'override_request'

/**
 * A refusal the UI is expected to act on rather than merely report — it names
 * the legal alternative, the capability that was missing, or the approval that
 * is required.
 */
export class BillingRefusal extends Error {
  constructor(
    message: string,
    readonly alternative?: BillingAlternative,
    readonly capability?: string,
    readonly approvalRequired?: boolean,
    readonly threshold?: number,
    readonly approverRole?: string,
  ) {
    super(message)
    this.name = 'BillingRefusal'
  }
}

/**
 * The fetcher wrappers throw a plain Error carrying only the message, so the
 * structured part of a refusal is re-fetched here. Going direct to fetch keeps
 * `error.alternative` and `error.capability` intact.
 */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiClient } = await import('@/lib/api-client')
  try {
    const res: any = await apiClient(path, init)
    return res?.data as T
  } catch (err: any) {
    throw err
  }
}

/**
 * Mutating call that preserves a refusal's structure. `apiClient` collapses the
 * error body to a message, so this reads the response itself.
 */
async function mutate<T>(path: string, method: string, body?: unknown): Promise<T> {
  const { API_BASE, getToken } = await import('@/lib/api-client')
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  let payload: any = null
  try { payload = await res.json() } catch { /* empty body */ }

  if (!res.ok || payload?.success === false) {
    const e = payload?.error ?? {}
    throw new BillingRefusal(
      e.message ?? `Request failed (${res.status})`,
      e.alternative,
      e.capability,
      e.approvalRequired,
      e.threshold,
      e.approverRole,
    )
  }
  return payload?.data as T
}

// ─────────────────────────────────────────────────────────────────────────────
// S-11 — capabilities. Read before rendering, so a forbidden action is absent
// or disabled with a reason rather than failing on submit (rule 4).
// ─────────────────────────────────────────────────────────────────────────────

export interface BillingCapabilities {
  can_manage_catalogue: boolean
  can_manage_tariffs: boolean
  can_publish_tariffs: boolean
  can_add_manual_charge: boolean
  can_adjust_charge: boolean
  can_waive_charge: boolean
  can_issue_invoice: boolean
  can_run_billing: boolean
  can_issue_credit_note: boolean
  can_confirm_eft_payment: boolean
  can_refund: boolean
  can_write_off: boolean
  can_override_credit_limit: boolean
  can_approve: boolean
  can_export: boolean
  can_manage_integration: boolean
}

export interface ApprovalThreshold {
  threshold: number
  approverRole: string
  allowSelfApproval: boolean
}

export interface CapabilityResponse {
  userId: string
  role: string
  capabilities: BillingCapabilities
  thresholds: Record<string, ApprovalThreshold>
}

export const NO_CAPABILITIES: BillingCapabilities = {
  can_manage_catalogue: false, can_manage_tariffs: false, can_publish_tariffs: false,
  can_add_manual_charge: false, can_adjust_charge: false, can_waive_charge: false,
  can_issue_invoice: false, can_run_billing: false, can_issue_credit_note: false,
  can_confirm_eft_payment: false, can_refund: false, can_write_off: false,
  can_override_credit_limit: false, can_approve: false, can_export: false,
  can_manage_integration: false,
}

export const getCapabilities = () =>
  call<CapabilityResponse>(`${BASE}/settings/capabilities`)

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue (C-01 … C-07)
// ─────────────────────────────────────────────────────────────────────────────

export interface CatalogueItem {
  id: string
  code: string
  customerName: string
  internalName: string | null
  description: string | null
  category: string
  unitOfMeasure: string
  taxability: string
  glAccountCode: string | null
  taxCode: string | null
  status: string
  isBundle: boolean
  sortOrder: number
  versionNo: number
  activeFrom: string | null
  usage: { chargeLines: number; rateLines: number; rules: number }
  deletable: boolean
  deleteBlockedReason: string | null
  ledgerMapped: boolean
}

export const getCatalogue = (params: {
  status?: string; category?: string; search?: string
} = {}) => {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][])
  return call<{ categories: string[]; units: string[]; items: CatalogueItem[] }>(
    `${BASE}/catalogue${q.toString() ? `?${q}` : ''}`)
}

export const getCatalogueItem = (id: string) =>
  call<{
    item: any
    versions: Array<{
      id: string; versionNo: number; effectiveFrom: string; effectiveTo: string | null
      current: boolean; snapshot: any; changedBy: string | null; changeNote: string | null
      usedByChargeLines: number; at: string
    }>
    applicability: any[]
    pricedOn: Array<{ rateCardId: string; cardName: string; cardStatus: string; rateType: string; unitRate: string }>
  }>(`${BASE}/catalogue/${id}`)

export const createCatalogueItem = (body: Record<string, unknown>) =>
  mutate<CatalogueItem>(`${BASE}/catalogue`, 'POST', body)

export const updateCatalogueItem = (id: string, body: Record<string, unknown>) =>
  mutate<CatalogueItem>(`${BASE}/catalogue/${id}`, 'PATCH', body)

export const deleteCatalogueItem = (id: string) =>
  mutate<{ deleted: boolean }>(`${BASE}/catalogue/${id}`, 'DELETE')

export const seedCatalogue = () =>
  mutate<{ seeded: number; skipped: number }>(`${BASE}/catalogue/seed`, 'POST', {})

export const createApplicabilityRule = (itemId: string, body: Record<string, unknown>) =>
  mutate<any>(`${BASE}/catalogue/${itemId}/applicability`, 'POST', body)

export const updateApplicabilityRule = (ruleId: string, body: Record<string, unknown>) =>
  mutate<any>(`${BASE}/catalogue/applicability/${ruleId}`, 'PATCH', body)

export const deleteApplicabilityRule = (ruleId: string) =>
  mutate<{ deleted: boolean }>(`${BASE}/catalogue/applicability/${ruleId}`, 'DELETE')

export const getCatalogueAuditLog = (params: { itemId?: string; limit?: number } = {}) => {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
  return call<Array<{
    id: string; entityType: string; entityId: string; action: string
    before: any; after: any; reasonCode: string | null; reasonNote: string | null
    actor: string; at: string
  }>>(`${BASE}/catalogue/audit-log${q.toString() ? `?${q}` : ''}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tariff (T-01 … T-11)
// ─────────────────────────────────────────────────────────────────────────────

export interface RateCard {
  id: string
  name: string
  siteId: string | null
  currency: string
  status: string
  versionNo: number
  effectiveFrom: string
  effectiveTo: string | null
  isSiteDefault: boolean
  roundingMode: string
  roundingDp: number
  lineCount: number
  assignedAccounts: number
  usedByChargeLines: number
  reviewedBy: string | null
  publishedBy: string | null
  publishedAt: string | null
  editable: boolean
  availableActions: string[]
}

export interface RateTier {
  id?: string
  tierNo: number
  fromQty: number
  toQty: number | null
  unitRate: string
  flatAmount: string | null
}

export interface RateLine {
  id: string
  itemId: string
  itemCode: string
  itemName: string
  category: string
  unitOfMeasure: string
  rateType: string
  unitRate: string | null
  percentOf: string | null
  percentBaseItemId: string | null
  minQuantity: string | null
  minCharge: string | null
  maxCap: string | null
  freeAllowance: string | null
  freeAllowanceUnit: string | null
  formulaId: string | null
  formulaName: string | null
  formulaExpression: string | null
  tiers: RateTier[]
  notes: string | null
}

export const getRateCards = (status?: string) =>
  call<{ rateTypes: string[]; cards: RateCard[] }>(
    `${BASE}/tariffs${status ? `?status=${status}` : ''}`)

export const getRateCard = (id: string) =>
  call<{
    card: RateCard
    lines: RateLine[]
    assignedAccounts: Array<{ id: string; account_code: string; legal_name: string }>
    unpricedItems: Array<{ id: string; code: string; customer_name: string; category: string; unit_of_measure: string }>
    coverage: { priced: number; unpriced: number; complete: boolean }
  }>(`${BASE}/tariffs/${id}`)

export const createRateCard = (body: Record<string, unknown>) =>
  mutate<RateCard>(`${BASE}/tariffs`, 'POST', body)

export const updateRateCard = (id: string, body: Record<string, unknown>) =>
  mutate<RateCard>(`${BASE}/tariffs/${id}`, 'PATCH', body)

export const createRateLine = (cardId: string, body: Record<string, unknown>) =>
  mutate<any>(`${BASE}/tariffs/${cardId}/lines`, 'POST', body)

export const updateRateLine = (lineId: string, body: Record<string, unknown>) =>
  mutate<any>(`${BASE}/tariffs/lines/${lineId}`, 'PATCH', body)

export const deleteRateLine = (lineId: string) =>
  mutate<{ deleted: boolean }>(`${BASE}/tariffs/lines/${lineId}`, 'DELETE')

export const reviewRateCard = (id: string) =>
  mutate<RateCard>(`${BASE}/tariffs/${id}/review`, 'POST', {})

export const publishRateCard = (id: string, body: Record<string, unknown> = {}) =>
  mutate<{ card: RateCard; effectNote: string; coverageGaps: string[] }>(
    `${BASE}/tariffs/${id}/publish`, 'POST', body)

export const upliftRateCard = (id: string, body: Record<string, unknown>) =>
  mutate<any>(`${BASE}/tariffs/${id}/uplift`, 'POST', body)

export const assignRateCard = (id: string, accountIds: string[], unassign = false) =>
  mutate<{ updated: any[]; note: string }>(
    `${BASE}/tariffs/${id}/assign`, 'POST', { accountIds, unassign })

export const compareRateCards = (id: string, otherId: string) =>
  call<{
    left: { id: string; name: string | null }
    right: { id: string; name: string | null }
    rows: Array<{
      itemCode: string; itemName: string; change: string
      left: any; right: any; deltaPct: number | null
    }>
  }>(`${BASE}/tariffs/${id}/compare/${otherId}`)

export interface SimulationResult {
  scenarioId?: string
  name: string
  ok: boolean
  error?: string
  regression?: { expected: string; actual: string; matches: boolean } | null
  subtotal?: Money
  taxTotal?: Money
  total?: Money
  warnings?: string[]
  lines?: Array<{
    itemCode: string; description: string; quantity: number
    chargeableQuantity: number; lineSubtotal: Money; lineTotal: Money
    working: ChargeWorking
  }>
}

export const simulateRateCard = (id: string, body: Record<string, unknown>) =>
  mutate<{
    results: SimulationResult[]
    summary: { run: number; failed: number; regressions: number; readyToPublish: boolean; note: string | null }
  }>(`${BASE}/tariffs/${id}/simulate`, 'POST', body)

export const getScenarios = () =>
  call<{ scenarios: any[]; recommendedMinimum: number; shortfall: number }>(
    `${BASE}/tariffs/scenarios`)

export const createScenario = (body: Record<string, unknown>) =>
  mutate<any>(`${BASE}/tariffs/scenarios`, 'POST', body)

export const deleteScenario = (id: string) =>
  mutate<{ deleted: boolean }>(`${BASE}/tariffs/scenarios/${id}`, 'DELETE')

export const getFormulas = () =>
  call<{
    availableFunctions: string[]
    availableInputs: string[]
    formulas: Array<{
      id: string; name: string; expression: string; inputs: Record<string, number>
      description: string | null; isDefault: boolean; usedByRateLines: number
    }>
  }>(`${BASE}/tariffs/formulas`)

export const testFormula = (body: {
  expression: string; inputs?: Record<string, number>; sample?: Record<string, unknown>
}) =>
  mutate<{
    valid: boolean
    error?: string
    position?: number
    variables: string[]
    functions?: string[]
    scopeUsed?: Record<string, unknown>
    result: number | null
  }>(`${BASE}/tariffs/formulas/test`, 'POST', body)

export const createFormula = (body: Record<string, unknown>) =>
  mutate<any>(`${BASE}/tariffs/formulas`, 'POST', body)

export const getSurcharges = () =>
  call<{ surcharges: any[]; holidays: any[]; conditionKinds: string[] }>(
    `${BASE}/tariffs/surcharges`)

export const createSurcharge = (body: Record<string, unknown>) =>
  mutate<any>(`${BASE}/tariffs/surcharges`, 'POST', body)

// ─────────────────────────────────────────────────────────────────────────────
// Charges (X-02, O-02 … O-06)
// ─────────────────────────────────────────────────────────────────────────────

export interface QuoteLine {
  itemId: string
  itemCode: string
  description: string
  lineKind: string
  attachMode: string
  removable: boolean
  unitOfMeasure: string
  quantity: number
  chargeableQuantity: number
  unitPrice: Money
  lineSubtotal: Money
  discountAmount: Money
  taxRate: number
  taxAmount: Money
  lineTotal: Money
  working: ChargeWorking
}

export interface Quote {
  currency: string
  tariffBasis: string
  rateCard: { id: string; name: string; version: number }
  lines: QuoteLine[]
  availableOptions: Array<{
    itemId: string; itemCode: string; description: string; unitOfMeasure: string
    indicativeUnitPrice: Money; indicativeTotal: Money
  }>
  subtotal: Money
  discountTotal: Money
  taxTotal: Money
  total: Money
  taxNote: string
  warnings: string[]
  snapshot: any
}

export const getQuote = (body: Record<string, unknown>) =>
  mutate<Quote>(`${BASE}/charges/quote`, 'POST', body)

export const rateBooking = (bookingId: string, body: Record<string, unknown> = {}) =>
  mutate<Quote & { persisted: { inserted: number; removed: number; varianceLines: number }; bookingReference: string }>(
    `${BASE}/charges/rate/${bookingId}`, 'POST', body)

export const rerateBooking = (bookingId: string, body: Record<string, unknown> = {}) =>
  mutate<Quote & { persisted: { inserted: number; removed: number; varianceLines: number } }>(
    `${BASE}/charges/rerate/${bookingId}`, 'POST', body)

export interface ChargeLine {
  id: string
  itemId: string | null
  itemCode: string | null
  category: string | null
  description: string
  lineKind: string
  status: string
  source: string
  unitOfMeasure: string
  quantity: number
  chargeableQuantity: number
  unitPrice: Money
  lineSubtotal: Money
  discountAmount: Money
  taxAmount: Money
  lineTotal: Money
  estimatedTotal: Money | null
  varianceAmount: Money | null
  originalTotal: Money | null
  reasonCode: string | null
  reasonNote: string | null
  adjustedBy: string | null
  adjustedAt: string | null
  approvedBy: string | null
  accrualDate: string | null
  invoiceId: string | null
  invoiceNumber: string | null
  invoiceStatus: string | null
  working: ChargeWorking | null
  editable: boolean
}

export interface BookingFinancials {
  currency: string
  ratingSnapshot: {
    rateCardId: string
    rateCardName: string | null
    rateCardVersion: number
    frozen: boolean
  } | null
  lines: ChargeLine[]
  totals: {
    subtotal: Money; discountTotal: Money; taxTotal: Money; total: Money
    estimatedTotal: Money; varianceTotal: Money
  }
  invoiced: boolean
}

export const getBookingFinancials = (bookingId: string) =>
  call<BookingFinancials>(`${BASE}/charges/booking/${bookingId}`)

export const addManualCharge = (body: {
  bookingId: string; itemId: string; quantity: number; unitPrice?: string
  reasonCode: string; reasonNote?: string; description?: string; approvedBy?: string
}) => mutate<{ id: string; lineTotal: Money }>(`${BASE}/charges/manual`, 'POST', body)

export const adjustCharge = (id: string, body: {
  newAmount?: number; waive?: boolean; reasonCode: string; reasonNote?: string; approvedBy?: string
}) => mutate<{
  id: string; status: string; lineTotal: Money; originalTotal: Money; givenAway: Money
}>(`${BASE}/charges/${id}/adjust`, 'PATCH', body)

export interface DwellRow {
  bookingId: string
  reference: string
  customer: string | null
  container: string | null
  loadType: string | null
  storageStartDate: string | null
  daysOnSite: number
  freeAllowanceDays: number
  billableDays: number
  thresholdProximity: 'breached' | 'approaching' | 'clear'
  daysToThreshold: number
  accruedToDate: Money
  lastAccrualDate: string | null
}

export const getDwellMonitor = (dwellThresholdDays?: number) =>
  call<{ nextAccrualAt: string; dwellThresholdDays: number; rows: DwellRow[] }>(
    `${BASE}/charges/dwell${dwellThresholdDays ? `?dwellThresholdDays=${dwellThresholdDays}` : ''}`)

export const getDemurrageReview = () =>
  call<Array<{
    chargeLineId: string; bookingId: string; reference: string; customer: string | null
    notifyEmail: string | null; container: string | null; daysOnSite: number
    description: string; lineTotal: Money; accrualDate: string | null
    working: ChargeWorking | null; status: string
  }>>(`${BASE}/charges/demurrage-review`)

export interface CreditDecision {
  outcome: 'ok' | 'over_limit' | 'on_hold' | 'inactive'
  exposure: Money
  creditLimit: Money
  headroom: Money
  currency: string
  message?: string
  alternative?: 'prepaid_checkout' | 'override_request'
}

export const checkCredit = (accountId: string, amount: number) =>
  mutate<CreditDecision>(`${BASE}/charges/credit-check`, 'POST', { accountId, amount })

// ─────────────────────────────────────────────────────────────────────────────
// Invoices (B-01 … B-11)
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkbenchRow {
  bookingId: string
  reference: string
  bookingStatus: string
  completedAt: string | null
  slotDate: string | null
  accountId: string | null
  accountCode: string | null
  accountName: string
  invoiceCycle: string
  lineCount: number
  unbilledTotal: Money
  ageDays: number
  exceptions: string[]
}

export const getWorkbench = () =>
  call<{ rows: WorkbenchRow[]; totals: { bookings: number; value: Money } }>(
    `${BASE}/invoices/workbench`)

export interface PreflightCase {
  code: string
  severity: 'block' | 'acknowledge'
  label: string
  explanation: string
  bookingIds: string[]
  count: number
}

export const runPreflight = (scope: Record<string, unknown> = {}) =>
  mutate<{
    runId: string
    status: string
    canProceed: boolean
    cases: PreflightCase[]
    summary: {
      bookings: number; accounts: number; value: Money
      blockingCases: number; acknowledgeableCases: number
    }
  }>(`${BASE}/invoices/preflight`, 'POST', { scope })

export const executeBillingRun = (body: {
  runId: string; acknowledgedCases?: string[]; issue?: boolean
}) => mutate<{
  runId: string; status: string; created: number; failed: number
  outcomes: Array<{
    ok: boolean; accountName: string; invoiceNumber?: string
    invoiceId?: string; total?: Money; error?: string
  }>
}>(`${BASE}/invoices/run`, 'POST', body)

export interface InvoiceListRow {
  id: string
  invoiceNumber: string | null
  docType: string
  status: string
  accountId: string | null
  accountCode: string | null
  accountName: string | null
  issueDate: string | null
  dueDate: string | null
  daysOverdue: number
  total: Money
  amountPaid: Money
  balanceDue: Money
  deliveryState: string
  peppolState: string | null
  dunningStep: number
  dunningPaused: boolean
  openDisputes: number
}

export const getInvoices = (params: {
  status?: string; accountId?: string; from?: string; to?: string; search?: string; limit?: number
} = {}) => {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => [k, String(v)]))
  return call<InvoiceListRow[]>(`${BASE}/invoices${q.toString() ? `?${q}` : ''}`)
}

export interface InvoiceDetail {
  id: string
  invoiceNumber: string | null
  docType: string
  status: string
  documentTitle: string
  isTaxInvoice: boolean
  taxNote: string
  supplier: { name: string | null; abn: string | null; address: string | null }
  billTo: {
    accountId: string | null; accountCode: string | null; name: string | null
    abn: string | null; address: string | null; email: string | null
  }
  issueDate: string | null
  dueDate: string | null
  periodStart: string | null
  periodEnd: string | null
  paymentTerms: string | null
  remittanceRef: string | null
  payLinkToken: string | null
  paymentRails: {
    eft: {
      bankName: string | null; accountName: string | null; bsb: string | null
      accountNumber: string | null; reference: string | null
    } | null
    compay: { billerCode: string; reference: string | null } | null
    payLink: string | null
  }
  lines: Array<{
    id: string; lineNo: number; bookingReference: string | null; description: string
    unitOfMeasure: string; quantity: number; unitPrice: Money; lineSubtotal: Money
    discountAmount: Money; taxRate: number; taxAmount: Money; lineTotal: Money
    taxability: string; glAccountCode: string | null; working: ChargeWorking | null
  }>
  totals: {
    subtotal: Money; discountTotal: Money; taxTotal: Money; total: Money
    amountPaid: Money; amountCredited: Money; amountWrittenOff: Money; balanceDue: Money
  }
  delivery: {
    state: string; deliveredAt: string | null
    peppolState: string | null; peppolMessageId: string | null
  }
  dunning: {
    step: number; nextAt: string | null; paused: boolean; pauseReason: string | null
  }
  availableActions: string[]
  history: Array<{
    id: string; fromStatus: string | null; toStatus: string; eventKind: string
    detail: any; actor: string; at: string
  }>
  creditNotes: Array<{
    id: string; number: string | null; status: string; scope: string
    reasonCode: string; total: Money; issueDate: string | null
  }>
  payments: Array<{
    id: string; receiptNumber: string | null; method: string
    receivedDate: string | null; amount: Money
  }>
  disputes: Array<{
    id: string; status: string; reasonCode: string; reasonNote: string | null
    raisedBy: string | null; disputedAmount: Money | null; createdAt: string
  }>
}

export const getInvoice = (id: string) => call<InvoiceDetail>(`${BASE}/invoices/${id}`)

export const createInvoice = (body: {
  accountId: string; bookingIds: string[]; periodStart?: string; periodEnd?: string
  docType?: string; issue?: boolean
}) => mutate<{ id: string; invoiceNumber?: string; dueDate?: string }>(
  `${BASE}/invoices`, 'POST', body)

export const issueInvoice = (id: string) =>
  mutate<{ invoiceNumber: string; dueDate: string }>(`${BASE}/invoices/${id}/issue`, 'POST', {})

export const updateInvoice = (id: string, body: Record<string, unknown>) =>
  mutate<any>(`${BASE}/invoices/${id}`, 'PATCH', body)

export const createCreditNote = (invoiceId: string, body: {
  scope: 'full' | 'partial'; invoiceLineIds?: string[]; reasonCode: string
  reasonNote?: string; approvedBy?: string; issue?: boolean
}) => mutate<{
  id: string; creditNoteNumber: string | null; total: Money
  invoiceStatus: string; invoiceBalance: Money
}>(`${BASE}/invoices/${invoiceId}/credit-note`, 'POST', body)

export const setInvoiceDelivery = (id: string, body: {
  state: string; channel?: string; detail?: string
}) => mutate<{
  id: string; invoice_number: string; status: string
  delivery_state: string; exception: string | null
}>(`${BASE}/invoices/${id}/deliver`, 'POST', body)

export const raiseDispute = (invoiceId: string, body: {
  reasonCode: string; reasonNote?: string; invoiceLineIds?: string[]; disputedAmount?: number
}) => mutate<{
  id: string; invoiceStatus: string; dunningPaused: boolean; confirmation: string
}>(`${BASE}/invoices/${invoiceId}/dispute`, 'POST', body)

export const writeOffInvoice = (invoiceId: string, body: {
  amount?: number; reasonCode: string; reasonNote?: string; approvedBy?: string
}) => mutate<{
  id: string; amount: Money; invoiceStatus: string; ledgerNote: string
}>(`${BASE}/invoices/${invoiceId}/write-off`, 'POST', body)

// ─────────────────────────────────────────────────────────────────────────────
// Accounts (A-01 … A-11)
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountRow {
  id: string
  accountCode: string
  legalName: string
  tradingName: string | null
  abn: string | null
  billingEmail: string | null
  status: string
  paymentTerms: string
  paymentTermsDays: number
  invoiceCycle: string
  creditLimit: Money
  exposure: Money
  headroom: Money
  pctOfLimit: number | null
  exposureBand: 'no_limit' | 'at_limit' | 'near_limit' | 'within_limit'
  creditHold: boolean
  creditHoldReason: string | null
  openInvoices: number
  overdueInvoices: number
  earliestDueDate: string | null
  avgDaysToPay: number | null
  rateCardId: string | null
  rateCardName: string | null
  tariffBasis: string
}

export const getAccounts = (params: {
  status?: string; search?: string; onHold?: boolean
} = {}) => {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => [k, String(v)]))
  return call<{ paymentTerms: string[]; accounts: AccountRow[] }>(
    `${BASE}/accounts${q.toString() ? `?${q}` : ''}`)
}

export const getAccount = (id: string) => call<any>(`${BASE}/accounts/${id}`)

export const createAccount = (body: Record<string, unknown>) =>
  mutate<any>(`${BASE}/accounts`, 'POST', body)

export const updateAccount = (id: string, body: Record<string, unknown>) =>
  mutate<any>(`${BASE}/accounts/${id}`, 'PATCH', body)

export const setCreditHold = (id: string, hold: boolean, reason?: string) =>
  mutate<{ account: any; note: string }>(
    `${BASE}/accounts/${id}/hold`, 'POST', { hold, reason })

export const requestCreditOverride = (id: string, body: {
  requestedAmount: number; reason: string; expiresAt?: string
}) => mutate<any>(`${BASE}/accounts/${id}/override`, 'POST', body)

export const getCreditOverrides = () =>
  call<Array<{
    id: string; accountId: string; accountCode: string; accountName: string
    requestedAmount: Money; currentLimit: Money; exposureAtRequest: Money
    reason: string; status: string; requestedBy: string | null
    decidedBy: string | null; decidedAt: string | null; expiresAt: string | null; createdAt: string
  }>>(`${BASE}/accounts/overrides`)

export const decideCreditOverride = (id: string, decision: 'approved' | 'declined', expiresAt?: string) =>
  mutate<any>(`${BASE}/accounts/overrides/${id}`, 'PATCH', { decision, expiresAt })

export interface AgedRow {
  accountId: string
  accountCode: string
  accountName: string
  totalDue: Money
  buckets: {
    current: Money; days1To30: Money; days31To60: Money; days61To90: Money; days90Plus: Money
  }
}

export const getAgedReceivables = () =>
  call<{
    rows: AgedRow[]
    totals: {
      totalDue: Money; current: Money; days1To30: Money
      days31To60: Money; days61To90: Money; days90Plus: Money
    }
    reconciliation: {
      buckets: Money; invoiceRegister: Money; variance: Money; agrees: boolean
    }
  }>(`${BASE}/accounts/aged`)

export interface CollectionRow {
  invoiceId: string
  invoiceNumber: string | null
  accountId: string
  accountCode: string
  accountName: string
  billingEmail: string | null
  dueDate: string | null
  daysOverdue: number
  total: Money
  balanceDue: Money
  status: string
  dunningStep: number
  nextActionAt: string | null
  nextStepSubject: string | null
  paused: boolean
  pauseReason: string | null
  promiseToPayDate: string | null
  creditHold: boolean
}

export const getCollections = () => call<CollectionRow[]>(`${BASE}/accounts/collections`)

export const addCollectionNote = (invoiceId: string, body: {
  promiseToPayDate?: string; detail?: string; escalate?: boolean
}) => mutate<any>(`${BASE}/accounts/collections/${invoiceId}/note`, 'POST', body)

export interface DisputeRow {
  id: string
  invoiceId: string
  invoiceNumber: string | null
  invoiceStatus: string
  accountCode: string | null
  accountName: string | null
  status: string
  reasonCode: string
  reasonNote: string | null
  disputedAmount: Money | null
  invoiceTotal: Money
  balanceDue: Money
  raisedBy: string | null
  lines: Array<{ id: string; lineNo: number; description: string; lineTotal: string; working: ChargeWorking | null }>
  resolution: string | null
  resolutionNote: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
  dunningResumesOnResolve: boolean
  availableResolutions: string[]
}

export const getDisputes = (status?: string) =>
  call<DisputeRow[]>(`${BASE}/accounts/disputes${status ? `?status=${status}` : ''}`)

export const resolveDispute = (id: string, body: {
  resolution?: 'uphold' | 'credit' | 'adjust'; resolutionNote?: string; status?: string
}) => mutate<any>(`${BASE}/accounts/disputes/${id}`, 'PATCH', body)

export const runStatements = (body: {
  accountIds?: string[]; periodStart: string; periodEnd: string
}) => mutate<any>(`${BASE}/accounts/statements`, 'POST', body)

// ─────────────────────────────────────────────────────────────────────────────
// Payments (P-01 … P-08)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReceiptRow {
  id: string
  receiptNumber: string | null
  accountId: string | null
  accountCode: string | null
  accountName: string | null
  method: string
  source: string
  receivedDate: string
  amount: Money
  surchargeAmount: Money
  allocatedAmount: Money
  unallocatedAmount: Money
  status: string
  payerReference: string | null
  bankReference: string | null
  providerRef: string | null
  allocationCount: number
  reversalOfId: string | null
  reversalReason: string | null
  recordedBy: string | null
  createdAt: string
}

export const getReceipts = (params: {
  method?: string; allocation?: string; from?: string; to?: string; limit?: number
} = {}) => {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => [k, String(v)]))
  return call<{
    methods: string[]
    receipts: ReceiptRow[]
    totals: { received: Money; allocated: Money; unallocated: Money }
  }>(`${BASE}/payments/receipts${q.toString() ? `?${q}` : ''}`)
}

export const createReceipt = (body: {
  accountId?: string; amount: string; method?: string; receivedDate?: string
  currency?: string; surchargeAmount?: string; payerReference?: string
  bankReference?: string; narrative?: string
  allocations?: Array<{ invoiceId: string; amount: number }>
}) => mutate<{
  id: string; receiptNumber: string; amount: Money; unallocated: Money; allocation: any
}>(`${BASE}/payments/receipts`, 'POST', body)

export const allocateReceipt = (receiptId: string, allocations: Array<{
  invoiceId: string; amount: number; invoiceLineId?: string
}>) => mutate<{
  receiptStatus: string
  allocatedTotal: Money
  unallocatedBalance: Money
  invoices: Array<{
    invoiceId: string; invoiceNumber: string | null; allocated: Money
    invoiceStatus: string; balanceDue: Money; dunningStopped: boolean
  }>
}>(`${BASE}/payments/allocate`, 'POST', { receiptId, allocations })

export const suggestAllocation = (receiptId: string) =>
  call<{
    receipt: { id: string; receiptNumber: string | null; amount: Money; unallocated: Money }
    suggestion: Array<{
      invoiceId: string; invoiceNumber: string | null; dueDate: string | null
      status: string; balanceDue: Money; suggestedAmount: Money; excludeReason: string | null
    }>
    residual: Money
    residualNote: string | null
  }>(`${BASE}/payments/allocate/suggest?receiptId=${receiptId}`)

export const importBankStatement = (body: {
  filename?: string; format?: string
  lines: Array<{ valueDate: string; amount: number; narrative?: string; reference?: string }>
}) => mutate<{
  importId: string; inserted: number; duplicates: number
  autoSuggested: number; note: string | null
}>(`${BASE}/payments/import`, 'POST', body)

export const getMatchQueue = (state?: string) =>
  call<{
    lines: Array<{
      id: string; valueDate: string; amount: Money; narrative: string | null
      reference: string | null; matchState: string; matchConfidence: number | null
      matchBasis: string | null; suggestion: any; receiptId: string | null
    }>
    metrics: {
      totalLines: number; matched: number; matchRatePct: number | null
      autoByReference: number; target: number
    }
  }>(`${BASE}/payments/match-queue${state ? `?state=${state}` : ''}`)

export const resolveMatch = (lineId: string, body: {
  accept: boolean; invoiceId?: string; accountId?: string
}) => mutate<any>(`${BASE}/payments/match/${lineId}`, 'POST', body)

export const reverseReceipt = (id: string, body: {
  reason: string; amount?: number; approvedBy?: string
}) => mutate<{
  reversalReceiptId: string; reversalReceiptNumber: string
  originalReceiptNumber: string; amount: Money
  affectedInvoices: Array<{ invoiceId: string; status: string; balanceDue: Money }>
  note: string
}>(`${BASE}/payments/${id}/reverse`, 'POST', body)

export const getPaymentAudit = (id: string) => call<any>(`${BASE}/payments/${id}/audit`)

export const getPaymentFailures = () => call<any[]>(`${BASE}/payments/failures`)

// ─────────────────────────────────────────────────────────────────────────────
// Reports (R-01 … R-13, N-01 … N-03)
// ─────────────────────────────────────────────────────────────────────────────

export const getReportLibrary = () =>
  call<{
    canExport: boolean
    reports: Array<{ id: string; name: string; traces: string; group: string; path?: string }>
  }>(`${BASE}/reports`)

const reportQuery = (params: { from?: string; to?: string } = {}) => {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][])
  return q.toString() ? `?${q}` : ''
}

export const getRevenueByService = (p?: { from?: string; to?: string }) =>
  call<any>(`${BASE}/reports/revenue-by-service${reportQuery(p)}`)

export const getRevenueByCustomer = (p?: { from?: string; to?: string }) =>
  call<any>(`${BASE}/reports/revenue-by-customer${reportQuery(p)}`)

export const getGstSummary = (p?: { from?: string; to?: string }) =>
  call<any>(`${BASE}/reports/gst-summary${reportQuery(p)}`)

export const getStorageDwellReport = (p?: { from?: string; to?: string }) =>
  call<any>(`${BASE}/reports/storage-dwell${reportQuery(p)}`)

export const getConcessionsReport = (p?: { from?: string; to?: string }) =>
  call<any>(`${BASE}/reports/concessions${reportQuery(p)}`)

export const getExceptionsReport = () => call<{ exceptions: any[] }>(`${BASE}/reports/exceptions`)

export const getPaymentMixReport = (p?: { from?: string; to?: string }) =>
  call<any>(`${BASE}/reports/payment-mix${reportQuery(p)}`)

export interface RevenueDashboard {
  asOf: string
  periods: Record<'mtd' | 'qtd' | 'ytd', {
    from: string; to: string; netRevenue: Money; grossRevenue: Money
    invoices: number; priorYear: Money; changePct: number | null
  }>
  receivables: {
    outstanding: Money; overdue: Money; openInvoices: number; overduePct: number
  }
  unbilled: { value: Money; bookings: number }
  byCategory: Array<{ category: string; netRevenue: Money }>
}

export const getRevenueDashboard = () => call<RevenueDashboard>(`${BASE}/reports/dashboard`)

export interface LeakageCategory {
  code: string
  label: string
  explanation: string
  remedy: string
  remedyScreen: string
  estimatedValue: Money | null
  count: number
  rows: any[]
}

export const getLeakage = () =>
  call<{
    categories: LeakageCategory[]
    totalEstimatedLeakage: Money
    provenanceNote: string
  }>(`${BASE}/reports/leakage`)

export const getAuditLog = (params: {
  entityType?: string; action?: string; entityId?: string
  actorId?: string; from?: string; to?: string; limit?: number
} = {}) => {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => [k, String(v)]))
  return call<{
    canExport: boolean
    appendOnly: boolean
    retentionYears: number
    entries: Array<{
      id: string; entityType: string; entityId: string | null; action: string
      before: any; after: any; amountDelta: Money | null
      reasonCode: string | null; reasonNote: string | null
      actor: string; actorEmail: string | null; actorIp: string | null; at: string
    }>
  }>(`${BASE}/reports/audit-log${q.toString() ? `?${q}` : ''}`)
}

export const getIntegrityChecks = () =>
  call<{
    checkedAt: string
    allPassed: boolean
    checks: Array<{ name: string; label: string; passed: boolean; failures: number; rows: any[] }>
  }>(`${BASE}/reports/integrity`)

// ─────────────────────────────────────────────────────────────────────────────
// Settings (S-01 … S-11, Y-01)
// ─────────────────────────────────────────────────────────────────────────────

export const getBillingSettings = () => call<any>(`${BASE}/settings`)

export const updateTaxSettings = (body: Record<string, unknown>) =>
  mutate<{ effectiveFrom: string; documentEffect: string; note: string }>(
    `${BASE}/settings/tax`, 'PUT', body)

export const updateNumbering = (sequences: Array<Record<string, unknown>>) =>
  mutate<{ sequences: Array<{ docKind: string; preview: string }> }>(
    `${BASE}/settings/invoice`, 'PUT', { sequences })

export const updateDunning = (steps: Array<Record<string, unknown>>) =>
  mutate<{ steps: number }>(`${BASE}/settings/dunning`, 'PUT', { steps })

export const updateThresholds = (thresholds: Array<Record<string, unknown>>) =>
  mutate<{ thresholds: any[]; note: string }>(`${BASE}/settings/thresholds`, 'PUT', { thresholds })

export const grantCapabilities = (userId: string, capabilities: Partial<BillingCapabilities>) =>
  mutate<{ userId: string; name: string; capabilities: BillingCapabilities }>(
    `${BASE}/settings/capabilities/${userId}`, 'PUT', { capabilities })

export const getJobMonitor = () =>
  call<{
    runs: Array<{
      id: string; jobName: string; businessDate: string; status: string
      recordsProcessed: number; recordsCreated: number; recordsSkipped: number
      amountAccrued: Money; errorMessage: string | null
      startedAt: string; finishedAt: string | null; durationMs: number | null
      idempotencyKey: string
    }>
    accrualHealth: {
      lastRunDate: string | null; lastRunStatus: string | null
      ranYesterday: boolean; ranToday: boolean; warning: string | null
    }
    integrityChecks: Array<{ name: string; passed: boolean; failures: number | null; checkedAt: string }>
    retention: { years: number; purgeAllowedBefore: string; note: string }
  }>(`${BASE}/settings/jobs`)

export const runAccrual = (businessDate?: string) =>
  mutate<{
    status: string; processed: number; created: number; skipped: number
    amountAccrued: string; currency: string; demurrageLines: number
    thresholdCrossings: any[]; errors: any[]; note?: string
  }>(`${BASE}/settings/jobs/accrual`, 'POST', { businessDate })
