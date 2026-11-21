const CACHE = 'kunci-sekolah-v9';
const SHELL = [
  './', './index.html', './manifest.json', './tailwind.css', './vendor/lucide.min.js',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Simpan dalam cache hanya respons yang berjaya. Respons "opaque" (skrip CDN tanpa CORS)
// tidak boleh disemak status, tetapi dibenarkan supaya app boleh dibuka tanpa internet.
function bolehCache(res, cdn) {
  return !!res && (res.ok || (cdn && res.type === 'opaque'));
}

function simpan(req, res, cdn) {
  if (!bolehCache(res, cdn)) return;
  const copy = res.clone();
  caches.open(CACHE).then((c) => c.put(req, copy));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Jangan cache panggilan API Google Apps Script (sentiasa data terkini)
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;

  // Fail sendiri: network-first, fallback cache
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then((res) => {
        simpan(req, res, false);
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // CDN (Tailwind, Lucide, fon): stale-while-revalidate supaya boleh dibuka tanpa internet
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => {
        simpan(req, res, true);
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
