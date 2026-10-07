/**
 * Packing & Unpacking module — API client, types and shared constants.
 *
 * Talks to /api/packing-unpacking (backend/src/routes/packing-unpacking.ts). Uses plain fetch (not the
 * app's apiClient/rawFetcher, which throw away the error body) so a failed call keeps the
 * server's error code + per-field `errors`, which the screens use to show exactly what
 * blocks a step.
 */

import { rawFetcher } from './fetcher'
import { getToken, API_BASE } from './api-client'

export type Direction = 'import' | 'export'
export type Stage = 'new_request' | 'manifested' | 'planned' | 'result_validation' | 'completed'

// ── URL ⇄ domain mapping ─────────────────────────────────────────────────────

export type Mode = 'unpacking' | 'packing'
export const MODE_TO_DIRECTION: Record<Mode, Direction> = { unpacking: 'import', packing: 'export' }
export const DIRECTION_TO_MODE: Record<Direction, Mode> = { import: 'unpacking', export: 'packing' }
export const isMode = (v: unknown): v is Mode => v === 'unpacking' || v === 'packing'

export type StageSlug = 'new' | 'manifested' | 'planned' | 'validation' | 'done'
export const SLUG_TO_STAGE: Record<StageSlug, Stage> = {
  new: 'new_request', manifested: 'manifested', planned: 'planned', validation: 'result_validation', done: 'completed',
}
export const STAGE_TO_SLUG: Record<Stage, StageSlug> = {
  new_request: 'new', manifested: 'manifested', planned: 'planned', result_validation: 'validation', completed: 'done',
}
export const isStageSlug = (v: unknown): v is StageSlug => typeof v === 'string' && v in SLUG_TO_STAGE
export const STAGE_ORDER: Stage[] = ['new_request', 'manifested', 'planned', 'result_validation', 'completed']

export function stageLabel(stage: Stage, direction: Direction): string {
  switch (stage) {
    case 'new_request':       return 'New Request'
    case 'manifested':        return 'Manifested'
    case 'planned':           return 'Planned'
    case 'result_validation': return 'Result Validation'
    case 'completed':         return direction === 'import' ? 'Unpacked' : 'Packed'
  }
}

export const jobNoun = (d: Direction) => (d === 'import' ? 'Unpacking' : 'Packing')

export const containerPath = (d: Direction, id: string) => `/packing-unpacking/${DIRECTION_TO_MODE[d]}/containers/${id}`
export const stagePath = (d: Direction, s: Stage) => `/packing-unpacking/${DIRECTION_TO_MODE[d]}/${STAGE_TO_SLUG[s]}`

// ── Types (mirror the API's snake_case rows) ─────────────────────────────────

export type InspectionStatus = 'not_required' | 'pending' | 'passed' | 'failed'
export type FumigationStatus = 'not_required' | 'pending' | 'completed' | 'failed'

export interface CfsContainer {
  id: string
  request_id: string
  direction: Direction
  container_number: string
  seal_number: string | null
  container_type: string | null
  net_weight_kg: number | null
  volume_cbm: number | null
  package_count: number | null
  vessel: string | null
  voyage: string | null
  lloyds_number: string | null
  load_port: string | null
  discharge_port: string | null
  eta: string | null
  etd: string | null
  status: Stage | 'cancelled'
  inspection_status: InspectionStatus
  fumigation_status: FumigationStatus
  match_pct: number | null
  manifest_confirmed_at: string | null
  ics_push_status: string | null
  ics_push_ref: string | null
  location_id: string | null
  team_id: string | null
  planned_date: string | null
  planned_start: string | null
  planned_end: string | null
  plan_confirmed_at: string | null
  tablet_pushed_at: string | null
  tablet_payload: unknown
  result_submitted_at: string | null
  completed_at: string | null
  shared_with_customer_at: string | null
  // joined
  request_ref: string
  request_status: 'submitted' | 'accepted' | 'declined' | 'cancelled'
  customer_name: string
  customer_email: string | null
  customer_logo_url: string | null
  related_services: string[]
  sort_date: string | null
  slot_date: string | null
  gate_in_at: string | null
  shipment_count: number
  photo_count: number
  note_count: number
  location_name: string | null
  team_name: string | null
}

export type FieldStatus = 'match' | 'near' | 'mismatch' | 'missing'

export interface FieldComparison {
  key: string
  label: string
  type: 'text' | 'number'
  manifest: string | number | null
  ics: string | number | null
  status: FieldStatus
  score: number
  needsResolution: boolean
  chosen: 'manifest' | 'ics' | null
}

export interface ShipmentComparison {
  pairState: 'paired' | 'manifest_only' | 'ics_only'
  fields: FieldComparison[]
  matchPct: number
  needsInclusionDecision: boolean
  inclusion: 'include' | 'exclude' | null
  unresolvedCount: number
  resolved: boolean
}

export interface CfsShipment {
  id: string
  container_id: string
  house_bill_number: string
  job_reference: string | null
  weight_kg: number | null
  volume_cbm: number | null
  package_count: number | null
  consignee: string | null
  consignor: string | null
  goods_description: string | null
  marks_numbers: string | null
  handling_instructions: string | null
  match_pct: number | null
  comparison: ShipmentComparison | null
}

export interface CfsPhoto { id: string; source: 'customer' | 'tablet' | 'staff'; storage_path: string; file_name: string | null; caption: string | null; shipment_id: string | null; created_at: string }
export interface CfsNote { id: string; author_id: string | null; author_name: string | null; body: string; created_at: string }
export interface CfsMessage { id: string; subject: string | null; body: string; sent_by_name: string | null; recipient_email: string | null; shipment_id: string | null; created_at: string }
export interface CfsActivity { id: string; actor_name: string | null; action: string; detail: Record<string, unknown>; created_at: string }
export interface CfsResult {
  id: string
  status: 'submitted' | 'approved' | 'rejected'
  data: { shipments: Array<{ shipmentId: string; actualWeightKg: number | null; actualVolumeCbm: number | null; actualPackageCount: number | null; notes: string | null }>; notes: string | null }
  submitted_at: string
  reviewed_at: string | null
  review_notes: string | null
}

export interface CfsSettings {
  direction: Direction
  default_team_id: string | null
  notification_emails: string
  report_emails: string
  require_resolution: boolean
  min_match_pct: number
  numeric_tolerance_pct: number
}
export interface CfsLocation { id: string; name: string; kind: 'warehouse' | 'yard'; capacity_per_day: number; active: boolean }
export interface CfsTeam { id: string; name: string; direction: Direction | 'both'; active: boolean }

export interface ContainerDetail {
  container: CfsContainer
  shipments: CfsShipment[]
  photos: CfsPhoto[]
  notes: CfsNote[]
  messages: CfsMessage[]
  activity: CfsActivity[]
  results: CfsResult[]
  settings: CfsSettings
  compare_fields: Array<{ key: string; label: string; type: 'text' | 'number' }>
  match: { overall_pct: number | null; unresolved: number; can_confirm: boolean }
}

export interface StageSummary {
  new_request: { awaiting_acceptance: number; accepted: number; total: number }
  manifested: number
  planned: { draft: number; confirmed: number; total: number }
  result_validation: number
  completed: number
}

export interface PlanBoardData {
  from: string
  to: string
  days: string[]
  locations: CfsLocation[]
  jobs: CfsContainer[]
}

export interface JobSheet {
  job_type: 'unpacking' | 'packing'
  request_ref: string
  container: Record<string, string | number | null>
  customer: { name: string; email: string | null }
  plan: { location: string | null; team: string | null; date: string | null; start: string | null; end: string | null }
  related_services: string[]
  shipments: Array<Record<string, string | number | null>>
  notes: Array<{ body: string; author_name: string | null; created_at: string }>
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

export class CfsApiError extends Error {
  status: number
  code?: string
  details: Record<string, any>
  constructor(message: string, status: number, details: Record<string, any> = {}) {
    super(message)
    this.status = status
    this.code = details.code
    this.details = details
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/packing-unpacking${path}`, {
      method, headers, cache: 'no-store',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new CfsApiError('Could not reach the server. Check your connection and try again.', 0)
  }
  let json: any = null
  try { json = await res.json() } catch { /* non-JSON error body */ }
  if (res.status === 401) throw new CfsApiError('Your session has expired. Please sign in again.', 401, { code: 'unauthorized' })
  if (!res.ok || !json?.success) {
    const err = json?.error ?? {}
    throw new CfsApiError(err.message || `Request failed (${res.status})`, res.status, err)
  }
  return json.data as T
}

const qs = (o: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export interface NewContainerInput {
  containerNumber: string
  sealNumber?: string
  containerType?: string
  vessel?: string
  voyage?: string
  lloydsNumber?: string
  loadPort?: string
  dischargePort?: string
  eta?: string
  etd?: string
  netWeightKg?: number | null
  volumeCbm?: number | null
  packageCount?: number | null
  shipments?: Array<{ houseBillNumber: string; consignee?: string; consignor?: string; goodsDescription?: string; packageCount?: number | null; weightKg?: number | null; volumeCbm?: number | null }>
}

export interface NewRequestInput {
  direction: Direction
  customer?: { name?: string; email?: string; phone?: string }
  relatedServices?: string[]
  notes?: string
  photos?: Array<{ storagePath: string; fileName?: string }>
  containers: NewContainerInput[]
}

export interface PlanInput { locationId: string; teamId?: string; plannedDate: string; startTime: string; endTime: string; force?: boolean }

export const cfs = {
  // intake + customer
  createRequest: (b: NewRequestInput) => call<{ request: { id: string; request_ref: string; status: string }; containerIds: string[]; warnings: string[] }>('POST', '/requests', b),
  myRequests: () => call<any[]>('GET', '/my-requests'),
  myRequest: (id: string) => call<any>('GET', `/my-requests/${id}`),

  // lists
  summary: (direction: Direction) => call<StageSummary>('GET', `/summary${qs({ direction })}`),
  list: (p: { direction: Direction; stage: Stage; acceptance?: 'awaiting' | 'accepted'; confirmed?: boolean; q?: string }) =>
    call<CfsContainer[]>('GET', `/containers${qs({ direction: p.direction, stage: p.stage, acceptance: p.acceptance, confirmed: p.confirmed, q: p.q })}`),
  detail: (id: string) => call<ContainerDetail>('GET', `/containers/${id}`),
  planBoard: (from: string, days: number) => call<PlanBoardData>('GET', `/plan-board${qs({ from, days })}`),

  // acceptance
  accept: (requestId: string) => call<unknown>('POST', `/requests/${requestId}/accept`),
  decline: (requestId: string, reason: string) => call<unknown>('POST', `/requests/${requestId}/decline`, { reason }),

  // stage 1 → 2
  editContainer: (id: string, fields: Record<string, unknown>) => call<CfsContainer>('PATCH', `/containers/${id}`, fields),
  setCompliance: (id: string, f: { inspection_status?: InspectionStatus; fumigation_status?: FumigationStatus }) => call<unknown>('PATCH', `/containers/${id}/compliance`, f),
  refreshManifest: (id: string) => call<unknown>('POST', `/containers/${id}/refresh-manifest`),
  resolve: (shipmentId: string, field: string, source: string) => call<unknown>('POST', `/shipments/${shipmentId}/resolve`, { field, source }),
  resolveAll: (id: string, source: 'manifest' | 'ics') => call<{ changed: number }>('POST', `/containers/${id}/resolve-all`, { source }),
  saveShipments: (id: string, shipments: Array<Partial<CfsShipment>>) => call<CfsShipment[]>('PUT', `/containers/${id}/shipments`, { shipments }),
  confirmManifest: (id: string) => call<CfsContainer>('POST', `/containers/${id}/confirm-manifest`),

  // planning
  plan: (id: string, p: PlanInput) => call<CfsContainer>('POST', `/containers/${id}/plan`, p),
  unplan: (id: string) => call<CfsContainer>('POST', `/containers/${id}/unplan`),
  confirmPlan: (id: string) => call<CfsContainer>('POST', `/containers/${id}/confirm-plan`),
  recallPlan: (id: string) => call<CfsContainer>('POST', `/containers/${id}/recall-plan`),
  infoSheet: (id: string) => call<JobSheet>('GET', `/containers/${id}/info-sheet`),

  // execution + validation
  submitResult: (id: string, b: { shipments: Array<{ shipmentId: string; actualWeightKg?: number | null; actualVolumeCbm?: number | null; actualPackageCount?: number | null; notes?: string }>; notes?: string; photos?: Array<{ storagePath: string; fileName?: string; shipmentId?: string }>; source?: 'staff' | 'tablet' }) =>
    call<CfsContainer>('POST', `/containers/${id}/tablet-result`, b),
  approveResult: (id: string, notes?: string) => call<CfsContainer>('POST', `/containers/${id}/result/approve`, { notes }),
  rejectResult: (id: string, notes: string) => call<CfsContainer>('POST', `/containers/${id}/result/reject`, { notes }),
  cancel: (id: string, reason: string) => call<unknown>('POST', `/containers/${id}/cancel`, { reason }),

  // notes / photos / messages
  addNote: (id: string, body: string) => call<CfsNote>('POST', `/containers/${id}/notes`, { body }),
  deleteNote: (noteId: string) => call<unknown>('DELETE', `/notes/${noteId}`),
  addPhoto: (id: string, p: { storagePath: string; fileName?: string; shipmentId?: string }) => call<CfsPhoto>('POST', `/containers/${id}/photos`, p),
  deletePhoto: (photoId: string) => call<unknown>('DELETE', `/photos/${photoId}`),
  message: (id: string, b: { body: string; subject?: string; shipmentId?: string }) => call<CfsMessage>('POST', `/containers/${id}/messages`, b),

  // settings
  settings: () => call<{ import: CfsSettings; export: CfsSettings; locations: CfsLocation[]; teams: CfsTeam[] }>('GET', '/settings'),
  saveSettings: (d: Direction, s: Partial<CfsSettings>) => call<CfsSettings>('PUT', `/settings/${d}`, s),
  addLocation: (l: Partial<CfsLocation>) => call<CfsLocation>('POST', '/locations', l),
  editLocation: (id: string, l: Partial<CfsLocation>) => call<CfsLocation>('PATCH', `/locations/${id}`, l),
  addTeam: (t: Partial<CfsTeam>) => call<CfsTeam>('POST', '/teams', t),
  editTeam: (id: string, t: Partial<CfsTeam>) => call<CfsTeam>('PATCH', `/teams/${id}`, t),
}

// ── Uploads (reuses the app-wide /api/uploads endpoint) ──────────────────────

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const safeName = (n: string) => n.replace(/[^\x20-\x7E]/g, '_').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_')

/** Uploads a file and returns its storage path (what the API stores as storage_path). */
export async function uploadCfsFile(file: File, folder: string): Promise<{ storagePath: string; fileName: string }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is larger than 10 MB`)
  const date = new Date().toISOString().slice(0, 10)
  const path = `${date}/${folder}/${Date.now()}-${safeName(file.name)}`
  const fd = new FormData()
  fd.append('file', file)
  fd.append('path', path)
  const res = await rawFetcher('/api/uploads', { method: 'POST', body: fd })
  if (!res || !res.ok) throw new Error(`Could not upload ${file.name}`)
  const json = await res.json().catch(() => null)
  return { storagePath: json?.data?.filename ?? path, fileName: file.name }
}

// ── Display helpers ──────────────────────────────────────────────────────────

export const RELATED_SERVICES: Array<{ key: string; label: string }> = [
  { key: 'lcl_collection',   label: 'LCL collection' },
  { key: 'lcl_delivery_cfs', label: 'LCL delivery to CFS' },
  { key: 'empty_collection', label: 'Empty container collection' },
  { key: 'empty_delivery',   label: 'Empty container delivery' },
  { key: 'pra',              label: 'PRA' },
  { key: 'pre_receival',     label: 'Pre-receival notice' },
  { key: 'storage',          label: 'Storage' },
  { key: 'fcl_delivery',     label: 'FCL delivery to port' },
]
export const serviceLabel = (k: string) => RELATED_SERVICES.find(s => s.key === k)?.label ?? k.replace(/_/g, ' ')

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d.length === 10 ? d + 'T00:00:00' : d)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}
export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
export const fmtTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : '—')
export function fmtNum(n: number | string | null | undefined, dp = 2): string {
  if (n === null || n === undefined || n === '') return '—'
  const v = Number(n)
  return Number.isFinite(v) ? v.toLocaleString('en-AU', { maximumFractionDigits: dp }) : String(n)
}

export function toYMD(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function addDaysYMD(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toYMD(d)
}
