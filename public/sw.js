// Service worker: makes the app work offline after the first visit.
// - App shell (same origin): cached on install, served cache-first.
// - Other requests (speech model files, ONNX runtime from a CDN): network first,
//   saved to the cache on success, served from the cache when offline.

const VERSION = 'v1';
const SHELL_CACHE = `stt-shell-${VERSION}`;
const RUNTIME_CACHE = `stt-runtime-${VERSION}`;
const SHELL_FILES = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('stt-') && ![SHELL_CACHE, RUNTIME_CACHE].includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetchAndStore(request, SHELL_CACHE)),
    );
  } else {
    event.respondWith(networkFirst(request));
  }
});

async function fetchAndStore(request, cacheName) {
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    return await fetchAndStore(request, RUNTIME_CACHE);
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error(`Offline and not cached: ${request.url}`);
  }
}
