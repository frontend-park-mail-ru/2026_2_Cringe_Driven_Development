import { createBrowserHistory, type HistoryLocation, type RouterHistory } from './history';
import {
    comparePatterns,
    interpolatePath,
    joinPaths,
    matchPath,
    parseSearch,
    resolvePath,
    stringifySearch,
    type Params,
    type ParamValues,
    type Search,
} from './path';
import type {
    AnyRoute,
    ErrorRouteComponent,
    PathParamNames,
    RouteComponent,
    TrimRight,
} from './route';

export interface ParsedLocation {
    /** Полный адрес вместе с `basepath` — то, что попадает в адресную строку */
    href: string;
    /** Путь без `basepath` и завершающего слэша */
    pathname: string;
    search: Search;
    searchStr: string;
    /** Без ведущего `#` */
    hash: string;
    state: unknown;
}

export type MatchStatus = 'pending' | 'success' | 'error' | 'notFound';

export interface RouteMatch<TParams = any, TSearch = any, TContext = any, TLoaderData = any> {
    id: string;
    routeId: string;
    pathname: string;
    params: TParams;
    search: TSearch;
    context: TContext;
    loaderDeps: unknown;
    loaderData: TLoaderData;
    status: MatchStatus;
    error: unknown;
    /** Адресу не подошёл ни один маршрут: выставляется у совпадения корневого маршрута */
    globalNotFound: boolean;
}

export interface RouterState {
    status: 'pending' | 'idle';
    /** Адрес, на который идёт навигация. Обновляется сразу, до загрузки маршрутов */
    location: ParsedLocation;
    /** Адрес, маршруты которого уже загружены и отрисованы */
    resolvedLocation: ParsedLocation | undefined;
    matches: RouteMatch[];
}

/**
 * Регистрация роутера для вывода типов путей и параметров:
 *
 *     declare module './router' {
 *         interface Register { router: typeof router }
 *     }
 */
export interface Register {}

export type AnyRouter = Router<AnyRoute>;
export type RegisteredRouter = Register extends { router: infer TRouter } ? TRouter : AnyRouter;

type RegisteredRouteTree =
    RegisteredRouter extends Router<infer TRouteTree> ? TRouteTree : AnyRoute;

type IsAny<T> = 0 extends 1 & T ? true : false;

type FlattenRoutes<TRoute> = TRoute extends AnyRoute
    ?
          | TRoute
          | (IsAny<TRoute['types']['children']> extends true
                ? never
                : TRoute['types']['children'] extends readonly (infer TChild)[]
                  ? FlattenRoutes<TChild>
                  : never)
    : never;

type ToPath<TFullPath extends string> = TFullPath extends '/' ? '/' : TrimRight<TFullPath>;

export type RegisteredRoutes = FlattenRoutes<RegisteredRouteTree>;
export type RouteIds = RegisteredRoutes['types']['id'];
export type RouteById<TId> = Extract<RegisteredRoutes, { types: { id: TId } }>;

/** Все абсолютные пути зарегистрированного роутера. Без регистрации — любая строка */
export type RoutePaths =
    IsAny<RegisteredRoutes['types']['fullPath']> extends true
        ? string
        : ToPath<RegisteredRoutes['types']['fullPath']>;

export type RelativePath = '.' | '..' | `./${string}` | `../${string}`;
export type NavigateTo = RoutePaths | RelativePath;

type ParamsOption<TTo extends string> = [PathParamNames<TTo>] extends [never]
    ? { params?: true | ParamValues | ((current: Params) => ParamValues) }
    : {
          params:
              | Record<PathParamNames<TTo>, string | number>
              | ((current: Params) => Record<PathParamNames<TTo>, string | number>);
      };

export type NavigateOptions<TTo extends string = string> = {
    /** Шаблон пути: абсолютный (`/users/$userId`) или относительный (`..`). По умолчанию — текущий адрес */
    to?: TTo;
    /** `true` сохраняет текущие search-параметры, функция получает их на вход */
    search?: true | Search | ((current: Search) => Search);
    hash?: string;
    state?: unknown;
    replace?: boolean;
} & ParamsOption<TTo>;

const REDIRECT = Symbol('redirect');
const NOT_FOUND = Symbol('notFound');

export interface Redirect {
    [REDIRECT]: true;
    options: NavigateOptions;
}

export interface NotFoundError {
    [NOT_FOUND]: true;
    data: unknown;
}

/** Бросается из `beforeLoad` или `loader`, чтобы перенаправить на другой адрес */
export function redirect<TTo extends NavigateTo = '.'>(options: NavigateOptions<TTo>): Redirect {
    return { [REDIRECT]: true, options: options as NavigateOptions };
}

/** Бросается из `beforeLoad` или `loader`, чтобы отрисовать `notFoundComponent` маршрута */
export function notFound(options: { data?: unknown } = {}): NotFoundError {
    return { [NOT_FOUND]: true, data: options.data };
}

export function isRedirect(value: unknown): value is Redirect {
    return typeof value === 'object' && value !== null && REDIRECT in value;
}

export function isNotFound(value: unknown): value is NotFoundError {
    return typeof value === 'object' && value !== null && NOT_FOUND in value;
}

export interface RouterOptions<TRouteTree extends AnyRoute> {
    routeTree: TRouteTree;
    /** По умолчанию — история браузера */
    history?: RouterHistory;
    /** Префикс всех адресов приложения, например `/app` */
    basepath?: string;
    /** Начальный контекст, доступный в `beforeLoad` и `loader` всех маршрутов */
    context?: object;
    defaultPendingComponent?: RouteComponent;
    defaultErrorComponent?: ErrorRouteComponent;
    defaultNotFoundComponent?: RouteComponent;
    /** Сколько ждать загрузку, прежде чем показать `pendingComponent`. По умолчанию 1000 мс */
    defaultPendingMs?: number;
}

const DEFAULT_PENDING_MS = 1000;

export class Router<TRouteTree extends AnyRoute = AnyRoute> {
    readonly options: RouterOptions<TRouteTree>;
    readonly routeTree: TRouteTree;
    readonly history: RouterHistory;
    readonly basepath: string;
    readonly routesById: Record<string, AnyRoute> = {};
    state: RouterState;

    /** Маршруты с собственным путём, от более специфичных к менее специфичным */
    private readonly flatRoutes: AnyRoute[] = [];
    private readonly listeners = new Set<() => void>();
    private abortController: AbortController | undefined;
    private loadId = 0;

    constructor(options: RouterOptions<TRouteTree>) {
        this.options = options;
        this.routeTree = options.routeTree;
        this.history = options.history ?? createBrowserHistory();
        this.basepath = joinPaths(options.basepath ?? '').replace(/^\/$/, '');

        this.registerRoute(this.routeTree, undefined);
        this.flatRoutes.sort(
            (a, b) =>
                comparePatterns(a.fullPath, b.fullPath) || Number(b.isIndex) - Number(a.isIndex),
        );

        this.state = {
            status: 'pending',
            location: this.parseLocation(this.history.location),
            resolvedLocation: undefined,
            matches: [],
        };
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /** Начинает следить за историей и загружает маршруты текущего адреса */
    mount = (): (() => void) => {
        const unsubscribe = this.history.subscribe(() => void this.load());
        void this.load();
        return unsubscribe;
    };

    navigate = <TTo extends NavigateTo = '.'>(options: NavigateOptions<TTo>): Promise<void> =>
        this.commitLocation(options as NavigateOptions);

    /** То же, что `navigate`, но без проверки пути по зарегистрированным маршрутам */
    commitLocation(options: NavigateOptions): Promise<void> {
        const next = this.buildLocation(options);
        const replace = options.replace ?? next.href === this.state.location.href;

        if (replace) this.history.replace(next.href, options.state);
        else this.history.push(next.href, options.state);

        return this.load();
    }

    /** Перезапускает `beforeLoad` и `loader` всех маршрутов текущего адреса */
    invalidate = (): Promise<void> => this.load({ invalidate: true });

    buildLocation(options: NavigateOptions): ParsedLocation {
        const current = this.state.location;
        const currentParams: Params = this.state.matches.at(-1)?.params ?? {};
        const { to = '.', params, search, hash = '' } = options;

        const givenParams = typeof params === 'function' ? params(currentParams) : params;
        const nextParams =
            givenParams === true || givenParams === undefined
                ? currentParams
                : { ...currentParams, ...givenParams };
        const pathname = resolvePath(current.pathname, interpolatePath(to, nextParams));

        const nextSearch =
            search === true
                ? current.search
                : typeof search === 'function'
                  ? search(current.search)
                  : (search ?? {});
        const searchStr = stringifySearch(nextSearch);

        return {
            href: `${joinPaths(this.basepath, pathname)}${searchStr}${hash && `#${hash}`}`,
            pathname,
            search: nextSearch,
            searchStr,
            hash,
            state: options.state,
        };
    }

    async load(options: { invalidate?: boolean } = {}): Promise<void> {
        this.loadId += 1;
        const loadId = this.loadId;
        const isStale = () => loadId !== this.loadId;

        this.abortController?.abort();
        const abortController = new AbortController();
        this.abortController = abortController;

        const location = this.parseLocation(this.history.location);
        let matches = this.matchRoutes(location, !options.invalidate);
        let isPendingVisible = false;

        const patchMatch = (id: string, patch: Partial<RouteMatch>) => {
            matches = matches.map((match) => (match.id === id ? { ...match, ...patch } : match));
            if (isPendingVisible) this.setState({ matches });
        };

        // Пока идёт загрузка, на экране остаются прежние маршруты. Если она затянулась —
        // показываем новые вместе с их `pendingComponent`
        const pendingTimer = setTimeout(() => {
            isPendingVisible = true;
            this.setState({ matches });
        }, this.options.defaultPendingMs ?? DEFAULT_PENDING_MS);

        this.setState({ status: 'pending', location });

        try {
            let context = this.options.context ?? {};

            for (const [index, match] of matches.entries()) {
                try {
                    if (match.status === 'error') throw match.error;

                    const extraContext = await this.routesById[match.routeId]!.options.beforeLoad?.(
                        {
                            params: match.params,
                            search: match.search,
                            context,
                            location,
                            abortController,
                        },
                    );
                    if (isStale()) return;

                    context = { ...context, ...extraContext };
                    patchMatch(match.id, { context });
                } catch (error) {
                    if (isStale()) return;
                    if (isRedirect(error)) return await this.followRedirect(error);

                    // Маршруты глубже упавшего не отрисуются, загружать их незачем
                    matches = matches.slice(0, index + 1);
                    patchMatch(match.id, toFailure(error));
                    break;
                }
            }

            const redirects: Redirect[] = [];

            await Promise.all(
                matches.map(async (match) => {
                    if (match.status !== 'pending') return;

                    try {
                        const loaderData = await this.routesById[match.routeId]!.options.loader?.({
                            params: match.params,
                            deps: match.loaderDeps,
                            context: match.context,
                            location,
                            abortController,
                        });
                        if (!isStale()) patchMatch(match.id, { status: 'success', loaderData });
                    } catch (error) {
                        if (isStale()) return;
                        if (isRedirect(error)) redirects.push(error);
                        else patchMatch(match.id, toFailure(error));
                    }
                }),
            );
            if (isStale()) return;
            if (redirects[0]) return await this.followRedirect(redirects[0]);

            this.setState({ status: 'idle', resolvedLocation: location, matches });
        } finally {
            clearTimeout(pendingTimer);
        }
    }

    private followRedirect(thrown: Redirect): Promise<void> {
        return this.commitLocation({ replace: true, ...thrown.options });
    }

    private setState(patch: Partial<RouterState>): void {
        this.state = { ...this.state, ...patch };
        this.listeners.forEach((listener) => listener());
    }

    private registerRoute(route: AnyRoute, parent: AnyRoute | undefined): void {
        route.init(parent);

        if (this.routesById[route.id]) throw new Error(`Маршрут "${route.id}" объявлен дважды`);
        this.routesById[route.id] = route;

        if (route.options.path) this.flatRoutes.push(route);
        route.children.forEach((child) => this.registerRoute(child, route));
    }

    private parseLocation({ pathname, search, hash, state }: HistoryLocation): ParsedLocation {
        const hasBasepath = pathname === this.basepath || pathname.startsWith(`${this.basepath}/`);

        return {
            href: `${pathname}${search}${hash}`,
            pathname: joinPaths(hasBasepath ? pathname.slice(this.basepath.length) : pathname),
            search: parseSearch(search),
            searchStr: search,
            hash: hash.replace(/^#/, ''),
            state,
        };
    }

    /** Строит цепочку совпадений от корня до маршрута, подошедшего адресу */
    private matchRoutes(location: ParsedLocation, reuseLoaded: boolean): RouteMatch[] {
        let leaf: AnyRoute | undefined;
        let params: Params = {};

        for (const route of this.flatRoutes) {
            const matchedParams = matchPath(route.fullPath, location.pathname);
            if (matchedParams) {
                leaf = route;
                params = matchedParams;
                break;
            }
        }

        const branch: AnyRoute[] = [];
        let ancestor: AnyRoute | undefined = leaf ?? this.routeTree;
        while (ancestor) {
            branch.unshift(ancestor);
            ancestor = ancestor.parentRoute;
        }

        let search = location.search;

        return branch.map((route) => {
            let loaderDeps: unknown;
            let error: unknown;
            let hasSearchError = false;

            try {
                search = { ...search, ...route.options.validateSearch?.(search) };
                loaderDeps = route.options.loaderDeps?.({ search });
            } catch (searchError) {
                error = searchError;
                hasSearchError = true;
            }

            const pathname = interpolatePath(route.fullPath, params);
            const id = `${route.id}|${pathname}|${JSON.stringify(loaderDeps) ?? ''}`;
            // Уже загруженное совпадение не перезагружаем: его данные остаются на экране
            const loaded = reuseLoaded
                ? this.state.matches.find((match) => match.id === id && match.status === 'success')
                : undefined;

            return {
                id,
                routeId: route.id,
                pathname,
                params,
                search,
                context: {},
                loaderDeps,
                loaderData: loaded?.loaderData,
                status: hasSearchError ? 'error' : loaded ? 'success' : 'pending',
                error,
                globalNotFound: !leaf,
            };
        });
    }
}

export function createRouter<TRouteTree extends AnyRoute>(
    options: RouterOptions<TRouteTree>,
): Router<TRouteTree> {
    return new Router(options);
}

function toFailure(error: unknown): Partial<RouteMatch> {
    return { status: isNotFound(error) ? 'notFound' : 'error', error };
}
