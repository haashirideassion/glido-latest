import { setToken } from './api-client'

/**
 * clearAllClientState — call on logout.
 * Clears token + any other client-side state.
 * Add Zustand store resets here as they are added to the project.
 */
export function clearAllClientState() {
  setToken(null)
  sessionStorage.clear()
}
