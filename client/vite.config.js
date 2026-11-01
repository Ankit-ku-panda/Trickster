import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true, // lets ngrok / phone / LAN hosts reach the dev server
    // forwards game traffic to the local server, so one ngrok tunnel is enough
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
})
