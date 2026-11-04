import { io } from 'socket.io-client'
// Dev: same origin (Vite proxies /socket.io to localhost:3001). Production: set VITE_SERVER_URL.
export const API = (import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? '' : 'https://trickster-m41g.onrender.com')).replace(/\/+$/, '')
const resumeToken = (() => {
  const key = 'trickster-resume-token'
  try {
    const saved = sessionStorage.getItem(key)
    if (saved) return saved
    const token = crypto.randomUUID()
    sessionStorage.setItem(key, token)
    return token
  } catch {
    return crypto.randomUUID()
  }
})()
export const connect = (name) => io(API || undefined, { auth: { name, resumeToken } })
