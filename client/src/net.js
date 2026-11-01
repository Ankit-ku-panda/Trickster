import { io } from 'socket.io-client'
// Dev: same origin (Vite proxies /socket.io to localhost:3001). Production: set VITE_SERVER_URL.
export const API = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? '' : 'https://trickster-m41g.onrender.com/')
export const connect = (name) => io(API || undefined, { auth: { name } })
