import express from 'express'
import cors from 'cors'
import http from 'http'
import crypto from 'crypto'
import { Server } from 'socket.io'
import { genLevel, SIZES, LEVELS } from './game.js'

const ORIGIN = (process.env.CLIENT_ORIGIN || '*').trim().replace(/\/+$/, '')
const app = express()
app.use(cors({ origin: ORIGIN }))
app.get('/', (_, r) => r.send('Trickster server running'))
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: ORIGIN } })

const rooms = new Map()
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const sys = (room, t) => io.to(room.code).emit('chat', { sys: true, t })

function pickTrickster(room) {
  const ids = [...room.players.keys()]
  if (!ids.length) return
  const pool = ids.length > 1 ? ids.filter((i) => i !== room.tr) : ids
  room.tr = pool[crypto.randomInt(pool.length)]
  // private message: only the chosen player is told
  ids.forEach((id) => io.to(id).emit('role', { trickster: id === room.tr }))
}
function beginLevel(room) {
  room.objs = genLevel(room.lvl)
  room.players.forEach((p) => { p.x = 30; p.y = 360 })
  io.to(room.code).emit('objs', room.objs)
  sys(room, `Level ${room.lvl + 1} of 10`)
  pickTrickster(room)
}

// username only, no passwords
io.use((s, next) => {
  const name = String(s.handshake.auth?.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 14)
  if (!name) return next(new Error('Enter a username'))
  s.data.name = name
  next()
})

io.on('connection', (s) => {
  let room = null, lastChat = 0
  const join = (r, cb) => {
    if (r.phase !== 'lobby') return cb({ error: 'Game already started' })
    if (r.players.size >= 8) return cb({ error: 'Room is full' })
    const taken = [...r.players.values()].map((p) => p.n)
    let nm = s.data.name, k = 2
    while (taken.includes(nm)) nm = `${s.data.name.slice(0, 12)} ${k++}`
    room = r
    r.players.set(s.id, { n: nm, x: 30 + r.players.size * 26, y: 360, c: r.players.size % 8 })
    r.scores[s.id] = 0
    s.join(r.code)
    cb({ code: r.code })
    sys(r, `${nm} joined`)
  }
  s.on('create', (_, cb) => {
    let code
    do { code = Array.from({ length: 5 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join('') } while (rooms.has(code))
    const r = { code, players: new Map(), objs: [], lvl: 0, scores: {}, phase: 'lobby', tr: null }
    rooms.set(code, r)
    join(r, cb)
  })
  s.on('join', (code, cb) => {
    const r = rooms.get(String(code || '').toUpperCase())
    r ? join(r, cb) : cb({ error: 'Room not found' })
  })
  s.on('start', () => {
    if (!room || room.phase !== 'lobby') return
    room.phase = 'play'; room.lvl = 0
    beginLevel(room)
  })
  s.on('chat', (t) => {
    const p = room?.players.get(s.id), now = Date.now()
    if (!p || typeof t !== 'string' || now - lastChat < 400) return
    lastChat = now
    const x = t.trim().slice(0, 120)
    if (x) io.to(room.code).emit('chat', { n: p.n, c: p.c, t: x })
  })
  s.on('pos', (m) => {
    const p = room?.players.get(s.id)
    if (!p || room.phase !== 'play' || !Number.isFinite(m?.x) || !Number.isFinite(m?.y)) return
    p.x = clamp(m.x, 0, 780); p.y = clamp(m.y, -100, 600)
  })
  s.on('add', (o) => {
    if (!room || room.phase !== 'play' || s.id !== room.tr || room.objs.length > 150) return
    if (!SIZES[o?.k] || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return
    const [w, h] = SIZES[o.k]
    room.objs.push({ k: o.k, x: clamp(o.x, 0, 800 - w), y: clamp(o.y, 0, 450 - h), w, h })
    io.to(room.code).emit('objs', room.objs, true)
  })
  s.on('del', (i) => {
    if (!room || room.phase !== 'play' || s.id !== room.tr || !Number.isInteger(i) || !room.objs[i]) return
    room.objs.splice(i, 1)
    io.to(room.code).emit('objs', room.objs, true)
  })
  s.on('win', (m) => {
    const p = room?.players.get(s.id)
    if (!p || room.phase !== 'play' || m?.lvl !== room.lvl) return
    const lv = LEVELS[room.lvl]
    const near = (e) => e && p.x > e.x - 45 && p.x < e.x + e.w + 25 && Math.abs(p.y - e.y) < 70
    if (!near(lv.exit) && !near(lv.exit2)) return
    room.scores[s.id] = (room.scores[s.id] || 0) + 1
    io.to(room.code).emit('reveal', room.players.get(room.tr)?.n || '?')
    room.lvl++
    if (room.lvl >= 10) room.phase = 'done'
    else beginLevel(room)
  })
  s.on('disconnect', () => {
    if (!room) return
    const p = room.players.get(s.id)
    room.players.delete(s.id)
    if (!room.players.size) return rooms.delete(room.code)
    sys(room, `${p?.n} left`)
    if (room.phase === 'play' && room.tr === s.id) pickTrickster(room)
  })
})

// public state: never includes who the trickster is
setInterval(() => {
  for (const r of rooms.values()) {
    const players = {}
    r.players.forEach((p, id) => (players[id] = p))
    io.to(r.code).volatile.emit('state', { phase: r.phase, lvl: r.lvl, players, scores: r.scores })
  }
}, 50)

server.listen(process.env.PORT || 3001, () => console.log('Server on', process.env.PORT || 3001))
