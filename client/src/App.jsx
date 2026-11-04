import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Stars, Float } from '@react-three/drei'
import Crew, { COLORS } from './Crew'
import Scene from './Scene'
import { sfx, isMuted, setMuted } from './sfx'
import { W, H, START, SIZES, hit, rect, newT, resetT, LEVELS } from './game'
import { connect } from './net'

const WALK = { current: true }
const KEYS = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', Space: 'u' }
const TOOLS = [['p', 'Platform'], ['s', 'Spike'], ['f', 'Fake floor'], ['m', 'Moving'], ['h', 'Hidden spike'], ['d', 'Falling spike'], ['i', 'Invisible'], ['x', 'Delete']]

function Spin({ children }) {
  const g = useRef()
  useFrame((_, d) => { g.current.rotation.y += d * 0.9 })
  return <group ref={g}>{children}</group>
}
function Backdrop() {
  return (
    <div className="bg">
      <Canvas camera={{ position: [0, 0, 9], fov: 50 }}>
        <ambientLight intensity={0.9} /><directionalLight position={[3, 5, 5]} intensity={1.3} />
        <Stars radius={40} depth={30} count={1500} factor={4} fade speed={1} />
        {[[-4.2, 1.5, 0], [4.4, -1, 0], [-2.8, -2.3, 1], [3, 2.3, -1]].map((p, i) => (
          <Float key={i} speed={2} rotationIntensity={1.5} floatIntensity={2}>
            <Crew color={COLORS[i * 2]} wr={WALK} position={p} scale={0.9} />
          </Float>
        ))}
      </Canvas>
    </div>
  )
}
function Hero() {
  return (
    <div className="hero">
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <ambientLight intensity={0.9} /><directionalLight position={[2, 3, 4]} intensity={1.5} />
        <Float speed={3} floatIntensity={1}><Spin><Crew color="#ff8a3d" wr={WALK} scale={1.7} /></Spin></Float>
      </Canvas>
    </div>
  )
}
function Mute() {
  const [m, setM] = useState(isMuted())
  return <button data-nosfx onClick={() => { setMuted(!m); setM(!m); if (m) sfx.click() }}>Sound {m ? 'off' : 'on'}</button>
}
// touch controls, shown on phones and tablets only
function Pad({ K }) {
  const hold = (k) => ({
    'data-nosfx': 1,
    onPointerDown: (e) => { e.preventDefault(); K.current[k] = true },
    onPointerUp: () => { K.current[k] = false },
    onPointerLeave: () => { K.current[k] = false },
    onPointerCancel: () => { K.current[k] = false },
    onContextMenu: (e) => e.preventDefault(),
  })
  return (
    <div className="pad">
      <div><button {...hold('l')}>&lt;</button><button {...hold('r')}>&gt;</button></div>
      <button className="jump" {...hold('u')}>Jump</button>
    </div>
  )
}

function SndBtn() {
  const [m, setM] = useState(isMuted())
  return <button data-nosfx className="ib" onClick={() => { setMuted(!m); setM(!m); if (m) sfx.click() }}>{m ? 'SND OFF' : 'SND ON'}</button>
}

function Room({ sock, code, onLeave, connectionError }) {
  const st = useRef(null), objs = useRef([]), me = useRef({ ...START, vy: 0 }), K = useRef({}), T = useRef(newT())
  const roleR = useRef(null), phaseR = useRef(null), msgEnd = useRef(), toolR = useRef('p'), chatR = useRef(false), toastT = useRef()
  const [objV, setObjV] = useState(0), [role, setRole] = useState(null), [tool, setTool] = useState('p')
  const [hud, setHud] = useState(null), [note, setNote] = useState(''), [title, setTitle] = useState('')
  const [msgs, setMsgs] = useState([]), [text, setText] = useState('')
  const [chatOpen, setChatOpen] = useState(false), [unread, setUnread] = useState(0), [toast, setToast] = useState(null)
  const [toolsOpen, setToolsOpen] = useState(false), [zoom, setZoom] = useState(true)
  toolR.current = tool; chatR.current = chatOpen
  const push = (m) => setMsgs((a) => [...a.slice(-60), m])

  useEffect(() => {
    document.body.classList.add('inroom')
    sock.on('state', (s) => {
      if (phaseR.current !== s.phase) {
        if (s.phase === 'play') sfx.start()
        if (s.phase === 'done') sfx.over()
        phaseR.current = s.phase
      }
      st.current = s
    })
    sock.on('objs', (o, edit) => {
      const prev = objs.current.length
      objs.current = o; setObjV((v) => v + 1)
      if (edit && o.length < prev) resetT(T.current)
      if (edit) o.length < prev ? sfx.del() : roleR.current ? sfx.place() : sfx.trap()
    })
    sock.on('role', (r) => { roleR.current = r.trickster; setRole(r.trickster); sfx.role(r.trickster) })
    sock.on('reveal', (n) => { setNote(n + ' was the Trickster'); push({ sys: 1, t: n + ' was the Trickster' }); sfx.win(); setTimeout(() => setNote(''), 3500) })
    sock.on('chat', (m) => {
      push(m)
      if (m.sys) { if (m.t.endsWith('joined')) sfx.join(); return }
      sfx.chat()
      if (!chatR.current && st.current?.players[sock.id]?.n !== m.n) {
        setUnread((u) => u + 1); setToast(m)
        clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 3500)
      }
    })
    const kd = (e) => {
      if (e.target.tagName === 'INPUT') return
      const k = KEYS[e.code]
      if (k) { K.current[k] = e.type === 'keydown'; e.preventDefault() }
    }
    const blur = () => { K.current = {} }
    addEventListener('keydown', kd); addEventListener('keyup', kd); addEventListener('blur', blur)
    const iv = setInterval(() => { if (st.current) setHud({ ...st.current }) }, 200)
    return () => {
      document.body.classList.remove('inroom')
      clearInterval(iv)
      removeEventListener('keydown', kd); removeEventListener('keyup', kd); removeEventListener('blur', blur)
      ;['state', 'objs', 'role', 'reveal', 'chat'].forEach((e) => sock.off(e))
    }
  }, [])
  useEffect(() => { msgEnd.current?.scrollTo(0, 99999) }, [msgs, chatOpen])
  useEffect(() => { if (role === true) setZoom(false); else if (role === false) setZoom(true) }, [role])
  useEffect(() => {
    if (hud?.phase !== 'play') return
    setTitle('Level ' + (hud.lvl + 1) + ': ' + LEVELS[hud.lvl].name)
    const t = setTimeout(() => setTitle(''), 2200)
    return () => clearTimeout(t)
  }, [hud?.phase, hud?.lvl])

  const onEdit = (e) => {
    const x = e.point.x * 40 + W / 2, y = H / 2 - e.point.y * 40, tl = toolR.current
    if (tl === 'x') {
      const i = objs.current.findIndex((o) => hit({ x: x - 5, y: y - 5, w: 10, h: 10 }, rect(o, Date.now())))
      if (i >= 0) sock.emit('del', i)
    } else {
      const [w, h] = SIZES[tl]
      sock.emit('add', { k: tl, x: Math.round((x - w / 2) / 10) * 10, y: Math.round((y - h / 2) / 10) * 10 })
    }
  }
  const roster = hud?.players || {}
  const completed = hud?.completed || []
  const hasCompletedLevel = completed.includes(sock.id)
  const best = hud && Object.entries(hud.scores).sort((a, b) => b[1] - a[1])[0]
  const playing = hud?.phase === 'play'
  const send = (e) => {
    if (e.key !== 'Enter') return
    const t = text.trim()
    if (t) { sock.emit('chat', t); setText('') }
    if (playing) e.target.blur()
  }
  const fs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())
  const toolName = (TOOLS.find((t) => t[0] === tool) || [])[1]
  return (
    <div className="room">
      <div className="stage" onPointerDown={() => document.activeElement?.blur?.()}>
        <Scene {...{ st, objs, objV, roster, me, K, T, sock, zoom }} lvl={hud?.lvl || 0} isTrickster={playing && role === true} onEdit={onEdit} />
        <div className="hud">
          <div className="hl">
            <div>{playing ? 'L' + (hud.lvl + 1) + '/10 ' + LEVELS[hud.lvl].name.toUpperCase() : 'ROOM ' + code}</div>
            {hud && <div className="sc">{Object.entries(hud.scores).map(([id, s]) => (roster[id]?.n || '?') + ' ' + s).join(' | ')}</div>}
            {playing && role && <div className="err">TRICKSTER: {toolName}</div>}
          </div>
          <div className="ibs">
            <button className="ib" onClick={() => { setChatOpen((o) => !o); setUnread(0); setToast(null) }}>
              CHAT{unread > 0 && <span className="badge">{unread}</span>}
            </button>
            {playing && role && !hasCompletedLevel && <button className="ib alt" onClick={() => setToolsOpen((o) => !o)}>TOOLS</button>}
            <button className="ib pOnly" onClick={() => setZoom((z) => !z)}>{zoom ? 'FULL VIEW' : 'ZOOM IN'}</button>
            {document.fullscreenEnabled && <button className="ib" onClick={fs}>FULL</button>}
            <SndBtn />
            <button className="ib alt" onClick={onLeave}>EXIT</button>
          </div>
        </div>
        {toast && !chatOpen && <div className="toast"><b style={{ color: COLORS[toast.c % 8] }}>{toast.n}:</b> {toast.t}</div>}
        {(note || title) && <div className="over"><h2>{note || title}</h2></div>}
        {connectionError && (
          <div className="over">
            <div className="px"><h2>Connection interrupted</h2><p>{connectionError}</p></div>
          </div>
        )}
        {playing && hasCompletedLevel && (
          <div className="over">
            <div className="px">
              <h2>Level cleared!</h2>
              <p>Wait for the other players to reach the gate.</p>
              <p>{completed.length} / {Object.keys(roster).length} players ready</p>
            </div>
          </div>
        )}
        {hud?.phase === 'lobby' && (
          <div className="over dim"><div className="px">
            <h2>Lobby</h2>
            <p>Room code: <b className="err">{code}</b></p>
            {Object.values(roster).map((p, i) => <div key={i}>{p.n}{p.online === false ? ' (reconnecting)' : ''}</div>)}
            <p className="mute">The host starts the game. The Trickster is picked at random and kept secret.</p>
            {hud?.host === sock.id
              ? <button onClick={() => sock.emit('start')}>Start game</button>
              : <p className="mute">Waiting for the host to start the game.</p>}
          </div></div>
        )}
        {hud?.phase === 'done' && <div className="over dim"><div className="px"><h2>Game over</h2><p>Winner: {roster[best[0]]?.n} ({best[1]} levels)</p></div></div>}
        {playing && <Pad K={K} />}
      </div>
      {chatOpen && (
        <div className="chatpop">
          <div className="chat-h"><span>CHAT</span><button className="ib alt" onClick={() => setChatOpen(false)}>CLOSE</button></div>
          <div className="msgs" ref={msgEnd}>
            {msgs.map((m, i) => m.sys
              ? <div key={i} className="msg sys">{m.t}</div>
              : <div key={i} className="msg"><b style={{ color: COLORS[m.c % 8] }}>{m.n}:</b> {m.t}</div>)}
          </div>
          <input placeholder="Type, press Enter" value={text} maxLength={120} autoFocus={!matchMedia('(pointer:coarse)').matches}
            onChange={(e) => setText(e.target.value)} onKeyDown={send} />
        </div>
      )}
      {toolsOpen && (
        <div className="sheet">
          {TOOLS.map(([k, l]) => <button key={k} className={tool === k ? 'on' : ''} onClick={() => { setTool(k); setToolsOpen(false) }}>{l}</button>)}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState('landing'), [err, setErr] = useState(''), [code, setCode] = useState(''), [room, setRoom] = useState(null)
  const [name, setName] = useState(() => { try { return localStorage.getItem('tn-name') || '' } catch { return '' } })
  const [connectionError, setConnectionError] = useState('')
  const sock = useRef(null), roomRef = useRef(null)

  useEffect(() => {
    const click = (e) => { const b = e.target.closest?.('button'); if (b && !b.dataset.nosfx) sfx.click() }
    document.addEventListener('pointerdown', click)
    return () => document.removeEventListener('pointerdown', click)
  }, [])

  const enter = (ev, arg) => {
    const n = name.trim()
    if (!n) return setErr('Type a username first')
    try { localStorage.setItem('tn-name', n) } catch {}
    sock.current?.disconnect()
    const s = connect(n)
    sock.current = s
    s.on('connect_error', () => {
      if (roomRef.current) setConnectionError('Connection lost. Retrying...')
      else setErr('Server not reachable. Try again in a moment.')
    })
    s.on('disconnect', () => {
      if (roomRef.current) setConnectionError('Trying to reconnect to the room...')
    })
    s.on('connect', () => {
      if (!roomRef.current) return
      s.emit('resume', roomRef.current, (r) => {
        if (r?.error) setConnectionError(`Could not reconnect to the room: ${r.error}`)
        else { setConnectionError(''); setErr('') }
      })
    })
    s.emit(ev, arg, (r) => {
      if (r.error) { setErr(r.error); s.disconnect(); sock.current = null }
      else {
        roomRef.current = r.code
        setConnectionError('')
        setErr('')
        setRoom(r.code)
      }
    })
  }
  const leave = () => {
    roomRef.current = null
    sock.current?.disconnect()
    sock.current = null
    setConnectionError('')
    setRoom(null)
  }

  if (room) return <Room sock={sock.current} code={room} onLeave={leave} connectionError={connectionError} />
  return (
    <>
      <Backdrop />
      <div className="page">
        <h1>Trickster Levels</h1>
        {page === 'landing' && (<>
          <Hero />
          <p>10 levels. One secret Trickster builds the traps while you run.</p>
          <button onClick={() => setPage('menu')}>Play</button>
          <button className="alt" onClick={() => setPage('how')}>How to play</button><Mute />
          <div><video src="/trailer.mp4" autoPlay muted loop playsInline controls /></div>
        </>)}
        {page === 'how' && (
          <div className="px wide">
            <h2>How to play</h2>
            <ul>
              <li>Pick a username, create a room, and share the 5 letter code.</li>
              <li>The room host starts the game. Nobody has extra power during the run.</li>
              <li>Each level the server picks one Trickster at random. Only that player is told.</li>
              <li>Crewmates run to the gold door. Arrows or WASD and Space, or the on-screen buttons on a phone.</li>
              <li>Levels are sneaky: floors collapse, spikes pop up, ceilings drop, doors run away. Die and you restart the level, so learn the traps.</li>
              <li>The Trickster plays too, and can add platforms, fake floors, hidden or falling spikes and invisible blocks live.</li>
              <li>Use the chat on the left to accuse, bluff, and plan. Everyone must reach the door to clear a level. 10 levels.</li>
            </ul>
            <button onClick={() => setPage('landing')}>Back</button>
          </div>
        )}
        {page === 'menu' && (
          <div className="px">
            <h2>Ready?</h2>
            <input placeholder="Username" value={name} maxLength={14} onChange={(e) => setName(e.target.value)} />
            <button onClick={() => enter('create', null)}>Create room</button>
            <p className="mute">or join a friend</p>
            <input placeholder="Room code" value={code} maxLength={5} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <button className="alt" onClick={() => enter('join', code)}>Join room</button>
            {err && <p className="err">{err}</p>}
            <button onClick={() => setPage('how')}>How to play</button><Mute />
          </div>
        )}
      </div>
    </>
  )
}
