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
const CSRF_COOKIE = '__Host-csrf';
const CSRF_HEADER = 'X-CSRF-Token';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Ставит изменяющему запросу CSRF-токен из cookie. Cookie читается каждый раз: после login
 * и refresh бэкенд выдаёт новую.
 * @param {Request} request запрос
 */
function setCsrfHeader(request: Request): void {
    if (!UNSAFE_METHODS.has(request.method)) return;

    const prefix = `${CSRF_COOKIE}=`;
    const pair = document.cookie.split('; ').find((item) => item.startsWith(prefix));
    if (pair) request.headers.set(CSRF_HEADER, pair.slice(prefix.length));
}

/**
 * Добавляет CSRF-токен в изменяющие запросы.
 * @returns {Middleware} middleware клиента
 */
function csrfMiddleware(): Middleware {
    return {
        onRequest({ request }) {
            setCsrfHeader(request);
        },
    };
}

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

/**
 * Клиент бэкенда.
 * Токены живут в HttpOnly-cookie, браузер отправляет их сам; после 401 клиент обновляет их
 * по refresh-cookie. Изменяющие запросы несут CSRF-токен из cookie.
 */
export const api = createClient<paths>({ baseUrl: '/api/v1', credentials: 'include' });

api.use(csrfMiddleware(), refreshMiddleware());
