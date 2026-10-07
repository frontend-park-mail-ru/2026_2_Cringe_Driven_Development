import type { Middleware } from '@iredtea/openapi';

const CSRF_COOKIE = '__Host-csrf';
const CSRF_HEADER = 'X-CSRF-Token';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const RETRY_PATHS = new Set(['/auth/login', '/auth/register']);

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
 * Проверяет, что бэкенд отклонил запрос из-за CSRF-токена.
 * @param {Response} response ответ
 * @returns {Promise<boolean>} true, если это 403 с кодом csrf_invalid
 */
async function isCsrfInvalid(response: Response): Promise<boolean> {
    if (response.status !== 403) return false;
    try {
        const body: unknown = await response.clone().json();
        return (
            typeof body === 'object' &&
            body !== null &&
            'code' in body &&
            body.code === 'csrf_invalid'
        );
    } catch {
        return false;
    }
}

/**
 * Добавляет CSRF-токен в изменяющие запросы. Вход и регистрация после 403 csrf_invalid
 * повторяются один раз: до входа cookie могла пропасть, а этот ответ уже принёс новую.
 * @returns {Middleware} middleware клиента
 */
export function csrfMiddleware(): Middleware {
    const retries = new WeakMap<Request, Request>();

    return {
        onRequest({ request, schemaPath }) {
            setCsrfHeader(request);
            // Тело запроса читается один раз, для повтора нужна копия
            if (RETRY_PATHS.has(schemaPath)) retries.set(request, request.clone());
        },
        async onResponse({ request, response, options }) {
            const retry = retries.get(request);
            retries.delete(request);
            if (!retry || !(await isCsrfInvalid(response))) return response;

            setCsrfHeader(retry);
            return options.fetch(retry);
        },
    };
}
