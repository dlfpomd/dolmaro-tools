// 쇼츠 라이터 — Service Worker
const CACHE_NAME = 'shorts-writer-v2';
const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.png',
];

// Hosts that must NEVER be cached (dynamic / secret-bearing / proxy traffic)
const NEVER_CACHE = [
  'api.anthropic.com',
  'api.allorigins.win',
  'corsproxy.io',
  'cdn.jsdelivr.net',       // pdf.js worker — always fetch fresh for security
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE).catch(() => { /* some entries may 404 in dev — ignore */ })
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (NEVER_CACHE.some((h) => url.hostname.endsWith(h))) return;

  // Same-origin: cache-first with background refresh
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
