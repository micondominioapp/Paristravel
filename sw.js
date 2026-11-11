// Service worker: permite abrir la app sin conexión (en el metro, por ejemplo).
// Solo guarda los archivos de la app y la librería del mapa; fotos, mapas y búsquedas van directo a internet.
const CACHE = 'paristravel-v15';
const SHELL = ['./', 'index.html', 'styles.css', 'js/app.js', 'js/planner.js', 'js/data.js', 'js/osm.js', 'js/share.js',
  'js/match.js', 'js/photos.js', 'js/prices.js', 'js/sync.js', 'js/transport.js', 'js/assistant.js', 'icons/icon.svg', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const ours = url.origin === self.location.origin || url.hostname === 'unpkg.com';
  if (!ours) return; // el navegador se encarga (fotos, mapas, OpenStreetMap, Wikipedia)
  // Red primero; si no hay conexión, la copia guardada.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then((r) => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
