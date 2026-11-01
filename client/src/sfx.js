// All sounds are synthesized with WebAudio, so there are no audio files to load.
let ctx = null
let muted = false
try { muted = localStorage.getItem('tn-mute') === '1' } catch {}
const ac = () => {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)() } catch {} }
  if (ctx && ctx.state === 'suspended') ctx.resume()
  return ctx
}
function tone(f, d = 0.1, type = 'square', v = 0.05, slide = 0, delay = 0) {
  if (muted) return
  const c = ac(); if (!c) return
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d)
  g.gain.setValueAtTime(v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + d)
  o.connect(g); g.connect(c.destination)
  o.start(t); o.stop(t + d + 0.02)
}
function noise(d = 0.2, v = 0.06) {
  if (muted) return
  const c = ac(); if (!c) return
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * d), c.sampleRate), data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const s = c.createBufferSource(), g = c.createGain()
  g.gain.value = v; s.buffer = buf; s.connect(g); g.connect(c.destination); s.start()
}
const seq = (notes, d = 0.12, type = 'square', v = 0.05, gap = 0.09) => notes.forEach((f, i) => tone(f, d, type, v, 0, i * gap))
export const isMuted = () => muted
export const setMuted = (m) => { muted = m; try { localStorage.setItem('tn-mute', m ? '1' : '0') } catch {} }
export const sfx = {
  click: () => tone(660, 0.05),
  jump: () => tone(300, 0.14, 'square', 0.05, 380),
  land: () => tone(110, 0.06, 'triangle', 0.07),
  step: () => tone(80, 0.03, 'triangle', 0.035),
  die: () => { tone(420, 0.35, 'sawtooth', 0.06, -340); noise(0.2, 0.05) },
  pop: () => tone(900, 0.09, 'square', 0.06, -600),
  fall: () => { tone(700, 0.3, 'sawtooth', 0.04, -550) },
  dodge: () => seq([500, 380, 560], 0.07, 'square', 0.05, 0.06),
  bump: () => tone(240, 0.1, 'triangle', 0.08, -100),
  collapse: () => noise(0.3, 0.06),
  win: () => seq([523, 659, 784, 1046]),
  place: () => tone(200, 0.12, 'square', 0.05, -90),
  trap: () => { tone(150, 0.25, 'sawtooth', 0.05, -80); noise(0.1, 0.03) },
  del: () => tone(520, 0.08, 'square', 0.045, -330),
  chat: () => seq([880, 1175], 0.07, 'sine', 0.05, 0.06),
  join: () => tone(520, 0.1, 'triangle', 0.06, 220),
  start: () => seq([262, 330, 392, 523], 0.14, 'square', 0.05, 0.1),
  role: (t) => (t ? seq([220, 165, 110], 0.22, 'sawtooth', 0.05, 0.16) : seq([660, 880], 0.08, 'triangle', 0.05, 0.08)),
  over: () => seq([784, 659, 523, 392, 523, 784, 1046], 0.16, 'square', 0.05, 0.13),
}
