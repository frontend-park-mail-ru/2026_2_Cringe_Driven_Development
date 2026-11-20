declare const self: ServiceWorkerGlobalScope;

const CACHE_PREFIX = 'cellestial-offline-';
/** Поднять версию при изменении офлайн-страницы, её стилей или шрифта. */
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = '/offline.html';

/** В кеше только офлайн-страница, её стили и шрифт. Файлы приложения и данные пользователя не кешируем. */
const OFFLINE_FILES = [OFFLINE_URL, '/offline.css', '/onest-variable.woff2'];

// тут сохраняем оффлайн рыбу при установке sw
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(OFFLINE_FILES))
            .then(() => self.skipWaiting()),
    );
});

// при активации удаляем прежние версии офлайн-кеша, текущий CACHE_NAME оставляем
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
                        .map((key) => caches.delete(key)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

// навигация и файлы рыбы Network First, без сети отдаем рыбу из кеша
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    const isOfflineFile =
        url.origin === self.location.origin && OFFLINE_FILES.includes(url.pathname);
    if (request.method !== 'GET' || (request.mode !== 'navigate' && !isOfflineFile)) return;

    const fallback = isOfflineFile ? url.pathname : OFFLINE_URL;
    event.respondWith(
        fetch(request).catch(
            async () =>
                (await caches.match(fallback, { cacheName: CACHE_NAME })) ?? Response.error(),
        ),
    );
});
