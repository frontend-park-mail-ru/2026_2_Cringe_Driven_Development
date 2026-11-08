import type { RouterInputs, RouterOutputs } from '@cdd/bff';
import { create } from '@cdd-team/zustand';
import { isRpcError, switchSession, trpc, type User } from '@api/trpc';
import { showSnackbar } from '@stores/snackbar';

/** `guest` — не вошёл, `authed` — вошёл. Известен с первого рендера: его задаёт первый HTML. */
export type SessionStatus = 'guest' | 'authed';

interface SessionState {
    status: SessionStatus;
    /** Текущий пользователь; null у гостя */
    user: User | null;
}

/** Логин и пароль для входа и регистрации. */
export type Credentials = RouterInputs['auth']['login'];

/** Стор сессии. До первого рендера его заполняет {@link initSession}. */
export const useSessionStore = create<SessionState>()(() => ({ status: 'guest', user: null }));

/** Сессия закончилась (BFF ответил `UNAUTHORIZED`): пользователь — гость. */
export function loseSession(): void {
    useSessionStore.setState(GUEST);
}

/**
 * Состояние сессии из первого HTML: без запросов, до первого рендера.
 * @param user пользователь из bootstrap или null для гостя
 */
export function initSession(user: User | null): void {
    useSessionStore.setState(user ? { status: 'authed', user } : GUEST);
}

/**
 * Ошибка входа или регистрации. `code` — `appCode` от Go, `validation_error` — ещё и ошибки полей
 * проверки BFF, `network` — BFF недоступен или ответил не по протоколу.
 */
export interface AuthError {
    code: string;
    /** Текст из ответа BFF */
    message?: string;
    /** Ошибки полей формы */
    fields?: Partial<Record<keyof Credentials, string>>;
}

/** Итог входа или регистрации. */
export type AuthResult = { ok: true } | { ok: false; error: AuthError };

const GUEST: SessionState = { status: 'guest', user: null };

/**
 * Ошибка входа или регистрации из ошибки процедуры.
 * @param error пойманная ошибка
 * @returns ошибка для формы
 */
function toAuthError(error: unknown): AuthError {
    if (!isRpcError(error)) return { code: 'network' };
    const { appCode, zodError } = error.data ?? {};
    if (zodError) {
        const fields = zodError.fieldErrors as Partial<Record<keyof Credentials, string[]>>;
        return {
            code: 'validation_error',
            fields: { login: fields.login?.[0], password: fields.password?.[0] },
        };
    }
    return { code: appCode ?? 'unknown', message: error.message };
}

/** Вход по логину и паролю. */
export async function login(credentials: Credentials): Promise<AuthResult> {
    try {
        const user = await switchSession(() => trpc.auth.login.mutate(credentials));
        useSessionStore.setState({ status: 'authed', user });
        return { ok: true };
    } catch (error) {
        return { ok: false, error: toAuthError(error) };
    }
}

/** Регистрация. BFF сразу ставит cookie сессии, поэтому после неё пользователь уже вошёл. */
export async function register(credentials: Credentials): Promise<AuthResult> {
    try {
        const user = await switchSession(() => trpc.auth.register.mutate(credentials));
        useSessionStore.setState({ status: 'authed', user });
        return { ok: true };
    } catch (error) {
        return { ok: false, error: toAuthError(error) };
    }
}

/**
 * Смена пароля. Сначала отвечают уже отправленные запросы сессии, новые не стартуют
 * (`switchSession`). После успеха Go отзывает все сессии: пользователь — гость.
 * @param input текущий и новый пароль
 */
export async function changePassword(
    input: RouterInputs['users']['changePassword'],
): Promise<void> {
    await switchSession(() => trpc.users.changePassword.mutate(input));
    useSessionStore.setState(GUEST);
}

/** Итог выхода: `serverRevocation` от BFF или `failed` — BFF не ответил, выход не подтверждён. */
export type LogoutResult = RouterOutputs['auth']['logout']['serverRevocation'] | 'failed';

const REVOCATION_WARNINGS: Partial<Record<LogoutResult, string>> = {
    unconfirmed: 'Вы вышли в этом браузере. Отзыв сессии на сервере не подтверждён',
    unknown: 'Вы вышли в этом браузере. Не удалось подтвердить отзыв сессии на сервере',
};

/**
 * Выход. Сначала отвечают уже отправленные запросы сессии, новые не стартуют (`switchSession`).
 * Любой ответ BFF — выход в этом браузере: пользователь — гость, а если Go не подтвердил отзыв,
 * об этом сообщает снекбар. Сбой сети или CSRF — не выход: снекбар с ошибкой, сессию гостем
 * делает только `onSessionLost`, если она закончилась, пока ждали отправленные запросы.
 */
export async function logout(): Promise<LogoutResult> {
    let result: LogoutResult;
    try {
        ({ serverRevocation: result } = await switchSession(() => trpc.auth.logout.mutate()));
    } catch {
        showSnackbar('Не удалось выйти. Проверьте подключение и попробуйте снова');
        return 'failed';
    }
    useSessionStore.setState(GUEST);
    const warning = REVOCATION_WARNINGS[result];
    if (warning) showSnackbar(warning);
    return result;
}

/**
 * Итог выхода со всех устройств: `ok` — Go подтвердил, `lost` — сессия потеряна без подтверждения,
 * `failed` — исход неизвестен, сессия остаётся.
 */
export type LogoutAllResult = 'ok' | 'lost' | 'failed';

/**
 * Выход со всех устройств через `switchSession`. Успех — только после подтверждения Go: тогда
 * пользователь — гость. Потеря сессии (`UNAUTHORIZED`) — не подтверждение общего отзыва: её
 * обрабатывает `onSessionLost`. Сбой сети, Go 5xx или S2S — исход неизвестен, сессия остаётся.
 */
export async function logoutAll(): Promise<LogoutAllResult> {
    try {
        await switchSession(() => trpc.auth.logoutAll.mutate());
    } catch {
        return useSessionStore.getState().status === 'guest' ? 'lost' : 'failed';
    }
    useSessionStore.setState(GUEST);
    return 'ok';
}

/** Ошибка загрузки аватара: `file` — файл отвергнут, `upload` — сбой сети, Go или BFF. */
export type AvatarError = 'file' | 'upload';

const FILE_ERRORS = new Set(['validation_error', 'payload_too_large', 'unsupported_media_type']);

/**
 * Загрузка или замена аватара. После `200 User` — пользователь в сторе с новым `avatar_url`.
 * `UNAUTHORIZED` обрабатывает транспорт; здесь это сбой загрузки.
 * @param file JPEG или PNG, уже проверенный клиентом
 * @returns null после успеха, иначе вид ошибки
 */
export async function uploadAvatar(file: File): Promise<AvatarError | null> {
    const form = new FormData();
    form.append('avatar', file);
    try {
        const { avatar_url } = await trpc.users.uploadAvatar.mutate(form);
        // только своё поле: параллельная смена логина не откатывается
        useSessionStore.setState((state) => ({
            user: state.user && { ...state.user, avatar_url },
        }));
        return null;
    } catch (error) {
        const code = isRpcError(error) ? error.data?.appCode : undefined;
        return code && FILE_ERRORS.has(code) ? 'file' : 'upload';
    }
}
