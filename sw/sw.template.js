/* Thread Mav service worker — generated at build time (see vite.config.ts).
 * The cache name changes with every build, so each deploy installs a fresh worker and
 * old caches are deleted on activate. The new worker WAITS; the app shows "Update ready"
 * and sends SKIP_WAITING when the user taps Reload (so a calculation is never interrupted).
 */
const CACHE = '__CACHE_NAME__';
const PRECACHE = __PRECACHE__;
const SCOPE = self.registration.scope;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((u) => new Request(new URL(u, SCOPE).href, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('thread-mav-') && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ cache: CACHE });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The app is a single hash-routed page: every navigation gets the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(new URL('./index.html', SCOPE).href).then((hit) => hit || fetch(req).catch(() => offlineResponse())),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => new Response('', { status: 504, statusText: 'Offline' })),
    ),
  );
});

function offlineResponse() {
  return new Response('<!doctype html><meta name="viewport" content="width=device-width"><body style="background:#07090b;color:#fff;font:18px -apple-system,sans-serif;padding:24px">Thread Mav is not cached yet. Connect once to finish installing.</body>', {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
