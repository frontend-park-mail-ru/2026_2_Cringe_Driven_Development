import { LoginUserBody, RegisterUserBody } from '@cdd/schemas';

import { publicGo } from '../go/api.ts';
import { authedProcedure, optionalSessionProcedure, publicProcedure, router } from '../trpc.ts';

/**
 * Вход, регистрация, выход и выход со всех устройств. Токены Go остаются в cookie сессии, клиенту —
 * только пользователь.
 */
export const auth = router({
    register: publicProcedure.input(RegisterUserBody).mutation(async ({ ctx, input }) => {
        const { user, tokens } = await publicGo.register(input, ctx.session.requestId);
        await ctx.session.start(tokens);
        ctx.session.clearLegacy();
        return user;
    }),
    login: publicProcedure.input(LoginUserBody).mutation(async ({ ctx, input }) => {
        const { user, tokens } = await publicGo.login(input, ctx.session.requestId);
        await ctx.session.start(tokens);
        ctx.session.clearLegacy();
        return user;
    }),
    /** Cookie удаляется при любом итоге Go; `serverRevocation` — подтвердил ли Go отзыв. */
    logout: optionalSessionProcedure.mutation(async ({ ctx }) => {
        const serverRevocation = ctx.session.active ? await ctx.go.logout() : 'not_requested';
        ctx.session.end();
        ctx.session.clearLegacy();
        return { browserSession: 'ended' as const, serverRevocation };
    }),
    /** Cookie удаляется только после подтверждения Go: при сбое сессии могли и не завершиться. */
    logoutAll: authedProcedure.mutation(async ({ ctx }) => {
        await ctx.go.logoutAll();
        ctx.session.end();
        return { ok: true as const };
    }),
});
