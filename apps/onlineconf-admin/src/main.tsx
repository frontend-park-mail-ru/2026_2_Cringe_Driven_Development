import { createRoot } from '@cdd-team/react';
import {
    Link,
    Outlet,
    RouterProvider,
    createRootRoute,
    createRoute,
    createRouter,
    redirect,
} from '@cdd-team/router';

const rootRoute = createRootRoute({
    component: () => (
        <>
            <header>
                <Link to="/keys">OnlineConf</Link>
            </header>
            <main>
                <Outlet />
            </main>
        </>
    ),
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
    component: () => <h1>Ключи</h1>,
});

// адреса — те же, что BFF отдаёт HTML админки (apps/bff/src/app.ts)
const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, keysRoute]),
    basepath: '/onlineconf',
});

declare module '@cdd-team/router' {
    interface Register {
        router: typeof router;
    }
}

const container = document.getElementById('root');
if (!container) throw new Error('Не найден элемент #root');
createRoot(container).render(<RouterProvider router={router} />);
