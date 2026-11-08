/** Имя cookie сессии BFF. Префикс `__Host-`: только Secure, `Path=/`, без `Domain`. */
export const SESSION_COOKIE = '__Host-Http-session';

const SESSION_ATTRS = 'Path=/; HttpOnly; Secure; SameSite=Lax';

/**
 * Значение cookie сессии из заголовка `Cookie` запроса.
 * @returns значение или `undefined`, если cookie нет
 */
export function readSessionCookie(req: Request): string | undefined {
    for (const part of (req.headers.get('Cookie') ?? '').split(';')) {
        const eq = part.indexOf('=');
        if (eq !== -1 && part.slice(0, eq).trim() === SESSION_COOKIE)
            return part.slice(eq + 1).trim();
    }
    return undefined;
}

/**
 * `Set-Cookie` сессии.
 * @param value зашифрованная сессия
 * @param maxAge срок жизни, секунды
 * @returns значение заголовка `Set-Cookie`
 */
export function sessionCookie(value: string, maxAge: number): string {
    return `${SESSION_COOKIE}=${value}; Max-Age=${Math.max(0, Math.floor(maxAge))}; ${SESSION_ATTRS}`;
}

/**
 * `Set-Cookie`, удаляющий cookie сессии.
 * @returns значение заголовка `Set-Cookie`
 */
export function clearedSessionCookie(): string {
    return `${SESSION_COOKIE}=; Max-Age=0; ${SESSION_ATTRS}`;
}

/** Cookie прежней схемы авторизации Go — с теми Path, с которыми их ставил Go */
const LEGACY: readonly (readonly [string, string])[] = [
    ['access_token', '/api/v1'],
    ['refresh_token', '/api/v1/auth'],
    ['__Host-csrf', '/'],
];

/** Имена cookie прежней схемы — чтобы не задвоить их удаление. */
export const LEGACY_COOKIE_NAMES: readonly string[] = LEGACY.map(([name]) => name);

/**
 * `Set-Cookie`, удаляющие cookie прежней схемы авторизации Go (`access_token`, `refresh_token`,
 * `__Host-csrf`) с их исходными `Path`.
 * @returns значения заголовков `Set-Cookie`
 */
export function clearedLegacyCookies(): string[] {
    return LEGACY.map(([name, path]) => `${name}=; Max-Age=0; Path=${path}; Secure; HttpOnly`);
}
