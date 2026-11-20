// Cache version is rewritten on every build (see scripts/stamp-sw.mjs) so a new
// deploy always installs a fresh service worker and drops the old cached app.
const CACHE = 'scoreview-shell-__BUILD__';
const root = new URL('./', self.location.href);
const url = (path = '') => new URL(path, root).href;
const SHELL = [url(), url('index.html'), url('manifest.webmanifest'), url('icon.svg'), url('icon-180.png')];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    const html = await (await fetch(url('index.html'), { cache: 'no-store' })).text();
    const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
      .map((match) => url(match[1])).filter((asset) => asset.startsWith(root.href));
    await Promise.allSettled(assets.map((asset) => cache.add(asset)));
    await self.skipWaiting();
  })());
});

self.addEventListener('message', (event) => { if (event.data === 'skip') self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop every previously cached version so a stale app can never survive an update.
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
    // Force every open tab/PWA window onto the freshly activated app.
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) => client.navigate(client.url));
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // HTML (navigation) and the JS/CSS bundles are network-first: when online we
  // always take the freshly deployed version, falling back to cache offline.
  // Hashed asset filenames change per build, so this still works offline.
  const isDocument = event.request.mode === 'navigate';
  const isHashedAsset = /\/assets\//.test(requestUrl.pathname);
  if (isDocument || isHashedAsset) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(event.request, { cache: 'no-store' });
        if (fresh.ok) { const cache = await caches.open(CACHE); cache.put(event.request, fresh.clone()); }
        return fresh;
      } catch {
        const cached = await caches.match(event.request);
        return cached || caches.match(url('index.html'));
      }
    })());
    return;
  }

  // Other same-origin GETs: cache-first for speed.
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
