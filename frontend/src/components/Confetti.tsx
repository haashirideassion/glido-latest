import { useEffect, useRef } from 'react'

/**
 * One-shot confetti burst, rendered fullscreen and self-cleaning.
 * No dependency — a small canvas particle sim. Fires once on mount.
 */
export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width  = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.scale(dpr, dpr)
    }
    resize()

    const colors = ['#FC6514', '#FF7A2A', '#0EA5E9', '#22C55E', '#F59E0B', '#8B5CF6', '#EC4899']
    const COUNT = 140
    const W = window.innerWidth
    const H = window.innerHeight

    const particles = Array.from({ length: COUNT }, () => {
      const fromLeft = Math.random() < 0.5
      return {
        x: fromLeft ? -10 : W + 10,
        y: H * (0.15 + Math.random() * 0.35),
        vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 7),
        vy: -(6 + Math.random() * 7),
        gravity: 0.22 + Math.random() * 0.08,
        drag: 0.985,
        size: 5 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        shape: Math.random() < 0.5 ? 'rect' : 'circle' as const,
        life: 0,
      }
    })

    let raf = 0
    let elapsed = 0
    const DURATION = 2600

    const tick = (dt: number) => {
      elapsed += dt
      ctx.clearRect(0, 0, W, H)
      for (const p of particles) {
        p.vx *= p.drag
        p.vy = p.vy * p.drag + p.gravity
        p.x += p.vx
        p.y += p.vy
        p.rot += p.rotSpeed
        p.life += dt

        const fadeStart = DURATION - 500
        const alpha = elapsed > fadeStart ? Math.max(0, 1 - (elapsed - fadeStart) / 500) : 1

        ctx.save()
        ctx.globalAlpha = alpha
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66)
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }

      if (elapsed < DURATION) {
        raf = requestAnimationFrame(loop)
      }
    }

    let last = performance.now()
    const loop = (now: number) => {
      const dt = now - last
      last = now
      tick(dt)
    }
    raf = requestAnimationFrame(loop)

    const onResize = () => resize()
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        pointerEvents: 'none',
        width: '100vw', height: '100vh',
      }}
    />
  )
}
