// Keeps a copy of the app so it opens without a connection. Lists themselves sync through /api.
// Files are fetched fresh when online (so updates show up straight away) and from the cache when not.
const CACHE = 'tally-v17';
const SHELL = ['./', 'index.html', 'styles.css?v=13', 'groups.js?v=1', 'icons.js?v=1', 'app.js?v=15', 'manifest.webmanifest', 'assets/app-icon.svg', 'assets/icon-192.png', 'assets/favicon-32.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFont) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Fonts never change: use the saved copy first.
    if (isFont) {
      const saved = await cache.match(request);
      if (saved) return saved;
    }
    try {
      const fresh = await fetch(request);
      if (fresh.ok || fresh.type === 'opaque') cache.put(request, fresh.clone());
      return fresh;
    } catch (error) {
      const saved = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
      if (saved) return saved;
      if (request.mode === 'navigate') return (await cache.match('index.html')) ?? Response.error();
      throw error;
    }
  })());
});
