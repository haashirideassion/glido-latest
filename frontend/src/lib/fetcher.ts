import { apiClient, getToken } from './api-client'

/**
 * Fetcher wrappers — Glido
 * Mirrors SRD-FleetSense fetcher.ts exactly.
 */

export const fetcher = async <T = any>(url: string, options?: RequestInit): Promise<any> => {
  try {
    return await apiClient<T>(url, options)
  } catch (err: any) {
    if (err.message === 'Unauthorized') return null
    throw err
  }
}

export const postFetcher = async <T = any>(url: string, body: unknown): Promise<any> => {
  return fetcher<T>(url, { method: 'POST', body: JSON.stringify(body) })
}

export const putFetcher = async <T = any>(url: string, body: unknown): Promise<any> => {
  return fetcher<T>(url, { method: 'PUT', body: JSON.stringify(body) })
}

export const patchFetcher = async <T = any>(url: string, body: unknown): Promise<any> => {
  return fetcher<T>(url, { method: 'PATCH', body: JSON.stringify(body) })
}

export const deleteFetcher = async <T = any>(url: string): Promise<any> => {
  return fetcher<T>(url, { method: 'DELETE' })
}

/**
 * rawFetcher — for file/blob responses (uploads, downloads)
 */
const RAW_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

/**
 * Resolve a backend-relative path (e.g. /api/uploads/files/logo.png)
 * to an absolute URL using the configured API base.
 * Pass-through for already-absolute URLs.
 */
export const resolveUploadUrl = (url: string | null | undefined): string => {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return RAW_BASE + (url.startsWith('/') ? url : `/${url}`)
}

export const rawFetcher = async (url: string, options?: RequestInit) => {
  const token = getToken()
  const headers = new Headers(options?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const fullUrl = RAW_BASE + (url.startsWith('/') ? url : `/${url}`)
  const res = await fetch(fullUrl, { ...options, headers })

  if (res.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    return null
  }

  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res
}
