import { bffHtml } from '@cdd-team/vite-plugin-bff-html';
import { mkcert } from '@cdd-team/vite-plugin-mkcert';
import { defineConfig, mergeConfig } from 'vite';
import { loadClientEnv, sharedConfig } from './vite/shared.ts';

export default defineConfig(({ mode }) => {
    const env = loadClientEnv(mode);
    const bffUrl = env.BFF_URL || 'http://127.0.0.1:3000';

    // dev-плагины идут первыми, как до разделения конфига
    return mergeConfig(
        {
            /**
             * Один origin с API: https://localhost:5173 — его же BFF ждёт в APP_ORIGIN. Vite
             * слушает 127.0.0.1: с host localhost на Windows он недоступен; открывать всё равно
             * https://localhost:5173
             */
            server: {
                host: '127.0.0.1',
                port: 5173,
                strictPort: true,
                proxy: { '/api': bffUrl },
            },
            plugins: [
                // локальный HTTPS: cookie сессии BFF — Secure; сертификат выпускает и доверяет
                // mkcert
                mkcert({ hosts: ['localhost', '127.0.0.1'] }),
                // HTML страниц — от BFF (пользователь в bootstrap и Set-Cookie сессии, как на
                // проде), Vite добавляет в него клиент HMR; /api из server.proxy плагин не
                // трогает
                bffHtml(bffUrl),
            ],
        },
        sharedConfig(env, 'dev'),
    );
});
