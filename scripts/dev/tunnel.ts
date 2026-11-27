// bun run dev:tunnel — bun run dev с production Go команды через SSH-туннель (docs/local-development.md).
// Bun сам читает корневой .env: переменные берутся оттуда или из окружения.
import { join } from 'node:path';

import { loadGoTls } from '../../apps/bff/src/go/tls.ts';

const services = [
    {
        variable: 'IDENTITY_API_URL',
        host: 'identity.internal.cellestial.ru',
        remotePort: 8444,
        port: 18444,
    },
    {
        variable: 'WORKSPACE_API_URL',
        host: 'workspace.internal.cellestial.ru',
        remotePort: 8445,
        port: 18445,
    },
] as const;
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
const env = { ...process.env };
for (const { variable, host, port } of services) {
    env[variable] = `https://127.0.0.1:${port}/api/v1`;
    env[`${variable}_TLS_SERVER_NAME`] = host;
}
const endpoints = services.map(({ variable }) => {
    const url = new URL(env[variable]!);
    let tls: ReturnType<typeof loadGoTls>;
    try {
        tls = loadGoTls(url, env, variable);
    } catch (err) {
        fail(err instanceof Error ? err.message : 'неверная конфигурация TLS');
    }

    return { url, tls };
});

for (const { port: PORT } of services) {
    // ExitOnForwardFailure тоже ловит занятый порт, но без понятной причины
    try {
        Bun.listen({ hostname: '127.0.0.1', port: PORT, socket: { data() {} } }).stop(true);
    } catch {
        fail(`порт 127.0.0.1:${PORT} занят: остановите прежний туннель или процесс на этом порту`);
    }
}

const ssh = Bun.spawn(
    [
        'ssh',
        '-N',
        '-o',
        'ExitOnForwardFailure=yes',
        '-o',
        'ServerAliveInterval=15',
        ...services.flatMap(({ port, remotePort }) => [
            '-L',
            `127.0.0.1:${port}:${backendHost}:${remotePort}`,
        ]),
        sshHost!,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
);
const sshAlive = () => ssh.exitCode === null && ssh.signalCode === null;

/** Ждёт ответа Go /health через туннель; false — SSH завершился или вышло время */
async function waitHealth({ url, tls }: (typeof endpoints)[number]): Promise<boolean> {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (sshAlive() && Date.now() < deadline) {
        try {
            const res = await fetch(new URL('/health', url), {
                signal: AbortSignal.timeout(2_000),
                tls,
                redirect: 'error',
            });
            if (res.ok) return true;
        } catch {
            // туннель ещё поднимается или gateway отказал в пробросе
        }
        await Bun.sleep(500);
    }
    return false;
}

if (!(await Promise.all(endpoints.map(waitHealth))).every(Boolean)) {
    ssh.kill();
    fail(
        sshAlive()
            ? `Identity или Workspace не ответил на /health за ${HEALTH_TIMEOUT_MS / 1000} с: проверьте DEV_TUNNEL_BACKEND_HOST`
            : `SSH завершился с кодом ${ssh.exitCode}: проверьте доступ к ${sshHost}`,
    );
}

console.log(`dev:tunnel: Identity и Workspace доступны через SSH`);
const dev = Bun.spawn(['bun', 'run', 'dev'], {
    cwd: join(import.meta.dir, '../..'),
    env,
    stdio: ['inherit', 'inherit', 'inherit'],
});

// Ctrl+C получают и dev, и ssh; скрипт ждёт, пока оба завершатся
let interrupted = false;
process.on('SIGINT', () => {
    interrupted = true;
    ssh.kill();
});
process.on('SIGTERM', () => {
    dev.kill();
    ssh.kill();
});

const first = await Promise.race([
    dev.exited.then(() => 'dev' as const),
    ssh.exited.then(() => 'ssh' as const),
]);
if (first === 'ssh' && !interrupted) {
    console.error(
        `dev:tunnel: SSH-туннель оборвался (${ssh.exitCode ?? ssh.signalCode}), останавливаю dev`,
    );
    dev.kill();
    await dev.exited;
    process.exit(1);
}
ssh.kill();
await ssh.exited;
process.exit(dev.exitCode ?? 1);
