import { loginInput, registerInput } from '@cdd/schemas/validate';

import { publicGo, type AuthResult } from '../go/api.ts';
import { route } from '../http.ts';
import type { Session } from '../session/session.ts';

/**
 * Новая сессия после входа или регистрации: cookie с токенами Go, старые cookie удаляются.
 * @param session сессия запроса
 * @param result пользователь и токены от Go
 * @returns пользователь для клиента
 */
async function begin(session: Session, { user, tokens }: AuthResult): Promise<AuthResult['user']> {
    await session.start(tokens);
    session.clearLegacy();
    return user;
}

/**
 * Вход, регистрация, выход и выход со всех устройств. Токены Go остаются в cookie сессии, клиенту —
 * только пользователь.
 */
export const auth = [
    route({
        method: 'POST',
        path: '/api/auth/register',
        access: 'public',
        input: { from: 'json', validate: registerInput },
        handle: async ({ session }, input) =>
            begin(session, await publicGo.register(input, session.requestId)),
    }),
    route({
        method: 'POST',
        path: '/api/auth/login',
        access: 'public',
        input: { from: 'json', validate: loginInput },
        handle: async ({ session }, input) =>
            begin(session, await publicGo.login(input, session.requestId)),
    }),
    /** Cookie удаляется при любом итоге Go; `serverRevocation` — подтвердил ли Go отзыв. */
    route({
        method: 'POST',
        path: '/api/auth/logout',
        access: 'optional',
        async handle({ session, go }) {
            const serverRevocation = session.active ? await go.logout() : 'not_requested';
            session.end();
            session.clearLegacy();
            return { browserSession: 'ended' as const, serverRevocation };
        },
    }),
    /** Cookie удаляется только после подтверждения Go: при сбое сессии могли и не завершиться. */
    route({
        method: 'POST',
        path: '/api/auth/logout-all',
        access: 'authed',
        async handle({ session, go }) {
            await go.logoutAll();
            session.end();
            return { ok: true as const };
        },
    }),
] as const;
