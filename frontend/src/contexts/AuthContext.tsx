import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { apiClient, setToken } from '@/lib/api-client'
import { clearAllClientState } from '@/lib/state-cleanup'
/**
 * AuthContext — Glido
 * Mirrors SRD-FleetSense auth-context.tsx exactly.
 * Bearer-only — no cookies anywhere.
 */

export type UserRole = 'reception_admin' | 'reception_staff' | 'visitor_registered' | 'super_admin'

interface User {
  id: string
  email: string
  name: string
  role: UserRole
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isAdmin: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; role?: UserRole }>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Decode JWT payload without verifying the signature.
 * Used only to instantly restore user state on reload — no network needed.
 * The backend re-validates the signature on every actual API call.
 */
function decodeJwtPayload(token: string): User | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (!payload?.id || !payload?.email || !payload?.name || !payload?.role) return null
    if (payload.exp && payload.exp * 1000 < Date.now()) return null
    return { id: payload.id, email: payload.email, name: payload.name, role: payload.role as UserRole }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]           = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    const token = typeof window !== 'undefined'
      ? localStorage.getItem('glido_auth_token')
      : null

    const isLoginPage = typeof window !== 'undefined' &&
      window.location.pathname.startsWith('/login')

    if (!token || isLoginPage) {
      setIsLoading(false)
      return
    }

    // ── STEP 1: Instantly restore from JWT payload (no network) ──
    // Prevents login-page flash on every reload.
    const localUser = decodeJwtPayload(token)
    if (localUser) {
      setUser(localUser)
      setIsLoading(false)
    } else {
      setToken(null)
      setIsLoading(false)
      return
    }

    // ── STEP 2: Background verify with backend ────────────────────
    // Catches server-side revocations. Only redirects on definitive 401.
    // Network errors, timeouts, 5xx → silently keep local session alive.
    try {
      const response = await apiClient<{ success: boolean; data: User }>('/api/auth/me')
      if (response.success && response.data) {
        setUser(response.data)
      }
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase()
      if (msg.includes('unauthorized')) {
        setToken(null)
        setUser(null)
        if (
          typeof window !== 'undefined' &&
          !window.location.pathname.startsWith('/login')
        ) {
          window.location.href = '/login'
        }
      }
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const login = async (
    email: string,
    password: string,
  ): Promise<{ success: boolean; error?: string; role?: UserRole }> => {
    try {
      const response = await apiClient<{
        success: boolean
        data: { token: string; user: User }
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      if (response.success) {
        setToken(response.data.token)
        setUser(response.data.user)
        return { success: true, role: response.data.user.role }
      }
      return { success: false, error: 'Login failed' }
    } catch (err: any) {
      return { success: false, error: err.message || 'Login failed' }
    }
  }

  const logout = () => {
    clearAllClientState()
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'reception_admin',
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Keep these helpers so existing code that imports them doesn't break
export function isReceptionRole(role: string) {
  return role === 'reception_staff' || role === 'reception_admin'
}

export function isVisitorRole(role: string) {
  return role === 'visitor_registered' || role === 'visitor'
}
