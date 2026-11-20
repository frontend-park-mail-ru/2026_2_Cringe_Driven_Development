import type { ApiErrorBody, BffPaths, ErrorCode, ValidationErrors } from '@cdd/bff';
import { createClient, type HttpMethod, type OptionsArg } from '@cdd-team/http-client';
import type { RuntimeSession } from '@cdd/schemas/types';
import { browserTransport } from './transport';

/** Путь API BFF. */
export type BffPath = keyof BffPaths & string;

/** Операция маршрута: у каждого пути API один метод. */
type OperationOf<P extends BffPath> = BffPaths[P][keyof BffPaths[P]];

/** Успешный ответ маршрута: тело 200 или `undefined` для 204. */
export type Output<P extends BffPath> =
    OperationOf<P> extends { responses: infer R } ? R[keyof R] : never;

/** JSON-тело маршрута, как его передаёт клиент. */
export type JsonInput<P extends BffPath> =
    OperationOf<P> extends { body: { 'application/json': infer B } } ? B : never;

/** Пользователь, как его отдаёт `users/me`. */
export type User = Output<'/api/users/me'>;

/** Страница списка блокнотов из `notebooks/list`. */
export type NotebookListPage = Output<'/api/notebooks/list'>;

/** Блокнот в списке. */
export type NotebookSummary = NotebookListPage['items'][number];

/** Данные страницы блокнота из `notebooks/get`: блокнот, активная сессия и очередь. */
export type NotebookPageData = Output<'/api/notebooks/get'>;

/** Блокнот с hash и ячейками. */
export type Notebook = NotebookPageData['notebook'];

/** Ячейка блокнота. */
export type Cell = Notebook['cells'][number];

/**
 * Вид сбоя запроса: `http` — BFF ответил ошибкой по протоколу (`code`, `appCode`, …),
 * `network` — сеть, `abort` — запрос отменён, `protocol` — ответ не по протоколу API,
 * `session_changed` — запрос не выполнялся или пришёл после смены сессии.
 */
export type BffErrorKind = 'http' | 'network' | 'abort' | 'protocol' | 'session_changed';

/** Сбой запроса к BFF. Поведение завязывается на `kind`, `code` и `appCode`, не на `message`. */
export class BffError extends Error {
    readonly kind: BffErrorKind;
    readonly status?: number;
    readonly code?: ErrorCode;
    readonly appCode?: string;
    readonly validationErrors?: ValidationErrors;
    readonly activeSession?: RuntimeSession;

    /**
     * @param kind вид сбоя
     * @param message описание
     * @param details статус и поля ошибки из ответа BFF
     */
    constructor(
        kind: BffErrorKind,
        message: string,
        details: { status?: number } & Partial<Omit<ApiErrorBody['error'], 'message'>> = {},
    ) {
        super(message);
        this.name = 'BffError';
        this.kind = kind;
        this.status = details.status;
        this.code = details.code;
        this.appCode = details.appCode;
        this.validationErrors = details.validationErrors;
        this.activeSession = details.activeSession;
    }
}

/** Ошибка, которую BFF вернул по протоколу: есть `code`. */
export type HttpBffError = BffError & { kind: 'http'; code: ErrorCode };

/**
 * Ошибка от BFF, а не сбой сети, отмена или ответ не по протоколу.
 * @param error пойманная ошибка
 */
export function isBffError(error: unknown): error is HttpBffError {
    return error instanceof BffError && error.kind === 'http';
}

/** Сообщение ошибки запроса, который не выполнялся или пришёл после смены сессии. */
export const SESSION_CHANGED = 'Сессия сменилась';

/**
 * Объект, не `null`.
 * @param value проверяемое значение
 */
const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/**
 * Тело ошибки по протоколу: `{ error: { code, message } }` со строками.
 * @param data разобранное тело ответа
 */
const isErrorBody = (data: unknown): data is ApiErrorBody =>
    isObject(data) &&
    isObject(data.error) &&
    typeof data.error.code === 'string' &&
    typeof data.error.message === 'string';

/** Общий клиент по карте маршрутов BFF: путь, query, JSON и multipart собирает он. */
const client = createClient<BffPaths>({ transport: browserTransport });

/**
 * Один HTTP-запрос к BFF: успешный DTO или {@link BffError}. Успех — только 200 с JSON или 204;
 * всё остальное, что не ошибка по протоколу, — `protocol`.
 * @param method HTTP-метод маршрута
 * @param path путь маршрута
 * @param options query, тело и прочий `init`
 * @returns успешный DTO маршрута
 * @throws {BffError} сеть, отмена, ошибка BFF или ответ не по протоколу
 */
async function send<P extends BffPath, M extends keyof BffPaths[P] & HttpMethod>(
    method: M,
    path: P,
    ...options: OptionsArg<BffPaths[P][M]>
): Promise<Output<P>> {
    let res;
    try {
        res = await client.request(method, path, ...options);
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new BffError('abort', 'Запрос отменён');
        }
        throw new BffError('network', 'BFF недоступен');
    }
    const json = res.headers.get('Content-Type')?.startsWith('application/json') ?? false;
    // общий клиент отдаёт непарсящийся JSON строкой; голых строк ни один маршрут BFF не возвращает
    const parsed = json && typeof res.data !== 'string';
    // тело 200 — тип ответа маршрута из BffPaths, его форму гарантирует BFF
    if (res.status === 204 || (res.status === 200 && parsed)) return res.data as Output<P>;
    if (res.status >= 400 && parsed && isErrorBody(res.data)) {
        const { message, ...details } = res.data.error;
        throw new BffError('http', message, { status: res.status, ...details });
    }
    throw new BffError('protocol', `Ответ BFF не по протоколу: ${res.status}`, {
        status: res.status,
    });
}

/**
 * Маршруты, которые завершают сессию и идут через {@link switchSession}, как `auth/*`, но самим
 * им сессия нужна.
 */
const ENDING: ReadonlySet<string> = new Set(['/api/users/change-password', '/api/auth/logout-all']);

/**
 * Защищённые маршруты — все, кроме смен сессии: им нужна сессия, их результаты — данные
 * пользователя.
 * @param path путь маршрута
 */
const isProtected = (path: string): boolean => !path.startsWith('/api/auth/') && !ENDING.has(path);

/** Идёт смена сессии: новые защищённые запросы не стартуют. */
let closing = false;
/**
 * Во время смены сессии защищённый запрос получил `UNAUTHORIZED`: BFF уже мог удалить cookie.
 * Если смена не удастся, сессия всё равно потеряна.
 */
let lostWhileClosing = false;
/**
 * Очередь смен сессии: следующая начинается после завершения предыдущей, иначе её начало сбросило
 * бы {@link lostWhileClosing}, а конец — снял бы {@link closing}, пока предыдущая ещё идёт.
 */
let switching: Promise<unknown> = Promise.resolve();
/**
 * Номер сессии: меняется при входе, выходе и её потере. Ответ на запрос прежней сессии в интерфейс
 * не попадает.
 */
let generation = 0;
/** Незавершённые HTTP-запросы защищённых маршрутов — смена сессии ждёт их. */
const inflight = new Set<Promise<void>>();
/** Обработчик потери сессии, его задаёт {@link onSessionLost}. */
let sessionLost = (): void => {};

/** Ошибка запроса прежней сессии. */
const sessionChanged = (): BffError => new BffError('session_changed', SESSION_CHANGED);

/**
 * BFF ответил `UNAUTHORIZED`: сессии нет.
 * @param error пойманная ошибка
 */
const isUnauthorized = (error: unknown): boolean =>
    isBffError(error) && error.code === 'UNAUTHORIZED';

/**
 * Запрос к BFF своего origin: один вызов — один HTTP-запрос, независимые запросы не связаны.
 * Сессия — в HttpOnly-cookie, её прикладывает браузер; токены и refresh — забота BFF. Учёт
 * защищённых запросов: смена сессии ждёт уже отправленные, ответ прежней сессии — ошибка
 * `session_changed`, а `UNAUTHORIZED` — потеря сессии.
 * @param method HTTP-метод маршрута
 * @param path путь маршрута из `BffPaths`
 * @param options query, тело с content type и прочий `init` (например, `signal`)
 * @returns успешный DTO маршрута; сбой — {@link BffError}
 */
export async function api<P extends BffPath, M extends keyof BffPaths[P] & HttpMethod>(
    method: M,
    path: P,
    ...options: OptionsArg<BffPaths[P][M]>
): Promise<Output<P>> {
    if (ENDING.has(path)) {
        try {
            return await send(method, path, ...options);
        } catch (error) {
            // их 401 — потеря сессии, а не отказ, как у входа
            if (isUnauthorized(error)) lostWhileClosing = true;
            throw error;
        }
    }
    if (!isProtected(path)) return send(method, path, ...options);
    if (closing) throw sessionChanged();
    const started = generation;
    const { promise: pending, resolve } = Promise.withResolvers<void>();
    inflight.add(pending);
    try {
        const result = await send(method, path, ...options);
        if (generation !== started) throw sessionChanged();
        return result;
    } catch (error) {
        if (generation !== started) throw sessionChanged();
        if (isUnauthorized(error)) {
            if (closing) lostWhileClosing = true;
            else {
                generation++;
                sessionLost();
            }
        }
        throw error;
    } finally {
        inflight.delete(pending);
        resolve();
    }
}

/**
 * Что делать, когда BFF ответил защищённому запросу `UNAUTHORIZED`: сессия закончилась.
 * @param handler перевод в гостя и переход ко входу
 */
export function onSessionLost(handler: () => void): void {
    sessionLost = handler;
}

/**
 * Смена сессии — вход, регистрация, выход, выход со всех устройств или смена пароля. Новые
 * защищённые запросы не стартуют, `call` отправляется после того, как ответили уже отправленные:
 * их `Set-Cookie` браузер применяет раньше, чем `call` поставит или удалит cookie, и прежняя сессия
 * её не перезапишет. После успеха ответы прежней сессии в интерфейс не попадают. Ошибка `call` —
 * сессия остаётся прежней; но если пока ждали отправленные, один из них получил `UNAUTHORIZED`,
 * сессии уже нет — срабатывает {@link onSessionLost}, ошибка `call` всё равно пробрасывается.
 * Смены сессии идут по очереди: вызов во время другой смены начнётся после её завершения.
 * @param call запрос `auth/login`, `auth/register`, `auth/logout`, `auth/logout-all` или
 *   `users/change-password`
 * @returns ответ `call`
 */
export function switchSession<T>(call: () => Promise<T>): Promise<T> {
    const run = switching.then(() => runSwitch(call));
    switching = run.catch(() => undefined);
    return run;
}

/**
 * Одна смена сессии из очереди {@link switchSession}: ждёт отправленные защищённые запросы, затем
 * выполняет `call` и меняет поколение сессии.
 * @param call запрос смены сессии
 * @returns ответ `call`
 */
async function runSwitch<T>(call: () => Promise<T>): Promise<T> {
    closing = true;
    lostWhileClosing = false;
    try {
        while (inflight.size > 0) await Promise.allSettled(inflight);
        let result: T;
        try {
            result = await call();
        } catch (error) {
            if (lostWhileClosing) {
                generation++;
                sessionLost();
            }
            throw error;
        }
        generation++;
        return result;
    } finally {
        closing = false;
        lostWhileClosing = false;
    }
}
