// Bump CACHE_VERSION when the asset list changes; content updates are picked up automatically.
var CACHE_VERSION = 'sp-converter-v3';
var ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'icons/logo.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'fonts/HayyakumAllah-Light.ttf',
  'fonts/HayyakumAllah-Regular.ttf',
  'fonts/HayyakumAllah-Medium.ttf',
  'fonts/HayyakumAllah-Bold.ttf'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys
        .filter(function (key) { return key !== CACHE_VERSION; })
        .map(function (key) { return caches.delete(key); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Stale-while-revalidate: answer from cache instantly (works offline), refresh the cache in the background.
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () {
          return cached || (req.mode === 'navigate' ? cache.match('index.html') : undefined);
        });
        if (cached) event.waitUntil(network);
        return cached || network;
      });
    })
  );
});
