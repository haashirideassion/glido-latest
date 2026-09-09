import { useState, useEffect } from 'react'
import { getTenant } from '@/lib/db/tenants'
import { useAuth } from '@/contexts/AuthContext'

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

export interface PlannerPermissions {
  can_create_vessel:   boolean
  can_create_trip:     boolean
  can_export_reports:  boolean
}

export const PLANNER_PERM_DEFAULTS: PlannerPermissions = {
  can_create_vessel:  true,
  can_create_trip:    true,
  can_export_reports: true,
}

const FULL_PERMS: PlannerPermissions = { can_create_vessel: true, can_create_trip: true, can_export_reports: true }

/**
 * Returns effective permissions for the current planner user.
 * super_admin always receives full permissions; planner users receive per-tenant configured permissions
 * (Reception's staff_permissions pattern — tenants.working_hours.planner_permissions).
 */
export function usePlannerPermissions(): PlannerPermissions {
  const { user, isLoading } = useAuth()
  const [perms, setPerms] = useState<PlannerPermissions>(PLANNER_PERM_DEFAULTS)

  useEffect(() => {
    if (isLoading || user?.role === 'super_admin') return
    getTenant(DEFAULT_TENANT_ID)
      .then(t => {
        const pp = (t?.working_hours as any)?.planner_permissions
        if (pp && typeof pp === 'object') setPerms({ ...PLANNER_PERM_DEFAULTS, ...pp })
      })
      .catch(() => {})
  }, [isLoading, user?.role])

  if (user?.role === 'super_admin') return FULL_PERMS
  return perms
}
