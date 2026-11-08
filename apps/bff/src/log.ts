import type { TRPCError } from '@trpc/server';
import type { MiddlewareHandler } from 'hono';

import { appCodeOf } from './errors.ts';

const TRPC_PREFIX = '/api/trpc/';

/**
 * Access-лог: одна строка JSON в stdout на запрос — `time`, `method`, `path`, `procedure`
 * (для tRPC), `status`, `ms`. `path` без query: в `?input=` лежит вход процедуры. `/health` не
 * логируется, его опрашивает healthcheck.
 */
export const accessLog: MiddlewareHandler = async (c, next) => {
    if (c.req.path === '/health') return next();
    const start = performance.now();
    await next();
    const path = c.req.path;
    console.log(
        JSON.stringify({
            time: new Date().toISOString(),
            /** HEAD приходит в Hono как GET (bff.ts), исходный метод — в env. */
            method: (c.env as { method?: string } | undefined)?.method ?? c.req.method,
            path,
            procedure: path.startsWith(TRPC_PREFIX) ? path.slice(TRPC_PREFIX.length) : undefined,
            status: c.res.status,
            ms: Math.round(performance.now() - start),
        }),
    );
};

/**
 * Лог ошибок tRPC: процедура, код и `appCode`; стек — только у неожиданных
 * (`INTERNAL_SERVER_ERROR`). Вход процедуры, cookie и заголовки не пишутся.
 * @param opts ошибка и путь процедуры от адаптера tRPC
 */
export function logTrpcError(opts: { error: TRPCError; path: string | undefined }): void {
    const { error, path } = opts;
    const internal = error.code === 'INTERNAL_SERVER_ERROR';
    console.error(
        JSON.stringify({
            time: new Date().toISOString(),
            procedure: path,
            code: error.code,
            appCode: appCodeOf(error),
            stack: internal ? (error.cause?.stack ?? error.stack) : undefined,
        }),
    );
}
