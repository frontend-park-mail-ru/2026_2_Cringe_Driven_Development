import { defineConfig, mergeConfig } from 'vite';
import { loadClientEnv, sharedConfig, toUrl } from './vite/shared.ts';

export default defineConfig(({ mode }) => {
    // RELEASE_SHA и CDN_URL задаёт CI при сборке релиза; без них (локально и в PR) base остаётся '/'
    const env = loadClientEnv(mode);
    const sha = env.RELEASE_SHA;
    const cdnUrl = env.CDN_URL && toUrl(env.CDN_URL);

    return mergeConfig(sharedConfig(env, sha || 'dev'), {
        // чанки релиза лежат в S3 под своим sha и грузятся с CDN: открытая вкладка живёт на своём релизе
        base: sha && cdnUrl ? `${cdnUrl}/releases/${sha}/` : '/',
        build: { outDir: 'dist' },
        // файлы public/ отдаёт BFF со своего origin (PUBLIC_FILES): favicon — по постоянному адресу,
        // CDN закрыт для роботов в robots.txt
        experimental: {
            renderBuiltUrl: (file: string, { type }: { type: 'asset' | 'public' }) =>
                type === 'public' ? `/${file}` : undefined,
        },
    });
});
