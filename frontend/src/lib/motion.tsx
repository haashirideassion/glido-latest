import { useEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { motion, animate, useMotionValue, useReducedMotion } from 'motion/react'

// Re-export for convenience
export { motion, AnimatePresence } from 'motion/react'

const SPRING = { type: 'spring', stiffness: 500, damping: 30, mass: 0.6 } as const

/**
 * Button with tactile press + hover feedback. Drop-in replacement for <button>
 * used on primary/action controls. Honours prefers-reduced-motion.
 */
export function TapButton({ children, ...props }: ComponentProps<typeof motion.button>) {
  const reduce = useReducedMotion()
  return (
    <motion.button
      whileTap={reduce ? undefined : { scale: 0.95 }}
      whileHover={reduce ? undefined : { scale: 1.02 }}
      transition={SPRING}
      {...props}
    >
      {children}
    </motion.button>
  )
}

/**
 * Count-up number for KPI values. Animates from the previous value to the new
 * one whenever it changes. Renders a plain <span> so it inherits any styling.
 */
export function AnimatedNumber({ value, format, ...rest }: { value: number; format?: (n: number) => string } & ComponentProps<'span'>) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(value)
  const [display, setDisplay] = useState(value)
  const first = useRef(true)

  useEffect(() => {
    if (reduce) { setDisplay(value); return }
    // On first mount, count up from 0 for a bit of life; afterwards animate from current.
    const from = first.current ? 0 : mv.get()
    first.current = false
    const controls = animate(from, value, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: v => { mv.set(v); setDisplay(Math.round(v)) },
    })
    return () => controls.stop()
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  return <span {...rest}>{format ? format(display) : display}</span>
}
