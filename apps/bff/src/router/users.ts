import { ChangeCurrentUserPasswordBody, UpdateCurrentUserBody } from '@cdd/schemas';

import { authedProcedure, router } from '../trpc.ts';

/** Текущий пользователь: данные профиля, смена логина и пароля. */
export const users = router({
    me: authedProcedure.query(({ ctx }) => ctx.go.getCurrentUser()),
    updateLogin: authedProcedure
        .input(UpdateCurrentUserBody)
        .mutation(({ ctx, input }) => ctx.go.updateCurrentUser(input)),
    // Go отзывает все сессии пользователя, поэтому cookie больше не нужна
    changePassword: authedProcedure
        .input(ChangeCurrentUserPasswordBody)
        .mutation(async ({ ctx, input }) => {
            await ctx.go.changeCurrentUserPassword(input);
            ctx.session.end();
            return { ok: true as const };
        }),
});
