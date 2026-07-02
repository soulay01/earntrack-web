const CACHE = 'earntrack-v3'
const STATIC = 'earntrack-static-v3'
const FONT = 'earntrack-fonts-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== STATIC && k !== FONT).map((k) => caches.delete(k)))
      ),
    ])
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  if (!url.protocol.startsWith('http')) return

  if (url.origin === location.origin && /\.(js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/i.test(url.pathname)) {
    e.respondWith(cacheFirst(request, STATIC))
    return
  }

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    e.respondWith(cacheFirst(request, FONT))
    return
  }

  if (url.origin === location.origin && request.mode === 'navigate') {
    e.respondWith(networkFirst(request))
    return
  }
})

const OFFLINE_HTML = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EarnTrack – Offline</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;background:#F8FAFC;color:#0F172A;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}div{text-align:center;max-width:320px}svg{color:#CBD5E1;margin-bottom:16px}h1{font-size:18px;font-weight:600;margin-bottom:8px}p{font-size:14px;color:#64748B;line-height:1.5;margin-bottom:24px}button{padding:10px 20px;background:#1E3A5F;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer}button:hover{background:#162d4a}</style></head><body><div><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 6s4-2 11-2 11 2 11 2"/><path d="M1 12s4-2 11-2 11 2 11 2"/><line x1="1" y1="6" x2="1" y2="18"/><line x1="23" y1="6" x2="23" y2="18"/><path d="M1 18s4-2 11-2 11 2 11 2"/></svg><h1>Keine Verbindung</h1><p>EarnTrack braucht eine Internetverbindung. Bitte prüfe dein Netzwerk und versuche es erneut.</p><button onclick="location.reload()">Erneut versuchen</button></div></body></html>`

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const res = await fetch(request)
    if (res.ok) {
      const cache = await caches.open(cacheName || CACHE)
      cache.put(request, res.clone())
    }
    return res
  } catch {
    return cached || new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html;charset=utf-8' } })
  }
}

async function networkFirst(request) {
  try {
    const res = await fetch(request)
    if (res.ok) {
      const cache = await caches.open(CACHE)
      cache.put(request, res.clone())
    }
    return res
  } catch {
    const cached = await caches.match(request)
    return cached || new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html;charset=utf-8' } })
  }
}
