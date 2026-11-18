/** Продолжить цепочку: запускает оставшиеся middleware и обработчик. */
export type Next = () => Promise<void>;

/** Обработчик маршрута: возвращает ответ. */
export type Handler<E = unknown> = (c: Context<E>, next: Next) => Response | Promise<Response>;

/** Middleware: возвращает свой ответ или вызывает `next` и оставляет итог в `c.res`. */
export type MiddlewareHandler<E = unknown> = (
    c: Context<E>,
    next: Next,
) => Promise<Response | void>;

type AnyHandler<E> = Handler<E> | MiddlewareHandler<E>;

type Route<E> = { method: string | null; path: string; handler: AnyHandler<E> };

const internalError = (): Response =>
    new Response('Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
    });

/** Контекст одного запроса. */
export class Context<E = unknown> {
    /** Запрос: исходный `Request`, путь без query, метод и заголовки. */
    readonly req: {
        raw: Request;
        path: string;
        method: string;
        header(name: string): string | undefined;
    };

    /** Окружение, переданное в `fetch`. */
    readonly env: E;

    #res: Response | undefined;

    /**
     * @param raw исходный запрос
     * @param path pathname запроса
     * @param env окружение из `fetch`
     */
    constructor(raw: Request, path: string, env: E) {
        this.req = {
            raw,
            path,
            method: raw.method,
            header: (name) => raw.headers.get(name) ?? undefined,
        };
        this.env = env;
    }

    /** Итоговый ответ; после `await next()` задан всегда. */
    get res(): Response {
        return this.#res as Response;
    }

    set res(res: Response) {
        this.#res = res;
    }

    /**
     * Текстовый ответ `text/plain; charset=UTF-8`.
     * @param text тело
     * @param status статус, по умолчанию 200
     * @param headers дополнительные заголовки
     * @returns ответ
     */
    text(text: string, status = 200, headers?: Record<string, string>): Response {
        return this.#body(text, 'text/plain; charset=UTF-8', status, headers);
    }

    /**
     * HTML-ответ `text/html; charset=UTF-8`.
     * @param html тело
     * @param status статус, по умолчанию 200
     * @param headers дополнительные заголовки
     * @returns ответ
     */
    html(html: string, status = 200, headers?: Record<string, string>): Response {
        return this.#body(html, 'text/html; charset=UTF-8', status, headers);
    }

    #body(
        body: string,
        type: string,
        status: number,
        headers: Record<string, string> | undefined,
    ): Response {
        return new Response(body, { status, headers: { 'Content-Type': type, ...headers } });
    }
}

/**
 * HTTP-роутер поверх Web Request/Response с API используемого подмножества Hono 4.
 * Маршруты: точный путь, `/prefix/*` (вложенные пути, не сам `/prefix`) и `*`.
 * Middleware и маршруты выполняются в порядке регистрации.
 */
export class Hono<E = unknown> {
    #routes: Route<E>[] = [];
    #notFound: (c: Context<E>) => Response | Promise<Response> = () =>
        new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    #onError: ((err: Error, c: Context<E>) => Response | Promise<Response>) | undefined;

    /**
     * Маршрут GET; на него же приходит HEAD.
     * @param path путь
     * @param handlers middleware и обработчик
     * @returns приложение для цепочки вызовов
     */
    get(path: string, ...handlers: AnyHandler<E>[]): this {
        return this.#add('GET', path, handlers);
    }

    /**
     * Маршрут POST.
     * @param path путь
     * @param handlers middleware и обработчик
     * @returns приложение для цепочки вызовов
     */
    post(path: string, ...handlers: AnyHandler<E>[]): this {
        return this.#add('POST', path, handlers);
    }

    /**
     * Маршрут для любого метода.
     * @param path путь
     * @param handlers middleware и обработчик
     * @returns приложение для цепочки вызовов
     */
    all(path: string, ...handlers: AnyHandler<E>[]): this {
        return this.#add(null, path, handlers);
    }

    /**
     * Middleware для всех запросов.
     * @param handlers middleware
     * @returns приложение для цепочки вызовов
     */
    use(...handlers: MiddlewareHandler<E>[]): this {
        return this.#add(null, '*', handlers);
    }

    /**
     * Ответ, когда цепочка дошла до конца без обработчика (по умолчанию 404).
     * @param handler обработчик
     * @returns приложение для цепочки вызовов
     */
    notFound(handler: (c: Context<E>) => Response | Promise<Response>): this {
        this.#notFound = handler;
        return this;
    }

    /**
     * Ответ на исключение обработчика или middleware (по умолчанию 500 без деталей).
     * @param handler обработчик ошибки
     * @returns приложение для цепочки вызовов
     */
    onError(handler: (err: Error, c: Context<E>) => Response | Promise<Response>): this {
        this.#onError = handler;
        return this;
    }

    /**
     * Обработать запрос; пригоден как `fetch` для `Bun.serve`. HEAD получает ответ GET-маршрута
     * целиком: тело отбрасывает `Bun.serve`, сохраняя `Content-Length`.
     * @param request запрос
     * @param env окружение, доступное как `c.env`
     * @returns ответ
     */
    fetch = async (request: Request, env?: E): Promise<Response> => {
        const path = new URL(request.url).pathname;
        const c = new Context<E>(request, path, env as E);
        const method = request.method === 'HEAD' ? 'GET' : request.method;
        const chain = this.#routes.filter(
            (r) => (r.method === null || r.method === method) && matches(r.path, path),
        );
        await this.#dispatch(c, chain, 0);
        return c.res;
    };

    #add(method: string | null, path: string, handlers: AnyHandler<E>[]): this {
        for (const handler of handlers) this.#routes.push({ method, path, handler });
        return this;
    }

    async #dispatch(c: Context<E>, chain: Route<E>[], i: number): Promise<void> {
        const route = chain[i];
        try {
            if (!route) {
                c.res = await this.#notFound(c);
                return;
            }
            let called = false;
            const next: Next = () => {
                if (called) return Promise.reject(new Error('next() called multiple times'));
                called = true;
                return this.#dispatch(c, chain, i + 1);
            };
            const res = await route.handler(c, next);
            if (res instanceof Response) c.res = res;
            // next() без await: downstream ещё не задал ответ
            else if (!called || (c.res as Response | undefined) === undefined)
                throw new Error('Handler returned no Response');
        } catch (err) {
            c.res = await this.#handleError(err, c);
        }
    }

    async #handleError(err: unknown, c: Context<E>): Promise<Response> {
        if (!this.#onError) return internalError();
        try {
            const res = await this.#onError(err instanceof Error ? err : new Error(String(err)), c);
            return res instanceof Response ? res : internalError();
        } catch {
            return internalError();
        }
    }
}

function matches(pattern: string, path: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('/*')) return path.startsWith(pattern.slice(0, -1));
    return path === pattern;
}
