import type { TokenPair } from '../go/client.ts';
import {
    LEGACY_COOKIE_NAMES,
    SESSION_COOKIE,
    clearedLegacyCookies,
    clearedSessionCookie,
    readSessionCookie,
    sessionCookie,
} from './cookies.ts';
import { openSession, sealSession, type SessionData } from './crypto.ts';
import { SessionEnded, refreshTokens, toSessionData } from './refresh.ts';

// refresh заранее, чтобы access не истёк по дороге к Go
const REFRESH_BEFORE_S = 30;

const now = (): number => Math.floor(Date.now() / 1000);

/** Сессия одного запроса: токены Go, вызовы с обновлением и решение о `Set-Cookie`. */
export interface Session {
    /** Есть ли действующая сессия. */
    readonly active: boolean;
    /**
     * Заголовки и refresh-токен для `POST /auth/logout` без refresh: undefined, если access уже
     * истёк или пары токенов нет.
     */
    revocation(): { init: RequestInit; refresh: string } | undefined;
    /** `X-Request-ID` запроса: из входящего заголовка или новый. */
    readonly requestId: string;
    /** Новая сессия после login или register. */
    start(tokens: TokenPair): Promise<void>;
    /** Завершить сессию: cookie удаляется. */
    end(): void;
    /**
     * Вызов Go с `Authorization: Bearer` и `X-Request-ID`. Без сессии — `SessionEnded`; access
     * обновляется заранее и после 401 (один повтор); повторный 401 завершает сессию. `refused` —
     * 401, который отказ операции, а не истёкший токен: возвращается как есть, без refresh.
     */
    call<T extends { status: number }>(
        fn: (init: RequestInit) => Promise<T>,
        refused?: (res: T) => boolean,
    ): Promise<T>;
    /** Привести `Set-Cookie` ответа к решению по сессии; чужие `Set-Cookie` остаются. */
    setCookies(headers: Headers): void;
    /** Удалить в ответе cookie прежней схемы авторизации Go. */
    clearLegacy(): void;
}

const REQUEST_ID = /^[\w.:-]{1,128}$/;

class RequestSession implements Session {
    private data: SessionData | null;
    // undefined — cookie не меняется, null — удалить, строка — записать
    private cookie: string | null | undefined;
    private legacy = false;
    readonly requestId: string;

    constructor(data: SessionData | null, clear: boolean, requestId: string) {
        this.data = data;
        this.cookie = clear ? null : undefined;
        this.requestId = requestId;
    }

    get active(): boolean {
        return this.data !== null;
    }

    revocation(): { init: RequestInit; refresh: string } | undefined {
        const d = this.data;
        if (!d?.access || !d.refresh || d.accessExp <= now()) return undefined;
        return { init: this.init(), refresh: d.refresh };
    }

    async start(tokens: TokenPair): Promise<void> {
        await this.save(toSessionData(tokens));
    }

    end(): void {
        this.data = null;
        this.cookie = null;
    }

    async call<T extends { status: number }>(
        fn: (init: RequestInit) => Promise<T>,
        refused?: (res: T) => boolean,
    ): Promise<T> {
        if (!this.data) throw new SessionEnded();
        if (this.data.accessExp - now() < REFRESH_BEFORE_S) await this.refresh();
        const res = await fn(this.init());
        if (res.status !== 401 || refused?.(res)) return res;
        await this.refresh();
        const retry = await fn(this.init());
        if (retry.status === 401 && !refused?.(retry)) {
            this.end();
            throw new SessionEnded();
        }
        return retry;
    }

    setCookies(headers: Headers): void {
        const own = [SESSION_COOKIE, ...LEGACY_COOKIE_NAMES].map((name) => `${name}=`);
        const others = headers.getSetCookie().filter((c) => !own.some((p) => c.startsWith(p)));
        headers.delete('Set-Cookie');
        for (const c of others) headers.append('Set-Cookie', c);
        if (this.legacy) for (const c of clearedLegacyCookies()) headers.append('Set-Cookie', c);
        if (this.cookie === null) headers.append('Set-Cookie', clearedSessionCookie());
        else if (this.cookie !== undefined && this.data) {
            headers.append('Set-Cookie', sessionCookie(this.cookie, this.data.refreshExp - now()));
        }
    }

    clearLegacy(): void {
        this.legacy = true;
    }

    private init(): RequestInit {
        return {
            headers: {
                Authorization: `Bearer ${this.data?.access}`,
                'X-Request-ID': this.requestId,
            },
        };
    }

    private async refresh(): Promise<void> {
        const current = this.data;
        if (!current) throw new SessionEnded();
        try {
            await this.save(await refreshTokens(current.refresh, this.requestId));
        } catch (err) {
            if (err instanceof SessionEnded) this.end();
            throw err;
        }
    }

    private async save(data: SessionData): Promise<void> {
        this.cookie = await sealSession(data);
        this.data = data;
    }
}

/**
 * Сессия запроса из cookie `__Host-Http-session`. Cookie, которая не расшифровалась или у которой
 * истёк refresh, — это отсутствие сессии, и она помечается к удалению; Go при этом не вызывается.
 * @param req входящий запрос
 * @returns сессия запроса
 */
export async function createSession(req: Request): Promise<Session> {
    const incoming = req.headers.get('X-Request-ID');
    const requestId = incoming && REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
    const value = readSessionCookie(req);
    if (value === undefined) return new RequestSession(null, false, requestId);
    const data = await openSession(value);
    if (!data || data.refreshExp <= now()) return new RequestSession(null, true, requestId);
    return new RequestSession(data, false, requestId);
}
