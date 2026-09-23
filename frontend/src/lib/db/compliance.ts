import { fetcher, postFetcher, patchFetcher } from '../fetcher'
import { rawFetcher } from '../fetcher'
import type {
  ComplianceActivity, ComplianceInspection, ComplianceSummary, ComplianceActivityLogItem,
  CompletedActivitiesSummary, InspectionsSummary, ComplianceCapabilities,
  ShipmentType, ComplianceActivityStatus, InspectionStatus, CompliancePriority,
} from '@/data/types'

export const NO_COMPLIANCE_CAPABILITIES: ComplianceCapabilities = {
  can_create_activity: false, can_edit_activity: false, can_cancel_activity: false,
  can_export_report: false,
  can_schedule_inspection: false, can_edit_inspection: false, can_start_inspection: false,
}

// ── Row mapping ───────────────────────────────────────────────────────────────

function rowToActivity(row: any): ComplianceActivity {
  return {
    id: row.id, entryNumber: row.entry_number, title: row.title,
    requestNumber: row.request_number ?? undefined, containerNumber: row.container_number ?? undefined,
    containerType: row.container_type ?? undefined, vesselName: row.vessel_name ?? undefined,
    voyageNumber: row.voyage_number ?? undefined, shipmentType: row.shipment_type,
    status: row.status, collectionDate: row.collection_date ?? undefined,
    description: row.description ?? undefined, category: row.category ?? undefined,
    tags: row.tags ?? [], completedDate: row.completed_date ?? undefined,
    completedBy: row.completed_by ?? null, completedByName: row.completed_by_name ?? null,
    assignedBy: row.assigned_by ?? null, assignedByName: row.assigned_by_name ?? null,
    qualityRating: row.quality_rating ?? null, reportAvailable: !!row.report_available,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function rowToInspection(row: any): ComplianceInspection {
  return {
    id: row.id, inspectionCode: row.inspection_code, title: row.title,
    description: row.description ?? undefined, inspectionType: row.inspection_type ?? undefined,
    location: row.location ?? undefined, inspectorName: row.inspector_name ?? undefined,
    scheduledAt: row.scheduled_at ?? undefined, status: row.effective_status ?? row.status,
    priority: row.priority, checklistItems: row.checklist_items ?? [],
    checklistObservations: row.checklist_observations ?? {},
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getComplianceSummary(): Promise<ComplianceSummary | null> {
  const res = await fetcher('/api/compliance/summary')
  if (!res?.data) return null
  const d = res.data
  return { activeTasks: d.active_tasks, completedThisMonth: d.completed_this_month, scheduledInspections: d.scheduled_inspections, overdueItems: d.overdue_items }
}

export async function getComplianceActivityLog(limit = 10): Promise<ComplianceActivityLogItem[]> {
  const res = await fetcher(`/api/compliance/activity?limit=${limit}`)
  return (res?.data ?? []).map((r: any) => ({ id: r.id, category: r.category, message: r.message, status: r.status, priority: r.priority, createdAt: r.created_at }))
}

export async function getComplianceCapabilities(): Promise<ComplianceCapabilities> {
  const res = await fetcher('/api/compliance/capabilities')
  return res?.data ?? NO_COMPLIANCE_CAPABILITIES
}

// ── Activities (My Activities) ───────────────────────────────────────────────

export async function getMyActivities(params: { search?: string; shipment_type?: ShipmentType } = {}): Promise<ComplianceActivity[]> {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  if (params.shipment_type) qs.set('shipment_type', params.shipment_type)
  const query = qs.toString()
  const res = await fetcher(`/api/compliance/activities${query ? `?${query}` : ''}`)
  return (res?.data ?? []).map(rowToActivity)
}

export async function getActivity(id: string): Promise<ComplianceActivity | null> {
  const res = await fetcher(`/api/compliance/activities/${id}`)
  return res?.data ? rowToActivity(res.data) : null
}

export interface CreateActivityPayload {
  entry_number?: string; title: string; request_number?: string; container_number?: string
  container_type?: string; vessel_name?: string; voyage_number?: string
  shipment_type?: ShipmentType; collection_date?: string; description?: string
}
export async function createActivity(payload: CreateActivityPayload): Promise<ComplianceActivity | null> {
  const res = await postFetcher('/api/compliance/activities', payload)
  return res?.data ? rowToActivity(res.data) : null
}

export interface UpdateActivityPayload extends Partial<CreateActivityPayload> {
  status?: ComplianceActivityStatus; category?: string; tags?: string[]; quality_rating?: number
}
export async function updateActivity(id: string, payload: UpdateActivityPayload): Promise<ComplianceActivity | null> {
  const res = await patchFetcher(`/api/compliance/activities/${id}`, payload)
  return res?.data ? rowToActivity(res.data) : null
}

export async function cancelActivity(id: string): Promise<ComplianceActivity | null> {
  const res = await patchFetcher(`/api/compliance/activities/${id}/cancel`, {})
  return res?.data ? rowToActivity(res.data) : null
}

// ── Completed Activities ─────────────────────────────────────────────────────

export type CompletedPeriod = 'all' | 'week' | 'month' | 'quarter'

export async function getCompletedActivities(params: { search?: string; period?: CompletedPeriod } = {}): Promise<ComplianceActivity[]> {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  if (params.period && params.period !== 'all') qs.set('period', params.period)
  const query = qs.toString()
  const res = await fetcher(`/api/compliance/activities/completed${query ? `?${query}` : ''}`)
  return (res?.data ?? []).map(rowToActivity)
}

export async function getCompletedActivitiesSummary(): Promise<CompletedActivitiesSummary> {
  const res = await fetcher('/api/compliance/activities/completed/summary')
  const d = res?.data ?? {}
  return { totalCompleted: d.total_completed ?? 0, thisMonth: d.this_month ?? 0, avgRating: d.avg_rating ?? 0, onTimePct: d.on_time_pct ?? 0 }
}

export async function downloadActivityReport(id: string, filename: string): Promise<void> {
  const res = await rawFetcher(`/api/compliance/activities/${id}/report`)
  if (!res) return
  const blob = await res.blob()
  triggerDownload(blob, filename)
}

export async function exportCompletedActivitiesCsv(params: { search?: string; period?: CompletedPeriod } = {}): Promise<void> {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  if (params.period && params.period !== 'all') qs.set('period', params.period)
  const query = qs.toString()
  const res = await rawFetcher(`/api/compliance/activities/export/csv${query ? `?${query}` : ''}`)
  if (!res) return
  const blob = await res.blob()
  triggerDownload(blob, 'completed-activities.csv')
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

// ── Site Inspection ───────────────────────────────────────────────────────────

export async function getInspections(params: { search?: string; status?: InspectionStatus | 'all'; date?: string } = {}): Promise<ComplianceInspection[]> {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  if (params.status && params.status !== 'all') qs.set('status', params.status)
  if (params.date) qs.set('date', params.date)
  const query = qs.toString()
  const res = await fetcher(`/api/compliance/inspections${query ? `?${query}` : ''}`)
  return (res?.data ?? []).map(rowToInspection)
}

export async function getInspectionsSummary(): Promise<InspectionsSummary> {
  const res = await fetcher('/api/compliance/inspections/summary')
  const d = res?.data ?? {}
  return { thisWeek: d.this_week ?? 0, inProgress: d.in_progress ?? 0, completed: d.completed ?? 0, overdue: d.overdue ?? 0 }
}

export async function getInspectionChecklists(): Promise<Record<string, string[]>> {
  const res = await fetcher('/api/compliance/inspections/checklists')
  return res?.data ?? {}
}

export async function getInspection(id: string): Promise<ComplianceInspection | null> {
  const res = await fetcher(`/api/compliance/inspections/${id}`)
  return res?.data ? rowToInspection(res.data) : null
}

export interface CreateInspectionPayload {
  title: string; description?: string; inspection_type?: string; location?: string
  inspector_name?: string; scheduled_at?: string; priority?: CompliancePriority
}
export async function createInspection(payload: CreateInspectionPayload): Promise<ComplianceInspection | null> {
  const res = await postFetcher('/api/compliance/inspections', payload)
  return res?.data ? rowToInspection(res.data) : null
}

export type UpdateInspectionPayload = Partial<CreateInspectionPayload>
export async function updateInspection(id: string, payload: UpdateInspectionPayload): Promise<ComplianceInspection | null> {
  const res = await patchFetcher(`/api/compliance/inspections/${id}`, payload)
  return res?.data ? rowToInspection(res.data) : null
}

export async function startInspection(id: string): Promise<ComplianceInspection | null> {
  const res = await patchFetcher(`/api/compliance/inspections/${id}/start`, {})
  return res?.data ? rowToInspection(res.data) : null
}

export async function saveInspectionObservations(id: string, observations: Record<string, string>): Promise<ComplianceInspection | null> {
  const res = await patchFetcher(`/api/compliance/inspections/${id}/observations`, { observations })
  return res?.data ? rowToInspection(res.data) : null
}

export async function completeInspection(id: string): Promise<ComplianceInspection | null> {
  const res = await patchFetcher(`/api/compliance/inspections/${id}/complete`, {})
  return res?.data ? rowToInspection(res.data) : null
}
