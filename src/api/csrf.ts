import type { Middleware } from '@iredtea/openapi';

const CSRF_COOKIE = '__Host-csrf';
const CSRF_HEADER = 'X-CSRF-Token';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Ставит изменяющему запросу CSRF-токен из cookie. Cookie читается каждый раз: после login
 * и refresh бэкенд выдаёт новую.
 * @param {Request} request запрос
 */
export function setCsrfHeader(request: Request): void {
    if (!UNSAFE_METHODS.has(request.method)) return;

    const prefix = `${CSRF_COOKIE}=`;
    const pair = document.cookie.split('; ').find((item) => item.startsWith(prefix));
    if (pair) request.headers.set(CSRF_HEADER, pair.slice(prefix.length));
}

/**
 * Добавляет CSRF-токен в изменяющие запросы.
 * @returns {Middleware} middleware клиента
 */
export function csrfMiddleware(): Middleware {
    return {
        onRequest({ request }) {
            setCsrfHeader(request);
        },
    };
}
