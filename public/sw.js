const CACHE = "major-acupoints-v10";
const scope = self.registration.scope;
const url = (path = "") => new URL(path, scope).toString();
const CORE = [
  url(),
  url("index.html"),
  url("assets/app.js"),
  url("assets/styles.css"),
  url("manifest.webmanifest"),
  url("icons/icon.svg"),
  url("data/cards.json"),
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(CORE);
      const response = await fetch(url("data/cards.json"));
      const cards = await response.json();
      const images = [...new Set(cards.flatMap((card) => [card.frontImage, card.backImage]).map(url))];
      await cache.addAll(images);
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(url("index.html"))),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
