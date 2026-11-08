import { useEffect } from '@cdd-team/react';
import { RootLayout } from '@layouts/RootLayout';
import { createRootRoute, useNavigate } from '@cdd-team/router';
import { useSessionStore } from '@stores/session';

/**
 * Неизвестный адрес при переходе внутри приложения — как при прямом открытии у BFF: гость уходит на
 * вход, вошедший — на `/404`. Сам ничего не рисует.
 */
function UnknownAddress() {
    const navigate = useNavigate();
    const authed = useSessionStore((state) => state.status === 'authed');
    useEffect(() => {
        void navigate({ to: authed ? '/404' : '/login', replace: true });
    }, [authed, navigate]);
    return null;
}

/** Корневой маршрут: общий макет; неизвестный адрес ведёт на вход или на `/404`. */
export const rootRoute = createRootRoute({
    component: RootLayout,
    notFoundComponent: UnknownAddress,
});
