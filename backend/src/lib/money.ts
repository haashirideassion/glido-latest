/**
 * Money — exact decimal arithmetic for the Billing module.
 *
 * The FRS makes three claims about money that ordinary JS floats cannot honour:
 *
 *   NFR-B-01 / RT-10  the sum of rounded lines equals the displayed subtotal,
 *                     with no residual cent
 *   NFR-B-03          no bare numeric ever represents money — a currency
 *                     travels with every amount
 *   SC-05             the total shown before payment equals the total invoiced
 *                     to the cent
 *
 * So every amount here is held as an integer count of 1/10000 of a currency unit
 * ("pips" — four decimal places, which is what rate tables need) and only
 * converted to a 2dp display value at a deliberate rounding step. Nothing in the
 * rating path does `0.1 + 0.2`.
 */

export type RoundingMode = 'half_up' | 'half_even' | 'up' | 'down'

/** Internal scale: 4 decimal places. Rate tables need 4; documents need 2. */
const SCALE = 10_000

export interface Money {
  /** Integer count of 1/10000 currency units. */
  readonly pips: number
  readonly currency: string
}

export function money(amount: number | string, currency: string): Money {
  return { pips: toPips(amount), currency }
}

export function zero(currency: string): Money {
  return { pips: 0, currency }
}

/**
 * Parse a decimal to pips without going through float multiplication.
 * `2.675 * 10000` is 26749.999… in IEEE-754; string-shifting the decimal point
 * is not.
 */
export function toPips(amount: number | string): number {
  const s = typeof amount === 'number' ? formatFixed(amount, 6) : String(amount).trim()
  if (!s || s === '-' || !/^-?\d*(\.\d*)?$/.test(s)) {
    throw new TypeError(`Not a decimal amount: ${JSON.stringify(amount)}`)
  }
  const neg = s.startsWith('-')
  const [intPart = '0', fracPart = ''] = (neg ? s.slice(1) : s).split('.')
  const frac4 = fracPart.padEnd(5, '0').slice(0, 5)  // one extra digit for rounding
  const base = BigInt(intPart || '0') * BigInt(SCALE) + BigInt(frac4.slice(0, 4) || '0')
  const carry = Number(frac4[4] ?? '0') >= 5 ? 1n : 0n
  const total = base + carry
  return Number(neg ? -total : total)
}

/** Decimal string for a pip count, at `dp` places, truncated — display uses round2. */
function formatFixed(n: number, dp: number): string {
  if (!Number.isFinite(n)) throw new TypeError(`Not a finite amount: ${n}`)
  return n.toFixed(dp)
}

function sameCurrency(a: Money, b: Money): string {
  if (a.currency !== b.currency) {
    // Mixing currencies silently is how a billing system loses money quietly.
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`)
  }
  return a.currency
}

export function add(a: Money, b: Money): Money {
  return { pips: a.pips + b.pips, currency: sameCurrency(a, b) }
}

export function subtract(a: Money, b: Money): Money {
  return { pips: a.pips - b.pips, currency: sameCurrency(a, b) }
}

export function sum(items: Money[], currency: string): Money {
  let pips = 0
  for (const m of items) {
    if (m.currency !== currency) throw new Error(`Currency mismatch: ${m.currency} vs ${currency}`)
    pips += m.pips
  }
  return { pips, currency }
}

export function negate(a: Money): Money {
  return { pips: -a.pips, currency: a.currency }
}

/** Multiply money by a dimensionless quantity, keeping full pip precision. */
export function multiply(a: Money, factor: number): Money {
  return { pips: Math.round(a.pips * factor), currency: a.currency }
}

/** rate (per unit, 4dp) × quantity → money. */
export function rateTimesQty(unitRate: number | string, quantity: number, currency: string): Money {
  return { pips: Math.round(toPips(unitRate) * quantity), currency }
}

/** Percentage of an amount. `percent` is a human percent: 10 means 10%. */
export function percentOf(a: Money, percent: number | string): Money {
  return { pips: Math.round((a.pips * toPips(percent)) / (100 * SCALE)), currency: a.currency }
}

export function compare(a: Money, b: Money): number {
  sameCurrency(a, b)
  return a.pips === b.pips ? 0 : a.pips < b.pips ? -1 : 1
}

export const isZero    = (a: Money) => a.pips === 0
export const isNegative = (a: Money) => a.pips < 0
export const maxMoney  = (a: Money, b: Money) => (compare(a, b) >= 0 ? a : b)
export const minMoney  = (a: Money, b: Money) => (compare(a, b) <= 0 ? a : b)

/**
 * Round to a document precision. This is the *only* place a cent is created or
 * destroyed, which is what makes the RT-10 invariant testable.
 */
export function round(a: Money, dp = 2, mode: RoundingMode = 'half_up'): Money {
  const step = SCALE / 10 ** dp                  // pips per output unit
  if (step <= 1) return a
  const q = a.pips / step
  let rounded: number
  switch (mode) {
    case 'up':        rounded = Math.ceil(q); break
    case 'down':      rounded = Math.trunc(q); break
    case 'half_even': rounded = halfEven(q); break
    case 'half_up':
    default:
      // "Half away from zero" — a credit of -0.005 rounds to -0.01, matching the
      // debit it reverses, so a full credit note always nets an invoice to zero.
      rounded = a.pips < 0 ? -Math.round(-q) : Math.round(q)
  }
  return { pips: rounded * step, currency: a.currency }
}

function halfEven(q: number): number {
  const floor = Math.floor(q)
  const diff = q - floor
  if (diff > 0.5) return floor + 1
  if (diff < 0.5) return floor
  return floor % 2 === 0 ? floor : floor + 1
}

/** Number of currency units, as a JS number. Use only at the persistence edge. */
export function toNumber(a: Money, dp = 2): number {
  return Number(toDecimalString(a, dp))
}

/** Exact decimal string — what goes into a NUMERIC column. */
export function toDecimalString(a: Money, dp = 2): string {
  const neg = a.pips < 0
  const abs = Math.abs(a.pips)
  const whole = Math.trunc(abs / SCALE)
  const frac = String(abs % SCALE).padStart(4, '0').slice(0, Math.max(0, dp))
  const body = dp > 0 ? `${whole}.${frac.padEnd(dp, '0')}` : String(whole)
  return neg && abs !== 0 ? `-${body}` : body
}

export function fromDb(value: unknown, currency: string): Money {
  if (value === null || value === undefined || value === '') return zero(currency)
  return money(String(value), currency)
}

/**
 * Distribute a total across weights so the parts sum back to the total exactly.
 * Used when a bundle price has to be itemised (SC-06) and when a receipt is
 * split across invoice lines (P-05) — the largest-remainder method, so the
 * residual cent lands on the largest part rather than vanishing.
 */
export function allocate(total: Money, weights: number[]): Money[] {
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  if (totalWeight === 0) return weights.map(() => zero(total.currency))

  const raw = weights.map(w => (total.pips * w) / totalWeight)
  const floors = raw.map(r => Math.trunc(r))
  let residual = total.pips - floors.reduce((s, f) => s + f, 0)

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.trunc(r) }))
    .sort((a, b) => b.frac - a.frac)

  const out = floors.slice()
  const step = residual >= 0 ? 1 : -1
  for (let k = 0; residual !== 0; k++) {
    out[order[k % order.length].i] += step
    residual -= step
  }
  return out.map(pips => ({ pips, currency: total.currency }))
}

/**
 * Format for display. Always carries the currency — there is no code path that
 * renders a bare number (NFR-B-03).
 */
export function formatMoney(a: Money, locale = 'en-AU'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: a.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(a, 2))
}
