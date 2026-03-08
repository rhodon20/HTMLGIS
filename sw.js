const CACHE_NAME = 'htmlgis-cache-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './ROADMAP.md',
  './icons/icon.svg',
  './js/core/state.js',
  './js/core/storage.js',
  './js/core/pwa.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.allSettled(CORE_ASSETS.map((url) => cache.add(url))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            if (event.request.url.startsWith('http')) cache.put(event.request, copy);
          });
          return res;
        })
        .catch(() => cached);
    })
  );
});
