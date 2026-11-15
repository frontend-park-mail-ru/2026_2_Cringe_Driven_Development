declare const self: ServiceWorkerGlobalScope;

const CACHE_PREFIX = 'cellestial-offline-';
/** Поднять версию при изменении офлайн-страницы, её стилей или шрифта. */
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = '/offline.html';

/**
 * Кеш — только офлайн-страница, её стили (CSP запрещает встроенные) и шрифт; JS и CSS SPA всегда
 * с CDN, HTML и RPC с данными пользователя не кешируются (docs: трек «Офлайн-режим»).
 */
const OFFLINE_FILES = [OFFLINE_URL, '/offline.css', '/onest-variable.woff2'];

/**
 * В кеше нет файлов SPA, поэтому новая версия не расходится с открытой вкладкой и вступает сразу,
 * без перезагрузки.
 */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(OFFLINE_FILES))
            .then(() => self.skipWaiting()),
    );
});

/** Удаляет прежние версии офлайн-кеша этого приложения и берёт открытые вкладки. */
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

/** Навигация — только из сети; без сети — офлайн-страница. Остальные запросы SW не трогает. */
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
