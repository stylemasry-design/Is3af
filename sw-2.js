/**
 * Service Worker — المنيا الصحية PWA
 * النسخة: 2.0.0
 * يدعم: التخزين المؤقت + العمل بدون إنترنت
 */

const CACHE_NAME = 'minya-health-v2';
const OFFLINE_URL = './offline.html';

// الملفات الأساسية المخزنة مسبقاً
const PRECACHE_ASSETS = [
  './index.html',
  './offline.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&family=Cairo:wght@400;600;700;900&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// ── Install ──────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing v2...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cache core assets (ignore failures for external)
        return Promise.allSettled(
          PRECACHE_ASSETS.map(url =>
            cache.add(url).catch(e => console.warn('[SW] Skip:', url))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch Strategy ────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, etc.
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Strategy: Cache First for assets, Network First for HTML
  if (request.destination === 'document') {
    // Network First for pages
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then(cached => cached || caches.match(OFFLINE_URL))
        )
    );
  } else if (
    request.destination === 'image' ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font'
  ) {
    // Cache First for static assets
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => new Response('', { status: 408 }));
      })
    );
  } else {
    // Network with cache fallback
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
  }
});

// ── Background Sync (للاتصال عند عودة الإنترنت) ──────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-favorites') {
    console.log('[SW] Background sync: favorites');
  }
});

// ── Push Notifications ────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'المنيا الصحية', {
      body: data.body || '',
      icon: './icons/icon-192x192.png',
      badge: './icons/icon-72x72.png',
      dir: 'rtl',
      lang: 'ar',
      vibrate: [200, 100, 200],
      data: { url: data.url || './index.html' },
      actions: [
        { action: 'open', title: 'فتح التطبيق' },
        { action: 'close', title: 'إغلاق' }
      ]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || './index.html')
    );
  }
});
