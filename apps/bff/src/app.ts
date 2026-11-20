import { Hono } from '@cdd-team/hono';

import { errorBody, ApiError } from './errors.ts';
import { serveRoute } from './http.ts';
import { accessLog } from './log.ts';
import { pageOf } from './pages.ts';
import { routes } from './router/index.ts';

/** Что приложению нужно от запуска: шаблон, публичные файлы и обработчики, которые есть. */
export type AppDeps = {
    template: string;
    publicFiles: Map<string, Bun.BunFile>;
    html?: (req: Request) => Promise<Response>;
};

/** Поисковым роботам не обходить API; клиентские страницы и ассеты не закрыты */
const ROBOTS_TXT = 'User-agent: *\nDisallow: /api/\n';

/** Неизвестный путь API или неверный метод известного: JSON 404, в Go и HTML не уходит */
const apiNotFound = (): Response =>
    Response.json(errorBody(new ApiError(404, 'Нет такого метода API')), { status: 404 });

const notFound = (): Response =>
    new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });

/**
 * Приложение `@cdd-team/hono`. Порядок маршрутов: `/health`, HTTP API по таблице маршрутов,
 * остальные `/api` и `/api/*` (JSON 404, в Go не уходят; так же неверный метод известного пути),
 * `/robots.txt` (без сессии и Go, при любом `Accept`), публичные файлы, HTML для GET/HEAD
 * с `Accept: text/html` (на неизвестный адрес — со статусом 404), остальное — 404. HEAD сюда
 * приходит как GET (`bff.ts`), тело отбрасывает Bun.
 * @returns приложение для `Bun.serve`
 */
export function createApp(deps: AppDeps): Hono {
    const app = new Hono();
    app.use(accessLog);

    app.get('/health', (c) => c.text('ok'));

    for (const r of routes) {
        if (r.method === 'GET') app.get(r.path, (c) => serveRoute(r, c.req.raw));
        else app.post(r.path, (c) => serveRoute(r, c.req.raw));
    }
    app.all('/api', apiNotFound);
    app.all('/api/*', apiNotFound);

    app.get(
        '/robots.txt',
        () =>
            new Response(ROBOTS_TXT, {
                headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
            }),
    );

    for (const [name, file] of deps.publicFiles) {
        /** Заголовки явно: у HEAD нет тела, и тип и размер BunFile без них теряются */
        const headers = { 'Content-Type': file.type, 'Content-Length': String(file.size) };
        app.get(`/${name}`, () => new Response(file, { headers }));
    }

    app.get('*', (c) => {
        if (!c.req.header('Accept')?.includes('text/html')) return notFound();
        if (deps.html) return deps.html(c.req.raw);
        const status = pageOf(c.req.path) ? 200 : 404;
        return c.html(deps.template, status, { 'Cache-Control': 'private, no-store' });
    });

    app.notFound(notFound);
    app.onError((err, c) => {
        console.error(
            JSON.stringify({
                time: new Date().toISOString(),
                path: c.req.path,
                error: err.message,
            }),
        );
        return new Response('Internal Server Error', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' },
        });
    });
    return app;
}
