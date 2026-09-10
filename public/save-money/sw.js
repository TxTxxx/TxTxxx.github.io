const CACHE = "txtxx-save-money-v3";
const FILES = [
  "./",
  "./index.html",
  "./app.css?v=2",
  "./app.js?v=2",
  "./ledger.js",
  "./manifest.webmanifest?v=3",
  "./icon-v2-192.png",
  "./icon-v3-32.png",
  "./icon-v3-180.png",
  "./icon-v3-192.png",
  "./icon-v3-512.png",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("txtxx-save-money-") && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith("/save-money/")
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          event.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(event.request, clone)),
          );
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then((cached) => cached || Response.error()),
      ),
  );
});
