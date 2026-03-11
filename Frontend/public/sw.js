// Wolf Trading App — Minimal Service Worker
// Required for PWA installability (beforeinstallprompt won't fire without this)
const CACHE = 'wolf-app-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  // Only handle same-origin navigation requests — fall back to index.html for SPA routes
  if (
    e.request.mode === 'navigate' &&
    e.request.url.startsWith(self.location.origin)
  ) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
  }
});
