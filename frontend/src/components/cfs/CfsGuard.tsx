import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

/** The Packing & Unpacking module has its own dedicated login screen (/login?role=packing, role 'packing', mirrors the backend's STAFF_ROLES). Reception / Super Admin logins do not open it. */
export const CFS_ROLES = ['packing']

export default function CfsGuard() {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontSize: 15, color: 'var(--text-secondary)' }}>
        Loading…
      </div>
    )
  }
  if (!isAuthenticated || !user || !CFS_ROLES.includes(user.role)) {
    // Remember where they were going so the login page can bring them back here.
    return <Navigate to={`/login?role=packing&redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }
  return <Outlet />
}
