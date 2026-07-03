import { toast } from 'sonner'

/**
 * Centralized API Client — Glido
 * Mirrors SRD-FleetSense api-client.ts exactly.
 *
 * - Attaches Authorization: Bearer <token> on every request
 * - Token stored in localStorage under SESSION_KEY
 * - Deduplicates in-flight GET requests
 * - On 401: clears token, redirects to /login
 * - On 5xx: shows toast error
 * - On network failure: shows toast error
 */

const SESSION_KEY = 'glido_auth_token'
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

const inFlightRequests = new Map<string, Promise<any>>()

export const setToken = (token: string | null) => {
  if (typeof window === 'undefined') return
  if (token) {
    localStorage.setItem(SESSION_KEY, token)
  } else {
    localStorage.removeItem(SESSION_KEY)
  }
}

export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SESSION_KEY)
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const path = API_BASE + (endpoint.startsWith('/') ? endpoint : `/${endpoint}`)

  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const config: RequestInit = { ...options, headers, cache: 'no-store' }

  const method = (options.method || 'GET').toUpperCase()
  const cacheKey = `${method}:${path}`

  if (method === 'GET' && inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!
  }

  const fetchAndProcess = async (): Promise<T> => {
    let response: Response
    try {
      response = await fetch(path, config)
    } catch (err: any) {
      if (err.name === 'AbortError') throw err
      if (typeof window !== 'undefined') {
        toast.error('Network Connection Failed', {
          description: 'Unable to reach the server. Please check your connection.',
        })
      }
      throw new Error('Network Error: ' + err.message)
    }

    if (response.status === 401) {
      let errorMessage = 'Invalid email or password.'
      try {
        const errorBody = await response.json()
        errorMessage = errorBody?.error?.message || errorBody?.message || errorMessage
      } catch {
        // keep default
      }
      const isLoginEndpoint  = path.includes('/auth/login')
      const isAuthMeEndpoint = path.includes('/auth/me')
      if (!isLoginEndpoint) setToken(null)
      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/login') &&
        !window.location.pathname.startsWith('/kiosk') &&
        !isAuthMeEndpoint
      ) {
        window.location.href = '/login'
      }
      throw new Error(errorMessage)
    }

    if (!response.ok) {
      let errorMessage = `Server responded with status ${response.status}`
      try {
        const errorData = await response.json()
        errorMessage = errorData.error?.message || errorData.message || errorMessage
      } catch {
        // ignore
      }
      if (response.status >= 500 && typeof window !== 'undefined') {
        toast.error('System Error', { description: errorMessage })
      }
      throw new Error(errorMessage)
    }

    const data = await response.json()
    if (method === 'GET') inFlightRequests.delete(cacheKey)
    return data
  }

  if (method === 'GET') {
    const promise = fetchAndProcess()
    inFlightRequests.set(cacheKey, promise)
    return promise
  }

  return fetchAndProcess()
}
