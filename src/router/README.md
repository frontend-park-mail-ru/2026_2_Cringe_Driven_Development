# Роутер

Собственный роутер с API по образцу [TanStack Router](https://tanstack.com/router/latest)
(code-based routing). Без сторонних зависимостей: только `@maninthecoat/react` и History API.

## Быстрый старт

```tsx
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from './router';

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const notebooksRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'notebooks',
    component: NotebooksLayout, // внутри — <Outlet />
});

const notebookRoute = createRoute({
    getParentRoute: () => notebooksRoute,
    path: '$notebookId',
    loader: ({ params }) => fetchNotebook(params.notebookId),
    component: NotebookPage,
});

const routeTree = rootRoute.addChildren([notebooksRoute.addChildren([notebookRoute])]);

export const router = createRouter({ routeTree });

// Регистрация включает проверку путей и параметров в Link, navigate и хуках
declare module './router' {
    interface Register {
        router: typeof router;
    }
}

createRoot(container).render(<RouterProvider router={router} />);
```

Маршруты приложения объявлены в [`src/routes.tsx`](../routes.tsx).

## Пути

| `path` | Что означает |
|---|---|
| `notebooks` | статичный сегмент |
| `$notebookId` | параметр, попадает в `params.notebookId` |
| `$` | сплат: остаток пути в `params._splat` |
| `/` | индексный маршрут: отрисовывается в `<Outlet />` родителя по его точному пути |
| `id: '_auth'` вместо `path` | обёртка без сегмента пути: общий layout или проверка доступа |

Из подходящих маршрутов выбирается самый специфичный: статичный сегмент важнее параметра,
параметр важнее сплата. Регистр статичных сегментов и завершающий слэш не учитываются.

## Опции маршрута

| Опция | Назначение |
|---|---|
| `component` | компонент маршрута. Без него отрисовывается `<Outlet />` |
| `validateSearch` | разбирает search-параметры: `(search) => ({ page: Number(search.page ?? 1) })` |
| `beforeLoad` | вызывается при каждой навигации от корня к листу. Возвращённый объект дополняет `context` потомков |
| `loaderDeps` | выбирает search-параметры, от которых зависит `loader` |
| `loader` | загружает данные маршрута, получает `params`, `deps`, `context`, `location`, `abortController` |
| `pendingComponent` | показывается, если загрузка длится дольше `defaultPendingMs` (1000 мс) |
| `errorComponent` | получает `error` и `reset`, отрисовывается при ошибке в `validateSearch`, `beforeLoad` или `loader` |
| `notFoundComponent` | отрисовывается на `throw notFound()`. У корневого маршрута — ещё и для неизвестных адресов |

Из `beforeLoad` и `loader` можно бросить `redirect({ to: '/login' })` или `notFound()`.

Пока новый адрес загружается, на экране остаются прежние маршруты. `loader` уже отрисованного
маршрута при навигации не перезапускается, пока не изменились его параметры пути или `loaderDeps`.
Перезапустить всё принудительно — `router.invalidate()`.

## Навигация

```tsx
<Link to="/notebooks/$notebookId" params={{ notebookId: 42 }} activeProps={{ class: 'active' }}>
    Блокнот
</Link>

const navigate = useNavigate();
navigate({ to: '/notebooks' });
navigate({ to: '..' }); // относительно текущего адреса
navigate({ search: (current) => ({ ...current, page: 2 }) }); // тот же путь, другой search
navigate({ to: '/login', replace: true });
```

- `params` обязательны, если в `to` есть параметры.
- `search` по умолчанию сбрасывается. `search: true` сохраняет текущие параметры.
- Не-строковые значения search хранятся в адресе как JSON, поэтому числа, булевы значения и
  объекты переживают перезагрузку страницы.
- Активная ссылка получает `data-status="active"` и `aria-current="page"`. По умолчанию ссылка
  активна и на вложенных адресах. `activeOptions={{ exact: true }}` требует точного совпадения.

## Хуки

Хуки маршрута типизированы по самому маршруту:

```tsx
const { notebookId } = notebookRoute.useParams();
const notebook = notebookRoute.useLoaderData();
const { page } = notebookRoute.useSearch();
```

Чтобы не импортировать маршрут в файл страницы, есть `getRouteApi('/notebooks/$notebookId')` с
теми же хуками и глобальные `useParams({ from })`, `useSearch({ from })`, `useLoaderData({ from })`,
`useRouteContext({ from })`, `useMatch({ from })`. Без `from` они читают ближайший к компоненту маршрут.

Остальные: `useRouter()`, `useRouterState({ select })`, `useLocation()`, `useNavigate()`, `useMatches()`.

## Отличия от TanStack Router

- Только code-based routing: генерации маршрутов по файлам нет.
- Нет предзагрузки по наведению, восстановления прокрутки, блокировки навигации и `staleTime`.
- `search` в `Link` и `navigate` не типизирован по маршруту — типы даёт `validateSearch` на чтении.
- `notFound()` отрисовывает `notFoundComponent` того маршрута, который его бросил, без всплытия к родителям.
