/* Service worker — permite usar o site sem internet.
   Páginas, scripts e questões: busca na rede primeiro (sempre atualizado) e
   usa a cópia salva quando estiver offline. Imagens e fontes: usa a cópia salva. */
const CACHE = 'qb-core-v1';
const MEDIA = 'qb-media-v1';
const CORE = [
  './',
  'index.html',
  'banco_questoes_pmsp.html',
  'banco_questoes_gcm.html',
  'assets/css/app.css',
  'assets/css/home.css',
  'assets/js/icons.js',
  'assets/js/app.js',
  'assets/js/home.js',
  'assets/img/pmesp-logo.png',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'data/questoes_pmsp.js',
  'data/questoes_gcm.js',
  'manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== MEDIA).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isMedia(url){
  return /\.(png|jpe?g|webp|gif|svg|woff2?)$/i.test(url.pathname) ||
    url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && url.hostname !== 'fonts.googleapis.com' && url.hostname !== 'fonts.gstatic.com') return;

  if (isMedia(url)) {
    // cache primeiro
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(MEDIA).then(c => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  // rede primeiro, com a cópia salva como reserva
  event.respondWith(
    fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() =>
      caches.match(req, {ignoreSearch: true}).then(hit =>
        hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())
      )
    )
  );
});
