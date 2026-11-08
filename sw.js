// Service worker: rende l'app utilizzabile anche senza connessione.
// Ricordati di aumentare VERSION a ogni modifica dei file, così i telefoni
// scaricano la versione nuova.
const VERSION = 'v3';
const CACHE = `casa-${VERSION}`;

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/cloud.js',
  'js/firebase-config.js',
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
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Libreria Firebase: i file hanno la versione nell'indirizzo e non cambiano
  // mai, quindi basta scaricarli una volta e poi usare la copia salvata.
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

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
