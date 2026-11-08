import { Hono } from 'hono';

import { accessLog } from './log.ts';
import { pageOf } from './pages.ts';

/** Что приложению нужно от запуска: шаблон, публичные файлы и обработчики, которые есть. */
export type AppDeps = {
    template: string;
    publicFiles: Map<string, Bun.BunFile>;
    trpc?: (req: Request) => Promise<Response>;
    html?: (req: Request) => Promise<Response>;
};

// поисковым роботам не обходить API; клиентские страницы и ассеты не закрыты
const ROBOTS_TXT = 'User-agent: *\nDisallow: /api/\n';

const notFound = (): Response =>
    new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });

/**
 * Приложение Hono. Порядок маршрутов: `/health`, tRPC, остальные `/api` (404, в Go не уходят),
 * `/robots.txt` (без сессии и Go, при любом `Accept`), публичные файлы, HTML для GET/HEAD с `Accept: text/html` (на неизвестный адрес — со статусом 404),
 * остальное — 404. HEAD сюда приходит как
 * GET (`index.ts`), тело отбрасывает Bun.
 * @param deps шаблон, публичные файлы и обработчики tRPC и HTML
 * @returns приложение для `Bun.serve`
 */
export function createApp(deps: AppDeps): Hono {
    const app = new Hono();
    app.use(accessLog);

    app.get('/health', (c) => c.text('ok'));

    app.all('/api/trpc', (c) => (deps.trpc ? deps.trpc(c.req.raw) : notFound()));
    app.all('/api/trpc/*', (c) => (deps.trpc ? deps.trpc(c.req.raw) : notFound()));
    app.all('/api', notFound);
    app.all('/api/*', notFound);

    app.get(
        '/robots.txt',
        () =>
            new Response(ROBOTS_TXT, {
                headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
            }),
    );

    for (const [name, file] of deps.publicFiles) {
        // заголовки явно: HEAD Hono собирает из ответа GET, и тип и размер BunFile теряются
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
