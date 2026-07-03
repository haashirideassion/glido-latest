import { createContext, useContext, type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'

/**
 * ReceptionAuthContext — derived from AuthContext (no Supabase).
 * Keeps the same public API so existing consumers don't break.
 */

interface ReceptionAuthValue {
  role:         string | null
  userId:       string | null
  isAdmin:      boolean   // reception_admin or super_admin
  isStaff:      boolean   // reception_staff only
  isSuperAdmin: boolean   // super_admin only
  loading:      boolean
}

const ReceptionAuthContext = createContext<ReceptionAuthValue>({
  role: null, userId: null,
  isAdmin: false, isStaff: false, isSuperAdmin: false,
  loading: true,
})

export function ReceptionAuthProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()

  const role       = user?.role ?? null
  const userId     = user?.id   ?? null
  const isAdmin    = role === 'reception_admin' || role === 'super_admin'
  const isStaff    = role === 'reception_staff'
  const isSuperAdmin = role === 'super_admin'

  return (
    <ReceptionAuthContext.Provider value={{ role, userId, isAdmin, isStaff, isSuperAdmin, loading: isLoading }}>
      {children}
    </ReceptionAuthContext.Provider>
  )
}

export function useReceptionAuth() {
  return useContext(ReceptionAuthContext)
}
