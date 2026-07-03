import { useState, useEffect } from 'react'
import { getTenant } from '@/lib/db/tenants'
import { useReceptionAuth } from '@/contexts/ReceptionAuthContext'

const DEFAULT_TENANT_ID = 'a0000000-0000-0000-0000-000000000001'

export interface StaffPermissions {
  // Bookings
  can_view_id_scan:           boolean
  can_mark_complete:          boolean
  can_override_status:        boolean
  can_create_manual_booking:  boolean
  // Reports
  can_export_csv:             boolean
  // ICS
  can_manual_ics_refresh:     boolean
  // Payments
  can_view_charge_details:    boolean
  can_confirm_eft:            boolean
}

export const STAFF_PERM_DEFAULTS: StaffPermissions = {
  can_view_id_scan:           true,
  can_mark_complete:          true,
  can_override_status:        false,
  can_create_manual_booking:  false,
  can_export_csv:             true,
  can_manual_ics_refresh:     true,
  can_view_charge_details:    true,
  can_confirm_eft:            false,
}

const ADMIN_PERMS: StaffPermissions = {
  can_view_id_scan:           true,
  can_mark_complete:          true,
  can_override_status:        true,
  can_create_manual_booking:  true,
  can_export_csv:             true,
  can_manual_ics_refresh:     true,
  can_view_charge_details:    true,
  can_confirm_eft:            true,
}

/**
 * Returns effective permissions for the current user.
 * Admins (reception_admin / super_admin) always receive full permissions.
 * reception_staff users receive per-tenant configured permissions.
 */
export function useStaffPermissions(): StaffPermissions {
  const { isAdmin, loading } = useReceptionAuth()
  const [perms, setPerms] = useState<StaffPermissions>(STAFF_PERM_DEFAULTS)

  useEffect(() => {
    if (loading || isAdmin) return
    getTenant(DEFAULT_TENANT_ID)
      .then(t => {
        const sp = (t?.working_hours as any)?.staff_permissions
        if (sp && typeof sp === 'object') {
          setPerms({ ...STAFF_PERM_DEFAULTS, ...sp })
        }
      })
      .catch(() => {})
  }, [isAdmin, loading])

  if (isAdmin) return ADMIN_PERMS
  return perms
}
