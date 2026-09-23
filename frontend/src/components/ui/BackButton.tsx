import { useNavigate } from 'react-router-dom'

/**
 * The single Back control for module pages that have one.
 *
 * It lives here rather than being copy-pasted per page because the five copies that existed
 * before had drifted, and the FRD calls for one recognisable Back affordance. Sized to 38px so
 * it sits inline in a page's existing toolbar row instead of claiming a band of its own —
 * Planner Trips lost three stacked rows of chrome for exactly that reason.
 *
 * `to` is a path when the FRD names a destination — 2.4.2.1 sends Planner Vessels to the Planner
 * Dashboard, which is not necessarily where the user came from — or `-1` where it just says
 * "the previous page", as 2.4.1.2 does for My Requests.
 */
export function BackButton({ to, label = 'Back' }: { to: string | number; label?: string }) {
  const navigate = useNavigate()
  const go = () => { if (typeof to === 'number') navigate(to); else navigate(to) }
  return (
    <button
      type="button"
      onClick={go}
      aria-label={label}
      onMouseEnter={e => { e.currentTarget.style.background = '#F7F6F5' }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px',
        flexShrink: 0, fontSize: 14, fontWeight: 600, color: '#374151', background: '#fff',
        border: '1px solid rgba(0,0,0,0.12)', borderRadius: 'var(--r-full)', cursor: 'pointer',
        fontFamily: 'inherit', transition: 'background 0.13s ease',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label}
    </button>
  )
}
