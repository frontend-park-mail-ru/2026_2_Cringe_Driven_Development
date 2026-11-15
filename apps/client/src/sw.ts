const CACHE_PREFIX = 'cellestial-offline-';
/** Поднять версию при изменении офлайн-страницы, её стилей или шрифта. */
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = '/offline.html';
type WaitableEvent = Event & { waitUntil(promise: Promise<unknown>): void };
type NavigationEvent = WaitableEvent & {
    request: Request;
    respondWith(promise: Promise<Response>): void;
};
type ServiceWorkerScope = { skipWaiting(): Promise<void>; clients: { claim(): Promise<void> } };
const sw = self as unknown as ServiceWorkerScope;

/**
 * Кеш — только офлайн-страница, её стили (CSP запрещает встроенные) и шрифт; JS и CSS SPA всегда
 * с CDN, HTML и RPC с данными пользователя не кешируются (docs: трек «Офлайн-режим»).
 */
const OFFLINE_FILES = [OFFLINE_URL, '/offline.css', '/onest-variable.woff2'];

// тут сохраняем оффлайн рыбу при установке sw
self.addEventListener('install', (event) => {
    (event as WaitableEvent).waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(OFFLINE_FILES))
            .then(() => sw.skipWaiting()),
    );
});

// при активации удаляем устаревшие кеши этого приложения (то на че совпал CACHE_NAME)
self.addEventListener('activate', (event) => {
    (event as WaitableEvent).waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
                        .map((key) => caches.delete(key)),
                ),
            )
            .then(() => sw.clients.claim()),
    );
});

// ток для навигации Network First и если не получилось отдаем рыбу
self.addEventListener('fetch', (event) => {
    const fetchEvent = event as NavigationEvent;
    const request = fetchEvent.request;
    if (request.mode !== 'navigate' || request.method !== 'GET') return;

    fetchEvent.respondWith(
        fetch(request).catch(
            async () =>
                (await caches.match(OFFLINE_URL, { cacheName: CACHE_NAME })) ?? Response.error(),
        ),
    );
});
