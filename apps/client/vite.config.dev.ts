import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { bffHtml } from '@cdd-team/vite-plugin-bff-html';
import { defineConfig, mergeConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';
import { loadClientEnv, sharedConfig } from './vite/shared.ts';

/**
 * Каталог из PATH в виде для сравнения: на Windows регистр в путях не важен.
 * @param dir каталог
 * @returns нормализованный путь
 */
const pathKey = (dir: string) => {
    const path = resolve(dir);
    return process.platform === 'win32' ? path.toLowerCase() : path;
};

/**
 * Убирает из PATH dev-сервера каталоги с чужим `mkcert`. Пока своего бинарника в
 * `~/.vite-plugin-mkcert` нет, vite-plugin-mkcert берёт первый `mkcert` из PATH и не скачивает
 * официальный. В WSL и Windows первым бывает npm-пакет `mkcert` с другим CLI: `-CAROOT` он не знает
 * (WSL) или не запускается без shell (Windows), и dev не стартует. Подходящим считается `mkcert`,
 * который отвечает на `-CAROOT`, как его вызывает плагин.
 */
function hideForeignMkcert() {
    const binary = process.platform === 'win32' ? 'mkcert.exe' : 'mkcert';
    if (existsSync(join(homedir(), '.vite-plugin-mkcert', binary))) return;
    const lookup = process.platform === 'win32' ? 'where mkcert' : 'command -v mkcert';
    for (;;) {
        let found: string | undefined;
        try {
            const output = execSync(lookup, {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            });
            found = output.split(/\r?\n/)[0]?.trim();
        } catch {
            return;
        }
        if (!found) return;
        try {
            execFileSync(found, ['-CAROOT'], { stdio: 'ignore', timeout: 10_000 });
            return;
        } catch {
            // не FiloSottile/mkcert: каталог убирается, поиск продолжается
        }
        const path = (process.env.PATH ?? '').split(delimiter);
        const rest = path.filter((dir) => pathKey(dir) !== pathKey(dirname(found)));
        if (rest.length === path.length) return;
        process.env.PATH = rest.join(delimiter);
        console.warn(`${found} — не mkcert для HTTPS: его каталог убран из PATH dev-сервера`);
    }
}

export default defineConfig(({ mode }) => {
    hideForeignMkcert();
    const env = loadClientEnv(mode);
    const bffUrl = env.BFF_URL || 'http://127.0.0.1:3000';

    // dev-плагины идут первыми, как до разделения конфига
    return mergeConfig(
        {
            // один origin с API: https://localhost:5173 — его же BFF ждёт в APP_ORIGIN. Vite слушает
            // 127.0.0.1: с host localhost на Windows он недоступен; открывать всё равно https://localhost:5173
            server: {
                host: '127.0.0.1',
                port: 5173,
                strictPort: true,
                proxy: { '/api/trpc': bffUrl },
            },
            plugins: [
                // локальный HTTPS: cookie сессии BFF — Secure; сертификат выпускает и доверяет mkcert
                mkcert({ hosts: ['localhost', '127.0.0.1'] }),
                // HTML страниц — от BFF (пользователь в bootstrap и Set-Cookie сессии, как на проде),
                // Vite добавляет в него клиент HMR; /api/trpc из server.proxy плагин не трогает
                bffHtml(bffUrl),
            ],
        },
        sharedConfig(env, 'dev'),
    );
});
