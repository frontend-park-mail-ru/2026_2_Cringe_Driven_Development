import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Подставляет адрес static вместо `%VITE_STATIC_URL%` в CSS. var() не работает внутри url() и в
 * `@font-face`, а HTML-подстановку Vite к CSS не применяет.
 * @param staticUrl нормализованный адрес static
 * @returns плагин Vite
 */
export const staticUrlPlugin = (staticUrl: string): Plugin => ({
    name: 'static-url',
    enforce: 'pre',
    transform: (code, id) =>
        /\.css($|\?)/.test(id)
            ? { code: code.replaceAll('%VITE_STATIC_URL%', staticUrl), map: null }
            : undefined,
});

/**
 * Добавляет в `<head>` метатег `<meta name="release">` с версией сборки.
 * @param release sha релиза или `dev`
 * @returns плагин Vite
 */
export const releaseMetaPlugin = (release: string): Plugin => ({
    name: 'release-meta',
    transformIndexHtml: () => [
        { tag: 'meta', attrs: { name: 'release', content: release }, injectTo: 'head' },
    ],
});

/**
 * Манифест, service worker и модуль `virtual:pwa-register`. Нужен и в dev: там нет SW, но клиент
 * импортирует этот модуль.
 * @returns плагины Vite
 */
export const vitepwaPlugin = (): Plugin[] =>
    VitePWA({
        // манифест и иконки отдаёт BFF со своего origin (PUBLIC_FILES): с CDN манифест не примут
        base: '/',
        // регистрирует src/serviceWorker.ts
        injectRegister: false,
        includeManifestIcons: false,
        workbox: {
            // sw.js — один файл: его, как и манифест, отдаёт BFF
            inlineWorkboxRuntime: true,
            sourcemap: false,
            // кеш — только самостоятельная офлайн-страница и её стили (CSP запрещает встроенные); JS и CSS SPA всегда с CDN, а HTML
            // и RPC с данными пользователя не кешируются (docs: трек «Офлайн-режим»)
            globPatterns: ['offline.html', 'offline.css'],
            navigateFallback: null,
            runtimeCaching: [
                {
                    urlPattern: ({ request }) => request.mode === 'navigate',
                    handler: 'NetworkOnly',
                    options: { precacheFallback: { fallbackURL: '/offline.html' } },
                },
            ],
            // в кеше нет файлов SPA, поэтому новая версия не расходится с открытой вкладкой
            // и вступает сразу, без перезагрузки
            skipWaiting: true,
            clientsClaim: true,
            cleanupOutdatedCaches: true,
        },
        manifest: {
            name: 'Cellestial',
            short_name: 'Cellestial',
            lang: 'ru',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            background_color: '#05030f',
            theme_color: '#05030f',
            icons: [
                { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
                { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
                {
                    src: '/pwa-maskable-512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable',
                },
            ],
        },
    });
