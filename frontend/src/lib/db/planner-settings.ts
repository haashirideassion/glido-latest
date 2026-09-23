import { fetcher, patchFetcher } from '../fetcher'
import type { PlannerSettings } from '@/data/types'

const BASE = '/api/planner-settings'

function rowToSettings(row: any): PlannerSettings {
  return {
    defaultLandingPage:   row.default_landing_page,
    itemsPerPage:         Number(row.items_per_page),
    showCompletedDefault: !!row.show_completed_default,
    emailNotifications:   row.email_notifications,
    systemNotifications:  row.system_notifications,
  }
}

export async function getPlannerSettings(): Promise<PlannerSettings | null> {
  const res = await fetcher(BASE)
  return res?.data ? rowToSettings(res.data) : null
}

export interface UpdatePlannerSettingsPayload {
  default_landing_page?: string
  items_per_page?: number
  show_completed_default?: boolean
  email_notifications?: PlannerSettings['emailNotifications']
  system_notifications?: PlannerSettings['systemNotifications']
}

export async function updatePlannerSettings(payload: UpdatePlannerSettingsPayload): Promise<PlannerSettings | null> {
  const res = await patchFetcher(BASE, payload)
  return res?.data ? rowToSettings(res.data) : null
}
