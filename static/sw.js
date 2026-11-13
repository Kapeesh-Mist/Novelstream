const CACHE_NAME = 'novelstream-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/static/index.html',
  '/static/styles.css',
  '/static/app.js',
  '/static/ai.js',
  '/static/reflow.js',
  '/static/db.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Bypass API calls from cache
  if (requestUrl.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // Fallback to cached index for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/static/index.html');
        }
      });
    })
  );
});

