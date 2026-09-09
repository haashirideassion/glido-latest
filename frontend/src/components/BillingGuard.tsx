import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Role gate for the Billing module. Capability gating within the module is a
 * separate, finer concern (S-11) handled by useBillingCapabilities — this only
 * decides who may see the module at all.
 *
 * reception_staff are included because the FRS puts the day-to-day operational
 * surfaces (O-03 add manual charge, O-04 adjust, O-05 dwell monitor) in front of
 * reception, and gates them by capability rather than by role.
 */
const ALLOWED_ROLES = ['billing', 'reception_admin', 'reception_staff', 'super_admin']

export default function BillingGuard() {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', fontSize: 15, color: 'var(--text-secondary)',
      }}>
        Loading…
      </div>
    )
  }

  if (!isAuthenticated || !user || !ALLOWED_ROLES.includes(user.role)) {
    return <Navigate to="/login?role=billing" replace />
  }

  return <Outlet />
}
