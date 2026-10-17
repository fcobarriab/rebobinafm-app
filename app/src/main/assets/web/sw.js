const CACHE_NAME = "rebobina-shell-v16";
const APP_FILES = [
  "index.html",
  "indexpwa.html",
  "install.js",
  "player.js",
  "news.js",
  "manifest.webmanifest",
  "images/rebobina-logo.webp",
  "images/news/smashing-pumpkins.webp",
  "images/news/rem.webp",
  "images/news/oasis.webp",
  "images/news/spice-girls.webp",
  "icons/rebobina_flechas_favicon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(
          APP_FILES.map((file) => new URL(file, self.registration.scope).href),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("rebobina-shell-") && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);

  if (request.method !== "GET" || requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    const indexUrl = new URL("index.html", self.registration.scope).href;
    const pwaUrl = new URL("indexpwa.html", self.registration.scope).href;
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const responseCopy = response.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, responseCopy);
          }
          return response;
        } catch (error) {
          const cachedPage =
            (await caches.match(request)) ||
            (await caches.match(pwaUrl)) ||
            (await caches.match(indexUrl));
          if (cachedPage) return cachedPage;

          console.error("No hay una página de Rebobina FM disponible offline.", error);
          return Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request).then((response) => {
        if (response.ok) {
          const responseCopy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, responseCopy));
        }
        return response;
      });
    }),
  );
});
