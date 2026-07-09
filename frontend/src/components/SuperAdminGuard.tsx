import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { ReceptionAuthProvider, useReceptionAuth } from '@/contexts/ReceptionAuthContext'

function SuperAdminGuardInner() {
  const { isSuperAdmin, loading } = useReceptionAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontSize: 15, color: 'var(--text-secondary)' }}>
        Loading…
      </div>
    )
  }

  if (!isSuperAdmin) {
    return <Navigate to="/reception" replace />
  }

  return <Outlet />
}

export default function SuperAdminGuard() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontSize: 15, color: 'var(--text-secondary)' }}>
        Loading…
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login?role=super_admin" replace />
  }

  return (
    <ReceptionAuthProvider>
      <SuperAdminGuardInner />
    </ReceptionAuthProvider>
  )
}
