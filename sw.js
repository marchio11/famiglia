// Service worker: rende l'app utilizzabile anche senza connessione.
// Ricordati di aumentare VERSION a ogni modifica dei file, così i telefoni
// scaricano la versione nuova.
const VERSION = 'v1';
const CACHE = `casa-${VERSION}`;

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/store.js',
  'js/util.js',
  'js/icons.js',
  'js/user.js',
  'js/views/home.js',
  'js/views/spesa.js',
  'js/views/todo.js',
  'js/views/liste.js',
  'js/views/calendario.js',
  'js/views/documenti.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Strategia "stale-while-revalidate": risponde subito dalla cache e intanto
// aggiorna la copia in background.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached || cache.match('index.html'));
      return cached || network;
    })
  );
});
