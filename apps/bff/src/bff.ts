import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { createApp } from './app.ts';
import { createContext } from './context.ts';
import { createHtmlHandler } from './html.ts';
import { logTrpcError } from './log.ts';
import { appRouter } from './router/index.ts';

/**
 * Обработчик запросов BFF целиком: tRPC, HTML, публичные файлы. Его отдают `Bun.serve` и тесты.
 * HEAD обслуживается как GET: тело отбрасывает Bun, `Content-Length` сохраняется (Hono превращал
 * бы HEAD в ответ с `Content-Length: 0`); исходный метод — в env Hono, для access-лога.
 * @param template проверенный HTML-шаблон клиента
 * @param publicFiles публичные файлы по имени
 * @returns функция `fetch` для `Bun.serve`
 */
export function createBff(
    template: string,
    publicFiles: Map<string, Bun.BunFile>,
): (req: Request) => Response | Promise<Response> {
    const app = createApp({
        template,
        publicFiles,
        html: createHtmlHandler(template),
        trpc: (req) =>
            fetchRequestHandler({
                endpoint: '/api/trpc',
                req,
                router: appRouter,
                createContext,
                onError: logTrpcError,
                /** Ответ с ключом настройки 2FA не кэшируется */
                responseMeta: ({ paths }) =>
                    paths?.includes('twoFactor.setup')
                        ? { headers: { 'Cache-Control': 'no-store' } }
                        : {},
            }),
    });
    return (req) =>
        req.method === 'HEAD'
            ? app.fetch(new Request(req, { method: 'GET' }), { method: 'HEAD' })
            : app.fetch(req);
}
