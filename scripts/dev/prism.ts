// Локальный мок Go на Prism: ответы — из spec/openapi.json (выгрузка Apidog), без Cloud Mock и его
// прокси. Клиент и BFF — как в bun run dev, но BFF ходит в Prism; в консоли браузера
// mock('cells.update', 409) — следующий такой вызов получит этот ответ мока.
import { join } from 'node:path';

const root = join(import.meta.dir, '../..');
const PRISM_URL = 'http://127.0.0.1:4010';

// статический режим: ответы — примеры контракта; случайные данные BFF просит только для
// создания ячейки (Prefer: dynamic=true), чтобы у новых ячеек были разные id
const prism = Bun.spawn(
    ['bunx', 'prism', 'mock', '-h', '127.0.0.1', '-p', '4010', 'spec/openapi.json'],
    { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] },
);

const dev = Bun.spawn(['bun', 'run', 'dev'], {
    cwd: root,
    env: {
        ...process.env,
        GO_API_URL: PRISM_URL,
        // контракт требует X-BFF-Key: без него Prism отклоняет запрос; значение мок не проверяет
        BFF_KEY: process.env.BFF_KEY || 'local-prism',
        MOCK_PREFER: '1',
        VITE_MOCK_PREFER: '1',
    },
    stdio: ['inherit', 'inherit', 'inherit'],
});

// на Windows kill() завершает только сам процесс: turbo, Vite и BFF остались бы занимать порты
const stop = (child: Bun.Subprocess): void => {
    if (child.exitCode !== null) return;
    if (process.platform === 'win32') {
        Bun.spawnSync(['taskkill', '/PID', String(child.pid), '/T', '/F'], {
            stdio: ['ignore', 'ignore', 'ignore'],
        });
    } else child.kill();
};

// любой из процессов завершился — завершаем и второй
const code = await Promise.race([prism.exited, dev.exited]);
stop(prism);
stop(dev);
process.exit(code);
