import { createRoot, useEffect, useState } from '@cdd-team/react';
import {
    Link,
    Outlet,
    RouterProvider,
    createRootRoute,
    createRoute,
    createRouter,
    redirect,
} from '@cdd-team/router';

/** Итог проверки доступа: решение принимает OnlineConf по роли из Identity. */
type Access = 'loading' | 'granted' | 'guest' | 'denied' | 'failed';

/**
 * Доступ текущего пользователя через BFF: 204 — администратор, 401 — нет входа, 403 `forbidden` —
 * нет роли. Остальное, включая сбой сети, — проверка не удалась.
 */
async function checkAccess(): Promise<Access> {
    try {
        const res = await fetch('/api/onlineconf/access', {
            headers: { 'X-CSRF': '1' },
            credentials: 'same-origin',
        });
        if (res.status === 204) return 'granted';
        if (res.status === 401) return 'guest';
        const body = (await res.json().catch(() => undefined)) as
            | { error?: { appCode?: string } }
            | undefined;
        if (res.status === 403 && body?.error?.appCode === 'forbidden') return 'denied';
    } catch {
        // сеть недоступна: как и любой другой сбой проверки
    }
    return 'failed';
}

/** Страницы админки — только администратору; продуктовую сессию отказ не завершает. */
function AccessGate() {
    const [access, setAccess] = useState<Access>('loading');
    useEffect(() => {
        void checkAccess().then(setAccess);
    }, []);
    switch (access) {
        case 'granted':
            return <Outlet />;
        case 'loading':
            return <p>Проверяем доступ…</p>;
        case 'guest':
            return (
                <p>
                    Войдите в Cellestial, чтобы открыть OnlineConf. <a href="/login">Войти</a>
                </p>
            );
        case 'denied':
            return (
                <p role="alert">
                    У вашей учётной записи нет доступа к OnlineConf.{' '}
                    <a href="/">Вернуться в Cellestial</a>
                </p>
            );
        case 'failed':
            return <p role="alert">Не удалось проверить доступ. Обновите страницу позже.</p>;
    }
}

const rootRoute = createRootRoute({
    component: () => (
        <>
            <header>
                <Link to="/keys">OnlineConf</Link>
            </header>
            <main>
                <AccessGate />
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
