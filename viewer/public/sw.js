const CACHE_NAME = "s2o-tracker-v1";
const APP_SHELL = ["./", "./manifest.webmanifest", "./icons/icon-192.svg", "./icons/icon-512.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();

          void caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone).catch(() => undefined);
          });

          return networkResponse;
        })
        .catch(() => caches.match("./"));
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch (error) {
      payload = {
        body: event.data.text(),
      };
    }
  }

  const title = payload.title || "S2O price alert";
  const body = payload.body || "Your tracked ticket hit one of your alert bounds.";
  const url = payload.url || "./";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "./icons/icon-192.svg",
      badge: "./icons/icon-192.svg",
      tag: payload.tag || "s2o-price-alert",
      data: { url },
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  const targetUrl = event.notification.data?.url || "./";

  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const matchingClient = clients.find((client) => "navigate" in client);

      if (matchingClient) {
        return matchingClient.navigate(targetUrl).then(() => matchingClient.focus());
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});
