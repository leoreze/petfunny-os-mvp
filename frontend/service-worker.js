const CACHE_NAME = 'petfunny-app-v1.5.110';
const APP_SHELL = [
  '/app/login',
  '/app/home',
  '/app/pagamento-pix',
  '/assets/css/app.css',
  '/assets/js/client-api.js',
  '/assets/js/client-auth.js',
  '/assets/js/client-shell.js',
  '/assets/js/client-push.js',
  '/assets/img/logo-petfunny-full.png',
  '/assets/img/icon-192.png',
  '/assets/img/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // O service worker pertence ao App do Tutor. Ele não deve interceptar o admin
  // nem a landing, porque isso pode devolver index.html em rotas como
  // /admin/promocoes e esconder a página CRUD real.
  const isClientAppRoute = url.pathname === '/app' || url.pathname.startsWith('/app/') || url.pathname.startsWith('/cliente');
  const isClientAsset = url.pathname.startsWith('/assets/js/client-') || url.pathname.startsWith('/assets/img/icon-') || url.pathname === '/assets/css/app.css' || url.pathname === '/manifest.webmanifest' || url.pathname === '/favicon.ico' || url.pathname === '/assets/img/favicon-petfunny.png';
  if (!isClientAppRoute && !isClientAsset) return;

  event.respondWith(
    fetch(request).then((response) => {
      const copy = response.clone();
      if (response.ok && (isClientAppRoute || isClientAsset)) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => null);
      }
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match('/app/home')))
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'PetFunny', body: event.data?.text() || 'Você tem uma novidade.' }; }
  const title = data.title || 'PetFunny avisou 🐾';
  const options = {
    body: data.body || 'Você tem uma novidade no Meu PetFunny.',
    icon: data.icon || '/assets/img/icon-192.png',
    badge: data.badge || '/assets/img/icon-192.png',
    tag: data.tag || 'petfunny',
    data: { url: data.url || '/app/home', type: data.type || 'info' },
    vibrate: [100, 50, 100],
    actions: [{ action: 'open', title: 'Abrir Meu PetFunny' }]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || '/app/home';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client && client.url.includes('/app/')) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
