import type { Validator } from '@cdd/schemas/validate';

import { env } from './env.ts';
import { ApiError, errorBody, toApiError } from './errors.ts';
import { createGo, type Go } from './go/api.ts';
import { logApiError } from './log.ts';
import { createSession, getRequestId, type Session } from './session/session.ts';

/**
 * Доступ к маршруту: `public` — без сессии (вход, регистрация), `optional` — сессия, если есть,
 * `authed` — без сессии 401.
 */
export type Access = 'public' | 'optional' | 'authed';

/** Что получает обработчик: сессия запроса, а при `optional` и `authed` — вызовы Go от её имени. */
type Ctx<A extends Access> = A extends 'public'
    ? { session: Session }
    : { session: Session; go: Go };

/** Откуда вход: query GET, JSON-тело или multipart. */
type RouteInput = {
    from: 'query' | 'json' | 'multipart';
    validate: Validator<unknown, unknown>;
};

/** Проверенный вход маршрута для обработчика; без входа — `undefined`. */
type InputOf<I> = I extends { validate: Validator<infer T, unknown> } ? T : undefined;
/** Вход маршрута, как его передаёт клиент. */
type WireOf<I> = I extends { validate: Validator<unknown, infer W> } ? W : never;

/** Маршрут таблицы: литеральные метод и путь, доступ, проверка входа и прикладной обработчик. */
export interface Route<
    M extends 'GET' | 'POST' = 'GET' | 'POST',
    P extends string = string,
    A extends Access = Access,
    I extends RouteInput | undefined = RouteInput | undefined,
    R = unknown,
> {
    method: M;
    path: P;
    access: A;
    input?: I;
    /** `Cache-Control: no-store` на успешный ответ */
    noStore?: true;
    handle(ctx: Ctx<A>, input: InputOf<I>): Promise<R>;
}

/**
 * Маршрут таблицы: вход обработчика выводится из проверки входа, ответ — из обработчика, поэтому
 * несовместимые проверка и обработчик не компилируются.
 * @param def метод, путь, доступ, вход и обработчик
 * @returns тот же маршрут с литеральными типами
 */
export const route = <
    const M extends 'GET' | 'POST',
    const P extends `/api/${string}`,
    const A extends Access,
    // строкой общий клиент отдаёт непарсящийся JSON: голую строку маршрут не возвращает
    R extends object | null | undefined | void,
    const I extends RouteInput | undefined = undefined,
>(
    def: Route<M, P, A, I, R>,
): Route<M, P, A, I, R> => def;

/** Параметры и тело операции общего клиента по источнику входа. */
type Request<I> = I extends { from: 'query' }
    ? {} extends WireOf<I>
        ? { params?: { query?: WireOf<I> } }
        : { params: { query: WireOf<I> } }
    : I extends { from: 'json' }
      ? { body: { 'application/json': WireOf<I> } }
      : I extends { from: 'multipart' }
        ? { body: { 'multipart/form-data': WireOf<I> } }
        : {};

/** Успех: `undefined` — 204 без тела, иначе 200 с JSON, включая `null`. */
type Responses<R> = [R] extends [undefined | void] ? { 204: undefined } : { 200: R };

/**
 * Операция общего клиента по маршруту: вход — wire-тип проверки, ответ — результат обработчика.
 */
export type OperationOf<T> =
    T extends Route<'GET' | 'POST', string, Access, infer I>
        ? Request<I> & { responses: Responses<Awaited<ReturnType<T['handle']>>> }
        : never;

/** Карта операций для общего клиента по таблице маршрутов. */
export type PathsOf<T extends Route> = {
    [R in T as R['path']]: { [M in R['method']]: OperationOf<R> };
};

/** Отказ CSRF: 403 с `appCode: csrf_invalid`. */
const csrfInvalid = (): ApiError => new ApiError(403, 'CSRF', { appCode: 'csrf_invalid' });

/**
 * CSRF до чтения сессии и вызовов Go: `X-CSRF: 1` на каждом запросе API, у POST ещё `Origin`
 * равен `APP_ORIGIN`, а `Sec-Fetch-Site`, если есть, — `same-origin`.
 * @param req запрос API
 * @throws {ApiError} 403 `csrf_invalid`
 */
function checkCsrf(req: globalThis.Request): void {
    if (req.headers.get('X-CSRF') !== '1') throw csrfInvalid();
    if (req.method === 'POST') {
        if (req.headers.get('Origin') !== env.APP_ORIGIN) throw csrfInvalid();
        const site = req.headers.get('Sec-Fetch-Site');
        if (site !== null && site !== 'same-origin') throw csrfInvalid();
    }
}

/**
 * Пары ключ-значение в объект; повтор ключа — массив значений, решает проверка входа.
 * @param entries пары query или multipart
 * @returns объект для проверки входа
 */
function group<V>(entries: Iterable<[string, V]>): Record<string, V | V[]> {
    const map = new Map<string, V | V[]>();
    for (const [key, value] of entries) {
        const prev = map.get(key);
        if (prev === undefined) map.set(key, value);
        else if (Array.isArray(prev)) prev.push(value);
        else map.set(key, [prev, value]);
    }
    // fromEntries создаёт собственные свойства: ключ __proto__ прототип не меняет
    return Object.fromEntries(map);
}

/**
 * Тип тела без параметров (`charset`, `boundary`) в нижнем регистре.
 * @param req запрос API
 */
const mediaType = (req: globalThis.Request): string =>
    (req.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase();

/**
 * Читает и проверяет вход маршрута; тело читается один раз. Неверный content type — 415,
 * неразбираемое тело — 400, вход не по проверке — 400 с проблемами полей. Исключение самой
 * проверки — не 400: оно уходит выше и становится 500.
 * @param input источник и проверка входа маршрута
 * @param req запрос API
 * @returns проверенный вход для обработчика
 */
async function readInput(input: RouteInput, req: globalThis.Request): Promise<unknown> {
    let raw: unknown;
    if (input.from === 'query') raw = group(new URL(req.url).searchParams);
    else if (input.from === 'json') {
        if (mediaType(req) !== 'application/json') {
            throw new ApiError(415, 'Нужно тело application/json');
        }
        raw = await req.json().catch(() => {
            throw new ApiError(400, 'Тело — не JSON');
        });
    } else {
        if (mediaType(req) !== 'multipart/form-data') {
            throw new ApiError(415, 'Нужно тело multipart/form-data');
        }
        const form = await req.formData().catch(() => undefined);
        if (!form) throw new ApiError(400, 'Тело — не multipart/form-data');
        raw = group(form.entries());
    }
    const result = input.validate(raw);
    if (!result.success)
        throw new ApiError(400, 'Неверные данные запроса', { issues: result.issues });
    return result.data;
}

/**
 * Обработка запроса маршрута: CSRF, сессия (одна на запрос), доступ, вход, обработчик. Успех —
 * 200 с JSON или 204, ошибка — JSON `{ error }`. `Set-Cookie` сессии ставится по итоговому решению
 * и при успехе, и при ошибке; `X-Request-ID` — тот же, что получил Go.
 * @param def маршрут из таблицы
 * @param req запрос как есть: тело ещё не прочитано
 * @returns ответ API
 */
export async function serveRoute(def: Route, req: globalThis.Request): Promise<Response> {
    const requestId = getRequestId(req);
    const headers = new Headers({ 'X-Request-ID': requestId });
    let session: Session | undefined;
    let status = 200;
    let body: unknown;
    try {
        checkCsrf(req);
        session = await createSession(req, requestId);
        if (def.access === 'authed' && !session.active) throw new ApiError(401, 'Нет сессии');
        const input = def.input ? await readInput(def.input, req) : undefined;
        body = await def.handle(
            def.access === 'public' ? { session } : { session, go: createGo(session) },
            input,
        );
        if (body === undefined) status = 204;
        if (def.noStore) headers.set('Cache-Control', 'no-store');
    } catch (e) {
        const error = toApiError(e);
        logApiError(req, error);
        status = error.status;
        body = errorBody(error);
    }
    session?.setCookies(headers);
    if (status === 204) return new Response(null, { status, headers });
    headers.set('Content-Type', 'application/json');
    return new Response(JSON.stringify(body), { status, headers });
}
