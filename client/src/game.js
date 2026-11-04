export const W = 800, H = 450
export const START = { x: 30, y: 360 }
// p platform, f fake floor, m moving, r retreating, i invisible, s spike, h hidden spike, d falling spike, z decoy door
export const SIZES = { p: [80, 16], s: [24, 24], f: [80, 16], m: [80, 16], h: [24, 24], d: [24, 24], i: [80, 16] }

export const hit = (a, b) =>
  a.x < b.x + b.w && a.x + (a.w || 20) > b.x && a.y < b.y + b.h && a.y + (a.h || 28) > b.y

// Per-player trap state. Traps trigger locally and reset when you respawn.
export const newT = () => ({ gone: new Set(), pop: new Set(), rev: new Set(), fall: new Map(), ret: new Map(), door: 0 })
export const resetT = (T) => { T.gone.clear(); T.pop.clear(); T.rev.clear(); T.fall.clear(); T.ret.clear(); T.door = 0 }

export function rect(o, t, T, i) {
  if (o.k === 'm') return { x: o.x + Math.sin(t / 700) * 60, y: o.y, w: o.w, h: o.h }
  if (T && o.k === 'd') { const f = T.fall.get(i); if (f) return { x: o.x, y: o.y + f.dy, w: o.w, h: o.h } }
  if (T && o.k === 'r') { const d = T.ret.get(i); if (d) return { x: o.x + d, y: o.y, w: o.w, h: o.h } }
  return o
}
export function lethal(m, o, T, i, t) {
  const k = o.k
  if (k === 'h' && !T.pop.has(i)) return false
  if (k === 's' || k === 'h' || k === 'd') { const r = rect(o, t, T, i); return hit(m, { x: r.x + 5, y: r.y + 7, w: r.w - 10, h: r.h - 9 }) }
  return k === 'z' ? hit(m, o) : false
}
export function respawn(m, T) { m.x = START.x; m.y = START.y; m.vy = 0; resetT(T) }

function triggers(p, objs, T, lv) {
  const cx = p.x + 10
  objs.forEach((o, i) => {
    const dx = Math.abs(cx - (o.x + o.w / 2))
    if (o.k === 'h' && !T.pop.has(i) && dx < (o.t || 20) && Math.abs(p.y + 28 - (o.y + o.h)) < 150) T.pop.add(i)
    else if (o.k === 'd' && !T.fall.has(i) && dx < (o.t || 30) && p.y > o.y) T.fall.set(i, { dy: 0, v: 0 })
    else if (o.k === 'r' && !T.ret.has(i) && dx < (o.t || 90) && Math.abs(p.y - o.y) < 150) T.ret.set(i, 0)
  })
  T.fall.forEach((f, i) => { const o = objs[i]; if (o) { f.v += 0.8; f.dy = Math.max(0, Math.min(f.dy + f.v, (o.fl || 400) - (o.y + o.h))) } })
  T.ret.forEach((d, i) => { const o = objs[i]; if (o) T.ret.set(i, Math.min(o.d || 40, d + 3)) })
  if (lv && lv.exit2 && !T.door && Math.abs(cx - (lv.exit.x + 15)) < 120) T.door = 1
}

const SOLID = new Set(['p', 'm', 'r', 'i', 'f'])
export function step(p, K, objs, T, t, lv) {
  const S = []
  objs.forEach((o, i) => { if (SOLID.has(o.k) && !(o.k === 'f' && T.gone.has(i))) S.push([i, rect(o, t, T, i)]) })
  if (K.u && p.on) p.vy = -10.5
  p.x += ((K.r ? 1 : 0) - (K.l ? 1 : 0)) * 2.5
  p.x = Math.max(0, Math.min(W - 20, p.x))
  for (const [i, r] of S) if (hit(p, r)) { p.x += p.x + 10 < r.x + r.w / 2 ? r.x - (p.x + 20) : r.x + r.w - p.x; if (objs[i].k === 'i') T.rev.add(i) }
  p.vy += 0.5
  if (p.vy > 13) p.vy = 13
  p.y += p.vy
  p.on = false
  for (const [i, r] of S) {
    if (!hit(p, r)) continue
    if (objs[i].k === 'i') T.rev.add(i)
    if (p.vy > 0) { p.y = r.y - 28; p.on = true; if (objs[i].k === 'f') T.gone.add(i) } else p.y = r.y + r.h
    p.vy = 0
  }
  triggers(p, objs, T, lv)
}

// ---------- the 10 levels ----------
const G = (x, w) => ({ k: 'p', x, y: 400, w, h: 50 })
const P = (x, y, w, h = 16) => ({ k: 'p', x, y, w, h })
const F = (x, y, w, h = 16) => ({ k: 'f', x, y, w, h })
const S = (x) => ({ k: 's', x, y: 376, w: 24, h: 24 })
const Hs = (x, y = 376) => ({ k: 'h', x, y, w: 24, h: 24 })
const D = (x, y = 40, fl = 400) => ({ k: 'd', x, y, w: 24, h: 24, fl })
const I = (x, y, w = 80, h = 16) => ({ k: 'i', x, y, w, h })
const R = (x, y, w = 70, d = 30) => ({ k: 'r', x, y, w, h: 16, d })
const M = (x, y, w = 80) => ({ k: 'm', x, y, w, h: 16 })
const Z = (x, y = 350) => ({ k: 'z', x, y, w: 30, h: 50 })
const E = (x = 765, y = 350) => ({ x, y, w: 30, h: 50 })

export const LEVELS = [
  { name: 'Deep Space', exit: E(), objs: [G(0, 300), F(300, 400, 80, 50), G(380, 420), Hs(560)] },
  { name: 'Meteor Shower', exit: E(), objs: [G(0, 180), G(260, 200), S(340), F(460, 400, 80, 50), G(540, 260), D(620)] },
  { name: 'Lava Cave', exit: E(), objs: [G(0, 200), P(200, 350, 120, 50), Hs(194, 326), P(390, 300, 110, 100), D(430, 60, 300), G(570, 230), F(640, 400, 80, 50), G(720, 80)] },
  { name: 'Ice Cavern', exit: E(), objs: [G(0, 250), I(140, 300, 90), G(330, 130), S(390), M(485, 384), G(590, 210), Hs(680)] },
  { name: 'Neon Grid', exit: E(), objs: [G(0, 100), P(150, 350, 70), Hs(194, 326), P(260, 310, 70), P(370, 270, 70), D(385, 60, 270), F(480, 310, 70), P(590, 350, 70), G(700, 100)] },
  { name: 'Toxic Swamp', exit: E(), objs: [G(0, 180), F(180, 400, 70, 50), G(250, 550), Hs(320), Hs(440), S(580), D(650), Hs(710)] },
  { name: 'Storm', exit: E(), objs: [G(0, 150), R(220, 380), G(370, 130), D(420), R(515, 380), G(600, 200), Hs(700)] },
  { name: 'Haunted House', exit: E(740), exit2: E(20), objs: [G(0, 540), F(540, 400, 80, 50), G(620, 180), Hs(250), Hs(380), D(470)] },
  { name: 'Clockwork', exit: E(), objs: [G(0, 300), I(300, 400, 80, 50), F(380, 400, 90, 50), G(470, 330), Hs(560), Z(660)] },
  { name: 'Hell Gate', exit: E(), exit2: E(395), objs: [G(0, 120), F(120, 400, 70, 50), G(190, 120), D(240), Hs(285), G(380, 100), S(430), R(500, 380), G(590, 100), Hs(630), G(690, 110)] },
]
export const genLevel = (n) => JSON.parse(JSON.stringify(LEVELS[Math.min(n, 9)].objs))

export const THEMES = [
  { bg: '#0b0a1e', pc: '#4ade80' },
  { bg: '#120a22', pc: '#a78bfa' },
  { bg: '#2a0a08', pc: '#e07a3f' },
  { bg: '#082033', pc: '#9bd7f2' },
  { bg: '#12062a', pc: '#ff4fd8' },
  { bg: '#08220f', pc: '#a3e635' },
  { bg: '#10151f', pc: '#8aa4c8' },
  { bg: '#150a1c', pc: '#9d7bd8' },
  { bg: '#1f1708', pc: '#d6a64a' },
  { bg: '#26050c', pc: '#e5484d' },
]
