/**
 * Keeps the app shell on the device. Data never goes through here.
 * Bump VERSION together with ?v= in index.html.
 */
const VERSION = '9';
const CACHE = 'flamingo-app-v' + VERSION;
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(self.registration.scope)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const old = names.filter(n => n.startsWith('flamingo-app-') && n !== CACHE);
    await Promise.all(old.map(n => caches.delete(n)));
    await self.clients.claim();
    if (old.length) notify();
  })());
});

async function notify() {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => c.postMessage({ type: 'app-updated' }));
}

async function page(event) {
  const cache = await caches.open(CACHE);
  const key = self.registration.scope;
  const cached = await cache.match(key);
  const network = fetch(event.request).then(async res => {
    if (res.ok) {
      const before = cached ? await cached.clone().text() : null;
      const after = await res.clone().text();
      await cache.put(key, res.clone());
      if (before !== null && before !== after) notify();
    }
    return res;
  }).catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || new Response('Offline. Open the app again when connected.', { status: 503 });
}

async function asset(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === location.origin) {
    event.respondWith(page(event));
    return;
  }
  const sameOrigin = url.origin === location.origin;
  if ((sameOrigin && !url.pathname.endsWith('/sw.js')) || CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(asset(req));
  }
});
