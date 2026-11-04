import type { AppRouter, RouterOutputs } from '@cdd/bff';
import {
    TRPCClientError,
    createTRPCClient,
    httpBatchLink,
    httpLink,
    isNonJsonSerializable,
    splitLink,
    type TRPCLink,
} from '@trpc/client';
// observable — та же утилита, что внутри самого @trpc/client: так пишутся свои link
import { observable } from '@trpc/server/observable';
import { fetchTracked } from '@stores/connection';

/** Пользователь, как его отдаёт `users.me`. */
export type User = RouterOutputs['users']['me'];

/** Блокнот в списке. */
export type NotebookSummary = RouterOutputs['notebooks']['list'][number];

/** Блокнот с ячейками. */
export type Notebook = RouterOutputs['notebooks']['get'];

/** Ячейка блокнота. */
export type Cell = Notebook['cells'][number];

/** Ошибка процедуры BFF: `data.code`, `data.appCode`, `data.zodError`. */
export type RpcError = TRPCClientError<AppRouter>;

// Завершают сессию и идут через switchSession, как auth.*, но самим им сессия нужна
const ENDING = new Set(['users.changePassword', 'auth.logoutAll']);

// Защищённые процедуры — все, кроме смен сессии: им нужна сессия, их результаты — данные пользователя
const isProtected = (path: string): boolean => !path.startsWith('auth.') && !ENDING.has(path);

// Идёт смена сессии: новые защищённые запросы не стартуют
let closing = false;
// Во время смены сессии защищённый запрос получил UNAUTHORIZED: BFF уже мог удалить cookie. Если
// смена не удастся, сессия всё равно потеряна
let lostWhileClosing = false;
// Очередь смен сессии: следующая начинается после завершения предыдущей, иначе её начало сбросило бы
// lostWhileClosing, а конец — снял бы closing, пока предыдущая ещё идёт
let switching: Promise<unknown> = Promise.resolve();
// Номер сессии: меняется при входе, выходе и её потере. Ответ на запрос прежней сессии в интерфейс
// не попадает
let generation = 0;
// Незавершённые HTTP-запросы защищённых процедур — выход ждёт их
const inflight = new Set<Promise<void>>();
let sessionLost = (): void => {};

/** Сообщение ошибки запроса, который не выполнялся или пришёл после смены сессии. */
export const SESSION_CHANGED = 'Сессия сменилась';

const sessionChanged = (): RpcError => new TRPCClientError(SESSION_CHANGED);

const isUnauthorized = (error: unknown): boolean =>
    error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED';

// Учёт защищённых запросов: выход ждёт уже отправленные, а UNAUTHORIZED — потеря сессии
const sessionLink: TRPCLink<AppRouter> =
    () =>
    ({ next, op }) =>
        observable((observer) => {
            if (ENDING.has(op.path)) {
                // их 401 — потеря сессии, а не отказ, как у входа
                return next(op).subscribe({
                    next: (value) => observer.next(value),
                    error(error) {
                        if (isUnauthorized(error)) lostWhileClosing = true;
                        observer.error(error);
                    },
                    complete: () => observer.complete(),
                });
            }
            if (!isProtected(op.path)) return next(op).subscribe(observer);
            if (closing) {
                observer.error(sessionChanged());
                return;
            }
            const started = generation;
            const { promise: pending, resolve } = Promise.withResolvers<void>();
            const finish = (): void => {
                inflight.delete(pending);
                resolve();
            };
            inflight.add(pending);
            const subscription = next(op).subscribe({
                next(value) {
                    if (generation === started) observer.next(value);
                    else observer.error(sessionChanged());
                },
                error(error) {
                    finish();
                    if (generation !== started) return observer.error(sessionChanged());
                    if (isUnauthorized(error)) {
                        if (closing) lostWhileClosing = true;
                        else {
                            generation++;
                            sessionLost();
                        }
                    }
                    observer.error(error);
                },
                complete() {
                    finish();
                    observer.complete();
                },
            });
            return () => {
                finish();
                subscription.unsubscribe();
            };
        });

const transport = {
    url: '/api/trpc',
    headers: { 'X-CSRF': '1' },
    fetch: (url: URL | RequestInfo, init?: RequestInit) =>
        fetchTracked(url, { ...init, credentials: 'same-origin' }),
};

/**
 * Клиент BFF: процедуры на `/api/trpc` своего origin, запросы одного тика — одним батчем.
 * Сессия — в HttpOnly-cookie, её прикладывает браузер; токены и refresh — забота BFF.
 */
export const trpc = createTRPCClient<AppRouter>({
    links: [
        sessionLink,
        // FormData (аватар) — отдельным запросом без батча и JSON: tRPC передаёт его как multipart
        splitLink({
            condition: (op) => isNonJsonSerializable(op.input),
            true: httpLink(transport),
            false: httpBatchLink({
                ...transport,
                // длинный батч GET делится, чтобы не упереться в лимит URL прокси
                maxURLLength: 2000,
            }),
        }),
    ],
});

/**
 * Ошибка от BFF, а не сбой сети или ответ не по протоколу tRPC.
 * @param error пойманная ошибка
 * @returns ошибка процедуры с `data` от BFF
 */
export function isRpcError(error: unknown): error is RpcError {
    return error instanceof TRPCClientError && error.data !== undefined && error.data !== null;
}

/**
 * Что делать, когда BFF ответил защищённому запросу `UNAUTHORIZED`: сессия закончилась.
 * @param handler перевод в гостя и переход ко входу
 */
export function onSessionLost(handler: () => void): void {
    sessionLost = handler;
}

/**
 * Смена сессии — вход, регистрация, выход, выход со всех устройств или смена пароля. Новые защищённые запросы не стартуют, `call`
 * отправляется после того, как ответили уже отправленные: их `Set-Cookie` браузер применяет раньше,
 * чем `call` поставит или удалит cookie, и прежняя сессия её не перезапишет. После успеха ответы
 * прежней сессии в интерфейс не попадают. Ошибка `call` — сессия остаётся прежней; но если пока
 * ждали отправленные, один из них получил `UNAUTHORIZED`, сессии уже нет — срабатывает
 * {@link onSessionLost}, ошибка `call` всё равно пробрасывается. Смены сессии идут по очереди:
 * вызов, пришедший во время другой смены, начнётся после её завершения.
 * @param call вызов `auth.login`, `auth.register`, `auth.logout`, `auth.logoutAll` или
 *   `users.changePassword`
 * @returns ответ `call`
 */
export function switchSession<T>(call: () => Promise<T>): Promise<T> {
    const run = switching.then(() => runSwitch(call));
    switching = run.catch(() => undefined);
    return run;
}

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
