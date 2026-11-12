// Локальный мок Go на Prism: ответы — из spec/openapi.json (копия контракта backend), без Cloud Mock и его
// прокси. Клиент и BFF — как в bun run dev, но BFF ходит в Prism; в консоли браузера
// mock('cells.update', 409) — следующий такой вызов получит этот ответ мока.
import { join } from 'node:path';

const root = join(import.meta.dir, '../..');
const PRISM_URL = 'http://127.0.0.1:4010';

/**
 * Статический режим: ответы — примеры контракта. Случайные данные BFF просит только для создания
 * ячейки (Prefer: dynamic=true), чтобы у новых ячеек были разные id.
 */
const prism = Bun.spawn(
    ['bunx', 'prism', 'mock', '-h', '127.0.0.1', '-p', '4010', 'spec/openapi.json'],
    { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] },
);

const dev = Bun.spawn(['bun', 'run', 'dev'], {
    cwd: root,
    env: {
        ...process.env,
        GO_API_URL: PRISM_URL,
        /** Контракт требует X-BFF-Key: без него Prism отклоняет запрос; значение не проверяется */
        BFF_KEY: process.env.BFF_KEY || 'local-prism',
        MOCK_PREFER: '1',
        VITE_MOCK_PREFER: '1',
    },
    stdio: ['inherit', 'inherit', 'inherit'],
});

/** Останавливает дерево процесса: на Windows `kill()` оставил бы turbo, Vite и BFF на портах. */
const stop = (child: Bun.Subprocess): void => {
    if (child.exitCode !== null) return;
    if (process.platform === 'win32') {
        Bun.spawnSync(['taskkill', '/PID', String(child.pid), '/T', '/F'], {
            stdio: ['ignore', 'ignore', 'ignore'],
        });
    } else child.kill();
};

/** Код выхода процесса, завершившегося первым: второй тоже останавливается. */
const code = await Promise.race([prism.exited, dev.exited]);
stop(prism);
stop(dev);
process.exit(code);
