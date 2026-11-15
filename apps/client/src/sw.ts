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

// при активации удаляем устаревшие кеши этого приложения (то на че совпал CACHE_NAME)
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

// ток для навигации Network First и если не получилось отдаем рыбу
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.mode !== 'navigate' || request.method !== 'GET') return;

    event.respondWith(
        fetch(request).catch(
            async () =>
                (await caches.match(OFFLINE_URL, { cacheName: CACHE_NAME })) ?? Response.error(),
        ),
    );
});
