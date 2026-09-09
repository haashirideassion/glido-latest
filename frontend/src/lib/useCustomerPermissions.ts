import { useState, useEffect } from 'react'
import { getTenant } from '@/lib/db/tenants'
import { useAuth } from '@/contexts/AuthContext'

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

export interface CustomerPermissions {
  can_create_service_request: boolean
}

export const CUSTOMER_PERM_DEFAULTS: CustomerPermissions = {
  can_create_service_request: true,
}

const FULL_PERMS: CustomerPermissions = { can_create_service_request: true }

/**
 * Returns effective permissions for the current customer user.
 * super_admin always receives full permissions; customer users receive per-tenant configured
 * permissions (Reception's staff_permissions pattern — tenants.working_hours.customer_permissions).
 */
export function useCustomerPermissions(): CustomerPermissions {
  const { user, isLoading } = useAuth()
  const [perms, setPerms] = useState<CustomerPermissions>(CUSTOMER_PERM_DEFAULTS)

  useEffect(() => {
    if (isLoading || user?.role === 'super_admin') return
    getTenant(DEFAULT_TENANT_ID)
      .then(t => {
        const cp = (t?.working_hours as any)?.customer_permissions
        if (cp && typeof cp === 'object') setPerms({ ...CUSTOMER_PERM_DEFAULTS, ...cp })
      })
      .catch(() => {})
  }, [isLoading, user?.role])

  if (user?.role === 'super_admin') return FULL_PERMS
  return perms
}
