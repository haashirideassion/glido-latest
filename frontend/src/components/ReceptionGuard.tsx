import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { ReceptionAuthProvider } from '@/contexts/ReceptionAuthContext'

const ALLOWED_ROLES = ['reception_staff', 'reception_admin', 'super_admin']

export default function ReceptionGuard() {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontSize: 15, color: 'var(--text-secondary)' }}>
        Loading…
      </div>
    )
  }

  if (!isAuthenticated || !user || !ALLOWED_ROLES.includes(user.role)) {
    return <Navigate to="/login" replace />
  }

  return (
    <ReceptionAuthProvider>
      <Outlet />
    </ReceptionAuthProvider>
  )
}
