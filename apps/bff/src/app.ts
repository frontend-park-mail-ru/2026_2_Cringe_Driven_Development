import { errorBody, ApiError } from './errors.ts';
import { upstreamMetrics } from './go/metrics.ts';
import { serveRoute } from './http.ts';
import { logged } from './log.ts';
import { pageOf } from './pages.ts';
import { routes } from './router/index.ts';

/** Что приложению нужно от запуска: шаблон, публичные файлы и обработчики, которые есть. */
export type AppDeps = {
    template: string;
    publicFiles: Map<string, Bun.BunFile>;
    html?: (req: Request) => Promise<Response>;
};

/** Маршруты и обработчик остальных запросов для `Bun.serve`. */
export type App = {
    routes: Bun.Serve.Routes<undefined, string>;
    fetch: (req: Request) => Promise<Response>;
};

/** Поисковым роботам не обходить API; клиентские страницы и ассеты не закрыты */
const ROBOTS_TXT = 'User-agent: *\nDisallow: /api/\n';

/** Неизвестный путь API или неверный метод известного: JSON 404, в Go и HTML не уходит */
const apiNotFound = (): Response =>
    Response.json(errorBody(new ApiError(404, 'Нет такого метода API')), { status: 404 });

const notFound = (): Response =>
    new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });

/**
 * Приложение для `Bun.serve`. В `routes`: `/health` (без лога; другие методы — 404 тоже без лога), HTTP API по таблице маршрутов,
 * `/robots.txt` (без сессии и Go, при любом `Accept`) и публичные файлы. HEAD GET-маршрута Bun
 * обслуживает тем же обработчиком и отбрасывает тело; HEAD POST-маршрута и неверный метод уходят
 * в `fetch`. В `fetch`: `/api` и `/api/*` — JSON 404 (в Go не уходят), GET/HEAD с
 * `Accept: text/html` — HTML (на неизвестный адрес — со статусом 404), остальное — 404.
 * @returns маршруты и `fetch`
 */
export function createApp(deps: AppDeps): App {
    const table: Record<
        string,
        Partial<Record<'GET' | 'POST', (req: Request) => Promise<Response>>>
    > = {};
    for (const r of routes) {
        (table[r.path] ??= {})[r.method] = logged((req) => serveRoute(r, req));
    }

    const files: App['routes'] = {};
    for (const [name, file] of deps.publicFiles) {
        /** Заголовки явно: у HEAD нет тела, и тип и размер BunFile без них теряются */
        const headers = { 'Content-Type': file.type, 'Content-Length': String(file.size) };
        files[`/${name}`] = { GET: logged(() => new Response(file, { headers })) };
    }

    const fallback = logged((req) => {
        const path = new URL(req.url).pathname;
        if (path === '/api' || path.startsWith('/api/')) return apiNotFound();
        const page = req.method === 'GET' || req.method === 'HEAD';
        if (!page || !req.headers.get('Accept')?.includes('text/html')) return notFound();
        if (deps.html) return deps.html(req);
        return new Response(deps.template, {
            status: pageOf(path) ? 200 : 404,
            headers: {
                'Content-Type': 'text/html; charset=UTF-8',
                'Cache-Control': 'private, no-store',
            },
        });
    });

    return {
        routes: {
            '/health': {
                GET: () =>
                    new Response('ok', {
                        headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
                    }),
            },
            '/metrics': { GET: upstreamMetrics },
            ...table,
            '/robots.txt': {
                GET: logged(
                    () =>
                        new Response(ROBOTS_TXT, {
                            headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
                        }),
                ),
            },
            ...files,
        },
        fetch: async (req) =>
            new URL(req.url).pathname === '/health' ? notFound() : fallback(req),
    };
}
