import { ChangeCurrentUserPasswordBody, UpdateCurrentUserBody } from '@cdd/schemas';
import { z } from 'zod';

import { authedProcedure, router } from '../trpc.ts';

// предел файла аватара по контракту Go: 5 МиБ
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

// multipart с единственным полем avatar: в Go уходит только файл, весь запрос — в пределах 6 МиБ
const AvatarForm = z
    .instanceof(FormData)
    .transform((form) => ([...form.keys()].length === 1 ? form.get('avatar') : null))
    .pipe(z.file().min(1).max(AVATAR_MAX_BYTES));

/** Текущий пользователь: данные профиля, смена логина, пароля и аватара. */
export const users = router({
    me: authedProcedure.query(({ ctx }) => ctx.go.getCurrentUser()),
    updateLogin: authedProcedure
        .input(UpdateCurrentUserBody)
        .mutation(({ ctx, input }) => ctx.go.updateCurrentUser(input)),
    uploadAvatar: authedProcedure
        .input(AvatarForm)
        .mutation(({ ctx, input }) => ctx.go.uploadCurrentUserAvatar(input)),
    // Go отзывает все сессии пользователя, поэтому cookie больше не нужна
    changePassword: authedProcedure
        .input(ChangeCurrentUserPasswordBody)
        .mutation(async ({ ctx, input }) => {
            await ctx.go.changeCurrentUserPassword(input);
            ctx.session.end();
            return { ok: true as const };
        }),
});
