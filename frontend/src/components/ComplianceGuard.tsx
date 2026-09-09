import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

const ALLOWED_ROLES = ['compliance_officer', 'compliance_admin', 'super_admin', 'reception_admin']

export default function ComplianceGuard() {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontSize: 15, color: 'var(--text-secondary)' }}>
        Loading…
      </div>
    )
  }

  if (!isAuthenticated || !user || !ALLOWED_ROLES.includes(user.role)) {
    return <Navigate to="/login?role=compliance" replace />
  }

  return <Outlet />
}
