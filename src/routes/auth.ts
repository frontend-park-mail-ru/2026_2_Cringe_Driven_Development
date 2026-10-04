import { createRoute, redirect } from '@modules/router';
import { restoreSession, useSessionStore } from '@stores/session';
import { rootRoute } from './root';

/** Обёртка страниц для вошедшего пользователя: гостя перенаправляет на вход. */
export const authRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_auth',
    beforeLoad: async () => {
        await restoreSession();
        if (useSessionStore.getState().status !== 'authed') throw redirect({ to: '/login' });
    },
});
