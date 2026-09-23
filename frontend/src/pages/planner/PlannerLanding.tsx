import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getPlannerSettings } from '@/lib/db/planner-settings'

// FRD 2.4.2.3 — "Default Landing Page" is a real preference, not decoration. /planner is a
// resolver: it reads the saved setting once and forwards to the screen the planner chose.
// Every other entry point in the module links to an explicit path, so this is the only place
// the setting is read.
const ALLOWED = ['dashboard', 'vessels', 'trips', 'reports'] as const
type Landing = (typeof ALLOWED)[number]

export default function PlannerLanding() {
  const [target, setTarget] = useState<Landing | null>(null)

  useEffect(() => {
    let cancelled = false
    getPlannerSettings()
      .then(s => {
        if (cancelled) return
        const next = s?.defaultLandingPage
        // Anything unrecognised (an older row, a value retired from the dropdown) falls back to
        // the dashboard rather than routing into a 404.
        setTarget(next && (ALLOWED as readonly string[]).includes(next) ? (next as Landing) : 'dashboard')
      })
      .catch(() => { if (!cancelled) setTarget('dashboard') })
    return () => { cancelled = true }
  }, [])

  // Nothing is drawn while the preference is in flight — a skeleton here would flash for one
  // request and then be replaced by the destination's own loading state.
  if (!target) return null
  return <Navigate to={`/planner/${target}`} replace />
}
