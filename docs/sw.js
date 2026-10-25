// Service worker: aplikacija radi i bez interneta (zadnji preuzeti podaci).
const VERZIJA = 'rn-v2';
const LJUSKA = ['./', 'index.html', 'stil.css', 'app.js', 'manifest.webmanifest', 'privatnost.html', 'ikone/ikona-192.png', 'ikone/ikona-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERZIJA).then(c => c.addAll(LJUSKA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERZIJA).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Uvijek prvo mreža (da nove verzije stignu odmah), a bez interneta spremljena kopija.
  const kljuc = url.origin + url.pathname;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const kopija = r.clone(); caches.open(VERZIJA).then(c => c.put(kljuc, kopija)); }
      return r;
    }).catch(() => caches.match(kljuc).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
