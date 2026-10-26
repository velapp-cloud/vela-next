/**
 * public/sw.js
 * Service worker propio, sin ninguna dependencia externa (Workbox,
 * next-pwa, etc.) — misma estrategia que ya funciono bien en la
 * version de Expo: red primero, y solo si la red falla, se usa lo
 * que haya en cache. Esto evita el problema de "cache vieja pegada"
 * que dio tantos dolores de cabeza en la version anterior.
 */
const CACHE_NAME = 'vela-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((respuesta) => {
        // Guarda una copia en cache solo si la respuesta es valida —
        // asi queda algo util para cuando SI falle la red mas adelante.
        if (respuesta && respuesta.status === 200) {
          const copia = respuesta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(event.request))
  );
});
