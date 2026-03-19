/* =====================
   SERVICE WORKER — Minya Health PWA
   v1.0.0
======================== */

const CACHE_NAME = 'minya-health-v1';
const DATA_CACHE = 'minya-health-data-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// ── INSTALL: cache static assets ──────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache local assets only (external may fail in offline install)
      return cache.addAll(['/', '/index.html', '/style.css', '/app.js', '/manifest.json']);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: delete old caches ────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== DATA_CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: strategy by request type ────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // data.json: Network first, fallback to cache (stale-while-revalidate)
  if (url.includes('/data.json')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(DATA_CACHE).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // OSM tiles: cache first with long TTL
  if (url.includes('tile.openstreetmap.org')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (!res || res.status !== 200) return res;
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // Google Fonts & Leaflet CDN: cache first
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') || url.includes('unpkg.com/leaflet')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      }))
    );
    return;
  }

  // Static assets: cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
