const VERSION = 'v43';
const STATIC_CACHE = `panah-chat-static-${VERSION}`;
const DYNAMIC_CACHE = `panah-chat-dynamic-${VERSION}`;

const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/js/app.js',
    '/css/style.css',
    '/assets/fonts.css',
    '/assets/fancybox.css',
    '/assets/sweetalert2@11.js',
    '/assets/tus.min.js',
    '/assets/browser-image-compression.js',
    '/assets/fancybox.umd.js',
    '/assets/fontawesome.min.js',
    '/assets/solid.min.js',
    '/assets/template/contact-cover.jpg',
    '/assets/template/chat-sample.jpg',
    '/socket.io/socket.io.js',
    '/manifest.json',
];

const NO_CACHE_DOMAINS = ['cdn.jsdelivr.net','unpkg.com','cdnjs.cloudflare.com'];

const isNoCacheReq = (u) => {
    try { const x = new URL(u); return NO_CACHE_DOMAINS.includes(x.hostname); } catch { return false; }
};
const isRangedReq = (req) => !!req.headers.get('range');
const canCacheRes = (res) => {
    if (!res) return false;
    if (res.status !== 200) return false;
    if (res.type !== 'basic' && res.type !== 'default') return false;
    if (res.headers.get('content-range')) return false;
    return true;
};

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(URLS_TO_CACHE)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names
            .filter((n) => n.startsWith('panah-chat-') && n !== STATIC_CACHE && n !== DYNAMIC_CACHE)
            .map((n) => caches.delete(n)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (!url.protocol.startsWith('http')) return;

    // Skip caching for non-GET, ranged, or upload requests
    if (request.method !== 'GET') return;
    if (request.headers.get('range')) { event.respondWith(fetch(request).catch(() => Response.error())); return; }
    if (url.pathname.startsWith('/uploads') || url.pathname.startsWith('/files')) {
      event.respondWith(fetch(request).catch(() => Response.error()));
      return;
    }
    if (url.pathname.startsWith('/socket.io')) return;
    if (url.pathname.startsWith('/api/')) {
      // API: network-first with no cache fallback
      event.respondWith(fetch(request).catch(() => new Response(JSON.stringify({error:'آفلاین'}), {headers:{'Content-Type':'application/json'}})));
      return;
    }

    // Navigation: network-first, cache fallback
    const isNavigation = request.mode === 'navigate' ||
      (request.headers.get('accept')?.includes('text/html'));

    if (isNavigation) {
      event.respondWith((async () => {
        try {
          const fresh = await fetch(request, { cache: 'no-store' });
          if (canCacheRes(fresh)) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put('/', fresh.clone());
          }
          return fresh;
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          return (await cache.match('/')) || (await cache.match('/index.html')) || new Response('آفلاین', {status:503});
        }
      })());
      return;
    }

    // Static assets: cache-first
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const res = await fetch(request);
        if (canCacheRes(res) && !url.pathname.startsWith('/files')) {
          const c = await caches.open(STATIC_CACHE);
          c.put(request, res.clone());
        }
        return res;
      } catch {
        return Response.error();
      }
    })());
});

self.addEventListener('push', event => {

    let data = {};

    try {
        data = event.data.json();
    } catch {
        data = {
            title: 'اعلان جدید',
            body: event.data.text()
        };
    }

    const options = {

        body: data.body || '',

        icon: '/assets/logo.png',

        badge: '/assets/logo-2.png',

        vibrate: [200, 100, 200],

        tag: data.messageId || 'chat',

        renotify: true,

        data: {
            url: data.url || '/'
        }
    };

    event.waitUntil(
        self.registration.showNotification(
            data.title || 'پیام جدید',
            options
        )
    );
});


self.addEventListener('notificationclick', (event) => {

    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {

                for (const client of clientList) {
                    if (client.url.includes(self.location.origin)) {
                        return client.focus();
                    }
                }

                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});
