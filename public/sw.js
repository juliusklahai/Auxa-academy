// Offline cache. Pages: network first (so updates show at once), cache when offline.
// Built assets (hashed file names): cache first.
const CACHE = 'auxa-v2';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './icon.svg?v=auxa', './manifest.webmanifest'])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
const save = (req, res) => {
  if (res.ok && new URL(req.url).origin === location.origin) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
  return res;
};
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // other sites and downloads (the Android app) go straight to the network, untouched
  if (url.origin !== self.location.origin || /\.(apk|mxl|musicxml)$/.test(url.pathname)) return;
  const page = req.mode === 'navigate' || req.destination === 'document' || /\.(webmanifest|json)$/.test(new URL(req.url).pathname);
  if (page) {
    e.respondWith(fetch(req).then((res) => save(req, res)).catch(() => caches.match(req).then((hit) => hit || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => save(req, res))));
});
