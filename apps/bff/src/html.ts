import { serializeJsonForHtml } from '@cdd-team/serialize-javascript';

import { createGo } from './go/api.ts';
import { GoError } from './go/errors.ts';
import { loadNotebook } from './notebook.ts';
import { type Page, decodeSegment, pageOf } from './pages.ts';
import { SessionEnded } from './session/refresh.ts';
import { createSession } from './session/session.ts';
import { loadSettings } from './settings.ts';
import type { BootstrapData } from './types.ts';

/** Заголовки HTML страниц: ответ зависит от сессии и выпуска, не кешируется. */
export const HTML_HEADERS = {
    'Content-Type': 'text/html; charset=UTF-8',
    'Cache-Control': 'private, no-store',
};

/** Страница 503: Go недоступен. Без скриптов — приложение не запускается. */
export const UNAVAILABLE_HTML =
    '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Cellestial</title></head>' +
    '<body><p>Сервис временно недоступен. Обновите страницу чуть позже.</p></body></html>';

/**
 * HTML клиента с данными в `<script id="bootstrap" type="application/json">`. JSON сериализуется
 * `serializeJsonForHtml` до создания ответа: `<`, `>`, `&`, U+2028/U+2029 в значениях и ключах —
 * JSON escapes, `</script>` и `<!--` не создают элементов. Несериализуемые данные — `TypeError`,
 * ответ — безопасный 500 из `logged`. `HTMLRewriter` — новый на каждый ответ, шаблон не меняется.
 * @param template проверенный HTML-шаблон клиента
 * @param data пользователь или `null`, на странице своего блокнота — и данные блокнота
 * @param headers заголовки ответа, уже с `Set-Cookie` сессии
 * @param status 200, для страницы `/404` — 404
 * @returns ответ с `Cache-Control: private, no-store`
 */
export function renderBootstrap(
    template: string,
    data: BootstrapData,
    headers: Headers,
    status = 200,
): Response {
    const json = serializeJsonForHtml(data);
    for (const [name, value] of Object.entries(HTML_HEADERS)) headers.set(name, value);
    return new HTMLRewriter()
        .on('script#bootstrap', {
            element(el) {
                el.setInnerContent(json, { html: true });
            },
        })
        .transform(new Response(template, { status, headers }));
}

/** Гостю открыты только вход и регистрация. */
const GUEST_PAGES = new Set<Page | undefined>(['login', 'register']);

const redirect = (location: string, headers: Headers): Response => {
    headers.set('Cache-Control', 'private, no-store');
    headers.set('Location', location);
    return new Response(null, { status: 302, headers });
};

const unavailable = (headers: Headers): Response => {
    for (const [name, value] of Object.entries(HTML_HEADERS)) headers.set(name, value);
    return new Response(UNAVAILABLE_HTML, { status: 503, headers });
};

/**
 * ID блокнота из адреса `/notebooks/:id`, как его примет `notebooks.get`, или `undefined`.
 * Параметр декодируется так же, как при сопоставлении маршрута: `/notebooks/%31` — блокнот 1.
 */

const notebookId = (pathname: string): number | undefined => {
    const id = Number(decodeSegment(pathname.split('/').filter(Boolean)[1] ?? ''));
    return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};

/**
 * Обработчик HTML клиента: по прямому запросу страницы решает, можно ли её открыть.
 *
 * - Пользователь — из Go `GET /users/me` через общий слой сессии (refresh, повтор после 401). Без
 *   сессии или когда она закончилась — гость, cookie удаляется. Сбой Go — 503 без приложения,
 *   сессия не удаляется; новая cookie после удачного refresh сохраняется и в 503.
 * - Гость: вход и регистрация — приложение, остальное, включая неизвестный адрес и `/404`, —
 *   `302` на `/login`; блокнот у Go не запрашивается.
 * - Вошедший: неизвестный адрес и `/404` — `302` на главную. Метаданные и content блокнота BFF
 *   загружает до выдачи HTML: свой — 200 и данные в bootstrap; отсутствующий, чужой (Go отвечает
 *   404 на оба) и некорректный ID — `302` на главную; сбой Go — 503.
 * - Вошедший на главной и в блокноте: настройки OnlineConf (`onlineconf/me`) в bootstrap; сбой
 *   OnlineConf — `onlineconf: null` в 200, не 503. Гостю настройки не запрашиваются.
 * @param template проверенный HTML-шаблон клиента
 * @returns обработчик GET-запросов страниц
 */
export function createHtmlHandler(template: string): (req: Request) => Promise<Response> {
    return async (req) => {
        const { pathname } = new URL(req.url);
        const page = pageOf(pathname);
        const session = await createSession(req);
        const headers = new Headers({ 'X-Request-ID': session.requestId });
        const go = createGo(session);
        let user: BootstrapData['user'] = null;
        let notebookPage: BootstrapData['notebookPage'];
        let onlineconf: BootstrapData['onlineconf'];
        try {
            if (session.active) {
                const me = await go.getCurrentUser();
                // только DTO пользователя: лишние поля ответа Go в HTML не попадают
                user = {
                    id: me.id,
                    login: me.login,
                    avatar_url: me.avatar_url,
                    has_2fa: me.has_2fa,
                };
            }
            if (user && page === 'notebook') {
                const id = notebookId(pathname);
                if (id === undefined) {
                    session.setCookies(headers);
                    return redirect('/', headers);
                }
                try {
                    notebookPage = await loadNotebook(go, id);
                } catch (err) {
                    // отсутствующий и чужой блокнот: Go ищет по ID и владельцу, 404 на оба
                    if (!(err instanceof GoError && err.kind === 'http' && err.status === 404)) {
                        throw err;
                    }
                    session.setCookies(headers);
                    return redirect('/', headers);
                }
            }
            // после блокнота, а не параллельно: вызовы одной сессии не делят refresh
            if (user && (page === 'index' || page === 'notebook'))
                onlineconf = await loadSettings(go);
        } catch (err) {
            if (!(err instanceof SessionEnded)) {
                session.setCookies(headers);
                return unavailable(headers);
            }
            user = null;
        }
        session.setCookies(headers);
        if (!user) {
            if (!GUEST_PAGES.has(page)) return redirect('/login', headers);
        } else if (!page || page === 'notFound') return redirect('/', headers);
        const status = 200;
        return renderBootstrap(
            template,
            {
                user,
                ...(notebookPage && { notebookPage }),
                ...(onlineconf !== undefined && { onlineconf }),
            },
            headers,
            status,
        );
    };
}
