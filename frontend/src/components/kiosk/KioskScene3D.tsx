import { useRef, useState, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import { useReducedMotion } from 'motion/react'
import * as THREE from 'three'

/**
 * On-site arrival diorama for the check-in kiosk. Unlike the booking wizard
 * (a journey from A→B), this tells the *arrival* story: a truck reaches the CFS
 * gate, checks in at the scanner, the boom barrier lifts, and it's waved through
 * to a loading bay. It reacts to the current kiosk screen.
 *
 *   welcome                    → truck waiting at the closed gate, "scan here" glow
 *   lookup/scan/slot/purpose   → scanner active (checking in)
 *   confirm/walkin             → booking found (green tick at the gate)
 *   idscan                     → ID verification beam
 *   arrived                    → boom lifts · truck rolls in · assigned bay lights up
 */

const damp = (c: number, t: number, l: number, dt: number) => c + (t - c) * (1 - Math.exp(-l * dt))
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

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

const BAY_COLORS = ['#2DD4BF', '#FBBF24', '#FB7185']

function Container({ color }: { color: string }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.55, 0]}><boxGeometry args={[1.85, 1.05, 1.45]} /><meshStandardMaterial color={color} flatShading roughness={0.55} /></mesh>
      {[-0.55, -0.18, 0.18, 0.55].map((x, i) => (
        <mesh key={i} position={[x, 0.55, 0.731]}><boxGeometry args={[0.08, 0.9, 0.02]} /><meshStandardMaterial color="#0f172a" transparent opacity={0.14} /></mesh>
      ))}
    </group>
  )
}

// ── Loading-bay dock (roller door + numbered header) ──────────────────────────
function BayDock({ color, lit }: { color: string; lit: (m: THREE.MeshStandardMaterial | null) => void }) {
  return (
    <group>
      <mesh castShadow position={[0, 1.3, 0]}><boxGeometry args={[2.4, 2.6, 2.4]} /><meshStandardMaterial color="#EEF2F7" flatShading roughness={0.7} /></mesh>
      {/* header band that lights up when assigned */}
      <mesh position={[0, 2.5, 1.21]}><boxGeometry args={[2.4, 0.4, 0.06]} /><meshStandardMaterial ref={lit} color={color} emissive={color} emissiveIntensity={0.25} /></mesh>
      {/* roller door */}
      <mesh position={[0, 0.85, 1.21]}><boxGeometry args={[1.7, 1.7, 0.05]} /><meshStandardMaterial color="#9aa6b5" flatShading roughness={0.6} /></mesh>
      {[1.4, 1.1, 0.8, 0.5, 0.2].map((y, i) => (
        <mesh key={i} position={[0, y, 1.24]}><boxGeometry args={[1.7, 0.04, 0.02]} /><meshStandardMaterial color="#6b7686" /></mesh>
      ))}
      {/* dock lip */}
      <mesh position={[0, 0.15, 1.55]}><boxGeometry args={[1.9, 0.3, 0.7]} /><meshStandardMaterial color="#cbd5e1" flatShading /></mesh>
    </group>
  )
}

function Cloud({ x, y, z, s }: { x: number; y: number; z: number; s: number }) {
  const blobs: Array<[number, number, number, number]> = [[0, 0, 0, 1], [0.9, -0.1, 0.1, 0.72], [-0.85, -0.05, -0.1, 0.68], [0.35, 0.32, 0, 0.6]]
  return (
    <group position={[x, y, z]} scale={s}>
      {blobs.map(([bx, by, bz, br], i) => (
        <mesh key={i} position={[bx, by, bz]}><icosahedronGeometry args={[br, 0]} /><meshStandardMaterial color="#F1F6FF" flatShading roughness={1} /></mesh>
      ))}
    </group>
  )
}

function Truck({ brand, service, cargoRef, wheelRefs }: {
  brand: string; service: string | null
  cargoRef: React.MutableRefObject<THREE.Group | null>
  wheelRefs: React.MutableRefObject<THREE.Group[]>
}) {
  const wheelPos: Array<[number, number]> = [[1.3, 0.7], [1.3, -0.7], [-0.7, 0.7], [-0.7, -0.7], [-1.6, 0.7], [-1.6, -0.7]]
  const loaded = service === 'Drop Off'
  return (
    <>
      <mesh position={[-0.35, 0.6, 0]}><boxGeometry args={[4, 0.22, 1.15]} /><meshStandardMaterial color="#2b3442" flatShading /></mesh>
      <mesh castShadow position={[1.4, 1.03, 0]}><boxGeometry args={[1.25, 1.35, 1.55]} /><meshStandardMaterial color={brand} flatShading roughness={0.45} /></mesh>
      <mesh castShadow position={[1.1, 1.82, 0]}><boxGeometry args={[0.75, 0.28, 1.5]} /><meshStandardMaterial color={brand} flatShading /></mesh>
      <mesh position={[2.04, 1.22, 0]}><boxGeometry args={[0.06, 0.6, 1.25]} /><meshStandardMaterial color="#0e1726" metalness={0.4} roughness={0.15} /></mesh>
      <mesh position={[2.07, 0.6, 0]}><boxGeometry args={[0.12, 0.28, 1.5]} /><meshStandardMaterial color="#94a3b8" flatShading metalness={0.4} /></mesh>
      <mesh castShadow position={[-0.55, 0.76, 0]}><boxGeometry args={[3.6, 0.16, 1.7]} /><meshStandardMaterial color="#cbd5e1" flatShading roughness={0.6} /></mesh>
      {wheelPos.map(([x, z], i) => (
        <group key={i} ref={el => { if (el) wheelRefs.current[i] = el }} position={[x, 0.35, z]}>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.35, 0.35, 0.2, 16]} /><meshStandardMaterial color="#1e2530" flatShading roughness={0.85} /></mesh>
          <mesh position={[0, 0, z > 0 ? 0.11 : -0.11]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.14, 0.14, 0.04, 12]} /><meshStandardMaterial color="#cbd5e1" metalness={0.5} /></mesh>
        </group>
      ))}
      <group ref={cargoRef} position={[-0.55, 0.85, 0]}>{loaded && <Container color="#2DD4BF" />}</group>
    </>
  )
}

function Rig({ phase, service, brand }: { phase: number; service: string | null; brand: string }) {
  const reduce = useReducedMotion()
  const truck = useRef<THREE.Group>(null!)
  const cargo = useRef<THREE.Group | null>(null)
  const wheels = useRef<THREE.Group[]>([])
  const boom = useRef<THREE.Group>(null!)
  const scanner = useRef<THREE.MeshStandardMaterial>(null!)
  const beam = useRef<THREE.Mesh>(null!)
  const tick = useRef<THREE.Group>(null!)
  const bayMats = useRef<THREE.MeshStandardMaterial[]>([])
  const keyL = useRef<THREE.DirectionalLight>(null!)

  // Truck target x: waits just before the gate (x≈-1.5), rolls through to a bay on arrival
  const arrived = phase >= 4
  const targetX = arrived ? 8 : -1.6   // roll up to the assigned (middle) bay
  const s = useRef({ x: -1.6, prevX: -1.6, boom: 0, scan: 0, tick: 0, bay: 0, clk: 0 })

  useFrame((st, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const cur = s.current
    cur.clk += dt
    const L = reduce ? 40 : 2.6

    cur.prevX = cur.x
    cur.x = damp(cur.x, targetX, L, dt)
    const dx = cur.x - cur.prevX
    if (truck.current) truck.current.position.x = cur.x
    for (const w of wheels.current) if (w) w.rotation.z -= dx * 2.7

    // Boom lifts on arrival
    cur.boom = damp(cur.boom, arrived ? 1.35 : 0, L, dt)
    if (boom.current) boom.current.rotation.z = cur.boom

    // Scanner pulse while checking in (phase 1)
    cur.scan = damp(cur.scan, phase >= 1 && phase < 4 ? 1 : 0, L, dt)
    const pulse = 0.5 + Math.abs(Math.sin(cur.clk * 3)) * 0.5
    if (scanner.current) scanner.current.emissiveIntensity = cur.scan * (0.6 + pulse * 1.2)
    if (beam.current) {
      const on = phase === 1 || phase === 3
      ;(beam.current.material as THREE.MeshStandardMaterial).opacity = damp((beam.current.material as THREE.MeshStandardMaterial).opacity, on ? 0.5 : 0, L, dt) * pulse
      beam.current.position.y = 2.0 + Math.sin(cur.clk * 2) * 0.15
    }
    // Found tick
    cur.tick = damp(cur.tick, phase >= 2 && phase < 4 ? 1 : 0, L, dt)
    if (tick.current) { tick.current.scale.setScalar(Math.max(0.0001, cur.tick)); tick.current.position.y = 3.3 + Math.sin(cur.clk * 1.6) * 0.06 }
    // Assigned bay lights
    cur.bay = damp(cur.bay, arrived ? 1 : 0, L, dt)
    bayMats.current.forEach((m, i) => { if (m) m.emissiveIntensity = (i === 1 ? cur.bay * 1.8 : 0.2) })

    if (keyL.current && !reduce) keyL.current.position.x = 9 + Math.sin(cur.clk * 0.2) * 1.5
    st.camera.lookAt(0, 1, 0)
  })

  return (
    <group>
      <ambientLight intensity={0.95} color="#EEF4FF" />
      <directionalLight ref={keyL} position={[9, 13, 7]} intensity={1.65} color="#FFFFFF" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-bias={-0.0004} />
      <directionalLight position={[-7, 5, -6]} intensity={0.45} color="#CFE3FF" />

      {/* Ground + apron */}
      <mesh position={[0, -0.5, 0]} receiveShadow><boxGeometry args={[30, 1, 14]} /><meshStandardMaterial color="#A9E1A2" flatShading roughness={0.95} /></mesh>
      <mesh position={[0, -1.15, 0]}><boxGeometry args={[30, 0.5, 14]} /><meshStandardMaterial color="#C9AA7C" flatShading /></mesh>
      {/* paved apron / lane */}
      <mesh position={[0, 0.03, 0]} receiveShadow><boxGeometry args={[30, 0.06, 3.2]} /><meshStandardMaterial color="#4b5563" flatShading roughness={0.85} /></mesh>
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh key={i} position={[-13 + i * 2.3, 0.07, 0]}><boxGeometry args={[0.9, 0.02, 0.16]} /><meshStandardMaterial color="#f8fafc" /></mesh>
      ))}

      {/* ── Gate: posts + boom barrier + entry sign ── */}
      <group position={[0.6, 0, 0]}>
        {/* posts on either side of the lane */}
        {[1.9, -1.9].map((z, i) => (
          <mesh key={i} castShadow position={[0, 1.1, z]}><boxGeometry args={[0.35, 2.2, 0.35]} /><meshStandardMaterial color="#64748b" flatShading /></mesh>
        ))}
        {/* entry sign arch */}
        <mesh position={[0, 2.5, 0]}><boxGeometry args={[0.4, 0.4, 4.4]} /><meshStandardMaterial color={brand} emissive={brand} emissiveIntensity={0.25} flatShading /></mesh>
        {/* boom barrier (pivots up) */}
        <group ref={boom} position={[0, 1.55, 1.75]}>
          <mesh castShadow position={[0, 0, -1.6]}><boxGeometry args={[0.14, 0.14, 3.2]} /><meshStandardMaterial color="#ef4444" flatShading /></mesh>
          {[-0.4, -1.0, -1.6, -2.2, -2.8].map((z, i) => (
            <mesh key={i} position={[0, 0.001, z]}><boxGeometry args={[0.16, 0.16, 0.28]} /><meshStandardMaterial color={i % 2 ? '#ffffff' : '#ef4444'} flatShading /></mesh>
          ))}
        </group>
      </group>

      {/* ── Scanner pillar (the kiosk itself) ── */}
      <group position={[-1.0, 0, 2.0]}>
        <mesh castShadow position={[0, 0.75, 0]}><boxGeometry args={[0.5, 1.5, 0.5]} /><meshStandardMaterial color="#475569" flatShading /></mesh>
        <mesh position={[0, 1.15, 0.27]} rotation={[-0.35, 0, 0]}>
          <boxGeometry args={[0.5, 0.6, 0.06]} />
          <meshStandardMaterial ref={scanner} color="#0f172a" emissive={brand} emissiveIntensity={0.4} />
        </mesh>
      </group>
      {/* scan beam over the truck */}
      <mesh ref={beam} position={[-1.6, 2, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.05, 1.1, 2.0, 4, 1, true]} />
        <meshStandardMaterial color={brand} emissive={brand} emissiveIntensity={1.4} transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* ── Loading bays: a dock frontage set back from the lane, doors facing the road ── */}
      {[4, 8, 12].map((x, i) => (
        <group key={i} position={[x, 0, -4]}>
          <BayDock color={BAY_COLORS[i]} lit={m => { if (m) bayMats.current[i] = m }} />
        </group>
      ))}
      {/* a couple of yard containers off to the side */}
      <group position={[15, 0, -3.5]}><Container color="#FBBF24" /></group>
      <group position={[15, 1.15, -3.5]}><Container color="#60A5FA" /></group>

      {/* Found tick above the gate */}
      <group ref={tick} position={[0.6, 3.3, 0]} scale={0.0001}>
        <mesh><cylinderGeometry args={[0.55, 0.55, 0.12, 24]} /><meshStandardMaterial color="#22C55E" emissive="#22C55E" emissiveIntensity={0.5} /></mesh>
        <mesh position={[-0.08, -0.02, 0.08]} rotation={[0, 0, 0.9]}><boxGeometry args={[0.14, 0.5, 0.05]} /><meshStandardMaterial color="#fff" /></mesh>
        <mesh position={[0.12, 0.06, 0.08]} rotation={[0, 0, -0.5]}><boxGeometry args={[0.14, 0.28, 0.05]} /><meshStandardMaterial color="#fff" /></mesh>
      </group>

      {/* Truck approaching the gate */}
      <group ref={truck} position={[-1.6, 0, 0]}><Truck brand={brand} service={service} cargoRef={cargo} wheelRefs={wheels} /></group>

      {/* Pines + clouds */}
      {([[-8, -4, '#3FAE6A'], [-6, 4, '#45B873']] as Array<[number, number, string]>).map(([x, z, c], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.1, 0.14, 0.7, 6]} /><meshStandardMaterial color="#7c4a1e" flatShading /></mesh>
          <mesh castShadow position={[0, 1.05, 0]}><coneGeometry args={[0.6, 1.2, 7]} /><meshStandardMaterial color={c} flatShading roughness={0.85} /></mesh>
        </group>
      ))}
      <Cloud x={-8} y={7} z={-4} s={1.1} />
      <Cloud x={5} y={8} z={-6} s={1.3} />

      <ContactShadows position={[0, 0.05, 0]} scale={34} blur={2.2} far={9} opacity={0.3} color="#334155" resolution={1024} />
    </group>
  )
}

const PHASE: Record<string, number> = {
  welcome: 0, lookup: 1, scan: 1, 'slot-picker': 1, purpose: 1,
  confirm: 2, walkin: 2, consent: 2.6, idscan: 3, arrived: 4, screensaver: 0,
}

export function KioskScene3D({ screen, service }: { screen: string; service: string | null }) {
  const brand = useBrandColor()
  const phase = PHASE[screen] ?? 0
  const orbit = useRef({ az: 0.95, el: 0.36, taz: 0.95, tel: 0.36, dragging: false, lx: 0, ly: 0 })
  const [grabbing, setGrabbing] = useState(false)

  const onDown = (e: React.PointerEvent) => { const o = orbit.current; o.dragging = true; o.lx = e.clientX; o.ly = e.clientY; setGrabbing(true) }
  const onMove = (e: React.PointerEvent) => {
    const o = orbit.current; if (!o.dragging) return
    o.taz = clamp(o.taz - (e.clientX - o.lx) * 0.006, 0.5, 1.4); o.tel = clamp(o.tel + (e.clientY - o.ly) * 0.005, 0.2, 0.7)
    o.lx = e.clientX; o.ly = e.clientY
  }
  const onUp = () => { orbit.current.dragging = false; setGrabbing(false) }

  return (
    <div
      style={{
        position: 'relative', width: '100%', height: '100%',
        cursor: grabbing ? 'grabbing' : 'grab', touchAction: 'none',
        WebkitMaskImage: 'radial-gradient(150% 130% at 50% 40%, #000 62%, transparent 100%)',
        maskImage: 'radial-gradient(150% 130% at 50% 40%, #000 62%, transparent 100%)',
      }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp}
    >
      <Canvas
        orthographic dpr={[1, 2]} shadows
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        camera={{ zoom: 34, near: -100, far: 200 }}
        style={{ background: 'transparent' }}
        onCreated={({ camera }) => { const R = 34, o = orbit.current; camera.position.set(Math.cos(o.az) * Math.cos(o.el) * R, Math.sin(o.el) * R, Math.sin(o.az) * Math.cos(o.el) * R) }}
      >
        <OrbitDriver orbit={orbit} />
        <Rig phase={phase} service={service} brand={brand} />
      </Canvas>
    </div>
  )
}

// Applies the damped orbit each frame
function OrbitDriver({ orbit }: { orbit: React.MutableRefObject<any> }) {
  useFrame((st, dt) => {
    const o = orbit.current
    o.az = damp(o.az, o.taz, 7, Math.min(dt, 0.05))
    o.el = damp(o.el, o.tel, 7, Math.min(dt, 0.05))
    const R = 34, hz = Math.cos(o.el) * R
    st.camera.position.set(Math.cos(o.az) * hz, Math.sin(o.el) * R + 1, Math.sin(o.az) * hz)
    st.camera.lookAt(0, 1, 0)
  })
  return null
}
