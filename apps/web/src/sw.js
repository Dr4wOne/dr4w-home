// Service worker for the installed app: the shell works offline; device data never comes from cache.
// The cache version and the precache list are filled in at build time (vite.config.ts).
const CACHE = 'dr4w-home-__VERSION__'
const PRECACHE = __PRECACHE__
const LIVE = ['/api/', '/health', '/pair', '/admin/']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (LIVE.some((p) => url.pathname.startsWith(p))) return
  if (e.request.mode === 'navigate') {
    // Network first, so a new version shows at once; the cached shell when the hub is out of reach.
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')))
    return
  }
  e.respondWith(caches.match(e.request).then((hit) => hit ?? fetch(e.request)))
})
