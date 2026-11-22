/* SUIKA — service worker
   Bump CACHE_VERSION whenever you deploy a new version of the game. */
const CACHE_VERSION = "suika-v1";
const RUNTIME_CACHE = "suika-runtime-v1";

const MATTER_CDN = "https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./game.js",
  "./manifest.webmanifest",
  "./favicon.ico",
  "./assets/backgrounds/ocean.jpg",
  "./assets/backgrounds/forest.jpg",
  "./assets/backgrounds/arctic.jpg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-192.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-16.png",
  "./assets/icons/favicon-32.png"
];
for (const dir of ["ocean", "forest", "arctic"]) {
  for (let t = 1; t <= 9; t++) CORE_ASSETS.push(`./assets/${dir}/tier${t}.png`);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(CORE_ASSETS);
    // The physics engine comes from a CDN: store it too so the game also runs offline.
    try {
      const res = await fetch(new Request(MATTER_CDN, { mode: "no-cors" }));
      await cache.put(MATTER_CDN, res);
    } catch (e) { /* will be cached on first successful load instead */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION && k !== RUNTIME_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Physics engine + Google Fonts (cross-origin): serve from cache, refresh in the background
  const external = url.hostname === "cdnjs.cloudflare.com" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (external) {
    event.respondWith((async () => {
      const cacheName = url.hostname === "cdnjs.cloudflare.com" ? CACHE_VERSION : RUNTIME_CACHE;
      const cache = await caches.open(cacheName);
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Page loads: network first (so updates arrive), cached game shell when offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put("./index.html", copy));
        return res;
      }).catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Everything else that is ours: cache first, refresh in the background
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
