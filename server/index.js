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
const ROOM_RETENTION_MS = 2 * 60 * 1000
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const sys = (room, t) => io.to(room.code).emit('chat', { sys: true, t })

function pickTrickster(room) {
  const ids = [...room.players.entries()].filter(([, player]) => player.online).map(([id]) => id)
  if (!ids.length) return
  const pool = ids.length > 1 ? ids.filter((i) => i !== room.tr) : ids
  room.tr = pool[crypto.randomInt(pool.length)]
  // private message: only the chosen player is told
  ids.forEach((id) => io.to(id).emit('role', { trickster: id === room.tr }))
}
function beginLevel(room) {
  room.completed.clear()
  room.objs = genLevel(room.lvl)
  room.players.forEach((p) => { p.x = 30; p.y = 360 })
  io.to(room.code).emit('objs', room.objs)
  sys(room, `Level ${room.lvl + 1} of 10`)
  pickTrickster(room)
}
function advanceLevelIfEveryoneCleared(room) {
  const online = [...room.players.entries()].filter(([, player]) => player.online)
  if (room.phase !== 'play' || !online.length || online.some(([id]) => !room.completed.has(id))) return
  io.to(room.code).emit('reveal', room.players.get(room.tr)?.n || '?')
  room.lvl++
  if (room.lvl >= 10) room.phase = 'done'
  else beginLevel(room)
}
function removeDisconnectedPlayer(room, id, player) {
  if (player.online || room.players.get(id) !== player) return
  room.players.delete(id)
  delete room.scores[id]
  room.completed.delete(id)
  if (room.tr === id) pickTrickster(room)
  if (!room.players.size) {
    clearTimeout(room.cleanupTimer)
    rooms.delete(room.code)
    return
  }
  if (room.phase === 'lobby' && room.host === id) {
    room.host = [...room.players.entries()].find(([, candidate]) => candidate.online)?.[0]
      || room.players.keys().next().value
    sys(room, `${room.players.get(room.host).n} is now the host`)
  }
  advanceLevelIfEveryoneCleared(room)
}

// username only, no passwords
io.use((s, next) => {
  const name = String(s.handshake.auth?.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 14)
  if (!name) return next(new Error('Enter a username'))
  s.data.name = name
  const resumeToken = s.handshake.auth?.resumeToken
  s.data.resumeToken = typeof resumeToken === 'string' && resumeToken.length <= 128 ? resumeToken : s.id
  next()
})

io.on('connection', (s) => {
  let room = null, lastChat = 0
  let playerId = s.id
  const join = (r, cb) => {
    if (r.phase !== 'lobby') return cb({ error: 'Game already started' })
    if (r.players.size >= 8) return cb({ error: 'Room is full' })
    const taken = [...r.players.values()].map((p) => p.n)
    let nm = s.data.name, k = 2
    while (taken.includes(nm)) nm = `${s.data.name.slice(0, 12)} ${k++}`
    room = r
    r.players.set(s.id, { n: nm, x: 30 + r.players.size * 26, y: 360, c: r.players.size % 8, online: true, token: s.data.resumeToken })
    r.scores[s.id] = 0
    s.join(r.code)
    cb({ code: r.code })
    sys(r, `${nm} joined`)
  }
  s.on('create', (_, cb) => {
    let code
    do { code = Array.from({ length: 5 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join('') } while (rooms.has(code))
    const r = { code, host: s.id, players: new Map(), objs: [], completed: new Set(), lvl: 0, scores: {}, phase: 'lobby', tr: null }
    rooms.set(code, r)
    join(r, cb)
  })
  s.on('join', (code, cb) => {
    const r = rooms.get(String(code || '').toUpperCase())
    r ? join(r, cb) : cb({ error: 'Room not found' })
  })
  s.on('resume', (code, cb) => {
    const r = rooms.get(String(code || '').toUpperCase())
    const entry = r && [...r.players.entries()].find(([, player]) => player.token === s.data.resumeToken && !player.online)
    if (!r || !entry) return cb({ error: 'Your disconnected player could not be found in this room' })
    const [oldId, player] = entry
    clearTimeout(r.cleanupTimer)
    clearTimeout(player.cleanupTimer)
    r.players.delete(oldId)
    r.players.set(s.id, { ...player, online: true })
    if (r.scores[oldId] !== undefined) {
      r.scores[s.id] = r.scores[oldId]
      delete r.scores[oldId]
    }
    if (r.completed.delete(oldId)) r.completed.add(s.id)
    if (r.host === oldId) r.host = s.id
    if (r.tr === oldId) r.tr = s.id
    if (r.phase === 'lobby' && !r.players.get(r.host)?.online) r.host = s.id
    playerId = s.id
    room = r
    s.join(r.code)
    if (r.phase === 'play' && !r.players.has(r.tr)) pickTrickster(r)
    cb({ code: r.code })
    s.emit('objs', r.objs)
    if (r.phase === 'play') s.emit('role', { trickster: r.tr === s.id })
    sys(r, `${player.n} reconnected`)
  })
  s.on('start', () => {
    if (!room || room.host !== playerId || room.phase !== 'lobby') return
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
    const p = room?.players.get(playerId)
    if (!p || !p.online || room.phase !== 'play' || room.completed.has(playerId) || !Number.isFinite(m?.x) || !Number.isFinite(m?.y)) return
    p.x = clamp(m.x, 0, 780); p.y = clamp(m.y, -100, 600)
  })
  s.on('add', (o) => {
    if (!room || room.phase !== 'play' || room.completed.has(playerId) || playerId !== room.tr || room.objs.length > 150) return
    if (!SIZES[o?.k] || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return
    const [w, h] = SIZES[o.k]
    room.objs.push({ k: o.k, x: clamp(o.x, 0, 800 - w), y: clamp(o.y, 0, 450 - h), w, h })
    io.to(room.code).emit('objs', room.objs, true)
  })
  s.on('del', (i) => {
    if (!room || room.phase !== 'play' || room.completed.has(playerId) || playerId !== room.tr || !Number.isInteger(i) || !room.objs[i]) return
    room.objs.splice(i, 1)
    io.to(room.code).emit('objs', room.objs, true)
  })
  s.on('win', (m) => {
    const p = room?.players.get(playerId)
    if (!p || !p.online || room.phase !== 'play' || m?.lvl !== room.lvl || room.completed.has(playerId)) return
    const lv = LEVELS[room.lvl]
    const near = (e) => e && p.x > e.x - 45 && p.x < e.x + e.w + 25 && Math.abs(p.y - e.y) < 70
    if (!near(lv.exit) && !near(lv.exit2)) return
    room.completed.add(playerId)
    room.scores[playerId] = (room.scores[playerId] || 0) + 1
    advanceLevelIfEveryoneCleared(room)
  })
  s.on('disconnect', () => {
    if (!room) return
    const p = room.players.get(playerId)
    if (!p) return
    p.online = false
    room.completed.delete(playerId)
    const online = [...room.players.entries()].filter(([, player]) => player.online)
    if (room.phase === 'lobby' && room.host === playerId && online.length) {
      room.host = online[0][0]
      sys(room, `${room.players.get(room.host).n} is now the host`)
    }
    sys(room, `${p.n} disconnected; waiting for reconnection`)
    if (room.phase === 'play' && room.tr === playerId) pickTrickster(room)
    advanceLevelIfEveryoneCleared(room)
    p.cleanupTimer = setTimeout(() => removeDisconnectedPlayer(room, playerId, p), ROOM_RETENTION_MS)
    p.cleanupTimer.unref?.()
  })
})

// public state: never includes who the trickster is
setInterval(() => {
  for (const r of rooms.values()) {
    const players = {}
    r.players.forEach((p, id) => {
      players[id] = { n: p.n, x: p.x, y: p.y, c: p.c, online: p.online }
    })
    io.to(r.code).volatile.emit('state', { phase: r.phase, lvl: r.lvl, host: r.host, players, scores: r.scores, completed: [...r.completed] })
  }
}, 50)

server.listen(process.env.PORT || 3001, () => console.log('Server on', process.env.PORT || 3001))
