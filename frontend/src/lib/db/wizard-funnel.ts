import { fetcher, postFetcher } from '../fetcher'

const BASE = '/api/analytics/wizard-funnel'
const SESSION_KEY = 'glido_wizard_funnel_session'

/** Stable per-browser-session id so repeat step-events from the same visit count once. */
export function getFunnelSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    return 'anon'
  }
}

/** Fire-and-forget — logs that this session reached a given wizard step. */
export function logFunnelStep(step: number) {
  postFetcher(BASE, { sessionId: getFunnelSessionId(), step }).catch(() => { /* best-effort */ })
}

export interface FunnelStepCount { step: number; sessions: number }

export async function getFunnelSummary(days = 30): Promise<FunnelStepCount[]> {
  const res = await fetcher(`${BASE}?days=${days}`)
  return res?.data ?? []
}
