import type { MiddlewareHandler } from '@cdd-team/hono';

import type { ApiError } from './errors.ts';

/**
 * Access-лог: одна строка JSON в stdout на запрос — `time`, `method`, `path`, `status`, `ms`.
 * `path` без query: в нём бывают входы запросов. `/health` не логируется, его опрашивает
 * healthcheck.
 */
export const accessLog: MiddlewareHandler = async (c, next) => {
    if (c.req.path === '/health') return next();
    const start = performance.now();
    await next();
    console.log(
        JSON.stringify({
            time: new Date().toISOString(),
            /** HEAD приходит в приложение как GET (bff.ts), исходный метод — в env. */
            method: (c.env as { method?: string } | undefined)?.method ?? c.req.method,
            path: c.req.path,
            status: c.res.status,
            ms: Math.round(performance.now() - start),
        }),
    );
};

/**
 * Лог ошибки API: метод, путь, `code` и `appCode`; стек — только у неожиданных
 * (`INTERNAL_SERVER_ERROR`). Query, тело, cookie и заголовки не пишутся.
 * @param req запрос API
 * @param error ошибка ответа
 */
export function logApiError(req: Request, error: ApiError): void {
    const cause = error.cause instanceof Error ? error.cause : undefined;
    console.error(
        JSON.stringify({
            time: new Date().toISOString(),
            method: req.method,
            path: new URL(req.url).pathname,
            code: error.code,
            appCode: error.appCode,
            stack: error.status === 500 ? (cause?.stack ?? error.stack) : undefined,
        }),
    );
}
