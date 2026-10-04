'use client'

import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import ThreeGlobe from 'three-globe'
import countries from '@/data/globe.json'

// Makes the WebGL renderer transparent so the CSS background shows through
function TransparentRenderer() {
  const { gl } = useThree()
  useEffect(() => {
    gl.setClearColor(0x000000, 0)
  }, [gl])
  return null
}

const CAMERA_Z = 300

// Monochrome palette: white, silver and grey arcs on a black globe.
const WHITE = '#ffffff'
const SILVER = '#bdbdbd'
const GREY = '#6e6e6e'

// ── Stealth payment connections between global financial hubs ────────────────
const CONNECTIONS = [
  { order: 1, startLat: 40.7128, startLng: -74.006, endLat: 51.5074, endLng: -0.1278, arcAlt: 0.3, color: WHITE }, // NYC → London
  { order: 1, startLat: 35.6762, startLng: 139.6503, endLat: 1.3521, endLng: 103.8198, arcAlt: 0.22, color: SILVER }, // Tokyo → Singapore
  { order: 2, startLat: 48.8566, startLng: 2.3522, endLat: 25.2048, endLng: 55.2708, arcAlt: 0.35, color: WHITE }, // Paris → Dubai
  { order: 2, startLat: -33.868, startLng: 151.2093, endLat: 31.2304, endLng: 121.4737, arcAlt: 0.2, color: GREY }, // Sydney → Shanghai
  { order: 3, startLat: 37.7749, startLng: -122.4194, endLat: 19.4326, endLng: -99.1332, arcAlt: 0.18, color: SILVER }, // SF → Mexico City
  { order: 3, startLat: 52.52, startLng: 13.405, endLat: -1.2921, endLng: 36.8219, arcAlt: 0.42, color: WHITE }, // Berlin → Nairobi
  { order: 4, startLat: 55.7558, startLng: 37.6176, endLat: 28.6139, endLng: 77.209, arcAlt: 0.3, color: GREY }, // Moscow → Delhi
  { order: 4, startLat: -22.906, startLng: -43.1729, endLat: 40.7128, endLng: -74.006, arcAlt: 0.42, color: SILVER }, // Rio → NYC
  { order: 5, startLat: 43.6532, startLng: -79.3832, endLat: 48.8566, endLng: 2.3522, arcAlt: 0.35, color: WHITE }, // Toronto → Paris
  { order: 5, startLat: 34.0522, startLng: -118.2437, endLat: 35.6762, endLng: 139.6503, arcAlt: 0.47, color: SILVER }, // LA → Tokyo
  { order: 6, startLat: 1.3521, startLng: 103.8198, endLat: 51.5074, endLng: -0.1278, arcAlt: 0.52, color: WHITE }, // Singapore → London
  { order: 6, startLat: 25.2048, startLng: 55.2708, endLat: 40.7128, endLng: -74.006, arcAlt: 0.5, color: GREY }, // Dubai → NYC
  { order: 7, startLat: 41.9028, startLng: 12.4964, endLat: 34.0522, endLng: -118.2437, arcAlt: 0.45, color: WHITE }, // Rome → LA
  { order: 7, startLat: -26.204, startLng: 28.0473, endLat: 51.5074, endLng: -0.1278, arcAlt: 0.5, color: SILVER }, // Johannesburg → London
  { order: 8, startLat: 59.9311, startLng: 30.3609, endLat: 31.2304, endLng: 121.4737, arcAlt: 0.35, color: WHITE }, // St Petersburg → Shanghai
  { order: 8, startLat: 19.4326, startLng: -99.1332, endLat: 48.8566, endLng: 2.3522, arcAlt: 0.4, color: GREY }, // Mexico City → Paris
  { order: 9, startLat: 22.3193, startLng: 114.1694, endLat: 37.7749, endLng: -122.4194, arcAlt: 0.48, color: WHITE }, // HK → SF
  { order: 9, startLat: -34.603, startLng: -58.3816, endLat: 52.52, endLng: 13.405, arcAlt: 0.52, color: SILVER }, // Buenos Aires → Berlin
]
type Connection = (typeof CONNECTIONS)[number]

function GlobeInScene() {
  const groupRef = useRef<THREE.Group>(null!)
  const globeRef = useRef<ThreeGlobe | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!groupRef.current || globeRef.current) return
    const g = new ThreeGlobe()
    groupRef.current.add(g)
    globeRef.current = g
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready || !globeRef.current) return
    const mat = globeRef.current.globeMaterial() as unknown as {
      color: THREE.Color
      emissive: THREE.Color
      emissiveIntensity: number
      shininess: number
    }
    mat.color = new THREE.Color('#000000')
    mat.emissive = new THREE.Color('#1a1a1a')
    mat.emissiveIntensity = 0.35
    mat.shininess = 0.6
  }, [ready])

  useEffect(() => {
    if (!ready || !globeRef.current) return
    const pts: { lat: number; lng: number; color: string }[] = []
    CONNECTIONS.forEach((c) => {
      pts.push({ lat: c.startLat, lng: c.startLng, color: c.color })
      pts.push({ lat: c.endLat, lng: c.endLng, color: c.color })
    })
    const unique = pts.filter((v, i, a) => a.findIndex((u) => u.lat === v.lat && u.lng === v.lng) === i)

    globeRef.current
      .hexPolygonsData((countries as { features: object[] }).features)
      .hexPolygonResolution(3)
      .hexPolygonMargin(0.7)
      .showAtmosphere(true)
      .atmosphereColor(WHITE)
      .atmosphereAltitude(0.14)
      .hexPolygonColor(() => 'rgba(255,255,255,0.14)')
      .arcsData(CONNECTIONS)
      .arcStartLat((d: object) => (d as Connection).startLat)
      .arcStartLng((d: object) => (d as Connection).startLng)
      .arcEndLat((d: object) => (d as Connection).endLat)
      .arcEndLng((d: object) => (d as Connection).endLng)
      .arcColor((d: object) => (d as Connection).color)
      .arcAltitude((d: object) => (d as Connection).arcAlt)
      .arcStroke(0.5)
      .arcDashLength(0.9)
      .arcDashInitialGap((d: object) => (d as Connection).order)
      .arcDashGap(15)
      .arcDashAnimateTime(2000)
      .pointsData(unique)
      .pointColor((d: object) => (d as { color: string }).color)
      .pointsMerge(true)
      .pointAltitude(0)
      .pointRadius(2)
  }, [ready])

  return <group ref={groupRef} />
}

/** The rotating globe, filling whatever box it is placed in. */
export function GlobeCanvas({ className = 'absolute inset-0' }: { className?: string }) {
  return (
    <div className={`${className} pointer-events-none`} aria-hidden>
      <Canvas camera={{ position: [0, 0, CAMERA_Z], fov: 50, near: 180, far: 1800 }} gl={{ antialias: true, alpha: true }} dpr={[1, 1.5]}>
        <TransparentRenderer />
        <ambientLight intensity={0.5} />
        <directionalLight position={[-400, 100, 400]} intensity={0.8} />
        <pointLight color={WHITE} position={[200, 200, 150]} intensity={0.45} />
        <pointLight color={SILVER} position={[-200, -100, 120]} intensity={0.35} />
        <fog attach="fog" args={[0x000000, 500, 1600]} />
        <GlobeInScene />
        <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} autoRotate autoRotateSpeed={0.35} />
      </Canvas>
    </div>
  )
}

/** Full-viewport fixed variant. */
export function GlobeBackground() {
  return <GlobeCanvas className="fixed inset-0 z-0" />
}
