import { loginInput, registerInput } from '@cdd/schemas/validate';

import { publicGo } from '../go/api.ts';
import { route } from '../http.ts';

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
        async handle({ session }, input) {
            const { user, tokens } = await publicGo.register(input, session.requestId);
            await session.start(tokens);
            session.clearLegacy();
            return user;
        },
    }),
    route({
        method: 'POST',
        path: '/api/auth/login',
        access: 'public',
        input: { from: 'json', validate: loginInput },
        async handle({ session }, input) {
            const { user, tokens } = await publicGo.login(input, session.requestId);
            await session.start(tokens);
            session.clearLegacy();
            return user;
        },
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
