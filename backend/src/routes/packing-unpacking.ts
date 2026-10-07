/**
 * Packing & Unpacking module — /api/packing-unpacking
 *
 *   import  → "Unpacking": manifest + ICS data is fetched and reconciled before planning.
 *   export  → "Packing":   the CFS keys the data in and it is pushed out to ICS.
 *
 * One request (I-101 / E-101) holds many containers; each container holds many shipments
 * (house bills). The CONTAINER moves through the stages:
 *
 *   new_request ─▶ manifested ─▶ planned ─▶ result_validation ─▶ completed
 *   (confirm        (plan +        (tablet       (approve)
 *    manifest)       confirm plan)  result)
 *
 * Staff routes need the module's own 'packing' role (Reception / Super Admin logins do NOT open it); customer routes (/requests POST, /my-requests*) only
 * ever expose the caller's own requests.
 */

import { Router, Request, Response } from 'express'
import type { PoolClient } from 'pg'
import { pool } from '../db'
import { requireAuth, requireRole } from '../middleware/auth'
import { createNotification } from '../lib/notifications'
import {
  compareShipment, resolvedFieldValue, overallMatchPct, normaliseBill,
  SHIPMENT_FIELDS, COMPARE_FIELDS, isEmpty,
  type ShipmentData, type ShipmentFieldKey,
} from '../lib/puCompare'
import { fetchManifestAndIcs, pushToIcs, type ManifestBundle } from '../lib/puSources'

const router = Router()
router.use(requireAuth)

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'
// The module has its own login (role 'packing', migration 045) and shares credentials with no other module.
const STAFF_ROLES = ['packing']
const ADMIN_ROLES = ['packing']
const staffOnly = requireRole(...STAFF_ROLES)
const adminOnly = requireRole(...ADMIN_ROLES)

type Direction = 'import' | 'export'
const STAGES = ['new_request', 'manifested', 'planned', 'result_validation', 'completed'] as const
type Stage = typeof STAGES[number]

const tenantOf = (_req: Request) => DEFAULT_TENANT_ID
const isStaff = (req: Request) => STAFF_ROLES.includes(req.user?.role ?? '')
const isDirection = (v: unknown): v is Direction => v === 'import' || v === 'export'

const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data })
const fail = (res: Response, status: number, message: string, extra: Record<string, unknown> = {}) =>
  res.status(status).json({ success: false, error: { message, ...extra } })

function serverError(res: Response, where: string, err: unknown) {
  console.error(`[cfs ${where}]`, err)
  return fail(res, 500, 'Server error')
}

const today = () => new Date().toISOString().slice(0, 10)
const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v)
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const text = (v: unknown, max = 500): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s.slice(0, max)
}
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const CONTAINER_NO = /^[A-Z]{4}[0-9]{7}$/
const normContainerNo = (v: unknown) => String(v ?? '').toUpperCase().replace(/[\s-]/g, '')

// pg returns NUMERIC as strings — convert the ones the UI does maths on.
const NUMERIC_COLS = ['net_weight_kg', 'volume_cbm', 'weight_kg', 'match_pct', 'capacity_per_day',
  'min_match_pct', 'numeric_tolerance_pct']
function fixNumbers<T extends Record<string, any>>(row: T): T {
  if (!row) return row
  const out: any = { ...row }
  for (const k of NUMERIC_COLS) if (k in out && out[k] !== null && out[k] !== undefined) out[k] = Number(out[k])
  return out
}

// ── Settings ─────────────────────────────────────────────────────────────────

interface PuSettings {
  direction: Direction
  default_team_id: string | null
  notification_emails: string
  report_emails: string
  require_resolution: boolean
  min_match_pct: number
  numeric_tolerance_pct: number
}

async function getSettings(tenantId: string, direction: Direction, db: { query: any } = pool): Promise<PuSettings> {
  const { rows } = await db.query(`SELECT * FROM pu_settings WHERE tenant_id = $1 AND direction = $2`, [tenantId, direction])
  const r = rows[0]
  return {
    direction,
    default_team_id: r?.default_team_id ?? null,
    notification_emails: r?.notification_emails ?? '',
    report_emails: r?.report_emails ?? '',
    require_resolution: r?.require_resolution ?? true,
    min_match_pct: r ? Number(r.min_match_pct) : 0,
    numeric_tolerance_pct: r ? Number(r.numeric_tolerance_pct) : 1,
  }
}

// ── Activity + notifications ─────────────────────────────────────────────────

async function logActivity(
  db: { query: any },
  req: Request | null,
  tenantId: string,
  requestId: string | null,
  containerId: string | null,
  action: string,
  detail: Record<string, unknown> = {},
) {
  await db.query(
    `INSERT INTO pu_activity (tenant_id, request_id, container_id, actor_id, actor_name, action, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [tenantId, requestId, containerId, req?.user?.id ?? null, req?.user?.name ?? 'System', action, JSON.stringify(detail)],
  )
}

/** Fire-and-forget in-app notification. Email is stubbed in lib/notifications.ts. */
function notify(title: string, body: string, refId?: string) {
  void createNotification('cfs_module', title, body, refId)
}

// ── Shared SELECT for container cards ────────────────────────────────────────

const CARD_SELECT = `
  SELECT c.*,
         r.request_ref, r.status AS request_status, r.customer_name, r.customer_email, r.customer_logo_url,
         r.related_services, r.source AS request_source, r.created_at AS request_created_at,
         COALESCE(CASE WHEN c.direction = 'import' THEN c.eta ELSE c.etd END, c.eta, c.etd) AS sort_date,
         bk.slot_date, bk.checked_in_at AS gate_in_at,
         (SELECT COUNT(*)::int FROM pu_shipments s WHERE s.container_id = c.id) AS shipment_count,
         (SELECT COUNT(*)::int FROM pu_photos p WHERE p.container_id = c.id OR (p.request_id = c.request_id AND p.container_id IS NULL)) AS photo_count,
         (SELECT COUNT(*)::int FROM pu_notes n WHERE n.container_id = c.id) AS note_count,
         l.name AS location_name, t.name AS team_name
    FROM pu_containers c
    JOIN pu_requests r ON r.id = c.request_id
    LEFT JOIN pu_locations l ON l.id = c.location_id
    LEFT JOIN pu_teams t ON t.id = c.team_id
    LEFT JOIN LATERAL (
      SELECT b.slot_date, b.checked_in_at
        FROM bookings b
       WHERE b.tenant_id = c.tenant_id AND LOWER(b.container_number) = LOWER(c.container_number)
         AND b.status <> 'cancelled'
       ORDER BY b.slot_date DESC LIMIT 1
    ) bk ON TRUE
`

async function loadCard(id: string, tenantId: string, db: { query: any } = pool) {
  const { rows } = await db.query(`${CARD_SELECT} WHERE c.id = $1 AND c.tenant_id = $2`, [id, tenantId])
  return rows[0] ? fixNumbers(rows[0]) : null
}

// ── Shipment row building (import) ───────────────────────────────────────────

function buildImportShipments(bundle: ManifestBundle, carry: Map<string, Record<string, string>> = new Map()) {
  const bills = new Map<string, { manifest: ShipmentData | null; ics: ShipmentData | null }>()
  for (const m of bundle.manifest) {
    const k = normaliseBill(m.house_bill_number)
    bills.set(k, { manifest: m, ics: bills.get(k)?.ics ?? null })
  }
  for (const i of bundle.ics) {
    const k = normaliseBill(i.house_bill_number)
    bills.set(k, { manifest: bills.get(k)?.manifest ?? null, ics: i })
  }
  const out: Array<{ key: string; manifest: ShipmentData | null; ics: ShipmentData | null; fieldSources: Record<string, string> }> = []
  for (const [key, v] of bills) {
    out.push({ key, manifest: v.manifest, ics: v.ics, fieldSources: carry.get(key) ?? {} })
  }
  return out
}

async function insertImportShipments(
  client: PoolClient, tenantId: string, containerId: string, bundle: ManifestBundle,
  tolerance: number, carry: Map<string, Record<string, string>> = new Map(),
) {
  const built = buildImportShipments(bundle, carry)
  const pcts: number[] = []
  let order = 0
  for (const b of built) {
    const cmp = compareShipment(b.manifest, b.ics, b.fieldSources, tolerance)
    pcts.push(cmp.matchPct)
    const bill = (b.manifest ?? b.ics)!.house_bill_number
    const vals = SHIPMENT_FIELDS.map(f => resolvedFieldValue(b.manifest, b.ics, f, b.fieldSources))
    await client.query(
      `INSERT INTO pu_shipments (tenant_id, container_id, house_bill_number, ${SHIPMENT_FIELDS.join(', ')},
                                 manifest, ics, field_sources, match_pct, sort_order)
       VALUES ($1,$2,$3, ${SHIPMENT_FIELDS.map((_, i) => `$${i + 4}`).join(', ')},
               $${SHIPMENT_FIELDS.length + 4}, $${SHIPMENT_FIELDS.length + 5}, $${SHIPMENT_FIELDS.length + 6},
               $${SHIPMENT_FIELDS.length + 7}, $${SHIPMENT_FIELDS.length + 8})`,
      [tenantId, containerId, bill, ...vals,
        b.manifest ? JSON.stringify(b.manifest) : null, b.ics ? JSON.stringify(b.ics) : null,
        JSON.stringify(b.fieldSources), cmp.matchPct, order++],
    )
  }
  const overall = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null
  await client.query(
    `UPDATE pu_containers SET match_pct = $2, manifest_fetched_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [containerId, overall],
  )
}

/** Container header fields that the manifest may fill in — only where the customer left them blank. */
const FILLABLE: Array<[string, keyof ManifestBundle['container']]> = [
  ['seal_number', 'seal_number'], ['container_type', 'container_type'], ['net_weight_kg', 'net_weight_kg'],
  ['volume_cbm', 'volume_cbm'], ['package_count', 'package_count'], ['vessel', 'vessel'], ['voyage', 'voyage'],
  ['lloyds_number', 'lloyds_number'], ['load_port', 'load_port'], ['discharge_port', 'discharge_port'], ['eta', 'eta'],
]

// ══════════════════════════════════════════════════════════════════════════════
// INTAKE
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/packing-unpacking/requests — customer submits (status: submitted) or staff keys one in
// on a customer's behalf (status: accepted straight away).
router.post('/requests', async (req: Request, res: Response) => {
  const tenantId = tenantOf(req)
  const staff = isStaff(req)
  const b = req.body ?? {}

  if (!isDirection(b.direction)) return fail(res, 400, 'direction must be "import" or "export"')
  const direction: Direction = b.direction
  const containersIn: any[] = Array.isArray(b.containers) ? b.containers : []
  if (containersIn.length === 0) return fail(res, 400, 'Add at least one container')
  if (containersIn.length > 50) return fail(res, 400, 'A request can hold at most 50 containers')

  const customerName = staff ? text(b.customer?.name, 200) : (text(b.customer?.name, 200) ?? text(req.user?.name, 200))
  if (!customerName) return fail(res, 400, 'Customer name is required')
  const customerEmail = text(b.customer?.email, 200) ?? (staff ? null : req.user?.email ?? null)

  const containers: Array<{ no: string; raw: any }> = []
  for (const [i, c] of containersIn.entries()) {
    const no = normContainerNo(c?.containerNumber)
    if (!CONTAINER_NO.test(no)) {
      return fail(res, 400, `Container ${i + 1}: "${c?.containerNumber ?? ''}" is not a valid container number (4 letters + 7 digits, e.g. MSKU1234567)`)
    }
    if (containers.some(x => x.no === no)) return fail(res, 400, `Container ${no} is listed twice in this request`)
    for (const k of ['eta', 'etd']) if (!isEmpty(c?.[k]) && !isIsoDate(c[k])) return fail(res, 400, `Container ${no}: ${k.toUpperCase()} must be a date (YYYY-MM-DD)`)
    containers.push({ no, raw: c })
  }

  const services: string[] = Array.isArray(b.relatedServices)
    ? b.relatedServices.map((s: unknown) => String(s).slice(0, 50)).slice(0, 20) : []
  const photos: any[] = Array.isArray(b.photos) ? b.photos.slice(0, 40) : []

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const settings = await getSettings(tenantId, direction, client)

    const { rows: cnt } = await client.query(
      `INSERT INTO pu_counters (tenant_id, direction, last_seq) VALUES ($1, $2, 101)
       ON CONFLICT (tenant_id, direction) DO UPDATE SET last_seq = pu_counters.last_seq + 1
       RETURNING last_seq`,
      [tenantId, direction],
    )
    const seq: number = cnt[0].last_seq
    const ref = `${direction === 'import' ? 'I' : 'E'}-${seq}`

    const { rows: reqRows } = await client.query(
      `INSERT INTO pu_requests (tenant_id, direction, seq, request_ref, status, source, customer_name, customer_email,
                                customer_phone, customer_logo_url, customer_user_id, related_services, customer_notes,
                                accepted_at, accepted_by, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [tenantId, direction, seq, ref, staff ? 'accepted' : 'submitted', staff ? 'staff' : 'customer',
        customerName, customerEmail, text(b.customer?.phone, 50), text(b.customer?.logoUrl, 500),
        staff ? (isUuid(b.customer?.userId) ? b.customer.userId : null) : req.user!.id,
        direction === 'export' ? services : [], text(b.notes, 4000),
        staff ? new Date() : null, staff ? req.user!.id : null, req.user!.id],
    )
    const request = reqRows[0]

    const warnings: string[] = []
    const created: string[] = []
    for (const { no, raw } of containers) {
      const { rows: dup } = await client.query(
        `SELECT r.request_ref FROM pu_containers c JOIN pu_requests r ON r.id = c.request_id
          WHERE c.tenant_id = $1 AND c.direction = $2 AND LOWER(c.container_number) = LOWER($3)
            AND c.status NOT IN ('completed','cancelled') AND r.status <> 'declined' AND r.id <> $4 LIMIT 1`,
        [tenantId, direction, no, request.id],
      )
      if (dup[0]) warnings.push(`${no} is already open on request ${dup[0].request_ref}`)

      const { rows: cr } = await client.query(
        `INSERT INTO pu_containers (tenant_id, request_id, direction, container_number, seal_number, container_type,
                                    net_weight_kg, volume_cbm, package_count, vessel, voyage, lloyds_number,
                                    load_port, discharge_port, eta, etd)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [tenantId, request.id, direction, no, text(raw.sealNumber, 50), text(raw.containerType, 20),
          numOrNull(raw.netWeightKg), numOrNull(raw.volumeCbm), numOrNull(raw.packageCount),
          text(raw.vessel, 100), text(raw.voyage, 50), text(raw.lloydsNumber, 50),
          text(raw.loadPort, 100), text(raw.dischargePort, 100),
          isIsoDate(raw.eta) ? raw.eta : null, isIsoDate(raw.etd) ? raw.etd : null],
      )
      const containerId: string = cr[0].id
      created.push(containerId)

      if (direction === 'import') {
        // Pull manifest + ICS data and pre-fill whatever the customer left blank.
        const bundle = await fetchManifestAndIcs(client, tenantId, no, today())
        const sets: string[] = []
        const vals: unknown[] = [containerId]
        for (const [col, key] of FILLABLE) {
          const v = bundle.container[key]
          if (v !== undefined && v !== null) { vals.push(v); sets.push(`${col} = COALESCE(${col}, $${vals.length})`) }
        }
        if (sets.length) await client.query(`UPDATE pu_containers SET ${sets.join(', ')} WHERE id = $1`, vals)
        await insertImportShipments(client, tenantId, containerId, bundle, settings.numeric_tolerance_pct)
      } else if (Array.isArray(raw.shipments)) {
        // Export: the customer may pre-declare house bills; the CFS completes the rest.
        let order = 0
        for (const s of raw.shipments.slice(0, 200)) {
          const hbl = text(s?.houseBillNumber, 60)
          if (!hbl) continue
          await client.query(
            `INSERT INTO pu_shipments (tenant_id, container_id, house_bill_number, consignee, consignor, goods_description,
                                       weight_kg, volume_cbm, package_count, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [tenantId, containerId, hbl, text(s.consignee, 200), text(s.consignor, 200), text(s.goodsDescription, 1000),
              numOrNull(s.weightKg), numOrNull(s.volumeCbm), numOrNull(s.packageCount), order++],
          )
        }
      }
      await logActivity(client, req, tenantId, request.id, containerId, 'container_added', { containerNumber: no })
    }

    for (const p of photos) {
      const path = text(p?.storagePath, 500)
      if (!path) continue
      await client.query(
        `INSERT INTO pu_photos (tenant_id, request_id, source, storage_path, file_name, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [tenantId, request.id, staff ? 'staff' : 'customer', path, text(p.fileName, 200), req.user!.id],
      )
    }
    await logActivity(client, req, tenantId, request.id, null, staff ? 'request_created_by_staff' : 'request_submitted',
      { requestRef: ref, containers: containers.length })
    await client.query('COMMIT')

    notify(
      `New ${direction === 'import' ? 'unpacking' : 'packing'} request ${ref}`,
      `${customerName} — ${containers.length} container${containers.length === 1 ? '' : 's'}${staff ? ' (entered by staff)' : ''}`,
      request.id,
    )
    return ok(res, { request, containerIds: created, warnings }, 201)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return serverError(res, 'POST /requests', err)
  } finally {
    client.release()
  }
})

// GET /api/packing-unpacking/my-requests — the signed-in customer's own requests
router.get('/my-requests', async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req)
    const { rows } = await pool.query(
      `SELECT r.id, r.request_ref, r.direction, r.status, r.related_services, r.created_at, r.decline_reason,
              COALESCE(json_agg(json_build_object(
                'id', c.id, 'container_number', c.container_number, 'status', c.status, 'eta', c.eta, 'etd', c.etd,
                'vessel', c.vessel, 'planned_date', c.planned_date,
                'inspection_status', c.inspection_status, 'fumigation_status', c.fumigation_status,
                'completed_at', c.completed_at
              ) ORDER BY c.created_at) FILTER (WHERE c.id IS NOT NULL), '[]') AS containers
         FROM pu_requests r
         LEFT JOIN pu_containers c ON c.request_id = r.id
        WHERE r.tenant_id = $1 AND r.customer_user_id = $2
        GROUP BY r.id ORDER BY r.created_at DESC LIMIT 200`,
      [tenantId, req.user!.id],
    )
    return ok(res, rows)
  } catch (err) { return serverError(res, 'GET /my-requests', err) }
})

// GET /api/packing-unpacking/my-requests/:id — one of the customer's own requests, customer-safe fields only
router.get('/my-requests/:id', async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  try {
    const tenantId = tenantOf(req)
    const { rows } = await pool.query(
      `SELECT id, request_ref, direction, status, related_services, customer_notes, decline_reason, created_at
         FROM pu_requests WHERE id = $1 AND tenant_id = $2 AND customer_user_id = $3`,
      [req.params.id, tenantId, req.user!.id],
    )
    const request = rows[0]
    if (!request) return fail(res, 404, 'Request not found')

    const [containers, messages, photos] = await Promise.all([
      pool.query(
        `SELECT c.id, c.container_number, c.seal_number, c.container_type, c.vessel, c.voyage, c.load_port, c.discharge_port,
                c.eta, c.etd, c.status, c.planned_date, c.planned_start, c.planned_end, c.inspection_status,
                c.fumigation_status, c.completed_at, c.shared_with_customer_at,
                l.name AS location_name,
                CASE WHEN c.status = 'completed' THEN
                  (SELECT COALESCE(json_agg(json_build_object(
                     'house_bill_number', s.house_bill_number, 'consignee', s.consignee, 'package_count', s.package_count,
                     'weight_kg', s.weight_kg, 'volume_cbm', s.volume_cbm) ORDER BY s.sort_order), '[]')
                     FROM pu_shipments s WHERE s.container_id = c.id)
                END AS shipments
           FROM pu_containers c LEFT JOIN pu_locations l ON l.id = c.location_id
          WHERE c.request_id = $1 ORDER BY c.created_at`, [request.id]),
      pool.query(`SELECT id, container_id, subject, body, sent_by_name, created_at FROM pu_messages WHERE request_id = $1 ORDER BY created_at DESC`, [request.id]),
      pool.query(
        `SELECT p.id, p.container_id, p.source, p.storage_path, p.file_name, p.created_at FROM pu_photos p
          WHERE p.request_id = $1 OR p.container_id IN (SELECT id FROM pu_containers WHERE request_id = $1 AND status = 'completed')
          ORDER BY p.created_at`, [request.id]),
    ])
    return ok(res, { request, containers: containers.rows.map(fixNumbers), messages: messages.rows, photos: photos.rows })
  } catch (err) { return serverError(res, 'GET /my-requests/:id', err) }
})

// ══════════════════════════════════════════════════════════════════════════════
// STAFF — lists, summary, detail
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/packing-unpacking/summary?direction=import — counts for the sidebar tabs
router.get('/summary', staffOnly, async (req: Request, res: Response) => {
  if (!isDirection(req.query.direction)) return fail(res, 400, 'direction is required')
  try {
    const { rows } = await pool.query(
      `SELECT c.status, r.status AS request_status,
              (c.status = 'planned' AND c.plan_confirmed_at IS NOT NULL) AS plan_confirmed,
              COUNT(*)::int AS n
         FROM pu_containers c JOIN pu_requests r ON r.id = c.request_id
        WHERE c.tenant_id = $1 AND c.direction = $2 AND r.status <> 'declined' AND c.status <> 'cancelled'
        GROUP BY 1, 2, 3`,
      [tenantOf(req), req.query.direction],
    )
    const out = {
      new_request: { awaiting_acceptance: 0, accepted: 0, total: 0 },
      manifested: 0,
      planned: { draft: 0, confirmed: 0, total: 0 },
      result_validation: 0,
      completed: 0,
    }
    for (const r of rows) {
      if (r.status === 'new_request') {
        if (r.request_status === 'submitted') out.new_request.awaiting_acceptance += r.n
        else out.new_request.accepted += r.n
        out.new_request.total += r.n
      } else if (r.status === 'manifested') out.manifested += r.n
      else if (r.status === 'planned') { (r.plan_confirmed ? out.planned.confirmed += r.n : out.planned.draft += r.n); out.planned.total += r.n }
      else if (r.status === 'result_validation') out.result_validation += r.n
      else if (r.status === 'completed') out.completed += r.n
    }
    return ok(res, out)
  } catch (err) { return serverError(res, 'GET /summary', err) }
})

// GET /api/packing-unpacking/containers?direction=&stage=&acceptance=&q=&limit=&offset=
router.get('/containers', staffOnly, async (req: Request, res: Response) => {
  const { direction, stage, acceptance, q } = req.query as Record<string, string | undefined>
  if (!isDirection(direction)) return fail(res, 400, 'direction is required')
  if (!stage || !(STAGES as readonly string[]).includes(stage)) return fail(res, 400, `stage must be one of ${STAGES.join(', ')}`)
  try {
    const params: unknown[] = [tenantOf(req), direction, stage]
    const where = [`c.tenant_id = $1`, `c.direction = $2`, `c.status = $3`, `r.status <> 'declined'`]
    if (stage === 'new_request') {
      if (acceptance === 'awaiting') where.push(`r.status = 'submitted'`)
      else if (acceptance === 'accepted') where.push(`r.status = 'accepted'`)
    }
    if (stage === 'planned') {
      if (req.query.confirmed === 'true') where.push(`c.plan_confirmed_at IS NOT NULL`)
      if (req.query.confirmed === 'false') where.push(`c.plan_confirmed_at IS NULL`)
    }
    if (q && q.trim()) {
      params.push(`%${q.trim().toLowerCase().replace(/[%_]/g, m => '\\' + m)}%`)
      const p = `$${params.length}`
      where.push(`(LOWER(c.container_number) LIKE ${p} OR LOWER(r.request_ref) LIKE ${p} OR LOWER(r.customer_name) LIKE ${p}
                   OR LOWER(COALESCE(c.vessel,'')) LIKE ${p}
                   OR EXISTS (SELECT 1 FROM pu_shipments s WHERE s.container_id = c.id AND LOWER(s.house_bill_number) LIKE ${p}))`)
    }
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '100'), 10) || 100, 1), 300)
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0)
    const order = stage === 'completed'
      ? `c.completed_at DESC NULLS LAST, c.created_at DESC`
      : `sort_date ASC NULLS LAST, bk.slot_date ASC NULLS LAST, bk.checked_in_at ASC NULLS LAST, c.created_at ASC`
    const { rows } = await pool.query(
      `${CARD_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params)
    return ok(res, rows.map(fixNumbers))
  } catch (err) { return serverError(res, 'GET /containers', err) }
})

// GET /api/packing-unpacking/containers/:id — everything for the detail screen
router.get('/containers/:id', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  try {
    const tenantId = tenantOf(req)
    const container = await loadCard(req.params.id, tenantId)
    if (!container) return fail(res, 404, 'Container not found')
    const settings = await getSettings(tenantId, container.direction)

    const [ships, photos, notes, messages, activity, results] = await Promise.all([
      pool.query(`SELECT * FROM pu_shipments WHERE container_id = $1 ORDER BY sort_order, created_at`, [container.id]),
      pool.query(
        `SELECT * FROM pu_photos WHERE container_id = $1 OR (request_id = $2 AND container_id IS NULL) ORDER BY created_at`,
        [container.id, container.request_id]),
      pool.query(`SELECT * FROM pu_notes WHERE container_id = $1 ORDER BY created_at DESC`, [container.id]),
      pool.query(`SELECT * FROM pu_messages WHERE request_id = $1 AND (container_id = $2 OR container_id IS NULL) ORDER BY created_at DESC`,
        [container.request_id, container.id]),
      pool.query(`SELECT * FROM pu_activity WHERE container_id = $1 OR (request_id = $2 AND container_id IS NULL) ORDER BY created_at DESC LIMIT 100`,
        [container.id, container.request_id]),
      pool.query(`SELECT * FROM pu_results WHERE container_id = $1 ORDER BY submitted_at DESC`, [container.id]),
    ])

    const shipments = ships.rows.map(s => {
      const row = fixNumbers(s)
      const comparison = container.direction === 'import' && (s.manifest || s.ics)
        ? compareShipment(s.manifest, s.ics, s.field_sources, settings.numeric_tolerance_pct)
        : null
      return { ...row, comparison }
    })
    const comparisons = shipments.map(s => s.comparison).filter(Boolean) as ReturnType<typeof compareShipment>[]
    const unresolved = comparisons.reduce((n, c) => n + c.unresolvedCount, 0)

    return ok(res, {
      container,
      shipments,
      photos: photos.rows,
      notes: notes.rows,
      messages: messages.rows,
      activity: activity.rows,
      results: results.rows,
      settings,
      compare_fields: COMPARE_FIELDS,
      match: {
        overall_pct: overallMatchPct(comparisons),
        unresolved,
        can_confirm: container.status === 'new_request' && container.request_status === 'accepted'
          && (container.direction === 'export' || !settings.require_resolution || unresolved === 0),
      },
    })
  } catch (err) { return serverError(res, 'GET /containers/:id', err) }
})

// ══════════════════════════════════════════════════════════════════════════════
// ACCEPTANCE
// ══════════════════════════════════════════════════════════════════════════════

router.post('/requests/:id/accept', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  try {
    const tenantId = tenantOf(req)
    const { rows } = await pool.query(
      `UPDATE pu_requests SET status = 'accepted', accepted_at = NOW(), accepted_by = $3, decline_reason = NULL, updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 AND status = 'submitted' RETURNING *`,
      [req.params.id, tenantId, req.user!.id])
    if (!rows[0]) return fail(res, 409, 'Only a request that is awaiting acceptance can be accepted')
    await logActivity(pool, req, tenantId, rows[0].id, null, 'request_accepted')
    notify(`Request ${rows[0].request_ref} accepted`, `${rows[0].customer_name}`, rows[0].id)
    return ok(res, rows[0])
  } catch (err) { return serverError(res, 'POST accept', err) }
})

router.post('/requests/:id/decline', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const reason = text(req.body?.reason, 1000)
  if (!reason) return fail(res, 400, 'Give the customer a reason for declining')
  try {
    const tenantId = tenantOf(req)
    const { rows } = await pool.query(
      `UPDATE pu_requests SET status = 'declined', decline_reason = $3, updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 AND status = 'submitted' RETURNING *`,
      [req.params.id, tenantId, reason])
    if (!rows[0]) return fail(res, 409, 'Only a request that is awaiting acceptance can be declined')
    await logActivity(pool, req, tenantId, rows[0].id, null, 'request_declined', { reason })
    notify(`Request ${rows[0].request_ref} declined`, reason, rows[0].id)
    return ok(res, rows[0])
  } catch (err) { return serverError(res, 'POST decline', err) }
})

// ══════════════════════════════════════════════════════════════════════════════
// STAGE 1 → 2 : container edits, manifest reconciliation, data entry, confirm
// ══════════════════════════════════════════════════════════════════════════════

const EDITABLE_HEADER: Record<string, 'text' | 'num' | 'int' | 'date'> = {
  seal_number: 'text', container_type: 'text', net_weight_kg: 'num', volume_cbm: 'num', package_count: 'int',
  vessel: 'text', voyage: 'text', lloyds_number: 'text', load_port: 'text', discharge_port: 'text',
  eta: 'date', etd: 'date',
}

// PATCH /api/packing-unpacking/containers/:id — edit header fields (only before the manifest is confirmed)
router.patch('/containers/:id', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  try {
    const tenantId = tenantOf(req)
    const c = await loadCard(req.params.id, tenantId)
    if (!c) return fail(res, 404, 'Container not found')
    if (c.status !== 'new_request') return fail(res, 409, 'Details can only be edited before the manifest is confirmed')

    const sets: string[] = []
    const vals: unknown[] = []
    for (const [k, kind] of Object.entries(EDITABLE_HEADER)) {
      if (!(k in (req.body ?? {}))) continue
      const raw = req.body[k]
      let v: unknown
      if (kind === 'text') v = text(raw, 200)
      else if (kind === 'num') { v = numOrNull(raw); if (!isEmpty(raw) && v === null) return fail(res, 400, `${k} must be a number`) }
      else if (kind === 'int') { v = numOrNull(raw); if (!isEmpty(raw) && (v === null || !Number.isInteger(v))) return fail(res, 400, `${k} must be a whole number`) }
      else { v = isEmpty(raw) ? null : raw; if (v !== null && !isIsoDate(v)) return fail(res, 400, `${k} must be a date (YYYY-MM-DD)`) }
      vals.push(v); sets.push(`${k} = $${vals.length}`)
    }
    if (!sets.length) return fail(res, 400, 'Nothing to update')
    vals.push(c.id)
    await pool.query(`UPDATE pu_containers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}`, vals)
    await logActivity(pool, req, tenantId, c.request_id, c.id, 'container_edited', { fields: Object.keys(req.body ?? {}).filter(k => k in EDITABLE_HEADER) })
    return ok(res, await loadCard(c.id, tenantId))
  } catch (err) { return serverError(res, 'PATCH /containers/:id', err) }
})

// PATCH /api/packing-unpacking/containers/:id/compliance — inspection / fumigation status, any stage.
// Also the hook other modules call so every card shows the live status.
router.patch('/containers/:id/compliance', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const INSP = ['not_required', 'pending', 'passed', 'failed']
  const FUM = ['not_required', 'pending', 'completed', 'failed']
  const { inspection_status, fumigation_status } = req.body ?? {}
  if (inspection_status !== undefined && !INSP.includes(inspection_status)) return fail(res, 400, `inspection_status must be one of ${INSP.join(', ')}`)
  if (fumigation_status !== undefined && !FUM.includes(fumigation_status)) return fail(res, 400, `fumigation_status must be one of ${FUM.join(', ')}`)
  if (inspection_status === undefined && fumigation_status === undefined) return fail(res, 400, 'Nothing to update')
  try {
    const tenantId = tenantOf(req)
    const { rows } = await pool.query(
      `UPDATE pu_containers SET inspection_status = COALESCE($3, inspection_status),
                                fumigation_status = COALESCE($4, fumigation_status), updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 RETURNING id, request_id, inspection_status, fumigation_status`,
      [req.params.id, tenantId, inspection_status ?? null, fumigation_status ?? null])
    if (!rows[0]) return fail(res, 404, 'Container not found')
    await logActivity(pool, req, tenantId, rows[0].request_id, rows[0].id, 'compliance_updated', { inspection_status, fumigation_status })
    return ok(res, rows[0])
  } catch (err) { return serverError(res, 'PATCH compliance', err) }
})

// POST /api/packing-unpacking/containers/:id/refresh-manifest — re-pull manifest + ICS (import, before confirm)
router.post('/containers/:id/refresh-manifest', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const client = await pool.connect()
  try {
    const tenantId = tenantOf(req)
    await client.query('BEGIN')
    const { rows } = await client.query(`SELECT * FROM pu_containers WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [req.params.id, tenantId])
    const c = rows[0]
    if (!c) { await client.query('ROLLBACK'); return fail(res, 404, 'Container not found') }
    if (c.direction !== 'import') { await client.query('ROLLBACK'); return fail(res, 400, 'Only unpacking containers have a manifest to refresh') }
    if (c.status !== 'new_request') { await client.query('ROLLBACK'); return fail(res, 409, 'The manifest is already confirmed') }

    const settings = await getSettings(tenantId, 'import', client)
    // Keep the user's earlier source choices for house bills that still exist.
    const prev = await client.query(`SELECT house_bill_number, field_sources FROM pu_shipments WHERE container_id = $1`, [c.id])
    const carry = new Map<string, Record<string, string>>(prev.rows.map(r => [normaliseBill(r.house_bill_number), r.field_sources ?? {}]))
    await client.query(`DELETE FROM pu_shipments WHERE container_id = $1`, [c.id])
    const bundle = await fetchManifestAndIcs(client, tenantId, c.container_number, today())
    await insertImportShipments(client, tenantId, c.id, bundle, settings.numeric_tolerance_pct, carry)
    await logActivity(client, req, tenantId, c.request_id, c.id, 'manifest_refreshed', { provider: bundle.provider })
    await client.query('COMMIT')
    return ok(res, { provider: bundle.provider })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return serverError(res, 'POST refresh-manifest', err)
  } finally { client.release() }
})

// POST /api/packing-unpacking/shipments/:id/resolve  { field, source }
//   field  = a shipment field key, or "_include" for a shipment present on only one side
//   source = "manifest" | "ics"  (fields)   or  "include" | "exclude"  (_include)
router.post('/shipments/:id/resolve', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const { field, source } = req.body ?? {}
  const isInclude = field === '_include'
  if (!isInclude && !(SHIPMENT_FIELDS as readonly string[]).includes(field)) return fail(res, 400, 'Unknown field')
  if (isInclude ? !['include', 'exclude'].includes(source) : !['manifest', 'ics'].includes(source)) return fail(res, 400, 'Invalid source')
  try {
    const tenantId = tenantOf(req)
    const { rows } = await pool.query(
      `SELECT s.*, c.status AS container_status, c.direction, c.request_id FROM pu_shipments s
         JOIN pu_containers c ON c.id = s.container_id WHERE s.id = $1 AND s.tenant_id = $2`,
      [req.params.id, tenantId])
    const s = rows[0]
    if (!s) return fail(res, 404, 'Shipment not found')
    if (s.direction !== 'import') return fail(res, 400, 'Only unpacking shipments are reconciled against ICS')
    if (s.container_status !== 'new_request') return fail(res, 409, 'The manifest is already confirmed')

    const sources = { ...(s.field_sources ?? {}), [isInclude ? '_include' : field]: source }
    const sets = [`field_sources = $2`, `updated_at = NOW()`]
    const vals: unknown[] = [s.id, JSON.stringify(sources)]
    if (!isInclude) {
      vals.push(resolvedFieldValue(s.manifest, s.ics, field as ShipmentFieldKey, sources))
      sets.push(`${field} = $${vals.length}`)
    }
    await pool.query(`UPDATE pu_shipments SET ${sets.join(', ')} WHERE id = $1`, vals)
    await logActivity(pool, req, tenantId, s.request_id, s.container_id, 'mismatch_resolved',
      { houseBill: s.house_bill_number, field, source })
    return ok(res, { field, source })
  } catch (err) { return serverError(res, 'POST resolve', err) }
})

// POST /api/packing-unpacking/containers/:id/resolve-all { source: 'manifest'|'ics' } — resolve every
// still-unresolved mismatch in one go (unpaired shipments are included).
router.post('/containers/:id/resolve-all', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const source = req.body?.source
  if (!['manifest', 'ics'].includes(source)) return fail(res, 400, 'source must be "manifest" or "ics"')
  const client = await pool.connect()
  try {
    const tenantId = tenantOf(req)
    await client.query('BEGIN')
    const { rows } = await client.query(`SELECT * FROM pu_containers WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [req.params.id, tenantId])
    const c = rows[0]
    if (!c) { await client.query('ROLLBACK'); return fail(res, 404, 'Container not found') }
    if (c.direction !== 'import' || c.status !== 'new_request') { await client.query('ROLLBACK'); return fail(res, 409, 'Nothing to resolve') }
    const settings = await getSettings(tenantId, 'import', client)
    const ships = await client.query(`SELECT * FROM pu_shipments WHERE container_id = $1`, [c.id])
    let changed = 0
    for (const s of ships.rows) {
      const cmp = compareShipment(s.manifest, s.ics, s.field_sources, settings.numeric_tolerance_pct)
      const sources: Record<string, string> = { ...(s.field_sources ?? {}) }
      const colUpdates: Array<[string, unknown]> = []
      for (const f of cmp.fields) {
        if (f.needsResolution && !f.chosen) {
          sources[f.key] = source
          colUpdates.push([f.key, resolvedFieldValue(s.manifest, s.ics, f.key, sources)])
          changed++
        }
      }
      if (cmp.needsInclusionDecision && !cmp.inclusion) { sources._include = 'include'; changed++ }
      if (colUpdates.length || sources._include !== s.field_sources?._include) {
        const setSql = ['field_sources = $2', ...colUpdates.map(([k], i) => `${k} = $${i + 3}`), 'updated_at = NOW()']
        await client.query(
          `UPDATE pu_shipments SET ${setSql.join(', ')} WHERE id = $1`,
          [s.id, JSON.stringify(sources), ...colUpdates.map(([, v]) => v)])
      }
    }
    await logActivity(client, req, tenantId, c.request_id, c.id, 'mismatches_resolved_in_bulk', { source, changed })
    await client.query('COMMIT')
    return ok(res, { changed })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return serverError(res, 'POST resolve-all', err)
  } finally { client.release() }
})

// PUT /api/packing-unpacking/containers/:id/shipments — export data entry. Replaces the shipment list:
// rows with an id are updated, rows without are inserted, anything omitted is removed.
router.put('/containers/:id/shipments', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const list: any[] = Array.isArray(req.body?.shipments) ? req.body.shipments : null as any
  if (!list) return fail(res, 400, 'shipments must be an array')
  if (list.length > 200) return fail(res, 400, 'Too many shipments')
  const seen = new Set<string>()
  for (const [i, s] of list.entries()) {
    const hbl = text(s?.house_bill_number, 60)
    if (!hbl) return fail(res, 400, `Shipment ${i + 1}: house bill number is required`)
    if (seen.has(normaliseBill(hbl))) return fail(res, 400, `House bill ${hbl} appears twice`)
    seen.add(normaliseBill(hbl))
    for (const k of ['weight_kg', 'volume_cbm', 'package_count'] as const) {
      if (!isEmpty(s[k]) && (numOrNull(s[k]) === null || (numOrNull(s[k]) as number) < 0)) return fail(res, 400, `Shipment ${hbl}: ${k} must be a positive number`)
    }
  }
  const client = await pool.connect()
  try {
    const tenantId = tenantOf(req)
    await client.query('BEGIN')
    const { rows } = await client.query(`SELECT * FROM pu_containers WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [req.params.id, tenantId])
    const c = rows[0]
    if (!c) { await client.query('ROLLBACK'); return fail(res, 404, 'Container not found') }
    if (c.direction !== 'export') { await client.query('ROLLBACK'); return fail(res, 400, 'Import shipments come from the manifest and cannot be edited') }
    if (c.status !== 'new_request') { await client.query('ROLLBACK'); return fail(res, 409, 'Data can only be edited before it is submitted') }

    const existing = await client.query(`SELECT id FROM pu_shipments WHERE container_id = $1`, [c.id])
    const existingIds = new Set(existing.rows.map(r => r.id))
    const keepIds = new Set<string>()
    let order = 0
    for (const s of list) {
      const vals = [
        text(s.house_bill_number, 60), text(s.job_reference, 100), numOrNull(s.weight_kg), numOrNull(s.volume_cbm),
        numOrNull(s.package_count), text(s.consignee, 200), text(s.consignor, 200), text(s.goods_description, 1000),
        text(s.marks_numbers, 500), text(s.handling_instructions, 1000),
      ]
      if (isUuid(s.id) && existingIds.has(s.id)) {
        keepIds.add(s.id)
        await client.query(
          `UPDATE pu_shipments SET house_bill_number=$2, job_reference=$3, weight_kg=$4, volume_cbm=$5, package_count=$6,
                  consignee=$7, consignor=$8, goods_description=$9, marks_numbers=$10, handling_instructions=$11,
                  sort_order=$12, updated_at=NOW() WHERE id=$1`, [s.id, ...vals, order++])
      } else {
        await client.query(
          `INSERT INTO pu_shipments (tenant_id, container_id, house_bill_number, job_reference, weight_kg, volume_cbm,
                  package_count, consignee, consignor, goods_description, marks_numbers, handling_instructions, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [tenantId, c.id, ...vals, order++])
      }
    }
    const drop = [...existingIds].filter(id => !keepIds.has(id as string))
    if (drop.length) await client.query(`DELETE FROM pu_shipments WHERE id = ANY($1::uuid[])`, [drop])
    await logActivity(client, req, tenantId, c.request_id, c.id, 'shipments_saved', { count: list.length })
    await client.query('COMMIT')
    const out = await pool.query(`SELECT * FROM pu_shipments WHERE container_id = $1 ORDER BY sort_order`, [c.id])
    return ok(res, out.rows.map(fixNumbers))
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return serverError(res, 'PUT shipments', err)
  } finally { client.release() }
})

// POST /api/packing-unpacking/containers/:id/confirm-manifest
//   import: the manual validation checkpoint — everything reconciled, then New Request → Manifested
//   export: validates the keyed-in data, pushes it to ICS, then New Request → Manifested
router.post('/containers/:id/confirm-manifest', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const client = await pool.connect()
  try {
    const tenantId = tenantOf(req)
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT c.*, r.request_ref, r.status AS request_status, r.related_services, r.customer_name
         FROM pu_containers c JOIN pu_requests r ON r.id = c.request_id
        WHERE c.id = $1 AND c.tenant_id = $2 FOR UPDATE OF c`, [req.params.id, tenantId])
    const c = rows[0]
    if (!c) { await client.query('ROLLBACK'); return fail(res, 404, 'Container not found') }
    if (c.status !== 'new_request') { await client.query('ROLLBACK'); return fail(res, 409, 'This container has already been confirmed') }
    if (c.request_status !== 'accepted') { await client.query('ROLLBACK'); return fail(res, 409, 'Accept the request before confirming it') }

    const settings = await getSettings(tenantId, c.direction, client)
    const ships = await client.query(`SELECT * FROM pu_shipments WHERE container_id = $1 ORDER BY sort_order, created_at`, [c.id])
    let shipments = ships.rows

    if (c.direction === 'import') {
      const comps = shipments.map(s => ({ s, cmp: compareShipment(s.manifest, s.ics, s.field_sources, settings.numeric_tolerance_pct) }))
      const unresolved = comps.reduce((n, x) => n + x.cmp.unresolvedCount, 0)
      if (settings.require_resolution && unresolved > 0) {
        await client.query('ROLLBACK')
        return fail(res, 422, `${unresolved} mismatch${unresolved === 1 ? '' : 'es'} still need a decision before the manifest can be confirmed`, { code: 'unresolved_mismatches', unresolved })
      }
      const kept = comps.filter(x => x.cmp.inclusion !== 'exclude')
      if (kept.length === 0) { await client.query('ROLLBACK'); return fail(res, 422, 'There are no shipments left on this container', { code: 'no_shipments' }) }
      const overall = overallMatchPct(kept.map(x => x.cmp)) ?? 0
      if (overall < settings.min_match_pct) {
        await client.query('ROLLBACK')
        return fail(res, 422, `Overall match is ${overall}% — at least ${settings.min_match_pct}% is required to confirm`, { code: 'below_threshold', overall, required: settings.min_match_pct })
      }
      // Lock the resolved values into the working columns and drop excluded shipments.
      for (const { s, cmp } of comps) {
        if (cmp.inclusion === 'exclude') { await client.query(`DELETE FROM pu_shipments WHERE id = $1`, [s.id]); continue }
        const vals = SHIPMENT_FIELDS.map(f => resolvedFieldValue(s.manifest, s.ics, f, s.field_sources))
        await client.query(
          `UPDATE pu_shipments SET ${SHIPMENT_FIELDS.map((f, i) => `${f} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
          [s.id, ...vals])
      }
      await client.query(`UPDATE pu_containers SET match_pct = $2 WHERE id = $1`, [c.id, overall])
    } else {
      const errors: Array<{ field: string; message: string }> = []
      for (const [f, label] of [['vessel', 'Vessel'], ['voyage', 'Voyage'], ['load_port', 'Load port'], ['discharge_port', 'Discharge port']] as const) {
        if (isEmpty(c[f])) errors.push({ field: f, message: `${label} is required` })
      }
      if (!c.etd) errors.push({ field: 'etd', message: 'ETD is required' })
      if (shipments.length === 0) errors.push({ field: 'shipments', message: 'Add at least one shipment' })
      for (const s of shipments) {
        if (Number(s.package_count ?? 0) <= 0 && Number(s.weight_kg ?? 0) <= 0) {
          errors.push({ field: `shipment:${s.id}`, message: `${s.house_bill_number}: enter a package count or weight` })
        }
      }
      if (errors.length) { await client.query('ROLLBACK'); return fail(res, 422, 'Some details are missing', { code: 'validation', errors }) }

      let push
      try {
        push = await pushToIcs({
          requestRef: c.request_ref, containerNumber: c.container_number,
          relatedServices: c.related_services ?? [], shipments,
        })
      } catch (err) {
        await client.query('ROLLBACK')
        console.error('[cfs confirm-manifest] ICS push failed', err)
        return fail(res, 502, 'Could not submit to ICS — nothing was changed. Try again shortly.', { code: 'ics_push_failed' })
      }
      await client.query(
        `UPDATE pu_containers SET ics_push_status = $2, ics_push_ref = $3, ics_pushed_at = NOW() WHERE id = $1`,
        [c.id, push.status, push.ref])
    }

    await client.query(
      `UPDATE pu_containers SET status = 'manifested', manifest_confirmed_at = NOW(), manifest_confirmed_by = $2, updated_at = NOW() WHERE id = $1`,
      [c.id, req.user!.id])
    await logActivity(client, req, tenantId, c.request_id, c.id, 'manifest_confirmed', { direction: c.direction })
    await client.query('COMMIT')
    notify(`${c.container_number} manifested`, `${c.request_ref} · ${c.customer_name} is ready to plan`, c.id)
    return ok(res, await loadCard(c.id, tenantId))
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return serverError(res, 'POST confirm-manifest', err)
  } finally { client.release() }
})

// ══════════════════════════════════════════════════════════════════════════════
// STAGE 2 → 3 : planning
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/packing-unpacking/containers/:id/plan { locationId, teamId?, plannedDate, startTime, endTime, force? }
// Assigns (or re-assigns) a draft plan. Does not notify the tablet — that's Confirm Plan.
router.post('/containers/:id/plan', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const { locationId, plannedDate, startTime, endTime, force } = req.body ?? {}
  let { teamId } = req.body ?? {}
  if (!isUuid(locationId)) return fail(res, 400, 'Choose a location')
  if (!isIsoDate(plannedDate)) return fail(res, 400, 'Choose a date')
  if (!isTime(startTime) || !isTime(endTime)) return fail(res, 400, 'Choose a start and end time')
  if (String(startTime).slice(0, 5) >= String(endTime).slice(0, 5)) return fail(res, 400, 'End time must be after the start time')
  try {
    const tenantId = tenantOf(req)
    const c = await loadCard(req.params.id, tenantId)
    if (!c) return fail(res, 404, 'Container not found')
    if (!['manifested', 'planned'].includes(c.status)) return fail(res, 409, 'Only a manifested container can be planned')
    if (c.plan_confirmed_at) return fail(res, 409, 'This plan has been sent to the tablet — recall it before changing it')

    const loc = await pool.query(`SELECT * FROM pu_locations WHERE id = $1 AND tenant_id = $2 AND active`, [locationId, tenantId])
    if (!loc.rows[0]) return fail(res, 400, 'That location is not available')
    if (!isUuid(teamId)) teamId = (await getSettings(tenantId, c.direction)).default_team_id
    if (!teamId) return fail(res, 400, 'Choose a team (or set a default team in Settings)')
    const team = await pool.query(
      `SELECT * FROM pu_teams WHERE id = $1 AND tenant_id = $2 AND active AND direction IN ($3, 'both')`, [teamId, tenantId, c.direction])
    if (!team.rows[0]) return fail(res, 400, 'That team is not available for this job type')

    // Capacity: other jobs already planned at that location on that day (any direction).
    const { rows: used } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM pu_containers
        WHERE tenant_id = $1 AND location_id = $2 AND planned_date = $3 AND id <> $4 AND status IN ('planned','result_validation')`,
      [tenantId, locationId, plannedDate, c.id])
    const cap = Number(loc.rows[0].capacity_per_day)
    if (used[0].n >= cap && force !== true) {
      return fail(res, 409, `${loc.rows[0].name} already has ${used[0].n} of ${cap} jobs on ${plannedDate}`,
        { code: 'capacity_exceeded', used: used[0].n, capacity: cap })
    }

    await pool.query(
      `UPDATE pu_containers SET location_id=$2, team_id=$3, planned_date=$4, planned_start=$5, planned_end=$6,
              status='planned', updated_at=NOW() WHERE id=$1`,
      [c.id, locationId, teamId, plannedDate, startTime, endTime])
    await logActivity(pool, req, tenantId, c.request_id, c.id, 'plan_assigned',
      { location: loc.rows[0].name, team: team.rows[0].name, date: plannedDate, start: startTime, end: endTime })
    return ok(res, await loadCard(c.id, tenantId))
  } catch (err) { return serverError(res, 'POST plan', err) }
})

// POST /api/packing-unpacking/containers/:id/unplan — draft plan back to Manifested
router.post('/containers/:id/unplan', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  try {
    const tenantId = tenantOf(req)
    const { rows } = await pool.query(
      `UPDATE pu_containers SET status='manifested', location_id=NULL, team_id=NULL, planned_date=NULL,
              planned_start=NULL, planned_end=NULL, updated_at=NOW()
        WHERE id=$1 AND tenant_id=$2 AND status='planned' AND plan_confirmed_at IS NULL RETURNING id, request_id`,
      [req.params.id, tenantId])
    if (!rows[0]) return fail(res, 409, 'Only an unconfirmed plan can be removed')
    await logActivity(pool, req, tenantId, rows[0].request_id, rows[0].id, 'plan_removed')
    return ok(res, await loadCard(rows[0].id, tenantId))
  } catch (err) { return serverError(res, 'POST unplan', err) }
})

/** Everything the execution tablet (and the printed info sheet) needs for a job. */
async function buildJobSheet(containerId: string, tenantId: string) {
  const c = await loadCard(containerId, tenantId)
  if (!c) return null
  const [ships, photos, notes] = await Promise.all([
    pool.query(`SELECT * FROM pu_shipments WHERE container_id = $1 ORDER BY sort_order, created_at`, [containerId]),
    pool.query(`SELECT id, source, storage_path, file_name FROM pu_photos WHERE container_id = $1 OR (request_id = $2 AND container_id IS NULL)`, [containerId, c.request_id]),
    pool.query(`SELECT body, author_name, created_at FROM pu_notes WHERE container_id = $1 ORDER BY created_at`, [containerId]),
  ])
  return {
    job_type: c.direction === 'import' ? 'unpacking' : 'packing',
    request_ref: c.request_ref,
    container: {
      id: c.id, container_number: c.container_number, seal_number: c.seal_number, container_type: c.container_type,
      vessel: c.vessel, voyage: c.voyage, lloyds_number: c.lloyds_number, load_port: c.load_port,
      discharge_port: c.discharge_port, eta: c.eta, etd: c.etd,
      net_weight_kg: c.net_weight_kg, volume_cbm: c.volume_cbm, package_count: c.package_count,
      inspection_status: c.inspection_status, fumigation_status: c.fumigation_status,
    },
    customer: { name: c.customer_name, email: c.customer_email },
    plan: { location: c.location_name, team: c.team_name, date: c.planned_date, start: c.planned_start, end: c.planned_end },
    related_services: c.related_services ?? [],
    shipments: ships.rows.map(fixNumbers).map(s => ({
      id: s.id, house_bill_number: s.house_bill_number, job_reference: s.job_reference, weight_kg: s.weight_kg,
      volume_cbm: s.volume_cbm, package_count: s.package_count, consignee: s.consignee, consignor: s.consignor,
      goods_description: s.goods_description, marks_numbers: s.marks_numbers, handling_instructions: s.handling_instructions,
    })),
    photos: photos.rows,
    notes: notes.rows,
  }
}

// POST /api/packing-unpacking/containers/:id/confirm-plan — locks the plan and pushes the job to the tablet module
router.post('/containers/:id/confirm-plan', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  try {
    const tenantId = tenantOf(req)
    const c = await loadCard(req.params.id, tenantId)
    if (!c) return fail(res, 404, 'Container not found')
    if (c.status !== 'planned') return fail(res, 409, 'Plan the container first')
    if (c.plan_confirmed_at) return fail(res, 409, 'This plan is already confirmed')
    if (!c.location_id || !c.team_id || !c.planned_date || !c.planned_start || !c.planned_end) return fail(res, 422, 'The plan is incomplete')

    const sheet = await buildJobSheet(c.id, tenantId)
    // PHASE 2: the Unpacking/Packing tablet app reads this snapshot. Until it exists the
    // payload is stored on the container and shown in the printed information sheet.
    await pool.query(
      `UPDATE pu_containers SET plan_confirmed_at=NOW(), plan_confirmed_by=$2, tablet_pushed_at=NOW(), tablet_payload=$3, updated_at=NOW() WHERE id=$1`,
      [c.id, req.user!.id, JSON.stringify(sheet)])
    await logActivity(pool, req, tenantId, c.request_id, c.id, 'plan_confirmed', { team: c.team_name, location: c.location_name, date: c.planned_date })
    notify(`${c.container_number} plan confirmed`, `${c.team_name} · ${c.location_name} · ${c.planned_date}`, c.id)
    return ok(res, await loadCard(c.id, tenantId))
  } catch (err) { return serverError(res, 'POST confirm-plan', err) }
})

// POST /api/packing-unpacking/containers/:id/recall-plan — pull a confirmed plan back (only if no result has come in)
router.post('/containers/:id/recall-plan', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  try {
    const tenantId = tenantOf(req)
    const { rows } = await pool.query(
      `UPDATE pu_containers SET plan_confirmed_at=NULL, plan_confirmed_by=NULL, tablet_pushed_at=NULL, tablet_payload=NULL, updated_at=NOW()
        WHERE id=$1 AND tenant_id=$2 AND status='planned' AND plan_confirmed_at IS NOT NULL RETURNING id, request_id`,
      [req.params.id, tenantId])
    if (!rows[0]) return fail(res, 409, 'Only a confirmed plan that has not been executed can be recalled')
    await logActivity(pool, req, tenantId, rows[0].request_id, rows[0].id, 'plan_recalled')
    return ok(res, await loadCard(rows[0].id, tenantId))
  } catch (err) { return serverError(res, 'POST recall-plan', err) }
})

// GET /api/packing-unpacking/containers/:id/info-sheet — data for the printable information sheet
router.get('/containers/:id/info-sheet', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  try {
    const sheet = await buildJobSheet(req.params.id, tenantOf(req))
    if (!sheet) return fail(res, 404, 'Container not found')
    if (!sheet.plan.date) return fail(res, 409, 'Plan the container before printing its information sheet')
    return ok(res, sheet)
  } catch (err) { return serverError(res, 'GET info-sheet', err) }
})

// GET /api/packing-unpacking/plan-board?direction=&from=YYYY-MM-DD&days=7 — graphical planning data
router.get('/plan-board', staffOnly, async (req: Request, res: Response) => {
  const from = isIsoDate(req.query.from) ? req.query.from : today()
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? '7'), 10) || 7, 1), 31)
  try {
    const tenantId = tenantOf(req)
    const to = new Date(from + 'T00:00:00Z'); to.setUTCDate(to.getUTCDate() + days - 1)
    const toStr = to.toISOString().slice(0, 10)
    const [locs, jobs] = await Promise.all([
      pool.query(`SELECT * FROM pu_locations WHERE tenant_id = $1 AND active ORDER BY kind, name`, [tenantId]),
      pool.query(
        `${CARD_SELECT} WHERE c.tenant_id = $1 AND c.planned_date BETWEEN $2 AND $3 AND c.status IN ('planned','result_validation','completed')
         ORDER BY c.planned_date, c.planned_start`, [tenantId, from, toStr]),
    ])
    const dayList: string[] = []
    for (let i = 0; i < days; i++) { const d = new Date(from + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i); dayList.push(d.toISOString().slice(0, 10)) }
    return ok(res, { from, to: toStr, days: dayList, locations: locs.rows.map(fixNumbers), jobs: jobs.rows.map(fixNumbers) })
  } catch (err) { return serverError(res, 'GET plan-board', err) }
})

// ══════════════════════════════════════════════════════════════════════════════
// STAGE 3 → 4 → 5 : execution result, validation, completion
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/packing-unpacking/containers/:id/tablet-result — the tablet app (Phase 2) posts execution output here.
router.post('/containers/:id/tablet-result', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const list: any[] = Array.isArray(req.body?.shipments) ? req.body.shipments : []
  const client = await pool.connect()
  try {
    const tenantId = tenantOf(req)
    await client.query('BEGIN')
    const { rows } = await client.query(`SELECT * FROM pu_containers WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [req.params.id, tenantId])
    const c = rows[0]
    if (!c) { await client.query('ROLLBACK'); return fail(res, 404, 'Container not found') }
    if (c.status !== 'planned' || !c.plan_confirmed_at) {
      await client.query('ROLLBACK'); return fail(res, 409, 'Results can only be submitted for a confirmed plan')
    }
    const ships = await client.query(`SELECT id FROM pu_shipments WHERE container_id = $1`, [c.id])
    const validIds = new Set(ships.rows.map(s => s.id))
    const cleaned = []
    for (const s of list) {
      if (!validIds.has(s?.shipmentId)) { await client.query('ROLLBACK'); return fail(res, 400, 'Result refers to a shipment that is not on this container') }
      for (const k of ['actualWeightKg', 'actualVolumeCbm', 'actualPackageCount']) {
        if (!isEmpty(s[k]) && (numOrNull(s[k]) === null || (numOrNull(s[k]) as number) < 0)) { await client.query('ROLLBACK'); return fail(res, 400, `${k} must be a positive number`) }
      }
      cleaned.push({
        shipmentId: s.shipmentId, actualWeightKg: numOrNull(s.actualWeightKg), actualVolumeCbm: numOrNull(s.actualVolumeCbm),
        actualPackageCount: numOrNull(s.actualPackageCount), notes: text(s.notes, 1000),
      })
    }
    if (cleaned.length === 0) { await client.query('ROLLBACK'); return fail(res, 400, 'Submit the actual details for at least one shipment') }

    await client.query(
      `INSERT INTO pu_results (tenant_id, container_id, data, submitted_by) VALUES ($1,$2,$3,$4)`,
      [tenantId, c.id, JSON.stringify({ shipments: cleaned, notes: text(req.body?.notes, 2000) }), req.user!.id])
    for (const p of (Array.isArray(req.body?.photos) ? req.body.photos.slice(0, 60) : [])) {
      const path = text(p?.storagePath, 500)
      if (!path) continue
      await client.query(
        `INSERT INTO pu_photos (tenant_id, request_id, container_id, shipment_id, source, storage_path, file_name, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tenantId, c.request_id, c.id, validIds.has(p?.shipmentId) ? p.shipmentId : null,
          req.body?.source === 'staff' ? 'staff' : 'tablet', path, text(p.fileName, 200), req.user!.id])
    }
    await client.query(`UPDATE pu_containers SET status='result_validation', result_submitted_at=NOW(), updated_at=NOW() WHERE id=$1`, [c.id])
    await logActivity(client, req, tenantId, c.request_id, c.id, 'result_submitted', { shipments: cleaned.length })
    await client.query('COMMIT')
    notify(`${c.container_number} result received`, 'Ready for validation', c.id)
    return ok(res, await loadCard(c.id, tenantId), 201)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return serverError(res, 'POST tablet-result', err)
  } finally { client.release() }
})

// POST /api/packing-unpacking/containers/:id/result/approve | /reject
router.post('/containers/:id/result/:decision', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const decision = req.params.decision
  if (decision !== 'approve' && decision !== 'reject') return fail(res, 404, 'Route not found')
  const notes = text(req.body?.notes, 2000)
  if (decision === 'reject' && !notes) return fail(res, 400, 'Say what needs to be redone')
  const client = await pool.connect()
  try {
    const tenantId = tenantOf(req)
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT c.*, r.request_ref, r.customer_name FROM pu_containers c JOIN pu_requests r ON r.id = c.request_id
        WHERE c.id = $1 AND c.tenant_id = $2 FOR UPDATE OF c`, [req.params.id, tenantId])
    const c = rows[0]
    if (!c) { await client.query('ROLLBACK'); return fail(res, 404, 'Container not found') }
    if (c.status !== 'result_validation') { await client.query('ROLLBACK'); return fail(res, 409, 'There is no result waiting for validation') }

    await client.query(
      `UPDATE pu_results SET status = $2, reviewed_by = $3, reviewed_at = NOW(), review_notes = $4
        WHERE id = (SELECT id FROM pu_results WHERE container_id = $1 AND status = 'submitted' ORDER BY submitted_at DESC LIMIT 1)`,
      [c.id, decision === 'approve' ? 'approved' : 'rejected', req.user!.id, notes])

    if (decision === 'approve') {
      await client.query(
        `UPDATE pu_containers SET status='completed', validated_at=NOW(), validated_by=$2, completed_at=NOW(),
                shared_with_customer_at=NOW(), updated_at=NOW() WHERE id=$1`, [c.id, req.user!.id])
      await logActivity(client, req, tenantId, c.request_id, c.id, 'result_approved', { notes })
    } else {
      // Back to the confirmed plan so the job can be re-executed.
      await client.query(`UPDATE pu_containers SET status='planned', result_submitted_at=NULL, updated_at=NOW() WHERE id=$1`, [c.id])
      await logActivity(client, req, tenantId, c.request_id, c.id, 'result_rejected', { notes })
    }
    await client.query('COMMIT')
    if (decision === 'approve') {
      notify(`${c.container_number} ${c.direction === 'import' ? 'unpacked' : 'packed'}`, `${c.request_ref} · ${c.customer_name}`, c.id)
    }
    return ok(res, await loadCard(c.id, tenantId))
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return serverError(res, 'POST result decision', err)
  } finally { client.release() }
})

// POST /api/packing-unpacking/containers/:id/cancel { reason }
router.post('/containers/:id/cancel', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const reason = text(req.body?.reason, 1000)
  if (!reason) return fail(res, 400, 'Give a reason for cancelling')
  try {
    const tenantId = tenantOf(req)
    const { rows } = await pool.query(
      `UPDATE pu_containers SET status='cancelled', updated_at=NOW()
        WHERE id=$1 AND tenant_id=$2 AND status NOT IN ('completed','cancelled') RETURNING id, request_id, container_number`,
      [req.params.id, tenantId])
    if (!rows[0]) return fail(res, 409, 'This container cannot be cancelled')
    await logActivity(pool, req, tenantId, rows[0].request_id, rows[0].id, 'container_cancelled', { reason })
    return ok(res, rows[0])
  } catch (err) { return serverError(res, 'POST cancel', err) }
})

// ══════════════════════════════════════════════════════════════════════════════
// NOTES · PHOTOS · CUSTOMER MESSAGES
// ══════════════════════════════════════════════════════════════════════════════

router.post('/containers/:id/notes', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const body = text(req.body?.body, 4000)
  if (!body) return fail(res, 400, 'Write a note first')
  try {
    const tenantId = tenantOf(req)
    const c = await pool.query(`SELECT id, request_id FROM pu_containers WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId])
    if (!c.rows[0]) return fail(res, 404, 'Container not found')
    const { rows } = await pool.query(
      `INSERT INTO pu_notes (tenant_id, container_id, author_id, author_name, body) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [tenantId, req.params.id, req.user!.id, req.user!.name, body])
    await logActivity(pool, req, tenantId, c.rows[0].request_id, req.params.id, 'note_added')
    return ok(res, rows[0], 201)
  } catch (err) { return serverError(res, 'POST notes', err) }
})

router.delete('/notes/:id', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  try {
    // Authors can delete their own notes; admins can delete any.
    const { rowCount } = await pool.query(
      `DELETE FROM pu_notes WHERE id = $1 AND tenant_id = $2 AND (author_id = $3 OR $4)`,
      [req.params.id, tenantOf(req), req.user!.id, ADMIN_ROLES.includes(req.user!.role)])
    if (!rowCount) return fail(res, 404, 'Note not found')
    return ok(res, { deleted: true })
  } catch (err) { return serverError(res, 'DELETE note', err) }
})

router.post('/containers/:id/photos', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const path = text(req.body?.storagePath, 500)
  if (!path) return fail(res, 400, 'storagePath is required')
  try {
    const tenantId = tenantOf(req)
    const c = await pool.query(`SELECT id, request_id FROM pu_containers WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId])
    if (!c.rows[0]) return fail(res, 404, 'Container not found')
    let shipmentId: string | null = null
    if (isUuid(req.body?.shipmentId)) {
      const s = await pool.query(`SELECT id FROM pu_shipments WHERE id = $1 AND container_id = $2`, [req.body.shipmentId, req.params.id])
      shipmentId = s.rows[0]?.id ?? null
    }
    const { rows } = await pool.query(
      `INSERT INTO pu_photos (tenant_id, request_id, container_id, shipment_id, source, storage_path, file_name, caption, uploaded_by)
       VALUES ($1,$2,$3,$4,'staff',$5,$6,$7,$8) RETURNING *`,
      [tenantId, c.rows[0].request_id, req.params.id, shipmentId, path, text(req.body?.fileName, 200), text(req.body?.caption, 300), req.user!.id])
    return ok(res, rows[0], 201)
  } catch (err) { return serverError(res, 'POST photos', err) }
})

router.delete('/photos/:id', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  try {
    const { rowCount } = await pool.query(`DELETE FROM pu_photos WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantOf(req)])
    if (!rowCount) return fail(res, 404, 'Photo not found')
    return ok(res, { deleted: true })
  } catch (err) { return serverError(res, 'DELETE photo', err) }
})

// POST /api/packing-unpacking/containers/:id/messages — message the customer about a container or one shipment
router.post('/containers/:id/messages', staffOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const body = text(req.body?.body, 4000)
  if (!body) return fail(res, 400, 'Write a message first')
  try {
    const tenantId = tenantOf(req)
    const c = await loadCard(req.params.id, tenantId)
    if (!c) return fail(res, 404, 'Container not found')
    let shipmentId: string | null = null
    if (isUuid(req.body?.shipmentId)) {
      const s = await pool.query(`SELECT id FROM pu_shipments WHERE id = $1 AND container_id = $2`, [req.body.shipmentId, c.id])
      shipmentId = s.rows[0]?.id ?? null
    }
    const { rows } = await pool.query(
      `INSERT INTO pu_messages (tenant_id, request_id, container_id, shipment_id, sent_by, sent_by_name, recipient_email, subject, body)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [tenantId, c.request_id, c.id, shipmentId, req.user!.id, req.user!.name, c.customer_email,
        text(req.body?.subject, 200) ?? `About ${c.container_number}`, body])
    await logActivity(pool, req, tenantId, c.request_id, c.id, 'customer_messaged', { shipmentId })
    // EMAIL IS STUBBED (see lib/notifications.ts) — the message is saved and the customer
    // sees it under My Requests; wire SMTP in here to also email c.customer_email.
    return ok(res, { ...rows[0], email_sent: false }, 201)
  } catch (err) { return serverError(res, 'POST messages', err) }
})

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS · LOCATIONS · TEAMS
// ══════════════════════════════════════════════════════════════════════════════

router.get('/settings', staffOnly, async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req)
    const [imp, exp, locs, teams] = await Promise.all([
      getSettings(tenantId, 'import'), getSettings(tenantId, 'export'),
      pool.query(`SELECT * FROM pu_locations WHERE tenant_id = $1 ORDER BY active DESC, kind, name`, [tenantId]),
      pool.query(`SELECT * FROM pu_teams WHERE tenant_id = $1 ORDER BY active DESC, name`, [tenantId]),
    ])
    return ok(res, { import: imp, export: exp, locations: locs.rows.map(fixNumbers), teams: teams.rows })
  } catch (err) { return serverError(res, 'GET settings', err) }
})

const emailList = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  if (!s) return ''
  const parts = s.split(/[,;\s]+/).filter(Boolean)
  return parts.every(p => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p)) ? parts.join(', ') : null
}

router.put('/settings/:direction', adminOnly, async (req: Request, res: Response) => {
  if (!isDirection(req.params.direction)) return fail(res, 400, 'Invalid direction')
  const b = req.body ?? {}
  const notif = emailList(b.notification_emails ?? '')
  const rep = emailList(b.report_emails ?? '')
  if (notif === null || rep === null) return fail(res, 400, 'Email lists must be valid addresses separated by commas')
  const minMatch = numOrNull(b.min_match_pct ?? 0)
  const tol = numOrNull(b.numeric_tolerance_pct ?? 1)
  if (minMatch === null || minMatch < 0 || minMatch > 100) return fail(res, 400, 'Minimum match must be between 0 and 100')
  if (tol === null || tol < 0 || tol > 20) return fail(res, 400, 'Numeric tolerance must be between 0 and 20')
  try {
    const tenantId = tenantOf(req)
    let teamId: string | null = null
    if (b.default_team_id) {
      if (!isUuid(b.default_team_id)) return fail(res, 400, 'Invalid team')
      const t = await pool.query(`SELECT id FROM pu_teams WHERE id = $1 AND tenant_id = $2 AND direction IN ($3,'both')`, [b.default_team_id, tenantId, req.params.direction])
      if (!t.rows[0]) return fail(res, 400, 'That team cannot be used for this job type')
      teamId = t.rows[0].id
    }
    await pool.query(
      `INSERT INTO pu_settings (tenant_id, direction, default_team_id, notification_emails, report_emails, require_resolution, min_match_pct, numeric_tolerance_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tenant_id, direction) DO UPDATE SET default_team_id=$3, notification_emails=$4, report_emails=$5,
         require_resolution=$6, min_match_pct=$7, numeric_tolerance_pct=$8, updated_at=NOW()`,
      [tenantId, req.params.direction, teamId, notif, rep, b.require_resolution !== false, minMatch, tol])
    return ok(res, await getSettings(tenantId, req.params.direction))
  } catch (err) { return serverError(res, 'PUT settings', err) }
})

router.post('/locations', adminOnly, async (req: Request, res: Response) => {
  const name = text(req.body?.name, 100)
  if (!name) return fail(res, 400, 'Name is required')
  const kind = req.body?.kind === 'yard' ? 'yard' : 'warehouse'
  const cap = numOrNull(req.body?.capacity_per_day ?? 6)
  if (cap === null || !Number.isInteger(cap) || cap < 1 || cap > 500) return fail(res, 400, 'Capacity must be a whole number from 1 to 500')
  try {
    const { rows } = await pool.query(
      `INSERT INTO pu_locations (tenant_id, name, kind, capacity_per_day) VALUES ($1,$2,$3,$4) RETURNING *`,
      [tenantOf(req), name, kind, cap])
    return ok(res, fixNumbers(rows[0]), 201)
  } catch (err) { return serverError(res, 'POST locations', err) }
})

router.patch('/locations/:id', adminOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const b = req.body ?? {}
  const sets: string[] = []; const vals: unknown[] = []
  if ('name' in b) { const n = text(b.name, 100); if (!n) return fail(res, 400, 'Name is required'); vals.push(n); sets.push(`name = $${vals.length}`) }
  if ('kind' in b) { vals.push(b.kind === 'yard' ? 'yard' : 'warehouse'); sets.push(`kind = $${vals.length}`) }
  if ('capacity_per_day' in b) {
    const cap = numOrNull(b.capacity_per_day)
    if (cap === null || !Number.isInteger(cap) || cap < 1 || cap > 500) return fail(res, 400, 'Capacity must be a whole number from 1 to 500')
    vals.push(cap); sets.push(`capacity_per_day = $${vals.length}`)
  }
  if ('active' in b) { vals.push(b.active !== false); sets.push(`active = $${vals.length}`) }
  if (!sets.length) return fail(res, 400, 'Nothing to update')
  try {
    vals.push(req.params.id, tenantOf(req))
    const { rows } = await pool.query(`UPDATE pu_locations SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND tenant_id = $${vals.length} RETURNING *`, vals)
    if (!rows[0]) return fail(res, 404, 'Location not found')
    return ok(res, fixNumbers(rows[0]))
  } catch (err) { return serverError(res, 'PATCH location', err) }
})

router.post('/teams', adminOnly, async (req: Request, res: Response) => {
  const name = text(req.body?.name, 100)
  if (!name) return fail(res, 400, 'Name is required')
  const direction = ['import', 'export', 'both'].includes(req.body?.direction) ? req.body.direction : 'both'
  try {
    const { rows } = await pool.query(`INSERT INTO pu_teams (tenant_id, name, direction) VALUES ($1,$2,$3) RETURNING *`, [tenantOf(req), name, direction])
    return ok(res, rows[0], 201)
  } catch (err) { return serverError(res, 'POST teams', err) }
})

router.patch('/teams/:id', adminOnly, async (req: Request, res: Response) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Invalid id')
  const b = req.body ?? {}
  const sets: string[] = []; const vals: unknown[] = []
  if ('name' in b) { const n = text(b.name, 100); if (!n) return fail(res, 400, 'Name is required'); vals.push(n); sets.push(`name = $${vals.length}`) }
  if ('direction' in b) {
    if (!['import', 'export', 'both'].includes(b.direction)) return fail(res, 400, 'Invalid direction')
    vals.push(b.direction); sets.push(`direction = $${vals.length}`)
  }
  if ('active' in b) { vals.push(b.active !== false); sets.push(`active = $${vals.length}`) }
  if (!sets.length) return fail(res, 400, 'Nothing to update')
  try {
    vals.push(req.params.id, tenantOf(req))
    const { rows } = await pool.query(`UPDATE pu_teams SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND tenant_id = $${vals.length} RETURNING *`, vals)
    if (!rows[0]) return fail(res, 404, 'Team not found')
    return ok(res, rows[0])
  } catch (err) { return serverError(res, 'PATCH team', err) }
})

export default router
