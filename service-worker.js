/* service-worker.js — caches the app shell so the whole app keeps
   working with no internet connection. Data itself lives in IndexedDB
   (see db.js), which already works offline by nature. */

const CACHE_NAME = 'myanmar-work-ai-v1';
const APP_SHELL = [
  './',
  './index.html',
  './dashboard.html',
  './sales.html',
  './inventory.html',
  './credit.html',
  './reports.html',
  './ai.html',
  './style.css',
  './responsive.css',
  './db.js',
  './utils.js',
  './app.js',
  './sales.js',
  './inventory.js',
  './credit.js',
  './reports.js',
  './ai.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Cache-first for the app shell, falling back to network, and
   caching new same-origin GET responses as we go (so the app keeps
   improving its offline coverage automatically). */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
