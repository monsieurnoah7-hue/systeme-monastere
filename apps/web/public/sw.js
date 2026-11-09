const CACHE = 'mf-shell-v3';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/pwa-192.png', '/pwa-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL);
    try {
      const response = await fetch('/index.html', { cache: 'no-store' });
      if (!response.ok) return;
      const html = await response.text();
      const assets = [...html.matchAll(/(?:src|href)="([^\"]+\.(?:js|css))"/g)].map((match) => match[1]);
      if (assets.length) await cache.addAll(assets);
    } catch {
      // L’application reste installable; les fichiers seront mis en cache au prochain accès en ligne.
    }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/')) return;
  event.respondWith(
    (request.mode === 'navigate'
      ? fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
            return response;
          })
          .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/')))
      : fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => caches.match(request))),
  );
});
