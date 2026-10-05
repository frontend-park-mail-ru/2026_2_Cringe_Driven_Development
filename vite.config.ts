import { defineConfig, loadEnv } from 'vite';

/**
 * Адрес без слеша в конце; без протокола считается https.
 * @param url адрес из переменной окружения
 * @returns нормализованный адрес
 */
const toUrl = (url: string) =>
    (/^https?:\/\//.test(url) ? url : `https://${url}`).replace(/\/+$/, '');

export default defineConfig(({ mode }) => {
    // RELEASE_SHA и CDN_URL задаёт CI при сборке релиза; без них (локально и в PR) base остаётся '/'
    // STATIC_URL — адрес static (картинки и шрифты), BACKEND_URL — адрес локального бэкенда
    const { RELEASE_SHA: sha, CDN_URL: cdn, STATIC_URL, BACKEND_URL } = loadEnv(mode, '.', '');
    const cdnUrl = cdn && toUrl(cdn);
    const staticUrl = toUrl(STATIC_URL || 'https://static.cellestial.ru');

    return {
        // чанки релиза лежат в S3 под своим sha и грузятся с CDN: открытая вкладка живёт на своём релизе
        base: sha && cdnUrl ? `${cdnUrl}/releases/${sha}/` : '/',
        // алиасы папок src берутся из paths в tsconfig.json
        resolve: { tsconfigPaths: true },
        server: {
            host: '127.0.0.1',
            strictPort: true,
            proxy: {
                '/api/v1': BACKEND_URL || 'http://127.0.0.1:8080',
            },
        },
        build: { outDir: 'dist', sourcemap: true },
        plugins: [
            {
                // var() не работает внутри url() и в @font-face: адрес static подставляется
                // вместо %STATIC_URL% в CSS и index.html
                name: 'static-url',
                enforce: 'pre',
                transform: (code: string, id: string) =>
                    /\.css($|\?)/.test(id) ? code.replaceAll('%STATIC_URL%', staticUrl) : undefined,
                transformIndexHtml: {
                    order: 'pre',
                    handler: (html) => html.replaceAll('%STATIC_URL%', staticUrl),
                },
            },
            {
                name: 'release-meta',
                transformIndexHtml: () => [
                    {
                        tag: 'meta',
                        attrs: { name: 'release', content: sha || 'dev' },
                        injectTo: 'head',
                    },
                ],
            },
        ],
    };
});
