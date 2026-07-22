// Minimal offline app-shell cache. No server push, no background sync — this
// app's real-time behavior is the WebSocket sync client running in the page,
// not the service worker. The one exception is showNotification(), which the
// page calls directly (via navigator.serviceWorker.ready) so a "new quest"
// nudge shows as a real OS notification even while the tab is backgrounded;
// this file just has to route the resulting tap back into the app.

const CACHE_NAME = "first-bank-of-dad-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match("/"))),
  );
});

// Tapping a "new quest" notification should bring the app to the front — reuse an already-open
// tab if there is one instead of piling up duplicate windows.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) return existing.focus();
      return self.clients.openWindow("/");
    }),
  );
});
