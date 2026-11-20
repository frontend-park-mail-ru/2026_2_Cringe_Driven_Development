import { createApp } from './app.ts';
import { createHtmlHandler } from './html.ts';

/**
 * Обработчик запросов BFF целиком: HTTP API, HTML, публичные файлы. Его отдаёт `Bun.serve`.
 * HEAD обслуживается как GET: тело отбрасывает Bun, `Content-Length` сохраняется; исходный метод —
 * в env приложения, для access-лога. HEAD POST-маршрута API — 404: у него нет GET.
 * @param template проверенный HTML-шаблон клиента
 * @param publicFiles публичные файлы по имени
 * @returns функция `fetch` для `Bun.serve`
 */
export function createBff(
    template: string,
    publicFiles: Map<string, Bun.BunFile>,
): (req: Request) => Response | Promise<Response> {
    const app = createApp({ template, publicFiles, html: createHtmlHandler(template) });
    return (req) =>
        req.method === 'HEAD'
            ? app.fetch(new Request(req, { method: 'GET' }), { method: 'HEAD' })
            : app.fetch(req);
}
