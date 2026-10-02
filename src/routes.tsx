import { useState } from '@maninthecoat/react';

import { createRootRoute, createRoute, createRouter, Link, Outlet } from './router';

const RootLayout = () => (
    <main>
        <Outlet />
    </main>
);

const NotFoundPage = () => (
    <section>
        <h1>Страница не найдена</h1>
        <Link to="/">На главную</Link>
    </section>
);

const HomePage = () => {
    const [count, setCount] = useState(0);

    return (
        <section>
            <h1>Cellestial: Vite работает</h1>
            <button onClick={() => setCount(count + 1)}>Кликов: {count}</button>
        </section>
    );
};

const rootRoute = createRootRoute({
    component: RootLayout,
    notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: HomePage,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module './router' {
    interface Register {
        router: typeof router;
    }
}
