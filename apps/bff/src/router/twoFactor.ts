import { ConfirmTwoFactorAuthBody, DisableTwoFactorAuthBody } from '@cdd/schemas';

import { authedProcedure, router } from '../trpc.ts';

/**
 * 2FA текущего пользователя: данные настройки (QR и ключ), подтверждение кодом и отключение по
 * паролю. Ключ настройки BFF не хранит и не журналирует: он уходит клиенту в ответе `setup`.
 */
export const twoFactor = router({
    setup: authedProcedure.mutation(({ ctx }) => ctx.go.enableTwoFactor()),
    confirm: authedProcedure.input(ConfirmTwoFactorAuthBody).mutation(async ({ ctx, input }) => {
        await ctx.go.confirmTwoFactor(input);
        return { ok: true as const };
    }),
    disable: authedProcedure.input(DisableTwoFactorAuthBody).mutation(async ({ ctx, input }) => {
        await ctx.go.disableTwoFactor(input);
        return { ok: true as const };
    }),
});
