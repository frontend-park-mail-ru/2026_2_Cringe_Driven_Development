import createClient, { type Middleware } from '@iredtea/openapi';
import type { components, paths } from './schema';

/** Пользователь (схема User в Apidog). */
export type User = components['schemas']['User'];

/** Логин и пароль (схема Credentials в Apidog). */
export type Credentials = components['schemas']['Credentials'];

/** Код ошибки из ответа бэкенда (схема Error в Apidog). */
export type ApiErrorCode = components['schemas']['Error']['code'];

/** Блокнот в списке (схема NotebookSummary в Apidog). */
export type NotebookSummary = components['schemas']['NotebookSummary'];

/** Блокнот с ячейками (схема Notebook в Apidog). */
export type Notebook = components['schemas']['Notebook'];

/** Ячейка блокнота (схема Cell в Apidog). */
export type Cell = components['schemas']['Cell'];

const REFRESH_PATH = '/auth/refresh';
const AUTH_PREFIX = '/auth/';

/**
 * После 401 обновляет cookie через refresh и повторяет запрос.
 * Запросы, получившие 401 одновременно, ждут один и тот же refresh.
 * @returns {Middleware} middleware клиента
 */
function refreshMiddleware(): Middleware {
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

            refreshing ??= options
                .fetch(
                    new Request(options.baseUrl + REFRESH_PATH, {
                        method: 'POST',
                        credentials: 'include',
                    }),
                )
                .then((refreshed) => refreshed.ok)
                .finally(() => {
                    refreshing = undefined;
                });

            return (await refreshing) ? options.fetch(retry) : response;
        },
    };
}

/**
 * Клиент бэкенда.
 * Токены живут в HttpOnly-cookie, браузер отправляет их сам; после 401 клиент обновляет их
 * по refresh-cookie.
 */
export const api = createClient<paths>({ baseUrl: '/api/v1', credentials: 'include' });

api.use(refreshMiddleware());
