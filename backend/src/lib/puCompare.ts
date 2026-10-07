/**
 * Packing & Unpacking — manifest vs ICS comparison.
 *
 * Pure functions only (no DB, no network) so the matching rules can be unit-tested and
 * changed in one place. Used by the import ("Unpacking") flow, where each shipment (house
 * bill) arrives twice — once from the manifest and once from ICS — and staff must reconcile
 * the two before the job can be planned.
 */

export type FieldType = 'text' | 'number'

export interface CompareField {
  key: ShipmentFieldKey
  label: string
  type: FieldType
}

export const SHIPMENT_FIELDS = [
  'job_reference',
  'weight_kg',
  'volume_cbm',
  'package_count',
  'consignee',
  'consignor',
  'goods_description',
  'marks_numbers',
  'handling_instructions',
] as const

export type ShipmentFieldKey = typeof SHIPMENT_FIELDS[number]

export const COMPARE_FIELDS: CompareField[] = [
  { key: 'job_reference',         label: 'Job reference no.',    type: 'text'   },
  { key: 'weight_kg',             label: 'Weight (kg)',          type: 'number' },
  { key: 'volume_cbm',            label: 'Volume (cbm)',         type: 'number' },
  { key: 'package_count',         label: 'Package count',        type: 'number' },
  { key: 'consignee',             label: 'Consignee',            type: 'text'   },
  { key: 'consignor',             label: 'Consignor',            type: 'text'   },
  { key: 'goods_description',     label: 'Goods description',    type: 'text'   },
  { key: 'marks_numbers',         label: 'Marks & numbers',      type: 'text'   },
  { key: 'handling_instructions', label: 'Handling instructions', type: 'text'  },
]

export type ShipmentData = Partial<Record<ShipmentFieldKey, string | number | null>> & {
  house_bill_number: string
}

export type FieldStatus = 'match' | 'near' | 'mismatch' | 'missing'

export interface FieldComparison {
  key: ShipmentFieldKey
  label: string
  type: FieldType
  manifest: string | number | null
  ics: string | number | null
  status: FieldStatus
  /** 0..1 similarity used for the % match */
  score: number
  /** needs a human decision before Confirm Manifest */
  needsResolution: boolean
  /** 'manifest' | 'ics' once the user has picked a source */
  chosen: 'manifest' | 'ics' | null
}

export type PairState = 'paired' | 'manifest_only' | 'ics_only'

export interface ShipmentComparison {
  pairState: PairState
  fields: FieldComparison[]
  matchPct: number
  /** unpaired shipments need an include/exclude decision */
  needsInclusionDecision: boolean
  inclusion: 'include' | 'exclude' | null
  unresolvedCount: number
  resolved: boolean
}

export const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

export function normaliseBill(v: string | null | undefined): string {
  return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function normaliseText(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 0..1 similarity of two strings (1 = identical) based on Levenshtein distance. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = a[i - 1] === b[j - 1] ? last : Math.min(last, prev[j], prev[j - 1]) + 1
      last = tmp
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length)
}

export function compareField(
  type: FieldType,
  manifest: unknown,
  ics: unknown,
  tolerancePct: number,
): { status: FieldStatus; score: number } {
  const mEmpty = isEmpty(manifest)
  const iEmpty = isEmpty(ics)
  if (mEmpty && iEmpty) return { status: 'match', score: 1 }
  if (mEmpty || iEmpty) return { status: 'missing', score: 0 }

  if (type === 'number') {
    const a = Number(manifest)
    const b = Number(ics)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { status: 'mismatch', score: 0 }
    if (a === b) return { status: 'match', score: 1 }
    const denom = Math.max(Math.abs(a), Math.abs(b))
    const rel = denom === 0 ? 0 : Math.abs(a - b) / denom
    const score = Math.max(0, 1 - rel)
    return { status: rel * 100 <= tolerancePct ? 'near' : 'mismatch', score }
  }

  const a = normaliseText(manifest)
  const b = normaliseText(ics)
  if (a === b) return { status: 'match', score: 1 }
  return { status: 'mismatch', score: similarity(a, b) }
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Compare one shipment's manifest row against its ICS row.
 * `fieldSources` holds the user's choices: { weight_kg: 'ics', … , _include: 'include' }.
 */
export function compareShipment(
  manifest: ShipmentData | null,
  ics: ShipmentData | null,
  fieldSources: Record<string, string> | null | undefined,
  tolerancePct: number,
): ShipmentComparison {
  const sources = fieldSources ?? {}
  const pairState: PairState = manifest && ics ? 'paired' : manifest ? 'manifest_only' : 'ics_only'

  const fields: FieldComparison[] = COMPARE_FIELDS.map(f => {
    const m = manifest ? (manifest[f.key] ?? null) : null
    const i = ics ? (ics[f.key] ?? null) : null
    const { status, score } = pairState === 'paired'
      ? compareField(f.type, m, i, tolerancePct)
      : { status: 'missing' as FieldStatus, score: 0 }
    const pick = sources[f.key]
    const chosen = pick === 'manifest' || pick === 'ics' ? pick : null
    // For an unpaired shipment the single present side is the only possible value, so
    // individual fields don't need resolving — the include/exclude decision covers them.
    const needsResolution = pairState === 'paired' && (status === 'mismatch' || status === 'missing')
    return { key: f.key, label: f.label, type: f.type, manifest: m, ics: i, status, score, needsResolution, chosen }
  })

  const needsInclusionDecision = pairState !== 'paired'
  const inclusion = sources._include === 'include' || sources._include === 'exclude' ? sources._include : null

  const unresolvedFields = fields.filter(f => f.needsResolution && !f.chosen).length
  const unresolvedCount = unresolvedFields + (needsInclusionDecision && !inclusion ? 1 : 0)
  const matchPct = pairState === 'paired'
    ? round1((fields.reduce((s, f) => s + f.score, 0) / fields.length) * 100)
    : 0

  return {
    pairState, fields, matchPct, needsInclusionDecision, inclusion,
    unresolvedCount, resolved: unresolvedCount === 0,
  }
}

/** The value a shipment field should take given the chosen source (defaults to manifest). */
export function resolvedFieldValue(
  manifest: ShipmentData | null,
  ics: ShipmentData | null,
  key: ShipmentFieldKey,
  fieldSources: Record<string, string> | null | undefined,
): string | number | null {
  const pick = fieldSources?.[key]
  const m = manifest ? (manifest[key] ?? null) : null
  const i = ics ? (ics[key] ?? null) : null
  if (pick === 'ics') return i
  if (pick === 'manifest') return m
  // No explicit pick: manifest wins, but never discard a value the other side has.
  return !isEmpty(m) ? m : i
}

export function overallMatchPct(shipments: ShipmentComparison[]): number | null {
  if (shipments.length === 0) return null
  return round1(shipments.reduce((s, c) => s + c.matchPct, 0) / shipments.length)
}
