// CORRECT service worker – makes the app installable and keeps the shell, samples and face detector available offline.
// API calls (/api/*) are never cached: they need live YouCam / Gemini results.
const VERSION = "correct-v4";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/favicon.ico",
  "/samples/redness/thumb.jpg",
  "/samples/undereye/thumb.jpg",
  "/samples/spots/thumb.jpg",
];
const SAMPLES = ["redness", "undereye", "spots"];

// After install, quietly cache every file the three sample faces need (read from each bundle.json),
// so "try a sample" works fully offline – on a plane, in a store with bad signal, or during a flaky demo.
async function cacheSamples() {
  const cache = await caches.open(VERSION);
  for (const id of SAMPLES) {
    try {
      const url = `/samples/${id}/bundle.json`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.clone().text();
      await cache.put(url, res);
      const files = Array.from(new Set(text.match(/\/samples\/[a-z]+\/[\w.-]+\.(?:jpg|png)/g) || []));
      for (const f of files) if (!(await cache.match(f))) await cache.add(f).catch(() => {});
    } catch {
      /* best effort */
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => cacheSamples())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Pages: network first (fresh code), fall back to cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Static assets, sample bundles, icons, MediaPipe wasm/model: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/samples/") || url.pathname.startsWith("/mediapipe/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});
