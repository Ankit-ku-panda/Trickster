import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
export const COLORS = ['#ff8a3d', '#38d9a9', '#ff5d9e', '#7c8cff', '#ffd43b', '#69db7c', '#da77f2', '#4dabf7']
const shade = (hex) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.65).toString(16).padStart(2, '0')).join('')
// Original bean-shaped astronaut: capsule body, glass visor, backpack, swinging legs
export default function Crew({ color = '#ff8a3d', wr = { current: false }, scale = 1, ...rest }) {
  const l = useRef(), r = useRef(), body = useRef()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 11, a = wr.current ? Math.sin(t) * 0.7 : 0
    l.current.rotation.x = a; r.current.rotation.x = -a
    body.current.position.y = wr.current ? Math.abs(Math.sin(t)) * 0.07 : 0
  })
  const dark = shade(color)
  return (
    <group {...rest} scale={scale}>
      <group ref={body}>
        <mesh><capsuleGeometry args={[0.38, 0.45, 4, 12]} /><meshStandardMaterial color={color} flatShading /></mesh>
        <mesh position={[0, 0.28, 0.3]}><boxGeometry args={[0.52, 0.28, 0.2]} /><meshStandardMaterial color="#a5f3fc" emissive="#22d3ee" emissiveIntensity={0.35} flatShading /></mesh>
        <mesh position={[0, -0.05, -0.42]}><boxGeometry args={[0.45, 0.6, 0.26]} /><meshStandardMaterial color={dark} flatShading /></mesh>
      </group>
      <mesh ref={l} position={[-0.18, -0.68, 0]}><boxGeometry args={[0.24, 0.3, 0.26]} /><meshStandardMaterial color={dark} flatShading /></mesh>
      <mesh ref={r} position={[0.18, -0.68, 0]}><boxGeometry args={[0.24, 0.3, 0.26]} /><meshStandardMaterial color={dark} flatShading /></mesh>
    </group>
  )
}
