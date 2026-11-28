import { avatarInput, changePasswordInput, updateLoginInput } from '@cdd/schemas/validate';

import { route } from '../http.ts';
import { SessionEnded } from '../session/refresh.ts';

/** Текущий пользователь: данные профиля, смена логина, пароля и аватара. */
export const users = [
    route({
        method: 'GET',
        path: '/api/users/me',
        access: 'authed',
        /**
         * `isAdmin` — роль OnlineConf; сбой проверки роли профиль не ломает, ссылки в админку нет.
         * Конец сессии при проверке пробрасывается: клиент получает `UNAUTHORIZED`.
         */
        async handle({ go }) {
            const me = await go.getCurrentUser();
            const isAdmin = await go.getOnlineConfAccess().then(
                () => true,
                (err: unknown) => {
                    if (err instanceof SessionEnded) throw err;
                    return false;
                },
            );
            return { ...me, isAdmin };
        },
    }),
    route({
        method: 'POST',
        path: '/api/users/update-login',
        access: 'authed',
        input: { from: 'json', validate: updateLoginInput },
        handle: ({ go }, input) => go.updateCurrentUser(input),
    }),
    /** Go отзывает все сессии пользователя, поэтому cookie больше не нужна */
    route({
        method: 'POST',
        path: '/api/users/change-password',
        access: 'authed',
        input: { from: 'json', validate: changePasswordInput },
        async handle({ session, go }, input) {
            await go.changeCurrentUserPassword(input);
            session.end();
            return { ok: true as const };
        },
    }),
    route({
        method: 'POST',
        path: '/api/users/avatar',
        access: 'authed',
        input: { from: 'multipart', validate: avatarInput },
        handle: ({ go }, { avatar }) => go.uploadCurrentUserAvatar(avatar),
    }),
] as const;
