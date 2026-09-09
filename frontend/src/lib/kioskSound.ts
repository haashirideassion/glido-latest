/**
 * Short WebAudio beeps for kiosk feedback — no external audio assets needed.
 * Outdoor kiosk screens wash out in sunlight, so an audible cue confirms the
 * action landed even when the visual state is hard to read at a glance.
 */
let ctx: AudioContext | null = null
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, startAt: number, duration: number, gain: number, ac: AudioContext) {
  const osc = ac.createOscillator()
  const gn = ac.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gn.gain.setValueAtTime(0, ac.currentTime + startAt)
  gn.gain.linearRampToValueAtTime(gain, ac.currentTime + startAt + 0.015)
  gn.gain.linearRampToValueAtTime(0, ac.currentTime + startAt + duration)
  osc.connect(gn); gn.connect(ac.destination)
  osc.start(ac.currentTime + startAt)
  osc.stop(ac.currentTime + startAt + duration + 0.02)
}

/** Two quick ascending notes — booking found, scan accepted, etc. */
export function playSuccessTone() {
  const ac = getCtx(); if (!ac) return
  tone(740, 0,    0.11, 0.16, ac)
  tone(988, 0.11, 0.16, 0.16, ac)
}

/** A single low buzz — booking not found, scan rejected. */
export function playErrorTone() {
  const ac = getCtx(); if (!ac) return
  tone(220, 0, 0.22, 0.14, ac)
}
