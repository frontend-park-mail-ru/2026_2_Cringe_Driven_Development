import type { Middleware } from '@iredtea/openapi';
import { setCsrfHeader } from './csrf';

const REFRESH_PATH = '/auth/refresh';
const AUTH_PREFIX = '/auth/';

/**
 * После 401 обновляет cookie через refresh и повторяет запрос.
 * Запросы, получившие 401 одновременно, ждут один и тот же refresh.
 * @returns {Middleware} middleware клиента
 */
export function authMiddleware(): Middleware {
    const retries = new WeakMap<Request, Request>();
    let refreshing: Promise<boolean> | undefined;

    return {
        onRequest({ request }) {
            // Тело запроса читается один раз, для повтора нужна копия
            retries.set(request, request.clone());
        },
        async onResponse({ request, response, schemaPath, options }) {
            const retry = retries.get(request);
            retries.delete(request);
            if (response.status !== 401 || schemaPath.startsWith(AUTH_PREFIX) || !retry) {
                return response;
            }

            if (!refreshing) {
                const refresh = new Request(options.baseUrl + REFRESH_PATH, {
                    method: 'POST',
                    credentials: 'include',
                });
                setCsrfHeader(refresh);
                refreshing = options
                    .fetch(refresh)
                    .then((refreshed) => refreshed.ok)
                    .finally(() => {
                        refreshing = undefined;
                    });
            }

            if (!(await refreshing)) return response;

            // После refresh CSRF-cookie новая, в копии запроса остался прежний токен
            setCsrfHeader(retry);
            return options.fetch(retry);
        },
    };
}
