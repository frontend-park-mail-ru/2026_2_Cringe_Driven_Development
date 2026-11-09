import { TRPCError } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

import { env } from './env.ts';
import { AppCodeError } from './errors.ts';
import { parseMockPrefer } from './mockPrefer.ts';
import { createSession, type Session } from './session/session.ts';

/**
 * Контекст процедур: сессия запроса, заголовки ответа для её `Set-Cookie` и одноразовые статусы
 * локального мока по процедурам (`null` вне `dev:prism`).
 */
export type Context = {
    session: Session;
    resHeaders: Headers;
    mockPrefer: ReadonlyMap<string, number> | null;
};

const csrfInvalid = (): TRPCError =>
    new TRPCError({ code: 'FORBIDDEN', message: 'CSRF', cause: new AppCodeError('csrf_invalid') });

/**
 * Контекст tRPC. CSRF проверяется до чтения сессии и вызовов Go: `X-CSRF: 1` на каждом RPC, у POST
 * ещё `Origin` равен `APP_ORIGIN`, а `Sec-Fetch-Site`, если есть, — `same-origin`. Отказ —
 * `FORBIDDEN` с `appCode: csrf_invalid`.
 */
export async function createContext({
    req,
    resHeaders,
}: FetchCreateContextFnOptions): Promise<Context> {
    if (req.headers.get('X-CSRF') !== '1') throw csrfInvalid();
    if (req.method === 'POST') {
        if (req.headers.get('Origin') !== env.APP_ORIGIN) throw csrfInvalid();
        const site = req.headers.get('Sec-Fetch-Site');
        if (site !== null && site !== 'same-origin') throw csrfInvalid();
    }
    const mockPrefer =
        env.MOCK_PREFER === '1' ? parseMockPrefer(req.headers.get('X-Mock-Prefer')) : null;
    return { session: await createSession(req), resHeaders, mockPrefer };
}
