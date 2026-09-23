import { fetcher, patchFetcher } from '../fetcher'
import type { AllocatorSettings } from '@/data/types'

const BASE = '/api/allocator-settings'

function rowToSettings(row: any): AllocatorSettings {
  return {
    defaultView:            row.default_view,
    automatedAllocation:    !!row.automated_allocation,
    operationStartTime:     row.operation_start_time,
    operationEndTime:       row.operation_end_time,
    newTripNotifications:   !!row.new_trip_notifications,
    resourceConflictAlerts: !!row.resource_conflict_alerts,
    maintenanceReminders:   !!row.maintenance_reminders,
    emailNotifications:     !!row.email_notifications,
  }
}

export async function getAllocatorSettings(): Promise<AllocatorSettings | null> {
  const res = await fetcher(BASE)
  return res?.data ? rowToSettings(res.data) : null
}

export interface UpdateAllocatorSettingsPayload {
  default_view?: string
  automated_allocation?: boolean
  operation_start_time?: string
  operation_end_time?: string
  new_trip_notifications?: boolean
  resource_conflict_alerts?: boolean
  maintenance_reminders?: boolean
  email_notifications?: boolean
}

export async function updateAllocatorSettings(payload: UpdateAllocatorSettingsPayload): Promise<AllocatorSettings | null> {
  const res = await patchFetcher(BASE, payload)
  return res?.data ? rowToSettings(res.data) : null
}
