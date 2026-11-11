// Mude o número da versão sempre que alterar a lista de arquivos; ativação limpa os caches antigos.
const CACHE = 'fm-crm-v19';
const ASSETS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/api.js',
  '/js/ui.js',
  '/js/notificacoes.js',
  '/js/views/whatsapp.js',
  '/js/views/dashboard.js',
  '/js/views/entity.js',
  '/js/views/finance.js',
  '/js/views/pessoas.js',
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

// Notificações push (cifradas até o aparelho). Cada tipo tem aparência e vibração próprias.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (err) { d = { titulo: 'CRM Fortaleza Move', corpo: event.data ? event.data.text() : '' }; }
  const urgente = d.tipo === 'transferencia';
  const discreto = d.tipo === 'ia';
  event.waitUntil((async () => {
    // CRM aberto e na tela: ele mesmo toca o som e mostra o aviso (sem notificação dupla). Teste sempre aparece.
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (d.tipo !== 'teste' && janelas.some((c) => c.visibilityState === 'visible')) return;
    await self.registration.showNotification(d.titulo || 'CRM Fortaleza Move', {
    body: d.corpo || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: d.tag || undefined,
    renotify: !discreto,
    silent: discreto,
    requireInteraction: urgente,
    vibrate: urgente ? [300, 150, 300, 150, 600] : discreto ? [] : [120, 80, 120],
    data: { url: d.url || '/#/conversas' }
    });
  })());
});

// O serviço de push trocou a inscrição: refaz e avisa o CRM (mantém as escolhas do aparelho).
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const antiga = event.oldSubscription;
    const chave = antiga && antiga.options && antiga.options.applicationServerKey;
    let nova = event.newSubscription;
    if (!nova && chave) nova = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
    if (!nova) return;
    await fetch('/api/push/inscrever', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscription: nova.toJSON(), renovar: true, anterior: antiga ? antiga.endpoint : null })
    }).catch(() => null);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const alvo = (event.notification.data && event.notification.data.url) || '/#/conversas';
  event.waitUntil((async () => {
    const url = new URL(alvo, self.location.origin);
    if (url.origin !== self.location.origin) return; // só abre o próprio CRM
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of janelas) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); return c.navigate(url.href).catch(() => null); }
    }
    return self.clients.openWindow(url.href);
  })());
});
