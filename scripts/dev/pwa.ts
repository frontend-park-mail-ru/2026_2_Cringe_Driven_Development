// Локальная проверка PWA и service worker: production-сборка клиента и BFF на одном origin, без CDN
// и Docker. В bun run dev service worker нет: там HMR. Адрес другой, чтобы режимы работали рядом.
import { join } from 'node:path';

const ORIGIN = 'http://localhost:4173';
const root = join(import.meta.dir, '../..');

const build = Bun.spawnSync(['bun', 'run', 'build'], {
    cwd: join(root, 'apps/client'),
    /** Пустые значения важнее корневого .env: с ними чанки ищутся здесь, а не на CDN релиза */
    env: { ...process.env, RELEASE_SHA: '', CDN_URL: '' },
    stdio: ['ignore', 'inherit', 'inherit'],
});
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);

console.log(`\nPWA: ${ORIGIN} — без HMR, после изменений клиента запустите команду заново\n`);
const bff = Bun.spawn(['bun', '--env-file=../../.env', 'src/dev.ts'], {
    cwd: join(root, 'apps/bff'),
    env: {
        ...process.env,
        APP_ORIGIN: ORIGIN,
        PORT: '4173',
        HTML_TEMPLATE: join(root, 'apps/client/dist/index.html'),
        /** Пустое значение отменяет умолчание dev.ts: нужны sw.js, манифест и offline.html */
        SKIP_PUBLIC_FILES: '',
        SERVE_CLIENT_ASSETS: '1',
    },
    stdio: ['inherit', 'inherit', 'inherit'],
});
process.exit(await bff.exited);
