import type { ApiError } from './errors.ts';

/**
 * Обёртка обработчика: одна строка access-лога JSON в stdout на запрос — `time`, `method`, `path`,
 * `status`, `ms`; `path` без query: в нём бывают входы запросов. Неожиданная ошибка пишется в stderr
 * и становится безопасным 500, с этим статусом и строка лога.
 * @param handler обработчик запроса
 * @returns обработчик с логом и безопасным 500
 */
export function logged(
    handler: (req: Request) => Response | Promise<Response>,
): (req: Request) => Promise<Response> {
    return async (req) => {
        const start = performance.now();
        const path = new URL(req.url).pathname;
        let res: Response;
        try {
            res = await handler(req);
        } catch (err) {
            console.error(
                JSON.stringify({
                    time: new Date().toISOString(),
                    path,
                    error: err instanceof Error ? err.message : String(err),
                }),
            );
            res = new Response('Internal Server Error', {
                status: 500,
                headers: { 'Content-Type': 'text/plain' },
            });
        }
        console.log(
            JSON.stringify({
                time: new Date().toISOString(),
                method: req.method,
                path,
                status: res.status,
                request_id: res.headers.get('X-Request-ID') ?? undefined,
                ms: Math.round(performance.now() - start),
            }),
        );
        return res;
    };
}

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
