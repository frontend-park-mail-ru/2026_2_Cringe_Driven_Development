import { RefreshTokenResponse } from '@cdd/schemas';

import { refreshToken, type TokenPair } from '../go/client.ts';
import { unwrap } from '../go/errors.ts';
import type { SessionData } from './crypto.ts';

/** Сессия закончилась: Go отказал в refresh или повторно ответил 401. Cookie удаляется. */
export class SessionEnded extends Error {
    constructor() {
        super('Сессия закончилась');
        this.name = 'SessionEnded';
    }
}

const CACHE_MS = 10_000;
/** Одновременные refresh одного токена (HTML и RPC, вкладки) — один вызов Go. */
const inflight = new Map<string, Promise<SessionData>>();

const now = (): number => Math.floor(Date.now() / 1000);

/**
 * Сессия из пары токенов Go (уже проверенной схемой ответа): сроки — от текущего момента.
 */
export function toSessionData(tokens: TokenPair): SessionData {
    const t = now();
    return {
        access: tokens.access_token,
        refresh: tokens.refresh_token,
        accessExp: t + tokens.access_expires_in,
        refreshExp: t + tokens.refresh_expires_in,
    };
}

async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Buffer.from(digest).toString('hex');
}

/**
 * Обновляет токены в Go. Одновременные вызовы с одним refresh-токеном получают один результат;
 * удачный держится 10 с, неудачный сразу забывается. 401 от Go — `SessionEnded`, прочие сбои —
 * `GoError`.
 * @param refresh refresh-токен сессии
 * @param requestId `X-Request-ID` для Go
 * @returns новые токены и сроки
 */
export async function refreshTokens(refresh: string, requestId?: string): Promise<SessionData> {
    const id = await sha256(refresh);
    const cached = inflight.get(id);
    if (cached) return cached;

    const pending = (async () => {
        const res = await refreshToken(
            { refresh_token: refresh },
            { headers: requestId ? { 'X-Request-ID': requestId } : {} },
        );
        if (res.status === 401) throw new SessionEnded();
        return toSessionData(unwrap(res, [200], RefreshTokenResponse));
    })();
    inflight.set(id, pending);
    pending.then(
        () => setTimeout(() => inflight.delete(id), CACHE_MS),
        () => inflight.delete(id),
    );
    return pending;
}
