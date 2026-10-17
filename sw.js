const CACHE_NAME = 'nutrilog-cache-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './vendor/dexie.min.js',
  './js/config.js',
  './js/db.js',
  './js/calc.js',
  './js/seed.js',
  './js/ui.js',
  './js/app.js',
  './js/auth/authProvider.js',
  './js/auth/localAuth.js',
  './legal/terms.html',
  './legal/privacy.html',
  './legal/health-disclaimer.html',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS) {
        try {
          await cache.add(asset);
        } catch (_err) {
          // Optional assets skipped if absent
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});