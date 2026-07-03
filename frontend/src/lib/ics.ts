/**
 * ICS (Integrated Cargo System) status check service.
 *
 * Checks clearance status for a house bill number or container.
 * When a CargoWise API URL + key are configured on the tenant, queries
 * the CargoWise eAdaptor API (WiseCloud) for live status. Falls back to
 * the cached status stored on the cfs_shipments record, and finally to
 * 'unavailable' if neither is available.
 *
 * CargoWise credentials are set in Settings → Integrations.
 */

import { updateShipmentIcsStatus } from './db/cfs-shipments'

export type IcsStatus = 'cleared' | 'held' | 'examination' | 'pending' | 'unavailable'

export interface IcsCheckResult {
  status:  IcsStatus
  source:  'api' | 'cached' | 'unavailable'
  checkedAt: string
}

/**
 * Check ICS status for a shipment.
 * If CargoWise API credentials are configured and a live check succeeds,
 * the result is cached back to the cfs_shipments record.
 */
export async function checkIcsStatus(opts: {
  shipmentId:    string
  hbl?:          string
  containerNumber?: string
  cachedStatus?: string
  apiUrl?:       string | null
  apiKey?:       string | null
}): Promise<IcsCheckResult> {
  const now = new Date().toISOString()

  // ── 1. Live CargoWise API check ──────────────────────────────────────────
  if (opts.apiUrl && opts.apiKey && (opts.hbl || opts.containerNumber)) {
    try {
      const status = await queryCargoWiseIcs({
        apiUrl:          opts.apiUrl,
        apiKey:          opts.apiKey,
        hbl:             opts.hbl,
        containerNumber: opts.containerNumber,
      })
      // Cache result back to DB (fire-and-forget)
      updateShipmentIcsStatus(opts.shipmentId, status).catch(() => {})
      return { status, source: 'api', checkedAt: now }
    } catch (err) {
      console.warn('[ics] CargoWise API check failed, falling back:', err)
    }
  }

  // ── 2. Use cached status from DB ─────────────────────────────────────────
  if (opts.cachedStatus && isValidIcsStatus(opts.cachedStatus)) {
    return { status: opts.cachedStatus as IcsStatus, source: 'cached', checkedAt: now }
  }

  // ── 3. Unavailable ───────────────────────────────────────────────────────
  return { status: 'unavailable', source: 'unavailable', checkedAt: now }
}

// ─── CargoWise eAdaptor integration ──────────────────────────────────────────
// CargoWise WiseCloud exposes a REST API at the configured endpoint.
// The expected response shape: { icsStatus: 'cleared' | 'held' | 'examination' | 'pending' }
// Credentials: set cargowise_api_url and cargowise_api_key on the tenant.

async function queryCargoWiseIcs(opts: {
  apiUrl:          string
  apiKey:          string
  hbl?:            string
  containerNumber?: string
}): Promise<IcsStatus> {
  const url = new URL('/ics/status', opts.apiUrl.replace(/\/$/, '') + '/')
  if (opts.hbl)             url.searchParams.set('hbl', opts.hbl)
  if (opts.containerNumber) url.searchParams.set('container', opts.containerNumber)

  const res = await fetch(url.toString(), {
    method:  'GET',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Accept':        'application/json',
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) throw new Error(`CargoWise API returned ${res.status}`)

  const data = await res.json() as { icsStatus?: string; status?: string }
  const raw = data.icsStatus ?? data.status ?? 'unavailable'
  return isValidIcsStatus(raw) ? (raw as IcsStatus) : 'unavailable'
}

function isValidIcsStatus(s: string): boolean {
  return ['cleared', 'held', 'examination', 'pending', 'unavailable'].includes(s)
}
