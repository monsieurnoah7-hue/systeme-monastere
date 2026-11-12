const CACHE = 'mf-shell-v5';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/pwa-192.png', '/pwa-512.png', '/emblem-white.png', '/favicon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(APP_SHELL).catch(() => undefined);
      try {
        const response = await fetch('/index.html', { cache: 'no-store' });
        if (response.ok) {
          const html = await response.text();
          const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
          if (assets.length) await cache.addAll(assets);
        }
      } catch {
        // Mode dégradé si hors-ligne lors de l'installation
      }
    })(),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

// Stratégie ultra-rapide PWA :
// - Navigation (HTML) : Cache-First immédiat (0 ms) avec revalidation arrière-plan
// - Assets (JS, CSS, Images, Polices) : Cache-First immédiat avec mise en cache dynamique
// - API (/api/, /files/) : Laisser passer directement (géré par le client SWR)
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Les appels d'API et de fichiers serveur ne sont pas interceptés par ce cache shell
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/')) return;

  // 1. Navigation SPA (chargement de la page de l'application)
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = (await cache.match('/index.html')) || (await cache.match('/'));
        
        // Si présent en cache, servir instantanément (démarrage en < 50ms)
        // et revalider en arrière-plan sans bloquer l'écran
        const networkFetch = fetch(request, { cache: 'no-cache' })
          .then((response) => {
            if (response.ok) {
              cache.put('/index.html', response.clone());
            }
            return response;
          })
          .catch(() => null);

        if (cached) {
          // Lancer la mise à jour en tâche de fond
          event.waitUntil(networkFetch);
          return cached;
        }

        // Première ouverture : réseau avec timeout strict de 3.5s
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 3500)
          );
          const networkRes = await Promise.race([networkFetch, timeoutPromise]);
          if (networkRes) return networkRes;
        } catch {
          // Fallback sur le cache au cas où
        }

        return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
      })(),
    );
    return;
  }

  // 2. Fichiers statiques (JS, CSS, Images, Webmanifest) : Cache-First immédiat
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok && response.status === 200) {
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        // En cas de panne réseau, essayer d'autres variantes de cache
        if (request.destination === 'image') {
          return (await cache.match('/emblem-white.png')) || Response.error();
        }
        throw err;
      }
    })(),
  );
});
