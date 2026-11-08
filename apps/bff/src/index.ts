// Точка входа BFF: запросы принимаются только после проверки конфигурации, шаблона и public.
import { dirname } from 'node:path';

import { createBff } from './bff.ts';
import { env } from './env.ts';
import { loadClientAssets, loadPublicFiles } from './public.ts';
import { loadTemplate } from './template.ts';

/** Сколько ждать завершения текущих запросов при остановке. */
const STOP_TIMEOUT_MS = 10_000;

async function start(): Promise<void> {
    let template: string;
    let publicFiles: Map<string, Bun.BunFile>;
    try {
        template = await loadTemplate(env.HTML_TEMPLATE);
        publicFiles = env.SKIP_PUBLIC_FILES
            ? new Map()
            : await loadPublicFiles(dirname(env.HTML_TEMPLATE));
        if (env.SERVE_CLIENT_ASSETS) {
            const assets = await loadClientAssets(dirname(env.HTML_TEMPLATE));
            publicFiles = new Map([...publicFiles, ...assets]);
        }
    } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }

    const server = Bun.serve({ port: env.PORT, fetch: createBff(template, publicFiles) });
    console.log(
        JSON.stringify({ time: new Date().toISOString(), msg: 'listening', port: server.port }),
    );

    let stopping = false;
    const stop = async (): Promise<void> => {
        if (stopping) return;
        stopping = true;
        /** Принудительная остановка, если текущие запросы не завершились к сроку */
        const force = setTimeout(() => void server.stop(true), STOP_TIMEOUT_MS);
        // новые запросы не принимаются, текущие завершаются
        await server.stop();
        clearTimeout(force);
        process.exit(0);
    };
    process.on('SIGTERM', () => void stop());
    process.on('SIGINT', () => void stop());
}

await start();
