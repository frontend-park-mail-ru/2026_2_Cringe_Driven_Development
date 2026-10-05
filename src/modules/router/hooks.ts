import { useContext, useLayoutEffect, useState } from '@maninthecoat/react';

import { MatchContext, RouterContext } from './context';
import type { AnyRoute } from './route';
import type {
    ParsedLocation,
    RegisteredRouter,
    RouteById,
    RouteIds,
    RouteMatch,
    RouterState,
} from './router';

type RouteTypes<TId> = RouteById<TId>['types'];
type MatchOf<TRoute extends AnyRoute> = RouteMatch<
    TRoute['types']['params'],
    TRoute['types']['search'],
    TRoute['types']['context'],
    TRoute['types']['loaderData']
>;

/** `from` — `id` маршрута, чьи данные нужны. Без него берётся ближайший к компоненту маршрут */
interface FromOptions<TFrom> {
    from: TFrom;
}

/**
 * Роутер из ближайшего `<RouterProvider>`.
 * @returns {RegisteredRouter} роутер
 */
export function useRouter(): RegisteredRouter {
    const router = useContext(RouterContext);
    if (!router) throw new Error('Хуки роутера работают только внутри <RouterProvider>');

    return router as RegisteredRouter;
}

/**
 * Состояние роутера. С `select` — его часть: компонент перерисовывается, только когда она меняется.
 * @returns {RouterState} состояние роутера
 */
export function useRouterState(): RouterState;
export function useRouterState<TSelected>(options: {
    select: (state: RouterState) => TSelected;
}): TSelected;
export function useRouterState(options?: { select: (state: RouterState) => unknown }): unknown {
    const router = useRouter();
    const [, setVersion] = useState(0);
    const select = options?.select ?? selectState;
    const state = router.state;
    const selected = select(state);

    // Перерисовываемся, только если изменилось выбранное значение, а не состояние целиком
    useLayoutEffect(
        () =>
            router.subscribe(() => {
                if (Object.is(select(router.state), selected)) return;
                setVersion((version) => version + 1);
            }),
        [router, select, selected],
    );
    // Состояние могло смениться между рендером и подпиской — тогда перерисовываемся
    useLayoutEffect(() => {
        if (router.state !== state) setVersion((version) => version + 1);
    }, [router, state]);

    return selected;
}

// Селекторы объявлены на уровне модуля: стрелочная функция в теле хука менялась бы на каждом
// рендере и заставляла бы эффект в useRouterState переподписываться
function selectState(state: RouterState): RouterState {
    return state;
}

function selectLocation(state: RouterState): ParsedLocation {
    return state.location;
}

function selectMatches(state: RouterState): RouteMatch[] {
    return state.matches;
}

/**
 * Текущий адрес.
 * @returns {ParsedLocation} адрес, на который идёт навигация
 */
export function useLocation(): ParsedLocation {
    return useRouterState({ select: selectLocation });
}

/**
 * Функция перехода на другой адрес.
 * @returns {RegisteredRouter['navigate']} `navigate` роутера
 */
export function useNavigate(): RegisteredRouter['navigate'] {
    return useRouter().navigate;
}

/**
 * Совпадения маршрутов текущего адреса.
 * @returns {RouteMatch[]} совпадения от корня к листу
 */
export function useMatches(): RouteMatch[] {
    return useRouterState({ select: selectMatches });
}

/**
 * Совпадение маршрута `from`, а без него — ближайшего к компоненту.
 * @param {string} [from] `id` маршрута
 * @returns {RouteMatch} совпадение маршрута
 */
export function useRouteMatch(from?: string): RouteMatch {
    const nearestRouteId = useContext(MatchContext);
    const routeId = from ?? nearestRouteId;
    const match = useMatches().find((candidate) => candidate.routeId === routeId);
    if (!match) throw new Error(`Маршрут "${routeId}" сейчас не отрисован`);

    return match;
}

/**
 * Совпадение маршрута: параметры, данные и состояние загрузки.
 * @param {FromOptions<TFrom>} options `from` — `id` маршрута; без него берётся ближайший к
 *     компоненту
 * @returns {RouteMatch} совпадение маршрута
 */
export function useMatch<TFrom extends RouteIds>(
    options: FromOptions<TFrom>,
): MatchOf<RouteById<TFrom>>;
export function useMatch(): RouteMatch;
export function useMatch(options?: FromOptions<string>): RouteMatch {
    return useRouteMatch(options?.from);
}

/**
 * Параметры пути маршрута.
 * @param {FromOptions<TFrom>} options `from` — `id` маршрута; без него берётся ближайший к
 *     компоненту
 * @returns {Record<string, string>} параметры пути
 */
export function useParams<TFrom extends RouteIds>(
    options: FromOptions<TFrom>,
): RouteTypes<TFrom>['params'];
export function useParams(): Record<string, string>;
export function useParams(options?: FromOptions<string>): unknown {
    return useRouteMatch(options?.from).params;
}

/**
 * Search-параметры маршрута, разобранные его `validateSearch`.
 * @param {FromOptions<TFrom>} options `from` — `id` маршрута; без него берётся ближайший к
 *     компоненту
 * @returns {Record<string, unknown>} search-параметры
 */
export function useSearch<TFrom extends RouteIds>(
    options: FromOptions<TFrom>,
): RouteTypes<TFrom>['search'];
export function useSearch(): Record<string, unknown>;
export function useSearch(options?: FromOptions<string>): unknown {
    return useRouteMatch(options?.from).search;
}

/**
 * Данные, которые вернул `loader` маршрута.
 * @param {FromOptions<TFrom>} options `from` — `id` маршрута; без него берётся ближайший к
 *     компоненту
 * @returns {unknown} данные маршрута
 */
export function useLoaderData<TFrom extends RouteIds>(
    options: FromOptions<TFrom>,
): RouteTypes<TFrom>['loaderData'];
export function useLoaderData(): unknown;
export function useLoaderData(options?: FromOptions<string>): unknown {
    return useRouteMatch(options?.from).loaderData;
}

/**
 * Контекст маршрута: контекст роутера и то, что вернули `beforeLoad` маршрута и его предков.
 * @param {FromOptions<TFrom>} options `from` — `id` маршрута; без него берётся ближайший к
 *     компоненту
 * @returns {unknown} контекст маршрута
 */
export function useRouteContext<TFrom extends RouteIds>(
    options: FromOptions<TFrom>,
): RouteTypes<TFrom>['context'];
export function useRouteContext(): unknown;
export function useRouteContext(options?: FromOptions<string>): unknown {
    return useRouteMatch(options?.from).context;
}

/**
 * Собирает хук, читающий данные совпадения маршрута. `id` читается лениво: роутер задаёт его позже.
 * @param {{ id: string }} route маршрут или объект с его `id`
 * @param {(match: RouteMatch) => TSelected} select что взять из совпадения
 * @returns {()} хук
 */
export function createMatchHook<TSelected>(
    route: { id: string },
    select: (match: RouteMatch) => TSelected,
): () => TSelected {
    return function useRouteData() {
        return select(useRouteMatch(route.id));
    };
}

/**
 * Типизированные хуки маршрута по его `id` — без импорта самого маршрута.
 * @param {TId} id `id` маршрута
 * @returns {object} хуки `useMatch`, `useParams`, `useSearch`, `useLoaderData` и `useRouteContext`
 */
export function getRouteApi<TId extends RouteIds>(id: TId) {
    const route = { id: id as string };

    return {
        useMatch: createMatchHook<MatchOf<RouteById<TId>>>(route, (match) => match),
        useParams: createMatchHook<RouteTypes<TId>['params']>(route, (match) => match.params),
        useSearch: createMatchHook<RouteTypes<TId>['search']>(route, (match) => match.search),
        useLoaderData: createMatchHook<RouteTypes<TId>['loaderData']>(
            route,
            (match) => match.loaderData,
        ),
        useRouteContext: createMatchHook<RouteTypes<TId>['context']>(
            route,
            (match) => match.context,
        ),
    };
}
