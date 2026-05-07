/* Yasi English — minimal PWA service worker.
 * Strategy:
 *  - Precache the offline shell + brand assets on install.
 *  - For navigations: network-first, fall back to cached /offline page.
 *  - For same-origin static assets (Next.js _next/static, /icons, /themes):
 *    stale-while-revalidate so subsequent visits feel instant.
 *  - Never cache POST / API / auth / model files.
 */
const VERSION = 'yasi-pwa-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL_ASSETS = [
  '/offline',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Tolerate individual asset 404s during install.
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function shouldBypass(url) {
  if (url.pathname.startsWith('/api/')) return true;
  if (url.pathname.startsWith('/auth/')) return true;
  if (url.pathname.startsWith('/admin/')) return true;
  if (url.pathname.startsWith('/models/')) return true;
  if (url.pathname.startsWith('/data/')) return true;
  if (url.pathname.endsWith('.mp3') || url.pathname.endsWith('.ogg') || url.pathname.endsWith('.webm')) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (shouldBypass(url)) return;

  // HTML navigations: network-first → cached offline page.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(RUNTIME_CACHE);
          const cached = await cache.match(req);
          if (cached) return cached;
          const shell = await caches.open(SHELL_CACHE);
          return (await shell.match('/offline')) ||
            new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        }
      })()
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icon') ||
    url.pathname.startsWith('/favicon') ||
    url.pathname.startsWith('/themes/') ||
    url.pathname.startsWith('/vendor/') ||
    /\.(?:js|css|woff2?|ttf|otf|svg|png|jpg|jpeg|webp|gif|ico)$/i.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })()
    );
  }
});
