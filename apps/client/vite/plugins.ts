import type { Plugin } from 'vite';

/**
 * Подставляет адрес static вместо `%VITE_STATIC_URL%` в CSS. `var()` не работает внутри `url()` и в
 * `@font-face`, а HTML-подстановку Vite к CSS не применяет.
 * @param staticUrl нормализованный адрес static
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
 * @param release SHA релиза или `dev`
 */
export const releaseMetaPlugin = (release: string): Plugin => ({
    name: 'release-meta',
    transformIndexHtml: () => [
        { tag: 'meta', attrs: { name: 'release', content: release }, injectTo: 'head' },
    ],
});
