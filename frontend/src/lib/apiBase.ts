// The backend now runs on Cloud Run, a separate origin from wherever the frontend
// is hosted (e.g. glido.tech). If VITE_API_BASE_URL isn't set at build time, API
// calls must NOT silently fall back to a relative path — that resolves against the
// frontend's own origin, which has no backend behind it. Only local dev (where the
// Vite proxy forwards /api to localhost:3001) should ever use an empty base.
const PROD_DEFAULT_API_BASE = 'https://glido-backend-prod-175164625810.asia-south1.run.app'

export const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? PROD_DEFAULT_API_BASE : '')
).replace(/\/$/, '')
