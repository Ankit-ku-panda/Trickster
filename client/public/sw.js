// Network first, falls back to cache. Video and API traffic are left alone.
const C = 'trickster-v2'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(C).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'])))
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== C).map((x) => caches.delete(x)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url)
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('.mp4')) return
  e.respondWith(
    fetch(r).then((res) => {
      if (res.ok) { const cp = res.clone(); caches.open(C).then((c) => c.put(r, cp)) }
      return res
    }).catch(() => caches.match(r).then((m) => m || caches.match('/')))
  )
})
