import { useRef, useState, useEffect, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import { useReducedMotion } from 'motion/react'
import * as THREE from 'three'

/**
 * Immersive isometric diorama of the booking as a delivery run down a curving
 * road. It reacts to the real choices and can be orbited with the mouse (drag
 * the scene). Rendered behind the wizard with a soft focus-mask, so it reads as
 * a full-screen world the form floats over — no boxed frame.
 *
 *   1 Slots        — rig idling at the CFS depot
 *   2 Service Type — orients to the travel direction
 *   3 Load Type    — cargo loads onto the flatbed (FCL container · LCL crates)
 *   4 Time Slot    — departs; the chosen time repaints the whole palette
 *   5 Details      — mid-run along the curve
 *   6 Documents    — cleared-paperwork seal floats up
 *   7 Review & Pay — arrival · booked ring
 */

type Props = {
  step: number
  serviceType: 'pickup' | 'dropoff' | null
  loadType: 'fcl' | 'lcl' | null
  slotCount: number
  slotLabel: string
  hasDocs: boolean
  slots?: Array<{ loadType: 'fcl' | 'lcl' | null; serviceType?: 'pickup' | 'dropoff' | null }>
  focusSlotIndex?: number
}

const damp = (c: number, t: number, l: number, dt: number) => c + (t - c) * (1 - Math.exp(-l * dt))
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const clamp01 = (v: number) => clamp(v, 0, 1)
const _tmp = new THREE.Color()
const dampColor = (cur: THREE.Color, hex: string, k: number) => cur.lerp(_tmp.set(hex), k)

function useBrandColor() {
  const [c, setC] = useState('#2563EB')
  useEffect(() => {
    const read = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--brand-color').trim()
      if (v) setC(v)
    }
    read()
    // Tenant colour lands async (after this scene has already mounted) — watch for it instead of reading once
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => mo.disconnect()
  }, [])
  return c
}

export function timeOfDay(label: string): 'morning' | 'day' | 'evening' {
  const m = label?.match(/(\d{1,2}):/)
  if (!m) return 'day'
  const h = parseInt(m[1], 10)
  if (h < 11) return 'morning'
  if (h < 16) return 'day'
  return 'evening'
}

type Preset = { key: string; kI: number; kPos: [number, number, number]; fill: string; fI: number; amb: string; aI: number; glow: number; ground: string; cloud: string }
const PRESETS: Record<string, Preset> = {
  day:     { key: '#FFFFFF', kI: 1.65, kPos: [10, 14, 8],  fill: '#CFE3FF', fI: 0.5,  amb: '#EEF4FF', aI: 0.95, glow: 0,   ground: '#A9E1A2', cloud: '#F1F6FF' },
  morning: { key: '#FFD79A', kI: 1.5,  kPos: [-13, 6, 7],  fill: '#FFC48F', fI: 0.45, amb: '#FFF3E4', aI: 0.95, glow: 0.2, ground: '#BBE2A2', cloud: '#FFE9D2' },
  evening: { key: '#FF9663', kI: 1.35, kPos: [13, 5, -2],  fill: '#8E7DF2', fI: 0.6,  amb: '#CFC2EC', aI: 0.7,  glow: 1,   ground: '#7F9E86', cloud: '#E9CFE6' },
}

const CONTAINER_COLORS = ['#2DD4BF', '#FB7185', '#FBBF24', '#60A5FA']

// Convoy spacing. A truck is ~4.5 units long (rear axle → front bumper), so the centre-to-centre
// queue gap must clear that or parked trucks visually merge into one blob. The depot straight is
// stretched per extra truck by a matching amount so the longer queue still fits on the land.
const QUEUE_GAP = 6.0
const DEPOT_STRETCH_PER_TRUCK = 7.4
// The depot/container yard sits far to the left (~x-18) while the destination city sits around
// x+13..16 — so the true midpoint of the scene content is left of world origin, not at 0. Shift
// the ground plane + camera framing by this much so both sides get even margins (previously the
// left container overflowed the land edge while the right had a big empty green strip).
const SCENE_CENTER_X = -2

// ── Detailed shipping container (corrugation · doors · corner castings) ────────
function Container({ color, w = 1.9, h = 1.05, d = 1.45 }: { color: string; w?: number; h?: number; d?: number }) {
  const ribs = Math.max(4, Math.round(w / 0.28))
  return (
    <group>
      <mesh castShadow><boxGeometry args={[w, h, d]} /><meshStandardMaterial color={color} flatShading roughness={0.55} /></mesh>
      {/* side corrugation */}
      {Array.from({ length: ribs }).map((_, i) => {
        const x = -w / 2 + 0.14 + i * ((w - 0.28) / (ribs - 1))
        return (
          <group key={i}>
            <mesh position={[x, 0, d / 2 + 0.001]}><boxGeometry args={[0.07, h * 0.86, 0.02]} /><meshStandardMaterial color="#0f172a" transparent opacity={0.13} /></mesh>
            <mesh position={[x, 0, -d / 2 - 0.001]}><boxGeometry args={[0.07, h * 0.86, 0.02]} /><meshStandardMaterial color="#0f172a" transparent opacity={0.13} /></mesh>
          </group>
        )
      })}
      {/* top & bottom rails */}
      {[h / 2, -h / 2].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}><boxGeometry args={[w + 0.02, 0.07, d + 0.02]} /><meshStandardMaterial color="#1e293b" transparent opacity={0.25} flatShading /></mesh>
      ))}
      {/* corner castings */}
      {[[1, 1, 1], [1, 1, -1], [-1, 1, 1], [-1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, -1, 1], [-1, -1, -1]].map(([sx, sy, sz], i) => (
        <mesh key={i} position={[sx * (w / 2 - 0.05), sy * (h / 2 - 0.05), sz * (d / 2 - 0.05)]}><boxGeometry args={[0.12, 0.12, 0.12]} /><meshStandardMaterial color="#334155" flatShading /></mesh>
      ))}
      {/* doors on the +x end */}
      <mesh position={[w / 2 + 0.011, 0, 0]}><boxGeometry args={[0.02, h * 0.9, d * 0.9]} /><meshStandardMaterial color={color} flatShading roughness={0.5} /></mesh>
      {[-d * 0.18, d * 0.18].map((z, i) => (
        <mesh key={i} position={[w / 2 + 0.03, 0, z]}><boxGeometry args={[0.04, h * 0.8, 0.05]} /><meshStandardMaterial color="#1e293b" /></mesh>
      ))}
    </group>
  )
}

// ── One cargo unit on the flatbed ─────────────────────────────────────────────
function CargoUnit({ loadType, color, x }: { loadType: 'fcl' | 'lcl'; color: string; x: number }) {
  if (loadType === 'fcl') return <group position={[x, 0.55, 0]}><Container color={color} /></group>
  const crates: Array<[number, number, number, string]> = [
    [-0.42, 0.32, -0.32, '#E4B584'], [0.42, 0.32, -0.32, '#D69A5C'],
    [-0.42, 0.32, 0.32, '#D69A5C'], [0.42, 0.32, 0.32, '#E4B584'], [0, 0.92, 0, color],
  ]
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0.06, 0]}><boxGeometry args={[1.5, 0.12, 1.3]} /><meshStandardMaterial color="#8B5E34" flatShading /></mesh>
      {crates.map(([cx, cy, cz, c], i) => (
        <mesh key={i} castShadow position={[cx, cy + 0.08, cz]}><boxGeometry args={[0.72, 0.62, 0.72]} /><meshStandardMaterial color={c} flatShading roughness={0.7} />
          <mesh position={[0, 0, 0.37]}><boxGeometry args={[0.5, 0.06, 0.02]} /><meshStandardMaterial color="#1e293b" transparent opacity={0.3} /></mesh>
        </mesh>
      ))}
    </group>
  )
}

// ── A building with a window grid (glows at dusk) ─────────────────────────────
function Building({ w, h, d, color, glowRef }: { w: number; h: number; d: number; color: string; glowRef: (m: THREE.MeshStandardMaterial | null) => void }) {
  const cols = Math.max(2, Math.round(w / 0.5))
  const rows = Math.max(2, Math.round(h / 0.7))
  const wins: Array<[number, number]> = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) wins.push([-w / 2 + 0.35 + c * ((w - 0.7) / Math.max(1, cols - 1)), -h / 2 + 0.5 + r * ((h - 1) / Math.max(1, rows - 1))])
  return (
    <group>
      <mesh castShadow position={[0, h / 2, 0]}><boxGeometry args={[w, h, d]} /><meshStandardMaterial color={color} flatShading roughness={0.65} /></mesh>
      {/* parapet */}
      <mesh position={[0, h + 0.06, 0]}><boxGeometry args={[w + 0.08, 0.12, d + 0.08]} /><meshStandardMaterial color="#1e293b" transparent opacity={0.3} flatShading /></mesh>
      {/* rooftop unit */}
      <mesh castShadow position={[w * 0.15, h + 0.22, -d * 0.1]}><boxGeometry args={[0.4, 0.3, 0.4]} /><meshStandardMaterial color="#94a3b8" flatShading /></mesh>
      {/* windows on +z face */}
      {wins.map(([x, y], i) => (
        <mesh key={i} position={[x, h / 2 + y, d / 2 + 0.01]}>
          <boxGeometry args={[0.28, 0.42, 0.03]} />
          <meshStandardMaterial ref={i === 0 ? glowRef : undefined} color="#a9c7e8" emissive="#FFE0A3" emissiveIntensity={0} roughness={0.3} metalness={0.2} />
        </mesh>
      ))}
    </group>
  )
}

// ── Low-poly cloud (faceted blobs) ────────────────────────────────────────────
function Cloud({ x, y, z, s, matRef }: { x: number; y: number; z: number; s: number; matRef: (m: THREE.MeshStandardMaterial | null) => void }) {
  const blobs: Array<[number, number, number, number]> = [[0, 0, 0, 1], [0.9, -0.1, 0.1, 0.75], [-0.85, -0.05, -0.1, 0.7], [0.35, 0.35, 0, 0.65], [-0.35, 0.3, 0.15, 0.6]]
  return (
    <group position={[x, y, z]} scale={s}>
      {blobs.map(([bx, by, bz, br], i) => (
        <mesh key={i} position={[bx, by, bz]}>
          <icosahedronGeometry args={[br, 0]} />
          <meshStandardMaterial ref={i === 0 ? matRef : undefined} color="#F1F6FF" flatShading roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

// ── A streetlight that clearly reaches over the road & glows at dusk ──────────
function StreetLight({ x, z, glowRef }: { x: number; z: number; glowRef: (m: THREE.MeshStandardMaterial | null) => void }) {
  const dir = z > 0 ? -1 : 1            // arm reaches toward the road centre
  const reach = 1.0
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.06, 0.09, 2.8, 8]} /><meshStandardMaterial color="#5b6472" flatShading /></mesh>
      <mesh position={[0, 2.75, dir * reach * 0.5]}><boxGeometry args={[0.09, 0.09, reach]} /><meshStandardMaterial color="#5b6472" flatShading /></mesh>
      {/* lamp head — tapers downward */}
      <mesh position={[0, 2.62, dir * reach]} rotation={[Math.PI, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.22, 0.24, 6]} />
        <meshStandardMaterial ref={glowRef} color="#8b93a1" emissive="#FFE08A" emissiveIntensity={0} />
      </mesh>
    </group>
  )
}

// ── Low-poly driver in hi-vis + hard hat ──────────────────────────────────────
function Driver({ walkRef }: { walkRef: React.MutableRefObject<{ l: THREE.Mesh | null; r: THREE.Mesh | null }> }) {
  const vest = '#D9E650', skin = '#E8B98F', trousers = '#334155'
  return (
    <group>
      {/* legs (refs so they can swing while walking) */}
      <mesh ref={el => { walkRef.current.l = el }} position={[-0.1, 0.32, 0]}><boxGeometry args={[0.16, 0.62, 0.2]} /><meshStandardMaterial color={trousers} flatShading /></mesh>
      <mesh ref={el => { walkRef.current.r = el }} position={[0.1, 0.32, 0]}><boxGeometry args={[0.16, 0.62, 0.2]} /><meshStandardMaterial color={trousers} flatShading /></mesh>
      {/* boots */}
      <mesh position={[-0.1, 0.04, 0.03]}><boxGeometry args={[0.17, 0.1, 0.28]} /><meshStandardMaterial color="#1e293b" flatShading /></mesh>
      <mesh position={[0.1, 0.04, 0.03]}><boxGeometry args={[0.17, 0.1, 0.28]} /><meshStandardMaterial color="#1e293b" flatShading /></mesh>
      {/* torso — hi-vis vest */}
      <mesh castShadow position={[0, 0.92, 0]}><boxGeometry args={[0.46, 0.62, 0.28]} /><meshStandardMaterial color={vest} flatShading roughness={0.6} /></mesh>
      {/* reflective bands */}
      <mesh position={[0, 1.0, 0.145]}><boxGeometry args={[0.46, 0.07, 0.02]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
      <mesh position={[0, 0.82, 0.145]}><boxGeometry args={[0.46, 0.07, 0.02]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
      {/* arms */}
      <mesh position={[-0.31, 0.92, 0]}><boxGeometry args={[0.13, 0.56, 0.16]} /><meshStandardMaterial color={vest} flatShading /></mesh>
      <mesh position={[0.31, 0.92, 0]}><boxGeometry args={[0.13, 0.56, 0.16]} /><meshStandardMaterial color={vest} flatShading /></mesh>
      {/* head */}
      <mesh castShadow position={[0, 1.38, 0]}><sphereGeometry args={[0.16, 16, 16]} /><meshStandardMaterial color={skin} flatShading /></mesh>
      {/* hard hat */}
      <mesh position={[0, 1.5, 0]}><sphereGeometry args={[0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#F59E0B" flatShading /></mesh>
      <mesh position={[0, 1.48, 0.12]}><boxGeometry args={[0.34, 0.03, 0.14]} /><meshStandardMaterial color="#F59E0B" flatShading /></mesh>
    </group>
  )
}

// ── Truck (cab faces +x) — one per booking slot ──────────────────────────────
function TruckModel({ brand, loadType, cargoColor, setCargo, setWheel, setHead }: {
  brand: string; loadType: 'fcl' | 'lcl' | null; cargoColor: string
  setCargo: (g: THREE.Group | null) => void
  setWheel?: (g: THREE.Group | null, i: number) => void
  setHead?: (m: THREE.MeshStandardMaterial | null) => void
}) {
  const wheelPos: Array<[number, number]> = [[1.35, 0.72], [1.35, -0.72], [-0.75, 0.72], [-0.75, -0.72], [-1.65, 0.72], [-1.65, -0.72]]
  return (
    <>
      <mesh position={[-0.35, 0.62, 0]}><boxGeometry args={[4.1, 0.22, 1.15]} /><meshStandardMaterial color="#2b3442" flatShading /></mesh>
      <mesh castShadow position={[1.45, 1.05, 0]}><boxGeometry args={[1.25, 1.35, 1.55]} /><meshStandardMaterial color={brand} flatShading roughness={0.45} metalness={0.1} /></mesh>
      <mesh castShadow position={[1.15, 1.85, 0]}><boxGeometry args={[0.75, 0.28, 1.5]} /><meshStandardMaterial color={brand} flatShading /></mesh>
      <mesh position={[2.09, 1.25, 0]}><boxGeometry args={[0.06, 0.6, 1.25]} /><meshStandardMaterial color="#0e1726" metalness={0.4} roughness={0.15} /></mesh>
      <mesh position={[2.12, 0.62, 0]}><boxGeometry args={[0.12, 0.28, 1.5]} /><meshStandardMaterial color="#94a3b8" flatShading metalness={0.4} /></mesh>
      {/* exhaust stack */}
      <mesh position={[0.78, 1.5, 0.72]}><cylinderGeometry args={[0.06, 0.06, 1.5, 8]} /><meshStandardMaterial color="#9aa4b2" metalness={0.5} roughness={0.4} /></mesh>
      <mesh position={[2.1, 0.9, 0.52]}><boxGeometry args={[0.07, 0.2, 0.24]} /><meshStandardMaterial ref={m => setHead?.(m)} color="#fff7d6" emissive="#fde68a" emissiveIntensity={0} /></mesh>
      <mesh position={[2.1, 0.9, -0.52]}><boxGeometry args={[0.07, 0.2, 0.24]} /><meshStandardMaterial color="#fff7d6" emissive="#fde68a" emissiveIntensity={0} /></mesh>
      <mesh castShadow position={[-0.55, 0.78, 0]}><boxGeometry args={[3.7, 0.16, 1.7]} /><meshStandardMaterial color="#cbd5e1" flatShading roughness={0.6} /></mesh>
      {[0.86, -0.86].map((z, i) => (
        <mesh key={i} position={[-0.55, 0.86, z]}><boxGeometry args={[3.7, 0.12, 0.06]} /><meshStandardMaterial color="#94a3b8" flatShading /></mesh>
      ))}
      {wheelPos.map(([x, z], i) => (
        <group key={i} ref={el => setWheel?.(el, i)} position={[x, 0.36, z]}>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.36, 0.36, 0.2, 16]} /><meshStandardMaterial color="#1e2530" flatShading roughness={0.85} /></mesh>
          <mesh position={[0, 0, z > 0 ? 0.11 : -0.11]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.15, 0.15, 0.04, 12]} /><meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.4} /></mesh>
          <mesh position={[0, 0, z > 0 ? 0.115 : -0.115]}><boxGeometry args={[0.5, 0.06, 0.02]} /><meshStandardMaterial color="#94a3b8" /></mesh>
        </group>
      ))}
      <group ref={setCargo} position={[-0.55, 0.86, 0]}>
        {loadType && <CargoUnit loadType={loadType} color={cargoColor} x={0} />}
      </group>
    </>
  )
}

// ── Road ribbon built from a curve ────────────────────────────────────────────
function useRoad(nTrucks: number) {
  return useMemo(() => {
    // More slots → longer depot straight so the convoy has room to queue without crowding
    const extra = Math.max(0, nTrucks - 1) * DEPOT_STRETCH_PER_TRUCK
    // The destination (right) half is kept nearly straight — the drop-off convoy queues along
    // it, and a tight bend there makes adjacent trucks face different ways ("crashed" look). Only
    // the depot (left) half keeps a gentle curve for character; the pickup queue sits on its long,
    // near-straight approach so it stays aligned too.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-16 - extra, 0, 3.2), new THREE.Vector3(-8 - extra * 0.5, 0, -1.4), new THREE.Vector3(-1, 0, 1.0),
      new THREE.Vector3(7, 0, 0.5), new THREE.Vector3(16, 0, 0.9),
    ], false, 'catmullrom', 0.5)
    const SEG = Math.min(200, 120 + Math.round(extra * 4)), HALF = 2.4
    const pos: number[] = [], idx: number[] = [], uv: number[] = []
    const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3()
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG
      const p = curve.getPointAt(t), tan = curve.getTangentAt(t)
      side.crossVectors(tan, up).normalize().multiplyScalar(HALF)
      pos.push(p.x - side.x, 0.05, p.z - side.z, p.x + side.x, 0.05, p.z + side.z)
      uv.push(0, t * SEG * 0.5, 1, t * SEG * 0.5)
    }
    for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setIndex(idx); geo.computeVertexNormals()
    // dash transforms — more dashes for a longer road so spacing stays consistent
    const nDash = Math.round(22 + extra * 1.8)
    const dashes: Array<{ p: THREE.Vector3; ry: number }> = []
    for (let i = 0; i < nDash; i++) {
      const t = 0.03 + i * (0.94 / (nDash - 1))
      const p = curve.getPointAt(t), tan = curve.getTangentAt(t)
      dashes.push({ p, ry: Math.atan2(-tan.z, tan.x) })
    }
    const len = curve.getLength()
    return { curve, geo, dashes, len }
  }, [nTrucks])
}

function Rig(props: Props & { brand: string; orbit: React.MutableRefObject<any> }) {
  const { step, serviceType, loadType, slotCount, slotLabel, hasDocs, slots, brand, orbit } = props
  const reduce = useReducedMotion()
  const nTrucks = Math.max(1, Math.min(slotCount || 1, 10))   // one truck per slot (a convoy)
  const { curve, geo, dashes, len } = useRoad(nTrucks)

  const trucks = useRef<THREE.Group[]>([])   // one per booking slot
  const cargos = useRef<(THREE.Group | null)[]>([])
  const wheels = useRef<THREE.Group[]>([])   // lead truck only
  const seal = useRef<THREE.Group>(null!)
  const pin = useRef<THREE.Group>(null!)       // pickup delivery pin (city · red)
  const pinDrop = useRef<THREE.Group>(null!)   // drop-off point pin (depot · blue)
  const ring = useRef<THREE.Mesh>(null!)       // arrival ring at the pickup end (tHi · destination city)
  const ringDrop = useRef<THREE.Mesh>(null!)   // arrival ring at the drop-off end (tLo · depot)
  const keyL = useRef<THREE.DirectionalLight>(null!)
  const fillL = useRef<THREE.DirectionalLight>(null!)
  const ambL = useRef<THREE.AmbientLight>(null!)
  const warmL = useRef<THREE.PointLight>(null!)
  const headMat = useRef<THREE.MeshStandardMaterial | null>(null)
  const groundMat = useRef<THREE.MeshStandardMaterial>(null!)
  const lampMats = useRef<THREE.MeshStandardMaterial[]>([])
  const winMats = useRef<THREE.MeshStandardMaterial[]>([])
  const cloudMats = useRef<THREE.MeshStandardMaterial[]>([])
  const clouds = useRef<THREE.Group[]>([])
  const driver = useRef<THREE.Group>(null!)
  const walkLegs = useRef<{ l: THREE.Mesh | null; r: THREE.Mesh | null }>({ l: null, r: null })
  const badge = useRef<THREE.Group>(null!)
  const idLines = useRef<THREE.Mesh[]>([])
  const idPhoto = useRef<THREE.Mesh>(null!)

  const dropoff = serviceType === 'dropoff'
  // How much the depot straight was stretched for this convoy size — ground, camera framing
  // and orbit target all key off this so nothing floats off the land as slotCount grows
  const extra = Math.max(0, nTrucks - 1) * DEPOT_STRETCH_PER_TRUCK
  // Truck param t along the curve: load at the depot end (steps 1-3), then run
  const travelP = clamp01((step - 3) / 4)
  const cargoOn = step >= 3 && !!loadType
  // Each truck's cargo comes from ITS OWN slot's choice. When per-slot data is present (the
  // multi-slot wizard always supplies it), a slot with no load type yet stays empty — we must
  // NOT fall back to the global `loadType`, or picking one slot would put cargo on every truck.
  // The global fallback only applies to the legacy single-slot case where no `slots` array exists.
  const loadOf = (i: number): 'fcl' | 'lcl' | null => slots ? (slots[i]?.loadType ?? null) : loadType
  // Each truck in the convoy faces the direction its own slot's service implies
  const dropoffOf = (i: number): boolean => (slots?.[i]?.serviceType ?? serviceType) === 'dropoff'
  // Pickup and drop-off trucks queue on opposite sides of the road (like opposing lanes)
  // instead of interleaved nose-to-tail facing different ways in the same line.
  const laneInfo: Array<{ dOf: boolean; idx: number }> = (() => {
    let p = 0, d = 0
    const out: Array<{ dOf: boolean; idx: number }> = []
    for (let i = 0; i < nTrucks; i++) {
      const dOf = dropoffOf(i)
      out.push({ dOf, idx: dOf ? d++ : p++ })
    }
    return out
  })()
  // Only split into two lanes when the convoy is genuinely mixed — a uniform convoy
  // (all pickup or all dropoff) still queues single-file, centred on the road as before.
  const isMixedConvoy = laneInfo.some(l => l.dOf) && laneInfo.some(l => !l.dOf)

  // Real-world spacing between queued trucks, as a fraction of the (variable-length) road
  const queueGapT = QUEUE_GAP / len
  const LANE_HALF = 1.35   // opposing lanes sit this far either side of the road centreline

  // The depot (pickup) queue extends BACKWARD from tLo and the destination (dropoff) queue
  // extends FORWARD from tHi. Push each anchor inward by that queue's own length so the whole
  // convoy always lands on the road ribbon (t∈[0,1]) — and therefore on the ground — instead
  // of extrapolating off the ends and floating past the land when many slots are selected.
  // Small convoys keep the original 0.14 / 0.86 framing; the rear truck never sits below
  // t≈0.06 nor beyond t≈0.94, regardless of how long the road grows for big convoys.
  const nDrop = laneInfo.filter(l => l.dOf).length
  const nPick = nTrucks - nDrop
  const pickupSpanT = Math.max(0, nPick - 1) * queueGapT
  const dropoffSpanT = Math.max(0, nDrop - 1) * queueGapT
  let tLo = Math.max(0.14, 0.06 + pickupSpanT)
  let tHi = Math.min(0.86, 0.94 - dropoffSpanT)
  // Safety net: keep a minimum travel run if a huge mixed convoy squeezes both ends inward
  if (tHi - tLo < 0.16) { const mid = (tLo + tHi) / 2; tLo = mid - 0.08; tHi = mid + 0.08 }

  const origin = dropoff ? curve.getPointAt(tHi) : curve.getPointAt(tLo)
  // Where each service's convoy ends up on arrival: pickups drive to tHi (the city), drop-offs
  // to tLo (the depot). A mixed convoy arrives at BOTH ends, so each end gets its own booked ring.
  const pArrivePick = curve.getPointAt(clamp(tHi, 0.001, 0.999))
  const pArriveDrop = curve.getPointAt(clamp(tLo, 0.001, 0.999))

  // Depot sits a fixed real-world distance off the road's start, offset to the side (perpendicular
  // to the road) — anchored by arc length rather than a hardcoded world position, so it never drifts
  // onto the road or off the widened ground when the depot straight is stretched for bigger convoys.
  const depotAnchorT = clamp(0.001 + 2.6 / len, 0.001, 0.4)
  const depotAnchorP = curve.getPointAt(depotAnchorT)
  const depotAnchorTan = curve.getTangentAt(depotAnchorT)
  const depotSide = new THREE.Vector3(-depotAnchorTan.z, 0, depotAnchorTan.x).normalize()
  // Sits back from the road edge by ~1.4 units (matching the destination city clearance). Bumped
  // from 4.4 when the road was widened (HALF 1.5→2.4), which had pushed the road edge up against
  // the depot's dock face.
  const DEPOT_OFFSET = 5.7
  const depotPos: [number, number, number] = [
    depotAnchorP.x - depotSide.x * DEPOT_OFFSET, 0, depotAnchorP.z - depotSide.z * DEPOT_OFFSET,
  ]
  const yardPos: [number, number, number] = [depotPos[0] - 3.2, 0, depotPos[2] + 0.8]

  const s = useRef({ prog: 0, t: dropoff ? tHi : tLo, cargo: 0, cargoY: 1.4, seal: 0, ready: 0, glow: 0, clk: 0, prevT: dropoff ? tHi : tLo, din: 0, idDev: 0, badge: 0, camX: 0, focusPulse: 0 })

  // Sample the road at any t, extrapolating in a straight line (X only) past either end —
  // used both by the lead truck and by every queued truck in the convoy.
  const sampleRoad = (t: number): { p: THREE.Vector3; tan: THREE.Vector3 } => {
    if (t < 0.001) {
      const p0 = curve.getPointAt(0.001), tan0 = curve.getTangentAt(0.001)
      return { p: p0.clone().setX(p0.x + tan0.x * (t - 0.001) * len), tan: tan0 }
    }
    if (t > 0.999) {
      const p1 = curve.getPointAt(0.999), tan1 = curve.getTangentAt(0.999)
      return { p: p1.clone().setX(p1.x + tan1.x * (t - 0.999) * len), tan: tan1 }
    }
    return { p: curve.getPointAt(t), tan: curve.getTangentAt(t) }
  }

  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const cur = s.current
    cur.clk += dt
    const L = reduce ? 40 : 6.5   // snappier — choices should read on the scene almost immediately
    const k = 1 - Math.exp(-L * dt)

    // Shared "story time" (0 = queued at depot, 1 = arrived) — each truck derives its own
    // curve position from this using its OWN service direction, so a mixed convoy never
    // has a truck visually facing backwards while actually driving forwards.
    cur.prog = damp(cur.prog, travelP, L, dt)
    cur.prevT = cur.t
    cur.t = dropoff ? tHi - (tHi - tLo) * cur.prog : tLo + (tHi - tLo) * cur.prog
    const tt = clamp(cur.t, 0.001, 0.999)
    const p = curve.getPointAt(tt)
    const dT = cur.t - cur.prevT
    const speed = Math.abs(dT) * 40

    // Cargo load-in progress (shared)
    cur.cargo = damp(cur.cargo, cargoOn ? 1 : 0, L, dt)
    cur.cargoY = damp(cur.cargoY, cargoOn ? 0 : 1.4, L, dt)

    // Gentle pulse under whichever truck the current step's slot tab has open
    cur.focusPulse = (Math.sin(cur.clk * 2.4) + 1) / 2

    for (let i = 0; i < nTrucks; i++) {
      const g = trucks.current[i]; if (!g) continue
      const { dOf, idx } = laneInfo[i]
      const baseTi = dOf ? tHi - (tHi - tLo) * cur.prog : tLo + (tHi - tLo) * cur.prog
      const tiRaw = dOf ? baseTi + idx * queueGapT : baseTi - idx * queueGapT
      const { p: pBase, tan: tani } = sampleRoad(tiRaw)
      // Lane offset — pickups queue on one side of the road, drop-offs on the other
      const side = new THREE.Vector3(-tani.z, 0, tani.x).normalize()
      const pi = pBase.clone().addScaledVector(side, isMixedConvoy ? (dOf ? 1 : -1) * LANE_HALF : 0)
      const diri = dOf ? tani.clone().negate() : tani
      const bob = i === 0 && speed > 0.002 && !reduce ? Math.sin(cur.clk * 22) * Math.min(speed, 0.4) * 0.04 : 0
      const focus = i === (props.focusSlotIndex ?? 0) && nTrucks > 1 && !reduce ? 1 + cur.focusPulse * 0.05 : 1
      g.position.set(pi.x, bob + (focus > 1 ? cur.focusPulse * 0.08 : 0), pi.z)
      g.rotation.y = Math.atan2(-diri.z, diri.x)
      g.scale.setScalar(focus)
      const cg = cargos.current[i]; if (cg) { cg.scale.setScalar(Math.max(0.0001, cur.cargo)); cg.position.y = 0.86 + cur.cargoY }
    }
    const roll = dT * (dropoff ? -160 : 160)
    for (const w of wheels.current) if (w) w.rotation.z -= roll

    // ── Story: driver climbs in · ID badge develops (personal-info step) ──
    cur.din = damp(cur.din, step >= 2 ? 1 : 0, 2.6, dt)          // 0 = standing by the cab, 1 = climbed in
    if (driver.current) {
      // stand beside the door (local to the truck) → step onto the sill → gone
      driver.current.position.set(1.35 + cur.din * 0.55, cur.din * 0.4, 0.95 - cur.din * 0.55)
      driver.current.rotation.y = -0.6 - cur.din * 0.9
      driver.current.scale.setScalar(Math.max(0.0001, 1 - clamp01((cur.din - 0.55) / 0.45)))
      const walking = cur.din > 0.02 && cur.din < 0.9 && !reduce ? Math.sin(cur.clk * 9) * 0.5 : 0
      if (walkLegs.current.l) walkLegs.current.l.rotation.x = walking
      if (walkLegs.current.r) walkLegs.current.r.rotation.x = -walking
    }
    // ID badge: fill in the fields over ~2s while on step 1, then float away
    cur.badge = damp(cur.badge, step <= 1 ? 1 : 0, 3, dt)
    cur.idDev = step <= 1 ? Math.min(1, cur.idDev + dt * 0.55) : 0
    if (badge.current) {
      // float it forward & toward centre — clear of the depot and the stepper band
      badge.current.position.set(origin.x + (dropoff ? -3.4 : 3.4), 3.3 + Math.sin(cur.clk * 1.6) * 0.09, origin.z + 3.0)
      badge.current.scale.setScalar(Math.max(0.0001, cur.badge * 1.7))
      badge.current.quaternion.copy(st.camera.quaternion)   // billboard toward viewer
    }
    if (idPhoto.current) (idPhoto.current.material as THREE.MeshStandardMaterial).opacity = clamp01(cur.idDev * 2)
    idLines.current.forEach((ln, i) => { if (ln) ln.scale.x = clamp01((cur.idDev - 0.25 - i * 0.22) / 0.22) })

    // Seal
    cur.seal = damp(cur.seal, hasDocs && step >= 6 ? 1 : 0, L, dt)
    if (seal.current) {
      seal.current.position.set(p.x, 2.9 + Math.sin(cur.clk * 1.8) * 0.07, p.z)
      seal.current.scale.setScalar(Math.max(0.0001, cur.seal))
      seal.current.rotation.y = Math.sin(cur.clk * 0.8) * 0.35
    }

    // Booked — a ring at each arrival end that actually has trucks (so a mixed pickup/drop-off
    // convoy celebrates at BOTH ends, not just the one the global service type points at).
    cur.ready = damp(cur.ready, step >= 7 ? 1 : 0, L, dt)
    const readyPick = nPick > 0 ? cur.ready : 0
    const readyDrop = nDrop > 0 ? cur.ready : 0
    if (ring.current) {
      ring.current.position.set(pArrivePick.x, 1.1, pArrivePick.z)
      ring.current.scale.setScalar(0.001 + readyPick * 1.25)
      ring.current.rotation.z += dt * 0.7 * readyPick
      ;(ring.current.material as THREE.MeshStandardMaterial).opacity = readyPick * 0.9
    }
    if (ringDrop.current) {
      ringDrop.current.position.set(pArriveDrop.x, 1.1, pArriveDrop.z)
      ringDrop.current.scale.setScalar(0.001 + readyDrop * 1.25)
      ringDrop.current.rotation.z += dt * 0.7 * readyDrop
      ;(ringDrop.current.material as THREE.MeshStandardMaterial).opacity = readyDrop * 0.9
    }
    const pinBob = 3.0 + (step >= 7 ? Math.abs(Math.sin(cur.clk * 3)) * 0.35 : Math.sin(cur.clk * 1.3) * 0.1)
    if (pin.current) pin.current.position.y = pinBob
    if (pinDrop.current) pinDrop.current.position.y = pinBob

    // Drift clouds
    for (const c of clouds.current) if (c) { c.position.x += dt * 0.35; if (c.position.x > 20) c.position.x = -20 }

    // Lighting → time preset
    const pre = PRESETS[timeOfDay(slotLabel)] ?? PRESETS.day
    cur.glow = damp(cur.glow, pre.glow, L, dt)
    if (keyL.current) {
      dampColor(keyL.current.color, pre.key, k)
      keyL.current.intensity = damp(keyL.current.intensity, pre.kI, L, dt)
      keyL.current.position.x = damp(keyL.current.position.x, pre.kPos[0], L, dt)
      keyL.current.position.y = damp(keyL.current.position.y, pre.kPos[1], L, dt)
      keyL.current.position.z = damp(keyL.current.position.z, pre.kPos[2], L, dt)
    }
    if (fillL.current) { dampColor(fillL.current.color, pre.fill, k); fillL.current.intensity = damp(fillL.current.intensity, pre.fI, L, dt) }
    if (ambL.current) { dampColor(ambL.current.color, pre.amb, k); ambL.current.intensity = damp(ambL.current.intensity, pre.aI, L, dt) }
    if (groundMat.current) dampColor(groundMat.current.color, pre.ground, k)
    for (const m of cloudMats.current) if (m) dampColor(m.color, pre.cloud, k)
    if (warmL.current) warmL.current.intensity = damp(warmL.current.intensity, cur.glow * 2.2, L, dt)
    if (headMat.current) headMat.current.emissiveIntensity = cur.glow * 2.4
    for (const m of lampMats.current) if (m) m.emissiveIntensity = cur.glow * 2.8
    for (const m of winMats.current) if (m) m.emissiveIntensity = cur.glow * 1.6

    // ── Orbit camera (drag the scene) — pan + zoom out to fit the whole convoy + city ──
    const o = orbit.current
    o.az = damp(o.az, o.taz, 7, dt)
    o.el = damp(o.el, o.tel, 7, dt)
    const R = 42, hz = Math.cos(o.el) * R
    // Re-centre on the midpoint of the depot queue and the destination city (ground/road grow the same way)
    cur.camX = damp(cur.camX, SCENE_CENTER_X - extra / 2, 7, dt)
    st.camera.position.set(cur.camX + Math.cos(o.az) * hz, Math.sin(o.el) * R + 1, Math.sin(o.az) * hz)
    st.camera.lookAt(cur.camX, 1.1, 0)
    const oc = st.camera as THREE.OrthographicCamera
    // The framing (truck/depot position along the curve) was composed for a wide, short
    // desktop banner. On a narrower/taller canvas (mobile — full width but a squat
    // 46vh-high scene band) that same zoom crops the sides first, pushing the lead
    // truck out of frame. Zoom out further as the canvas aspect narrows so the whole
    // convoy stays visible instead of just the empty stretch of road.
    const aspect = st.size.width / Math.max(1, st.size.height)
    // Wide desktop canvas (aspect ~3): zoom out to show the full diorama.
    // Narrow/tall canvas (mobile): zoom out further so nothing is cropped.
    const aspectFactor = clamp(aspect / 1.6, 0.45, 1.1)
    const tgtZoom = Math.max(4.8, 16 / (1 + extra / 32)) * aspectFactor
    oc.zoom = damp(oc.zoom, tgtZoom, 7, dt)
    oc.updateProjectionMatrix()
  })

  return (
    <group>
      <ambientLight ref={ambL} intensity={0.95} color="#EEF4FF" />
      <directionalLight ref={keyL} position={[10, 14, 8]} intensity={1.65} color="#FFFFFF" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-bias={-0.0004} />
      <directionalLight ref={fillL} position={[-8, 5, -6]} intensity={0.5} color="#CFE3FF" />
      <pointLight ref={warmL} position={[0, 3, 3]} distance={28} color="#FFB870" intensity={0} />

      {/* Ground + soil — widens leftward to stay under the depot queue as slotCount grows */}
      <mesh position={[SCENE_CENTER_X - extra / 2, -0.5, 0]} receiveShadow><boxGeometry args={[40 + extra, 1, 13]} /><meshStandardMaterial ref={groundMat} color="#A9E1A2" flatShading roughness={0.95} /></mesh>
      <mesh position={[SCENE_CENTER_X - extra / 2, -1.18, 0]}><boxGeometry args={[40 + extra, 0.55, 13]} /><meshStandardMaterial color="#C9AA7C" flatShading /></mesh>

      {/* Curved road + dashes */}
      <mesh geometry={geo} receiveShadow><meshStandardMaterial color="#3f4753" flatShading roughness={0.85} side={THREE.DoubleSide} /></mesh>
      {dashes.map((d, i) => (
        <mesh key={i} position={[d.p.x, 0.09, d.p.z]} rotation={[0, d.ry, 0]}><boxGeometry args={[0.85, 0.02, 0.14]} /><meshStandardMaterial color="#f8fafc" /></mesh>
      ))}

      {/* CFS depot (left) */}
      <group position={depotPos}>
        <mesh castShadow position={[0, 1.4, 0]}><boxGeometry args={[4, 2.8, 3.8]} /><meshStandardMaterial color="#EEF2F7" flatShading roughness={0.7} /></mesh>
        {/* corrugated gable roof */}
        <mesh castShadow position={[0, 3.0, 0]}><boxGeometry args={[4.3, 0.3, 4.1]} /><meshStandardMaterial color={brand} flatShading /></mesh>
        {/* brand signage band */}
        <mesh position={[0, 2.35, 1.91]}><boxGeometry args={[3, 0.4, 0.05]} /><meshStandardMaterial color={brand} emissive={brand} emissiveIntensity={0.25} /></mesh>
        {/* roller door */}
        <mesh position={[1.1, 0.8, 1.92]}><boxGeometry args={[1.5, 1.6, 0.05]} /><meshStandardMaterial color="#9aa6b5" flatShading roughness={0.6} /></mesh>
        {[1.3, 1.0, 0.7, 0.4].map((y, i) => <mesh key={i} position={[1.1, y, 1.95]}><boxGeometry args={[1.5, 0.04, 0.02]} /><meshStandardMaterial color="#6b7686" /></mesh>)}
        {/* loading dock lip */}
        <mesh position={[1.1, 0.15, 2.3]}><boxGeometry args={[1.7, 0.3, 0.7]} /><meshStandardMaterial color="#cbd5e1" flatShading /></mesh>
      </group>
      {/* container yard — tucked left of the depot so it never blocks the truck */}
      <group position={yardPos}>
        {([[0, 0.55, 0, 0], [2.05, 0.55, 0, 1], [1.02, 1.62, 0, 2]] as Array<[number, number, number, number]>).map(([x, y, z, ci], i) => (
          <group key={i} position={[x, y, z]}><Container color={CONTAINER_COLORS[ci]} /></group>
        ))}
      </group>

      {/* Destination city (right) */}
      <group position={[13, 0, -4.3]}>
        <group position={[-1.6, 0, 0.3]}><Building w={1.5} h={2.6} d={1.5} color="#93C5FD" glowRef={m => { if (m) winMats.current[0] = m }} /></group>
        <group position={[0.4, 0, -0.5]}><Building w={1.7} h={4.0} d={1.6} color="#C4B5FD" glowRef={m => { if (m) winMats.current[1] = m }} /></group>
        <group position={[2.3, 0, 0.4]}><Building w={1.4} h={2.0} d={1.4} color="#FCA5A5" glowRef={m => { if (m) winMats.current[2] = m }} /></group>
      </group>

      {/* Destination pins — red marks the pickup delivery point (city), blue the drop-off
          point (depot). Each shows only when the convoy actually has that kind of trip. */}
      {nPick > 0 && (
        <group ref={pin} position={[pArrivePick.x, 3.0, pArrivePick.z]}>
          <mesh position={[0, 0.22, 0]}><sphereGeometry args={[0.4, 18, 18]} /><meshStandardMaterial color="#F43F5E" flatShading emissive="#F43F5E" emissiveIntensity={0.2} /></mesh>
          <mesh position={[0, -0.34, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.32, 0.66, 18]} /><meshStandardMaterial color="#F43F5E" flatShading /></mesh>
          <mesh position={[0, 0.25, 0.33]}><sphereGeometry args={[0.15, 12, 12]} /><meshStandardMaterial color="#fff" /></mesh>
        </group>
      )}
      {nDrop > 0 && (
        <group ref={pinDrop} position={[pArriveDrop.x, 3.0, pArriveDrop.z]}>
          <mesh position={[0, 0.22, 0]}><sphereGeometry args={[0.4, 18, 18]} /><meshStandardMaterial color="#2563EB" flatShading emissive="#2563EB" emissiveIntensity={0.2} /></mesh>
          <mesh position={[0, -0.34, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.32, 0.66, 18]} /><meshStandardMaterial color="#2563EB" flatShading /></mesh>
          <mesh position={[0, 0.25, 0.33]}><sphereGeometry args={[0.15, 12, 12]} /><meshStandardMaterial color="#fff" /></mesh>
        </group>
      )}

      {/* Streetlights along the road */}
      <StreetLight x={-6} z={1.9} glowRef={m => { if (m) lampMats.current[0] = m }} />
      <StreetLight x={1} z={-1.9} glowRef={m => { if (m) lampMats.current[1] = m }} />
      <StreetLight x={8} z={1.9} glowRef={m => { if (m) lampMats.current[2] = m }} />

      {/* Pines */}
      {([[-8.5, -3, '#3FAE6A'], [5.5, 4.3, '#45B873'], [-2, 4.4, '#3FAE6A']] as Array<[number, number, string]>).map(([x, z, c], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.1, 0.14, 0.7, 6]} /><meshStandardMaterial color="#7c4a1e" flatShading /></mesh>
          <mesh castShadow position={[0, 1.0, 0]}><coneGeometry args={[0.6, 1.1, 7]} /><meshStandardMaterial color={c} flatShading roughness={0.85} /></mesh>
          <mesh castShadow position={[0, 1.55, 0]}><coneGeometry args={[0.42, 0.8, 7]} /><meshStandardMaterial color={c} flatShading roughness={0.85} /></mesh>
        </group>
      ))}

      {/* Clouds */}
      {([[-9, 7.5, -4, 1.1], [4, 8.5, -6, 1.4], [12, 7, -3, 0.9]] as Array<[number, number, number, number]>).map(([x, y, z, sc], i) => (
        <group key={i} ref={el => { if (el) clouds.current[i] = el }} position={[x, y, z]}>
          <Cloud x={0} y={0} z={0} s={sc} matRef={m => { if (m) cloudMats.current[i] = m }} />
        </group>
      ))}

      {/* Convoy — one truck per booking slot */}
      {Array.from({ length: nTrucks }).map((_, i) => (
        <group key={i} ref={el => { if (el) trucks.current[i] = el }}>
          <TruckModel
            brand={brand}
            loadType={loadOf(i)}
            cargoColor={CONTAINER_COLORS[i % CONTAINER_COLORS.length]}
            setCargo={g => { cargos.current[i] = g }}
            setWheel={i === 0 ? (el, wi) => { if (el) wheels.current[wi] = el } : undefined}
            setHead={i === 0 ? (m) => { headMat.current = m } : undefined}
          />
          {i === 0 && <group ref={driver} position={[1.35, 0, 0.95]}><Driver walkRef={walkLegs} /></group>}
        </group>
      ))}

      {/* Developing ID badge (personal-info step) */}
      <group ref={badge} position={[origin.x, 4.6, origin.z]} scale={0.0001}>
        {/* soft glow halo so it pops off the scene */}
        <mesh position={[0, 0, -0.06]}><planeGeometry args={[1.7, 2.0]} /><meshBasicMaterial color={brand} transparent opacity={0.16} /></mesh>
        {/* card */}
        <mesh><boxGeometry args={[1.05, 1.35, 0.05]} /><meshStandardMaterial color="#ffffff" flatShading /></mesh>
        {/* brand header + ID label bar */}
        <mesh position={[0, 0.56, 0.03]}><boxGeometry args={[1.05, 0.26, 0.02]} /><meshStandardMaterial color={brand} emissive={brand} emissiveIntensity={0.35} /></mesh>
        {/* lanyard clip */}
        <mesh position={[0, 0.76, 0]}><boxGeometry args={[0.16, 0.14, 0.06]} /><meshStandardMaterial color="#94a3b8" /></mesh>
        {/* photo (fades in) */}
        <mesh ref={idPhoto} position={[-0.28, 0.04, 0.03]}><boxGeometry args={[0.38, 0.46, 0.02]} /><meshStandardMaterial color="#D9E650" transparent opacity={0} /></mesh>
        {/* fields that fill in */}
        {[0.16, -0.06, -0.28, -0.5].map((y, i) => (
          <mesh key={i} ref={el => { if (el) idLines.current[i] = el }} position={[0.15, y, 0.031]} scale={[0.001, 1, 1]}>
            <boxGeometry args={[0.5, 0.07, 0.01]} /><meshStandardMaterial color={i === 0 ? '#334155' : '#cbd5e1'} />
          </mesh>
        ))}
      </group>

      {/* Seal */}
      <group ref={seal} position={[0, 2.9, 0]} scale={0.0001}>
        <mesh><boxGeometry args={[0.85, 1.05, 0.06]} /><meshStandardMaterial color="#ffffff" flatShading /></mesh>
        {[0.26, 0.04, -0.18].map((y, i) => <mesh key={i} position={[0, y, 0.04]}><boxGeometry args={[0.55, 0.06, 0.02]} /><meshStandardMaterial color="#cbd5e1" /></mesh>)}
        <mesh position={[0.2, -0.38, 0.06]}><cylinderGeometry args={[0.18, 0.18, 0.05, 18]} /><meshStandardMaterial color="#22C55E" emissive="#22C55E" emissiveIntensity={0.5} /></mesh>
      </group>

      {/* Booked rings — one per arrival end (pickup · drop-off) */}
      <mesh ref={ring} position={[0, 1.1, 0]} rotation={[Math.PI / 2, 0, 0]} scale={0.0001}>
        <torusGeometry args={[2.3, 0.11, 8, 44]} /><meshStandardMaterial color={brand} emissive={brand} emissiveIntensity={1.5} transparent opacity={0} />
      </mesh>
      <mesh ref={ringDrop} position={[0, 1.1, 0]} rotation={[Math.PI / 2, 0, 0]} scale={0.0001}>
        <torusGeometry args={[2.3, 0.11, 8, 44]} /><meshStandardMaterial color={brand} emissive={brand} emissiveIntensity={1.5} transparent opacity={0} />
      </mesh>

      <ContactShadows position={[0, 0.08, 0]} scale={40} blur={2.2} far={10} opacity={0.3} color="#334155" resolution={1024} />
    </group>
  )
}

export function WizardScene3D(props: Props) {
  const brand = useBrandColor()
  const orbit = useRef({ az: 1.48, el: 0.28, taz: 1.48, tel: 0.28, dragging: false, lx: 0, ly: 0 })
  const [grabbing, setGrabbing] = useState(false)

  const onDown = (e: React.PointerEvent) => { const o = orbit.current; o.dragging = true; o.lx = e.clientX; o.ly = e.clientY; setGrabbing(true); (e.target as Element).setPointerCapture?.(e.pointerId) }
  const onMove = (e: React.PointerEvent) => {
    const o = orbit.current; if (!o.dragging) return
    const dx = e.clientX - o.lx, dy = e.clientY - o.ly; o.lx = e.clientX; o.ly = e.clientY
    o.taz = clamp(o.taz - dx * 0.006, 0.6, 2.1)
    o.tel = clamp(o.tel + dy * 0.005, 0.18, 0.72)
  }
  const onUp = () => { orbit.current.dragging = false; setGrabbing(false) }

  return (
    <>
      {/* Scene layer — sits behind the page, soft-masked (no boxed frame) */}
      <div
        className="wiz-scene3d-layer"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '58%', zIndex: 0, pointerEvents: 'none',
          WebkitMaskImage: 'radial-gradient(140% 100% at 50% 34%, #000 58%, rgba(0,0,0,0.28) 84%, transparent 100%)',
          maskImage: 'radial-gradient(140% 100% at 50% 34%, #000 58%, rgba(0,0,0,0.28) 84%, transparent 100%)',
        }}
      >
        <Canvas
          orthographic dpr={[1, 2]} shadows
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          camera={{ zoom: 30, near: -120, far: 200 }}
          style={{ background: 'transparent' }}
        >
          <Rig {...props} brand={brand} orbit={orbit} />
        </Canvas>
      </div>
      {/* Interaction pad — orbit only when dragging the core scene area. Sits BELOW the
          wizard's content layer (zIndex 2) so the form/step panel always wins pointer
          hit-testing where it overlaps this band — otherwise this invisible drag strip
          would capture clicks meant for inputs and show a grab cursor over the form. */}
      <div
        className="wiz-orbit-pad"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onWheel={e => { const sc = document.querySelector('.wiz-scroll'); if (sc) sc.scrollTop += e.deltaY }}
        style={{ position: 'absolute', top: 128, left: 0, right: 0, height: 'calc(44% - 128px)', zIndex: 1, cursor: grabbing ? 'grabbing' : 'grab', touchAction: 'none' }}
      />
    </>
  )
}
