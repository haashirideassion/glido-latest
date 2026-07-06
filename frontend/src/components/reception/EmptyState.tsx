import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/**
 * Friendly animated empty-state. A brand-tinted parcel gently floats over a
 * breathing shadow — dependency-free (SVG + motion.dev), reduced-motion aware.
 */
export function EmptyState({
  title,
  subtitle,
  action,
  variant = 'box',
  compact = false,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  variant?: 'box' | 'inbox' | 'search'
  compact?: boolean
}) {
  const reduce = useReducedMotion()
  const float = reduce ? {} : { animate: { y: [0, -8, 0] }, transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' as const } }
  const breathe = reduce ? {} : { animate: { scaleX: [1, 0.82, 1], opacity: [0.12, 0.06, 0.12] }, transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' as const } }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{ padding: compact ? '36px 24px' : '56px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
    >
      <svg width="128" height="116" viewBox="0 0 128 116" style={{ marginBottom: 18 }} aria-hidden="true">
        {/* breathing shadow */}
        <motion.ellipse cx="64" cy="104" rx="34" ry="6" fill="rgba(0,0,0,1)" {...breathe} style={{ transformOrigin: '64px 104px' }} />
        {/* floating illustration */}
        <motion.g {...float}>
          {variant === 'search' ? (
            <>
              <circle cx="56" cy="52" r="26" fill="rgba(var(--brand-rgb),0.10)" stroke="var(--brand-color)" strokeWidth="3" opacity="0.55" />
              <line x1="76" y1="72" x2="94" y2="90" stroke="var(--brand-color)" strokeWidth="5" strokeLinecap="round" opacity="0.55" />
              <circle cx="56" cy="52" r="10" fill="var(--brand-color)" opacity="0.18" />
            </>
          ) : variant === 'inbox' ? (
            <>
              <rect x="34" y="40" width="60" height="44" rx="9" fill="rgba(var(--brand-rgb),0.10)" stroke="var(--brand-color)" strokeWidth="2.5" opacity="0.55" />
              <path d="M34 62 h18 l6 9 h12 l6 -9 h18" fill="none" stroke="var(--brand-color)" strokeWidth="2.5" strokeLinejoin="round" opacity="0.55" />
              <rect x="48" y="30" width="32" height="4" rx="2" fill="var(--brand-color)" opacity="0.35" />
            </>
          ) : (
            <>
              {/* parcel body */}
              <rect x="36" y="38" width="56" height="46" rx="9" fill="rgba(var(--brand-rgb),0.12)" stroke="var(--brand-color)" strokeWidth="2.5" opacity="0.6" />
              {/* lid seam */}
              <line x1="36" y1="53" x2="92" y2="53" stroke="var(--brand-color)" strokeWidth="2.5" opacity="0.5" />
              {/* tape / label */}
              <rect x="56" y="38" width="16" height="15" rx="3" fill="var(--brand-color)" opacity="0.42" />
              <line x1="64" y1="59" x2="64" y2="78" stroke="var(--brand-color)" strokeWidth="2.5" opacity="0.4" strokeLinecap="round" />
            </>
          )}
        </motion.g>
      </svg>

      <p style={{ fontSize: 16, fontWeight: 600, color: '#374151', margin: 0 }}>{title}</p>
      {subtitle && <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '6px 0 0', maxWidth: 320 }}>{subtitle}</p>}
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </motion.div>
  )
}
