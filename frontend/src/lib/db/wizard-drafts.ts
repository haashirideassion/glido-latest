import { fetcher, postFetcher } from '../fetcher'

const BASE = '/api/wizard-drafts'

/** Saves the current wizard state and returns a resume token (valid 24h). */
export async function saveWizardDraft(state: unknown): Promise<string | null> {
  const res = await postFetcher(BASE, { state })
  return res?.token ?? null
}

/** Fetches a previously saved wizard state by its resume token. Returns null if expired/missing. */
export async function loadWizardDraft(token: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetcher(`${BASE}/${token}`)
    return res?.data ?? null
  } catch {
    return null
  }
}
