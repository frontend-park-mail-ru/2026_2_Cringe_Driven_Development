import { serializeJsonForHtml } from '@cdd-team/serialize-javascript';

import { type Go, createGo } from './go/api.ts';
import { GoError } from './go/errors.ts';
import { loadNotebook } from './notebook.ts';
import { type Page, decodeSegment, isAdminPage, pageOf } from './pages.ts';
import { SessionEnded } from './session/refresh.ts';
import { type Session, createSession } from './session/session.ts';
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
 * HTML админки OnlineConf только после подтверждения роли: для гостя и пользователя без роли адрес
 * ведёт себя как неизвестная страница продукта. Без сессии или после её подтверждённого конца —
 * `302 /login` (OnlineConf без сессии не вызывается), отказ по роли — `302 /` с сохранением сессии,
 * `204` от OnlineConf — админка; сбой проверки, отказ по ключу BFF и прочие ответы — 503.
 */
async function serveAdmin(
    adminTemplate: string,
    session: Session,
    go: Go,
    headers: Headers,
): Promise<Response> {
    try {
        if (!session.active) throw new SessionEnded();
        await go.getOnlineConfAccess();
    } catch (err) {
        session.setCookies(headers);
        if (err instanceof SessionEnded) return redirect('/login', headers);
        // `forbidden` — нет роли; `s2s_forbidden` (ключ BFF) — сбой сервиса, не отказ пользователю
        const noRole = err instanceof GoError && err.status === 403 && err.code === 'forbidden';
        return noRole ? redirect('/', headers) : unavailable(headers);
    }
    session.setCookies(headers);
    for (const [name, value] of Object.entries(HTML_HEADERS)) headers.set(name, value);
    return new Response(adminTemplate, { headers });
}

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
 * - `/onlineconf` и `/onlineconf/*` при `adminTemplate`: см. {@link serveAdmin}.
 * @param template проверенный HTML-шаблон клиента
 * @param adminTemplate HTML админки OnlineConf
 * @returns обработчик GET-запросов страниц
 */
export function createHtmlHandler(
    template: string,
    adminTemplate?: string,
): (req: Request) => Promise<Response> {
    return async (req) => {
        const { pathname } = new URL(req.url);
        const page = pageOf(pathname);
        const session = await createSession(req);
        const headers = new Headers({ 'X-Request-ID': session.requestId });
        const go = createGo(session);
        if (adminTemplate !== undefined && isAdminPage(pathname)) {
            return serveAdmin(adminTemplate, session, go, headers);
        }
        let user: BootstrapData['user'] = null;
        let notebookPage: BootstrapData['notebookPage'];
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
            notebookPage ? { user, notebookPage } : { user },
            headers,
            status,
        );
    };
}
