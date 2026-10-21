const CACHE_PREFIX = "major-acupoints-";
const CACHE = `${CACHE_PREFIX}v11`;
const scope = self.registration.scope;
const url = (path = "") => new URL(path, scope).toString();
const CORE = [
  url(),
  url("index.html"),
  url("assets/app.js"),
  url("assets/styles.css"),
  url("manifest.webmanifest"),
  url("icons/icon.svg"),
  url("data/decks.json"),
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(CORE);
      const response = await cache.match(url("data/decks.json"));
      const decks = await response.json();
      await cache.addAll(decks.map((deck) => url(deck.path)));
      const allCards = await Promise.all(decks.map(async (deck) => {
        const data = await cache.match(url(deck.path));
        return data.json();
      }));
      const images = [...new Set(allCards.flat().flatMap((card) => [card.frontImage, card.backImage]).filter(Boolean).map(url))];
      await cache.addAll(images);
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith(scope)) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // Static same-origin assets are identical regardless of the request's Origin header.
      const cached = await cache.match(event.request.mode === "navigate" ? url("index.html") : event.request, { ignoreVary: true });
      return cached || fetch(event.request);
    }),
  );
});
