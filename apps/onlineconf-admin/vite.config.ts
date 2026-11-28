import { defineConfig, mergeConfig, type Plugin } from 'vite';
import { loadClientEnv, sharedConfig, toUrl } from '../client/vite/shared.ts';

/** HTML админки рядом с index.html клиента: в одном dist у них разные имена. */
const htmlName: Plugin = {
    name: 'onlineconf-html',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
        const html = bundle['index.html'];
        if (!html) throw new Error('Нет index.html в сборке админки');
        html.fileName = 'onlineconf.html';
    },
};

export default defineConfig(({ command, mode }) => {
    const env = loadClientEnv(mode);
    const sha = env.RELEASE_SHA;
    const cdnUrl = env.CDN_URL && toUrl(env.CDN_URL);
    return mergeConfig(sharedConfig(env, sha || 'dev'), {
        // релиз — в том же каталоге CDN, что и клиент; в dev адреса как на проде
        base:
            command === 'serve'
                ? '/onlineconf/'
                : sha && cdnUrl
                  ? `${cdnUrl}/releases/${sha}/`
                  : '/',
        server: { host: '127.0.0.1', port: 5174, strictPort: true },
        plugins: [htmlName],
        build: {
            // один dist с клиентом: заливка, архив выпуска и образ BFF берут его целиком.
            // Клиент собирается раньше и очищает dist (turbo.json)
            outDir: '../client/dist',
            emptyOutDir: false,
        },
    });
});
