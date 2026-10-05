import type { ReactElement } from '@maninthecoat/react';

import { createMatchHook } from './hooks';
import type { Search } from './path';
import type { ParsedLocation, RouteMatch } from './router';

/** `id` корневого маршрута. */
export const rootRouteId = '__root__';

type TrimLeft<T extends string> = T extends `/${infer TRest}` ? TrimLeft<TRest> : T;
/** Путь без завершающих слэшей. */
export type TrimRight<T extends string> = T extends `${infer TRest}/` ? TrimRight<TRest> : T;
type JoinPath<
    TBase extends string,
    TPath extends string,
> = `${TrimRight<TBase>}/${TrimLeft<TrimRight<TPath>>}`;

type ParsePathParams<T extends string> = T extends `${infer TLeft}/${infer TRight}`
    ? ParsePathParams<TLeft> | ParsePathParams<TRight>
    : T extends `$${infer TParam}`
      ? TParam extends ''
          ? '_splat'
          : TParam
      : never;

/** Параметры пути, выведенные из шаблона: `/users/$userId` → `{ userId: string }` */
export type PathParams<TPath extends string> = string extends TPath
    ? Record<string, string>
    : { [TParam in ParsePathParams<TPath>]: string };

/** Имена параметров пути из шаблона: `/users/$userId` → `'userId'` */
export type PathParamNames<TPath extends string> = ParsePathParams<TPath>;

type ResolveFullPath<TParent extends AnyRoute, TPath extends string> = TPath extends ''
    ? TParent['types']['fullPath']
    : JoinPath<TParent['types']['fullPath'], TPath>;

type ResolveId<TParent extends AnyRoute, TPath extends string, TId extends string> = JoinPath<
    TParent['types']['id'] extends typeof rootRouteId ? '' : TParent['types']['id'],
    TPath extends '' ? TId : TPath
>;

/** То, что вернул `beforeLoad`, дополняет контекст дочерних маршрутов */
type ResolveContext<TBeforeLoad> = Awaited<TBeforeLoad> extends object ? Awaited<TBeforeLoad> : {};

/** Компонент маршрута: свойств нет, данные маршрута читаются хуками. */
export type RouteComponent = () => ReactElement | null;
/** Компонент ошибки маршрута: получает ошибку и `reset` — перезагрузку маршрутов. */
export type ErrorRouteComponent = (props: {
    error: unknown;
    reset: () => void;
}) => ReactElement | null;

/** Что получает `beforeLoad` маршрута. */
export interface BeforeLoadContext<TParams, TSearch, TContext> {
    params: TParams;
    search: TSearch;
    context: TContext;
    location: ParsedLocation;
    abortController: AbortController;
}

/** Что получает `loader` маршрута. */
export interface LoaderContext<TParams, TDeps, TContext> {
    params: TParams;
    deps: TDeps;
    context: TContext;
    location: ParsedLocation;
    abortController: AbortController;
}

interface BaseRouteOptions<
    TParams,
    TParentSearch,
    TParentContext,
    TOwnSearch,
    TBeforeLoad,
    TDeps,
    TLoaderResult,
> {
    component?: RouteComponent;
    /** Показывается, если загрузка маршрута длится дольше `defaultPendingMs` */
    pendingComponent?: RouteComponent;
    errorComponent?: ErrorRouteComponent;
    notFoundComponent?: RouteComponent;
    /** Разбирает search-параметры адреса. Исключение отрисует `errorComponent` */
    validateSearch?: (search: Search) => TOwnSearch;
    /** Вызывается при каждой навигации от корня к листу. Подходит для проверок доступа */
    beforeLoad?: (
        context: BeforeLoadContext<TParams, TParentSearch & TOwnSearch, TParentContext>,
    ) => TBeforeLoad;
    /** Выбирает search-параметры, от которых зависит `loader`: при их смене он перезапустится */
    loaderDeps?: (context: { search: TParentSearch & TOwnSearch }) => TDeps;
    loader?: (
        context: LoaderContext<TParams, TDeps, TParentContext & ResolveContext<TBeforeLoad>>,
    ) => TLoaderResult;
}

/** Настройки маршрута для {@link createRoute}. */
export interface RouteOptions<
    TParent extends AnyRoute,
    TPath extends string,
    TId extends string,
    TOwnSearch,
    TBeforeLoad,
    TDeps,
    TLoaderResult,
> extends BaseRouteOptions<
    PathParams<ResolveFullPath<TParent, TPath>>,
    TParent['types']['search'],
    TParent['types']['context'],
    TOwnSearch,
    TBeforeLoad,
    TDeps,
    TLoaderResult
> {
    getParentRoute: () => TParent;
    /** Сегмент пути: `users`, `$userId`, `$` (сплат) или `/` для индексного маршрута */
    path?: TPath;
    /** Идентификатор маршрута-обёртки без собственного сегмента пути */
    id?: TId;
}

/** Настройки корневого маршрута: родителя, пути и `id` у него нет. */
export type RootRouteOptions<TRouterContext, TOwnSearch, TBeforeLoad, TDeps, TLoaderResult> =
    BaseRouteOptions<{}, {}, TRouterContext, TOwnSearch, TBeforeLoad, TDeps, TLoaderResult>;

type AnyRouteOptions = BaseRouteOptions<any, any, any, any, any, any, any> & {
    getParentRoute?: () => AnyRoute;
    path?: string;
    id?: string;
};

interface RouteTypes<TFullPath extends string, TId, TSearch, TContext, TLoaderData, TChildren> {
    fullPath: TFullPath;
    id: TId;
    params: PathParams<TFullPath>;
    search: TSearch;
    context: TContext;
    loaderData: TLoaderData;
    children: TChildren;
}

/** Маршрут с любыми типами. */
export type AnyRoute = Route<any, any, any, any, any, any>;

/**
 * Маршрут: настройки, место в дереве и хуки его данных.
 * Создаётся через {@link createRoute} и {@link createRootRoute}.
 */
export class Route<
    TFullPath extends string = string,
    TId extends string = string,
    TSearch = Search,
    TContext = {},
    TLoaderData = unknown,
    TChildren = unknown,
> {
    /** Существует только на уровне типов */
    declare readonly types: RouteTypes<TFullPath, TId, TSearch, TContext, TLoaderData, TChildren>;

    readonly options: AnyRouteOptions;
    readonly isRoot: boolean;
    id = '' as TId;
    fullPath = '' as TFullPath;
    parentRoute: AnyRoute | undefined;
    children: AnyRoute[] = [];

    constructor(options: AnyRouteOptions, isRoot = false) {
        this.options = options;
        this.isRoot = isRoot;
    }

    get isIndex(): boolean {
        return this.options.path === '/';
    }

    addChildren<const TNewChildren extends readonly AnyRoute[]>(
        children: TNewChildren,
    ): Route<TFullPath, TId, TSearch, TContext, TLoaderData, TNewChildren> {
        this.children = [...children];
        return this as Route<TFullPath, TId, TSearch, TContext, TLoaderData, any>;
    }

    /**
     * Вычисляет `id` и `fullPath` по родителю. Вызывается роутером при обходе дерева.
     * @param {AnyRoute | undefined} parent родительский маршрут; `undefined` — у корня
     */
    init(parent: AnyRoute | undefined): void {
        this.parentRoute = parent;

        if (!parent) {
            this.id = rootRouteId as TId;
            this.fullPath = '/' as TFullPath;
            return;
        }

        const { path, id } = this.options;
        const ownId = path || id;
        if (!ownId) throw new Error('Маршруту нужен `path` или `id`');

        this.id = joinRoutePath(parent.isRoot ? '' : parent.id, ownId) as TId;
        this.fullPath = (
            path ? joinRoutePath(parent.fullPath, path) : parent.fullPath
        ) as TFullPath;
    }

    useMatch: () => RouteMatch<PathParams<TFullPath>, TSearch, TContext, TLoaderData> =
        createMatchHook(this, (match) => match);
    useParams: () => PathParams<TFullPath> = createMatchHook(this, (match) => match.params);
    useSearch: () => TSearch = createMatchHook(this, (match) => match.search);
    useLoaderData: () => TLoaderData = createMatchHook(this, (match) => match.loaderData);
    useRouteContext: () => TContext = createMatchHook(this, (match) => match.context);
}

/**
 * Создаёт маршрут.
 * @param {RouteOptions} options родитель, `path` или `id`, компоненты, `beforeLoad` и `loader`
 * @returns {Route} маршрут
 */
export function createRoute<
    TParent extends AnyRoute,
    TPath extends string = '',
    TId extends string = '',
    TOwnSearch = {},
    TBeforeLoad = void,
    TDeps = undefined,
    TLoaderResult = undefined,
>(
    options: RouteOptions<TParent, TPath, TId, TOwnSearch, TBeforeLoad, TDeps, TLoaderResult>,
): Route<
    ResolveFullPath<TParent, TPath>,
    ResolveId<TParent, TPath, TId>,
    TParent['types']['search'] & TOwnSearch,
    TParent['types']['context'] & ResolveContext<TBeforeLoad>,
    Awaited<TLoaderResult>
> {
    return new Route(options);
}

/**
 * Создаёт корневой маршрут.
 * @param {RootRouteOptions} [options] компоненты, `beforeLoad` и `loader`
 * @returns {Route} корневой маршрут
 */
export function createRootRoute<
    TOwnSearch = {},
    TBeforeLoad = void,
    TDeps = undefined,
    TLoaderResult = undefined,
>(
    options: RootRouteOptions<{}, TOwnSearch, TBeforeLoad, TDeps, TLoaderResult> = {},
): Route<'/', typeof rootRouteId, TOwnSearch, ResolveContext<TBeforeLoad>, Awaited<TLoaderResult>> {
    return new Route(options, true);
}

/**
 * Корневой маршрут с типизированным контекстом роутера: `createRootRouteWithContext<Ctx>()({...})`
 * @returns {Function} функция, которая создаёт корневой маршрут из его настроек
 */
export function createRootRouteWithContext<TRouterContext extends object>() {
    return <TOwnSearch = {}, TBeforeLoad = void, TDeps = undefined, TLoaderResult = undefined>(
        options: RootRouteOptions<
            TRouterContext,
            TOwnSearch,
            TBeforeLoad,
            TDeps,
            TLoaderResult
        > = {},
    ): Route<
        '/',
        typeof rootRouteId,
        TOwnSearch,
        TRouterContext & ResolveContext<TBeforeLoad>,
        Awaited<TLoaderResult>
    > => new Route(options, true);
}

function joinRoutePath(base: string, path: string): string {
    return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+|\/+$/g, '')}`;
}
