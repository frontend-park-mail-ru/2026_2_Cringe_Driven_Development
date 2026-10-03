import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    // RELEASE_SHA и CDN_URL задаёт CI при сборке релиза; без них (локально и в PR) base остаётся '/'
    const { RELEASE_SHA: sha, CDN_URL: cdn } = loadEnv(mode, '.', '');
    const cdnUrl = cdn && (/^https?:\/\//.test(cdn) ? cdn : `https://${cdn}`).replace(/\/+$/, '');

    return {
        // чанки релиза лежат в S3 под своим sha и грузятся с CDN: открытая вкладка живёт на своём релизе
        base: sha && cdnUrl ? `${cdnUrl}/releases/${sha}/` : '/',
        server: {
            host: '127.0.0.1',
            strictPort: true,
        },
        build: { outDir: 'dist', sourcemap: true },
        plugins: [
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
