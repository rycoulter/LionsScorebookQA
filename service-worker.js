const CACHE_NAME = "baseball-scorebook-v1-1-101-build-265";
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./404.html",
  "./styles.css",
  "./dexie.min.js",
  "./db.js",
  "./storage.js",
  "./supabase-config.js",
  "./supabase-storage.js",
  "./matchup-images.js",
  "./data/league-standings-cache.js",
  "./data/league-standings.json",
  "./data/naba-rosters-cache.js",
  "./data/naba-rosters.json",
  "./app.js",
  "./lions-logo.png",
  "./new-lion.png",
  "./assets/backgrounds/lions-no-game-hero.png",
  "./lions-watermark.png",
  "./assets/lions-left.png",
  "./assets/lions-right.png",
  "./favicon.ico",
  "./icon-192.png",
  "./icon-512.png",
  "./assets/icons/favicon-32.png",
  "./assets/icons/favicon-48.png",
  "./assets/icons/apple-touch-icon.png",
  "./manifest.json",
  "./assets/team-logos/lions.png",
  "./assets/team-logos/lions-header-mark.png",
  "./assets/team-logos/lions-header-wordmark-cropped.png",
  "./assets/matchups/night/lions@d2.png",
  "./assets/matchups/night/lions@devils.png",
  "./assets/matchups/night/lions@ducks.png",
  "./assets/matchups/night/lions@eagles.png",
  "./assets/team-logos/turtles.png",
  "./assets/team-logos/bandidos.png",
  "./assets/team-logos/d2.png",
  "./assets/team-logos/eagles.png",
  "./assets/team-logos/ducks.png",
  "./assets/team-logos/devils.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(FILES_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
            return response;
          }
          return caches.match("./index.html").then((cached) => cached || response);
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
