import { fetcher, postFetcher, patchFetcher } from '../fetcher'
import type { MaintenanceRecord, MaintenanceTab, TripPriority } from '@/data/types'

const BASE = '/api/maintenance'

function rowToRecord(row: any): MaintenanceRecord {
  return {
    id: row.id,
    maintenanceCode: row.maintenance_code,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceCode: row.resource_code ?? null,
    activityType: row.activity_type,
    status: row.status,
    priority: row.priority ?? 'medium',
    dueDate: row.due_date ?? undefined,
    estimatedDuration: row.estimated_duration ?? undefined,
    startDate: row.start_date ?? undefined,
    estimatedCompletion: row.estimated_completion ?? undefined,
    completedDate: row.completed_date ?? undefined,
    progressPct: Number(row.progress_pct ?? 0),
    technician: row.technician ?? undefined,
    contractor: row.contractor ?? undefined,
    customFieldValue: row.custom_field_value ?? undefined,
    remarks: row.remarks ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getMaintenanceRecords(params: { tab?: MaintenanceTab; search?: string; priority?: TripPriority } = {}): Promise<MaintenanceRecord[]> {
  const qs = new URLSearchParams()
  if (params.tab)      qs.set('tab', params.tab)
  if (params.search)   qs.set('search', params.search)
  if (params.priority) qs.set('priority', params.priority)
  const query = qs.toString()
  const res = await fetcher(`${BASE}${query ? `?${query}` : ''}`)
  return (res?.data ?? []).map(rowToRecord)
}

export async function getMaintenanceRecord(idOrCode: string): Promise<MaintenanceRecord | null> {
  const res = await fetcher(`${BASE}/${idOrCode}`)
  return res?.data ? rowToRecord(res.data) : null
}

export interface ScheduleMaintenancePayload {
  resource_type: 'truck' | 'trailer'
  resource_id: string
  activity_type: string
  priority?: TripPriority
  due_date?: string
  estimated_duration?: string
  remarks?: string
  contractor?: string
  custom_field_value?: string
}

export async function scheduleMaintenance(payload: ScheduleMaintenancePayload): Promise<MaintenanceRecord | null> {
  const res = await postFetcher(BASE, payload)
  return res?.data ? rowToRecord(res.data) : null
}

export async function rescheduleMaintenance(id: string, dueDate: string): Promise<MaintenanceRecord | null> {
  const res = await patchFetcher(`${BASE}/${id}/reschedule`, { due_date: dueDate })
  return res?.data ? rowToRecord(res.data) : null
}

export async function startMaintenance(id: string, payload: { technician?: string; estimated_completion?: string } = {}): Promise<MaintenanceRecord | null> {
  const res = await patchFetcher(`${BASE}/${id}/start`, payload)
  return res?.data ? rowToRecord(res.data) : null
}

export async function updateMaintenanceProgress(id: string, payload: { progress_pct?: number; remarks?: string }): Promise<MaintenanceRecord | null> {
  const res = await patchFetcher(`${BASE}/${id}/progress`, payload)
  return res?.data ? rowToRecord(res.data) : null
}

export async function completeMaintenance(id: string): Promise<MaintenanceRecord | null> {
  const res = await patchFetcher(`${BASE}/${id}/complete`, {})
  return res?.data ? rowToRecord(res.data) : null
}
