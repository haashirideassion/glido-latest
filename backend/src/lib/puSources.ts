/**
 * Packing & Unpacking — external data adapters.
 *
 *  • fetchManifestAndIcs()  (import / Unpacking)  — returns the manifest rows and the ICS rows
 *    for a container so the two can be compared.
 *  • pushToIcs()            (export / Packing)    — sends CFS-keyed data out to ICS and other
 *    portals (PRA, pre-receival notice lodgement).
 *
 * NEITHER IS WIRED TO A REAL FEED YET. The manifest feed isn't available in Glido today and
 * the outbound ICS payload depends on the export field list still to be confirmed. Until
 * then:
 *   – the manifest side is a deterministic SAMPLE generator (same container number → same
 *     sample data every time, with a few deliberate manifest/ICS differences so the
 *     reconciliation screen is exercisable);
 *   – the ICS side uses real rows from the existing `cfs_shipments` ICS cache when there are
 *     any for the container, otherwise the sample;
 *   – pushToIcs() is a stub that reports `stubbed`.
 * Replace the bodies of these two functions with the real integrations; every caller goes
 * through them, so nothing else needs to change.
 */

import type { Pool } from 'pg'
import type { ShipmentData } from './puCompare'

export interface ContainerFields {
  seal_number?: string | null
  container_type?: string | null
  net_weight_kg?: number | null
  volume_cbm?: number | null
  package_count?: number | null
  vessel?: string | null
  voyage?: string | null
  lloyds_number?: string | null
  load_port?: string | null
  discharge_port?: string | null
  eta?: string | null
}

export interface ManifestBundle {
  provider: 'sample' | 'ics-cache+sample'
  container: ContainerFields
  manifest: ShipmentData[]
  ics: ShipmentData[]
}

// ── Deterministic pseudo-random helpers ──────────────────────────────────────

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: number) {
  let s = seed || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const pick = <T,>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length)]

const VESSELS  = ['MSC AURORA', 'MAERSK SENTOSA', 'ONE HARMONY', 'CMA CGM TITAN', 'EVER GLOBE', 'COSCO PACIFIC']
const PORTS_LOAD = ['SINGAPORE', 'SHANGHAI', 'NINGBO', 'BUSAN', 'HO CHI MINH', 'LOS ANGELES']
const PORT_DISCHARGE = ['SYDNEY', 'MELBOURNE', 'BRISBANE']
const TYPES    = ['20GP', '40GP', '40HC']
const CONSIGNEES = ['Harbourline Imports Pty Ltd', 'Southern Cross Trading', 'Pacific Home Supplies', 'Atlas Retail Group', 'BlueGum Distributors']
const CONSIGNORS = ['Shenzhen Brightway Co Ltd', 'Ningbo Allied Exports', 'Hanoi Garment JSC', 'Tokyo Precision KK', 'Guangzhou Sunrise Mfg']
const GOODS = ['Cartons of assorted homewares', 'Palletised kitchen appliances', 'Garment cartons on hangers', 'Packaged furniture parts', 'Electrical components in cartons', 'Plastic storage containers']
const HANDLING = ['', '', 'Fragile - handle with care', 'Keep dry', 'Do not stack', 'Forklift only']

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function round(n: number, dp: number): number {
  const f = Math.pow(10, dp)
  return Math.round(n * f) / f
}

function sampleBundle(containerNumber: string, today: string): ManifestBundle {
  const seed = hash(containerNumber.toUpperCase())
  const r = rng(seed)
  const shipmentCount = 2 + Math.floor(r() * 3) // 2–4 house bills
  const manifest: ShipmentData[] = []
  const ics: ShipmentData[] = []
  let totalW = 0, totalV = 0, totalP = 0

  for (let i = 0; i < shipmentCount; i++) {
    const hbl = `HBL${String(seed % 100000).padStart(5, '0')}${String.fromCharCode(65 + i)}`
    const weight = round(800 + r() * 4200, 1)
    const volume = round(3 + r() * 14, 2)
    const pkgs = 20 + Math.floor(r() * 180)
    const base: ShipmentData = {
      house_bill_number: hbl,
      job_reference: `JOB-${String(seed % 90000 + 10000)}-${i + 1}`,
      weight_kg: weight,
      volume_cbm: volume,
      package_count: pkgs,
      consignee: pick(r, CONSIGNEES),
      consignor: pick(r, CONSIGNORS),
      goods_description: pick(r, GOODS),
      marks_numbers: `${hbl.slice(-4)} / 1-${pkgs}`,
      handling_instructions: pick(r, HANDLING),
    }
    manifest.push({ ...base })
    ics.push({ ...base })
    totalW += weight; totalV += volume; totalP += pkgs
  }

  // Deliberate differences between manifest and ICS, driven by the container number so the
  // same container always shows the same picture. Roughly: 1 in 4 containers is a perfect
  // match; the rest have a near-match volume and/or a genuine mismatch.
  const scenario = seed % 4
  if (scenario !== 0 && ics[0]) {
    // near match: 8.9 vs 8.88 style rounding difference
    ics[0].volume_cbm = round(Number(ics[0].volume_cbm) * 0.998, 2)
  }
  if ((scenario === 2 || scenario === 3) && ics[1]) {
    ics[1].package_count = Number(ics[1].package_count) + 2 + (seed % 5)   // genuine mismatch
  }
  if (scenario === 3 && ics[0]) {
    ics[0].consignee = String(ics[0].consignee).replace(' Pty Ltd', ' Pty. Ltd.')   // cosmetic text difference
    ics[0].weight_kg = round(Number(ics[0].weight_kg) + 120.5, 1)                  // genuine mismatch
  }
  if (scenario === 3 && ics.length > 2) {
    ics.pop()   // a shipment on the manifest that ICS doesn't have → manifest_only
  }

  const container: ContainerFields = {
    seal_number: `SL${String(seed % 1000000).padStart(6, '0')}`,
    container_type: pick(r, TYPES),
    net_weight_kg: round(totalW, 1),
    volume_cbm: round(totalV, 2),
    package_count: totalP,
    vessel: pick(r, VESSELS),
    voyage: `${String(10 + (seed % 80))}${pick(r, ['E', 'W', 'N', 'S'])}`,
    lloyds_number: `97${String(seed % 100000).padStart(5, '0')}`,
    load_port: pick(r, PORTS_LOAD),
    discharge_port: pick(r, PORT_DISCHARGE),
    eta: addDays(today, 2 + (seed % 9)),
  }

  return { provider: 'sample', container, manifest, ics }
}

/**
 * Fetch manifest + ICS data for one container.
 * Uses real rows from the ICS shipment cache (`cfs_shipments`) when it has any for this
 * container, overlaying them on the sample so the comparison screen reflects real ICS values.
 */
export async function fetchManifestAndIcs(
  db: Pick<Pool, 'query'>,
  tenantId: string,
  containerNumber: string,
  today: string,
): Promise<ManifestBundle> {
  const bundle = sampleBundle(containerNumber, today)

  try {
    const { rows } = await db.query(
      `SELECT house_bill_number, weight_kg, volume_cbm, package_count, description
         FROM cfs_shipments
        WHERE tenant_id = $1 AND LOWER(container_number) = LOWER($2)
        ORDER BY created_at ASC`,
      [tenantId, containerNumber],
    )
    if (rows.length > 0) {
      const toNum = (v: unknown) => (v === null || v === undefined ? null : Number(v))
      const icsRows: ShipmentData[] = rows.map((row: any, i: number) => {
        const sample = bundle.ics[i] ?? bundle.ics[0]
        return {
          ...sample,
          house_bill_number: row.house_bill_number,
          weight_kg: toNum(row.weight_kg) ?? sample?.weight_kg ?? null,
          volume_cbm: toNum(row.volume_cbm) ?? sample?.volume_cbm ?? null,
          package_count: toNum(row.package_count) ?? sample?.package_count ?? null,
          goods_description: row.description ?? sample?.goods_description ?? null,
        }
      })
      // The manifest mirrors the same house bills (with the sample's slight differences) so
      // the two sides pair up by house bill number.
      const manifestRows: ShipmentData[] = icsRows.map((ic, i) => {
        const sample = bundle.manifest[i] ?? bundle.manifest[0]
        return {
          ...sample,
          house_bill_number: ic.house_bill_number,
          weight_kg: ic.weight_kg,
          volume_cbm: ic.volume_cbm,
          package_count: ic.package_count,
          goods_description: ic.goods_description,
        }
      })
      return { ...bundle, provider: 'ics-cache+sample', manifest: manifestRows, ics: icsRows }
    }
  } catch (err) {
    // The ICS cache is a nice-to-have; never let it break intake.
    console.error('[puSources] ICS cache lookup failed, using sample data:', (err as Error).message)
  }
  return bundle
}

export interface IcsPushResult {
  status: 'pushed' | 'stubbed' | 'failed'
  ref: string | null
  message?: string
}

/**
 * Export: push the CFS-keyed container + shipments to ICS (and PRA / pre-receival notice
 * lodgement when the customer asked for those paid services).
 *
 * STUB — returns `stubbed` with a reference. Throw from here to make "Confirm Manifest"
 * fail without advancing the job.
 */
export async function pushToIcs(payload: {
  requestRef: string
  containerNumber: string
  relatedServices: string[]
  shipments: Array<{ house_bill_number: string }>
}): Promise<IcsPushResult> {
  return {
    status: 'stubbed',
    ref: `STUB-${payload.requestRef}-${payload.containerNumber}`,
    message: 'Outbound ICS integration is not connected yet — nothing was sent.',
  }
}
