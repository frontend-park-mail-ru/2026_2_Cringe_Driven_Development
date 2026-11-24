// bun run dev:tunnel — bun run dev с production Go команды через SSH-туннель (docs/local-development.md).
// Bun сам читает корневой .env: переменные берутся оттуда или из окружения.
import { join } from 'node:path';

const PORT = 18080;
const BASE = `http://127.0.0.1:${PORT}`;
const GO_API_URL = `${BASE}/api/v1`;
const HEALTH_TIMEOUT_MS = 15_000;

/** Сообщает причину и завершает запуск с ошибкой */
function fail(message: string): never {
    console.error(`dev:tunnel: ${message}`);
    process.exit(1);
}

const required = ['DEV_TUNNEL_SSH_HOST', 'DEV_TUNNEL_BACKEND_HOST', 'BFF_KEY'] as const;
for (const name of required) {
    if (!process.env[name]) fail(`не задана переменная ${name} (корневой .env или окружение)`);
}
const { DEV_TUNNEL_SSH_HOST: sshHost, DEV_TUNNEL_BACKEND_HOST: backendHost } = process.env;

// ExitOnForwardFailure тоже ловит занятый порт, но без понятной причины
try {
    Bun.listen({ hostname: '127.0.0.1', port: PORT, socket: { data() {} } }).stop(true);
} catch {
    fail(`порт 127.0.0.1:${PORT} занят: остановите прежний туннель или процесс на этом порту`);
}

const ssh = Bun.spawn(
    [
        'ssh',
        '-N',
        '-o',
        'ExitOnForwardFailure=yes',
        '-o',
        'ServerAliveInterval=15',
        '-L',
        `127.0.0.1:${PORT}:${backendHost}:8080`,
        sshHost!,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
);
const sshAlive = () => ssh.exitCode === null && ssh.signalCode === null;

/** Ждёт ответа Go /health через туннель; false — SSH завершился или вышло время */
async function waitHealth(): Promise<boolean> {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (sshAlive() && Date.now() < deadline) {
        try {
            const res = await fetch(`${BASE}/health`, {
                signal: AbortSignal.timeout(2_000),
            });
            if (res.ok && ((await res.json()) as { status?: string }).status === 'alive')
                return true;
        } catch {
            // туннель ещё поднимается или gateway отказал в пробросе
        }
        await Bun.sleep(500);
    }
    return false;
}

if (!(await waitHealth())) {
    ssh.kill();
    fail(
        sshAlive()
            ? `Go не ответил status: alive на ${BASE}/health за ${HEALTH_TIMEOUT_MS / 1000} с: проверьте DEV_TUNNEL_BACKEND_HOST`
            : `SSH завершился с кодом ${ssh.exitCode}: проверьте доступ к ${sshHost}`,
    );
}

console.log(`dev:tunnel: production Go доступен через ${GO_API_URL}`);
const dev = Bun.spawn(['bun', 'run', 'dev'], {
    cwd: join(import.meta.dir, '../..'),
    env: { ...process.env, GO_API_URL },
    stdio: ['inherit', 'inherit', 'inherit'],
});

// Ctrl+C получают и dev, и ssh; скрипт ждёт, пока оба завершатся
process.on('SIGINT', () => ssh.kill());
process.on('SIGTERM', () => {
    dev.kill();
    ssh.kill();
});

const first = await Promise.race([
    dev.exited.then(() => 'dev' as const),
    ssh.exited.then(() => 'ssh' as const),
]);
if (first === 'ssh') {
    console.error(`dev:tunnel: SSH-туннель оборвался (код ${ssh.exitCode}), останавливаю dev`);
    dev.kill();
    await dev.exited;
    process.exit(1);
}
ssh.kill();
await ssh.exited;
process.exit(dev.exitCode ?? 1);
