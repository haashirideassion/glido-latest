import { useState, useEffect } from 'react'
import { getTenant } from '@/lib/db/tenants'
import { useAuth } from '@/contexts/AuthContext'

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

export interface AllocatorPermissions {
  can_create_resource:       boolean
  can_schedule_maintenance:  boolean
}

export const ALLOCATOR_PERM_DEFAULTS: AllocatorPermissions = {
  can_create_resource:      true,
  can_schedule_maintenance: true,
}

const FULL_PERMS: AllocatorPermissions = { can_create_resource: true, can_schedule_maintenance: true }

/**
 * Returns effective permissions for the current allocator user.
 * super_admin always receives full permissions; allocator users receive per-tenant configured
 * permissions (Reception's staff_permissions pattern — tenants.working_hours.allocator_permissions).
 */
export function useAllocatorPermissions(): AllocatorPermissions {
  const { user, isLoading } = useAuth()
  const [perms, setPerms] = useState<AllocatorPermissions>(ALLOCATOR_PERM_DEFAULTS)

  useEffect(() => {
    if (isLoading || user?.role === 'super_admin') return
    getTenant(DEFAULT_TENANT_ID)
      .then(t => {
        const ap = (t?.working_hours as any)?.allocator_permissions
        if (ap && typeof ap === 'object') setPerms({ ...ALLOCATOR_PERM_DEFAULTS, ...ap })
      })
      .catch(() => {})
  }, [isLoading, user?.role])

  if (user?.role === 'super_admin') return FULL_PERMS
  return perms
}
