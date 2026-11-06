// Mude o número da versão sempre que alterar a lista de arquivos; ativação limpa os caches antigos.
const CACHE = 'fm-crm-v10';
const ASSETS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/api.js',
  '/js/ui.js',
  '/js/views/dashboard.js',
  '/js/views/entity.js',
  '/js/views/finance.js',
  '/js/views/reports.js',
  '/js/views/settings.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()).catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // dados pessoais nunca entram no cache

  // Rede primeiro: a versão mais nova sempre vence quando há conexão; o cache só serve offline.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          const key = event.request.mode === 'navigate' ? '/index.html' : event.request;
          caches.open(CACHE).then((cache) => cache.put(key, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === 'navigate' ? caches.match('/index.html') : Response.error())))
  );
});
