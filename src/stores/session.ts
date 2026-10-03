import { create } from '@maninthecoat/zustand';
import { api, type ApiErrorCode, type Credentials, type User } from '../api/client';

/** unknown — сессию ещё проверяем, guest — не вошёл, authed — вошёл. */
export type SessionStatus = 'unknown' | 'guest' | 'authed';

interface SessionState {
    status: SessionStatus;
    /** Текущий пользователь; null, пока статус не authed */
    user: User | null;
}

/** Стор сессии. */
export const useSession = create<SessionState>()(() => ({ status: 'unknown', user: null }));

/** Ошибка входа или регистрации: код бэкенда или network — сервер недоступен. */
export interface AuthError {
    code: ApiErrorCode | 'network';
    /** Текст из ответа бэкенда */
    message?: string;
}

/** Итог входа или регистрации. */
export type AuthResult = { ok: true } | { ok: false; error: AuthError };

const GUEST: SessionState = { status: 'guest', user: null };

let restoring: Promise<void> | undefined;

/**
 * Восстанавливает сессию при старте: refresh-cookie меняется на access-токен, затем запрашивается
 * пользователь. Если refresh не прошёл — гость. Повторные вызовы ждут ту же проверку.
 * @returns промис, который выполнится, когда статус перестанет быть unknown
 */
export function restoreSession(): Promise<void> {
    restoring ??= (async () => {
        try {
            const refreshed = await api.POST('/auth/refresh');
            if (!refreshed.response.ok) {
                useSession.setState(GUEST);
                return;
            }
            const { data } = await api.GET('/users/me');
            useSession.setState(data ? { status: 'authed', user: data } : GUEST);
        } catch {
            useSession.setState(GUEST);
        }
    })();
    return restoring;
}

/**
 * Ошибка из тела ответа. Ответ без JSON с кодом приходит не от бэкенда, а от прокси,
 * когда бэкенд недоступен.
 * @param body тело ответа с ошибкой
 * @returns ошибка
 */
function toAuthError(body: unknown): AuthError {
    if (typeof body === 'object' && body !== null && 'code' in body) {
        return body as AuthError;
    }
    return { code: 'network' };
}

/**
 * Вход по логину и паролю.
 * @param credentials логин и пароль
 * @returns итог входа
 */
export async function login(credentials: Credentials): Promise<AuthResult> {
    try {
        const { data, error } = await api.POST('/auth/login', { body: credentials });
        if (!data) return { ok: false, error: toAuthError(error) };
        useSession.setState({ status: 'authed', user: data });
        return { ok: true };
    } catch {
        return { ok: false, error: { code: 'network' } };
    }
}

/**
 * Регистрация. Бэкенд сразу выдаёт токены, поэтому после неё пользователь уже вошёл.
 * @param credentials логин и пароль
 * @returns итог регистрации
 */
export async function register(credentials: Credentials): Promise<AuthResult> {
    try {
        const { data, error } = await api.POST('/auth/register', { body: credentials });
        if (!data) return { ok: false, error: toAuthError(error) };
        useSession.setState({ status: 'authed', user: data });
        return { ok: true };
    } catch {
        return { ok: false, error: { code: 'network' } };
    }
}
