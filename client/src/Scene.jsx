import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import Crew, { COLORS } from './Crew'
import { sfx } from './sfx'
import { W, H, hit, rect, step, respawn, lethal, LEVELS, THEMES } from './game'

const X = (x) => (x - W / 2) / 40, Y = (y) => (H / 2 - y) / 40

// Camera: whole level on wide screens, follows the player on tall (portrait) screens
function CamRig({ me, zoom }) {
  useFrame(({ camera, size }) => {
    const asp = size.width / size.height, t = Math.tan((camera.fov / 2) * Math.PI / 180) * 2
    const portrait = asp < 1.1, tight = zoom && portrait
    const d = Math.max(11.8 / t, (tight ? 9.5 : 20.8) / asp / t)
    camera.position.z += (d - camera.position.z) * 0.15
    const vw = t * camera.position.z * asp, lim = Math.max(0, 10.4 - vw / 2)
    const tx = vw < 20.4 ? Math.max(-lim, Math.min(lim, X(me.current.x + 10))) : 0
    camera.position.x += (tx - camera.position.x) * 0.12
    camera.position.y += ((tight ? -1.3 : 0) - camera.position.y) * 0.1
  })
  return null
}

// ---------- level objects ----------
function Obj({ o, i, T, th }) {
  const g = useRef(), a = useRef(0)
  useFrame(() => {
    const t = Date.now(), r = rect(o, t, T.current, i), m = g.current, s = T.current
    m.position.set(X(r.x + r.w / 2), Y(r.y + r.h / 2), 0)
    if (o.k === 'f') m.visible = !s.gone.has(i)
    else if (o.k === 'i') m.visible = s.rev.has(i)
    else if (o.k === 'h') {
      a.current += ((s.pop.has(i) ? 1 : 0) - a.current) * 0.4
      m.visible = a.current > 0.02
      m.scale.set(1, Math.max(a.current, 0.01), 1)
      m.position.y = Y(r.y + r.h) + (r.h / 80) * a.current
    } else if (o.k === 'z') m.rotation.y = t / 600
  })
  const spike = o.k === 's' || o.k === 'h' || o.k === 'd'
  const color = spike ? '#ff5d73' : o.k === 'z' ? '#fbbf24' : o.k === 'm' ? '#60a5fa' : o.k === 'i' ? '#7dd3fc' : th.pc
  return (
    <mesh ref={g} rotation={o.k === 'd' ? [Math.PI, 0, 0] : [0, 0, 0]}>
      {spike ? <coneGeometry args={[o.w / 80, o.h / 40, 4]} /> : <boxGeometry args={[o.w / 40, o.h / 40, o.k === 'z' ? 0.4 : 1.2]} />}
      <meshStandardMaterial color={color} flatShading transparent={o.k === 'i'} opacity={o.k === 'i' ? 0.55 : 1}
        emissive={spike ? '#7a1020' : o.k === 'z' ? '#a16207' : '#000'} />
    </mesh>
  )
}
function Door({ lv, T }) {
  const g = useRef()
  useFrame(({ clock }) => {
    const e = T.current.door && lv.exit2 ? lv.exit2 : lv.exit, m = g.current
    m.position.x += (X(e.x + 15) - m.position.x) * 0.2
    m.position.y += (Y(e.y + 25) - m.position.y) * 0.2
    m.rotation.y = clock.elapsedTime * 1.6
  })
  return (
    <mesh ref={g}>
      <boxGeometry args={[0.75, 1.25, 0.4]} /><meshStandardMaterial color="#fbbf24" emissive="#a16207" flatShading />
    </mesh>
  )
}

// ---------- game loop: fixed 60Hz steps ----------
function Sim({ st, objs, me, K, T, sock, lvlRef }) {
  const acc = useRef(0), n = useRef(0), walkSteps = useRef(0)
  useFrame((_, dt) => {
    const S = st.current
    if (!S || S.phase !== 'play') { acc.current = 0; return }
    const m = me.current, lv = LEVELS[Math.min(S.lvl, 9)], s = T.current
    if (lvlRef.current !== S.lvl) { lvlRef.current = S.lvl; respawn(m, s) }
    acc.current += Math.min(dt, 0.1)
    while (acc.current >= 1 / 60) {
      acc.current -= 1 / 60
      const was = m.on, k = K.current, now = Date.now()
      const z = [s.gone.size, s.pop.size, s.fall.size, s.ret.size, s.rev.size, s.door]
      step(m, k, objs.current, s, now, lv)
      if (k.u && was && m.vy < 0) sfx.jump()
      if (!was && m.on) sfx.land()
      if (s.gone.size > z[0]) sfx.collapse()
      if (s.pop.size > z[1]) sfx.pop()
      if (s.fall.size > z[2]) sfx.fall()
      if (s.ret.size > z[3] || s.door > z[5]) sfx.dodge()
      if (s.rev.size > z[4]) sfx.bump()
      if (m.on && !!k.l !== !!k.r && ++walkSteps.current % 16 === 0) sfx.step()
      if (m.y > H || objs.current.some((o, i) => lethal(m, o, s, i, now))) { sfx.die(); respawn(m, s) }
      n.current++
      const ex = s.door && lv.exit2 ? lv.exit2 : lv.exit
      if (hit(m, ex) && n.current % 20 === 0) { sock.emit('pos', { x: m.x, y: m.y }); sock.emit('win', { lvl: S.lvl }) }
      if (n.current % 3 === 0) sock.volatile.emit('pos', { x: m.x, y: m.y })
    }
  })
  return null
}
const Player = ({ id, info, st, me, myId }) => {
  const pos = useRef(), rot = useRef(), last = useRef(null), face = useRef(1), walk = useRef({ current: false }).current
  useFrame(() => {
    const p = id === myId ? me.current : st.current?.players[id]
    if (!p) return
    const tx = X(p.x + 10), ty = Y(p.y + 14), g = pos.current
    if (id === myId || last.current === null) g.position.set(tx, ty, 0)
    else g.position.set(g.position.x + (tx - g.position.x) * 0.35, g.position.y + (ty - g.position.y) * 0.35, 0)
    const dx = tx - (last.current ?? tx)
    walk.current = Math.abs(dx) > 0.004
    if (Math.abs(dx) > 0.002) face.current = dx > 0 ? 1 : -1
    last.current = tx
    rot.current.rotation.y += (face.current * 1.1 - rot.current.rotation.y) * 0.25
  })
  return (
    <group ref={pos}>
      <group ref={rot}><Crew color={COLORS[info.c % 8]} wr={walk} scale={0.48} /></group>
      <Html position={[0, 0.65, 0]} center style={{ pointerEvents: 'none' }}><div className="tag">{info.n}</div></Html>
    </group>
  )
}
export default function Scene({ st, objs, objV, roster, me, K, T, sock, lvl, zoom, isTrickster, onEdit }) {
  const lvlRef = useRef(-1), li = Math.min(lvl, 9), th = THEMES[li], lv = LEVELS[li]
  return (
    <Canvas
      camera={{ position: [0, 0, 14], fov: 45 }}
      dpr={[1, 1.5]}
      gl={{ antialias: false }}
    >
      <color attach="background" args={[th.bg]} key={th.bg} />
      <ambientLight intensity={0.9} /><directionalLight position={[4, 6, 8]} intensity={1.4} />
      <CamRig me={me} zoom={zoom} />
      <Sim {...{ st, objs, me, K, T, sock, lvlRef }} />
      {objs.current.map((o, i) => <Obj key={objV + '-' + i} o={o} i={i} T={T} th={th} />)}
      <Door lv={lv} T={T} key={'d' + li} />
      {Object.entries(roster).map(([id, info]) => <Player key={id} {...{ id, info, st, me }} myId={sock.id} />)}
      {isTrickster && <mesh onPointerDown={onEdit}><planeGeometry args={[W / 40, H / 40]} /><meshBasicMaterial transparent opacity={0} /></mesh>}
    </Canvas>
  )
}
