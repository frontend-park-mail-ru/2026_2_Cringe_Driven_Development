import { createRoute, redirect } from '../modules/router';
import { AuthPage } from '../pages/AuthPage/AuthPage';
import { restoreSession, useSession } from '../stores/session';
import { rootRoute } from './root';

/**
 * Обёртка страниц для гостя: вошедшего перенаправляет на главную.
 * Вход и регистрация — одна страница, поэтому при переходе между ними она не пересоздаётся.
 */
export const guestRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_guest',
    beforeLoad: async () => {
        await restoreSession();
        if (useSession.getState().status === 'authed') throw redirect({ to: '/' });
    },
    component: AuthPage,
});

export const loginRoute = createRoute({
    getParentRoute: () => guestRoute,
    path: 'login',
});

export const registerRoute = createRoute({
    getParentRoute: () => guestRoute,
    path: 'register',
});
