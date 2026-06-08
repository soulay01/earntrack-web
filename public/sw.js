const CACHE = 'earntrack-v1'
const STATIC = 'earntrack-static-v2'
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

  // Only handle GET
  if (request.method !== 'GET') return

  // Skip non http(s) and cross-origin API-ish calls
  if (!url.protocol.startsWith('http')) return

  // Same-origin static assets: cache-first
  if (url.origin === location.origin && /\.(js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/i.test(url.pathname)) {
    e.respondWith(cacheFirst(request, STATIC))
    return
  }

  // Google Fonts: cache-first
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    e.respondWith(cacheFirst(request, FONT))
    return
  }

  // Same-origin navigation (pages): network-first, fallback to cache
  if (url.origin === location.origin && request.mode === 'navigate') {
    e.respondWith(networkFirst(request))
    return
  }
})

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
    return cached || new Response('Offline', { status: 503 })
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
    return cached || new Response('Offline', { status: 503 })
  }
}
