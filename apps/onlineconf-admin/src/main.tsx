import { createRoot } from '@cdd-team/react';
import {
    RouterProvider,
    createRootRoute,
    createRoute,
    createRouter,
    redirect,
} from '@cdd-team/router';
import '../../client/src/styles/tokens.css';
import '../../client/src/styles/global.css';
import { AccessGate } from './AccessGate';
import { KeyPage } from './keys/KeyPage';
import { KeysPage, keysSearch } from './keys/KeysPage';
import { guardedHistory } from './leaveGuard';

const rootRoute = createRootRoute({
    component: AccessGate,
    notFoundComponent: () => <p>Страница не найдена</p>,
});

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: () => {
        throw redirect({ to: '/keys' });
    },
});

const keysRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'keys',
    validateSearch: keysSearch,
    component: KeysPage,
});

const keyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'keys/$name',
    component: KeyPage,
});

// Адреса соответствуют HTML админки, который отдаёт BFF.
const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, keysRoute, keyRoute]),
    basepath: '/onlineconf',
    history: guardedHistory,
});

declare module '@cdd-team/router' {
    interface Register {
        router: typeof router;
    }
}

const container = document.getElementById('root');
if (!container) throw new Error('Не найден элемент #root');
createRoot(container).render(<RouterProvider router={router} />);
