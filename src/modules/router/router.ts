import { createBrowserHistory, type HistoryLocation, type RouterHistory } from './history';
import {
    comparePatterns,
    interpolatePath,
    joinPaths,
    matchPath,
    normalizePath,
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

/** Адрес, разобранный роутером. */
export interface ParsedLocation {
    /** Полный адрес вместе с `basepath`, собранный из остальных полей */
    href: string;
    /**
     * Путь без `basepath` и завершающего слэша. Приведён к единому виду: регистр статичных
     * сегментов — как в шаблоне маршрута, параметры закодированы через `encodeURIComponent`
     */
    pathname: string;
    search: Search;
    searchStr: string;
    /** Без ведущего `#` */
    hash: string;
    state: unknown;
}

/** Состояние загрузки совпадения маршрута. */
export type MatchStatus = 'pending' | 'success' | 'error' | 'notFound';

/** Совпадение маршрута с адресом: параметры, данные и состояние загрузки. */
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

/** Состояние роутера: адрес и совпадения маршрутов. */
export interface RouterState {
    status: 'pending' | 'idle';
    /** Адрес, на который идёт навигация. Обновляется сразу, до загрузки маршрутов */
    location: ParsedLocation;
    /** Адрес, маршруты которого уже загружены и отрисованы */
    resolvedLocation: ParsedLocation | undefined;
    matches: RouteMatch[];
}

/**
 * Регистрация роутера для вывода типов путей и параметров. Блок лежит в `src/router.ts`
 * рядом с `createRouter`:
 *
 *     declare module './modules/router' {
 *         interface Register { router: typeof router }
 *     }
 */
export interface Register {}

/** Роутер с любым деревом маршрутов. */
export type AnyRouter = Router<AnyRoute>;
/** Роутер, зарегистрированный через {@link Register}; без регистрации — любой. */
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

/** Все маршруты зарегистрированного роутера. */
export type RegisteredRoutes = FlattenRoutes<RegisteredRouteTree>;
/** `id` всех маршрутов зарегистрированного роутера. */
export type RouteIds = RegisteredRoutes['types']['id'];
/** Маршрут зарегистрированного роутера по его `id`. */
export type RouteById<TId> = Extract<RegisteredRoutes, { types: { id: TId } }>;

/** Все абсолютные пути зарегистрированного роутера. Без регистрации — любая строка */
export type RoutePaths =
    IsAny<RegisteredRoutes['types']['fullPath']> extends true
        ? string
        : ToPath<RegisteredRoutes['types']['fullPath']>;

/** Относительный путь: `.`, `..` и пути от них. */
export type RelativePath = '.' | '..' | `./${string}` | `../${string}`;
/** Куда можно перейти: путь зарегистрированного маршрута или относительный путь. */
export type NavigateTo = RoutePaths | RelativePath;

type ParamsOption<TTo extends string> = [PathParamNames<TTo>] extends [never]
    ? { params?: true | ParamValues | ((current: Params) => ParamValues) }
    : {
          params:
              | Record<PathParamNames<TTo>, string | number>
              | ((current: Params) => Record<PathParamNames<TTo>, string | number>);
      };

/** Адрес перехода: путь, параметры, search, hash и состояние записи истории. */
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

/** Перенаправление: его создаёт {@link redirect}. */
export interface Redirect {
    [REDIRECT]: true;
    options: NavigateOptions;
}

/** Признак «не найдено»: его создаёт {@link notFound}. */
export interface NotFoundError {
    [NOT_FOUND]: true;
    data: unknown;
}

/**
 * Бросается из `beforeLoad` или `loader`, чтобы перенаправить на другой адрес.
 * @param {NavigateOptions<TTo>} options куда перенаправить
 * @returns {Redirect} объект для `throw`
 */
export function redirect<TTo extends NavigateTo = '.'>(options: NavigateOptions<TTo>): Redirect {
    return { [REDIRECT]: true, options: options as NavigateOptions };
}

/**
 * Бросается из `beforeLoad` или `loader`, чтобы отрисовать `notFoundComponent` маршрута.
 * @param {{ data?: unknown }} [options] `data` — данные для страницы «не найдено»
 * @returns {NotFoundError} объект для `throw`
 */
export function notFound(options: { data?: unknown } = {}): NotFoundError {
    return { [NOT_FOUND]: true, data: options.data };
}

/**
 * Проверяет, что поймано перенаправление.
 * @param {unknown} value пойманное значение
 * @returns {boolean} true, если это {@link Redirect}
 */
export function isRedirect(value: unknown): value is Redirect {
    return typeof value === 'object' && value !== null && REDIRECT in value;
}

/**
 * Проверяет, что поймано «не найдено».
 * @param {unknown} value пойманное значение
 * @returns {boolean} true, если это {@link NotFoundError}
 */
export function isNotFound(value: unknown): value is NotFoundError {
    return typeof value === 'object' && value !== null && NOT_FOUND in value;
}

/** Настройки роутера для {@link createRouter}. */
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
const MAX_REDIRECTS = 10;

interface LeafMatch {
    /** `undefined`, если адресу не подошёл ни один маршрут */
    route: AnyRoute | undefined;
    params: Params;
    pathname: string;
}

interface RedirectTarget {
    location: ParsedLocation;
    replace: boolean;
}

/**
 * Роутер: сопоставляет адрес с деревом маршрутов, загружает их и хранит состояние.
 * Создаётся через {@link createRouter}.
 */
export class Router<TRouteTree extends AnyRoute = AnyRoute> {
    readonly options: RouterOptions<TRouteTree>;
    readonly routeTree: TRouteTree;
    readonly history: RouterHistory;
    readonly basepath: string;
    readonly routesById: Record<string, AnyRoute> = {};
    state: RouterState;

    /** Корень и маршруты с собственным путём, от более специфичных к менее специфичным */
    private readonly flatRoutes: AnyRoute[] = [];
    /** Маршрут и параметры пути адреса `state.location`. Обновляется вместе с ним */
    private leaf: LeafMatch;
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

        const { location, leaf } = this.parseLocation(this.history.location);
        this.leaf = leaf;
        this.state = {
            status: 'pending',
            location,
            resolvedLocation: undefined,
            matches: [],
        };
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /**
     * Начинает следить за историей и загружает маршруты текущего адреса.
     * @returns {() => void} функция, которая прекращает слежение за историей
     */
    mount = (): (() => void) => {
        const unsubscribe = this.history.subscribe(() => void this.load());
        void this.load();
        return unsubscribe;
    };

    navigate = <TTo extends NavigateTo = '.'>(options: NavigateOptions<TTo>): Promise<void> =>
        this.commitLocation(options as NavigateOptions);

    /**
     * То же, что `navigate`, но без проверки пути по зарегистрированным маршрутам.
     * @param {NavigateOptions} options адрес перехода
     * @returns {Promise<void>} промис: выполнится, когда маршруты нового адреса загрузятся
     */
    commitLocation(options: NavigateOptions): Promise<void> {
        const next = this.buildLocation(options);
        return this.commit(next, options.replace ?? next.href === this.state.location.href);
    }

    /**
     * Перезапускает `beforeLoad` и `loader` всех маршрутов текущего адреса. Уже загруженные
     * маршруты остаются на экране с прежними данными, пока не придут новые.
     * @returns {Promise<void>} промис: выполнится, когда маршруты загрузятся заново
     */
    invalidate = (): Promise<void> => this.load({ invalidate: true });

    buildLocation(options: NavigateOptions): ParsedLocation {
        // Путь и параметры берём от одного и того же адреса: `state.matches` во время загрузки
        // ещё описывает предыдущую страницу
        const current = this.state.location;
        const currentParams = this.leaf.params;
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

        return this.createLocation(pathname, nextSearch, hash, options.state);
    }

    async load(options: { invalidate?: boolean; redirectCount?: number } = {}): Promise<void> {
        const { invalidate = false, redirectCount = 0 } = options;

        this.loadId += 1;
        const loadId = this.loadId;
        const isStale = () => loadId !== this.loadId;

        this.abortController?.abort();
        const abortController = new AbortController();
        this.abortController = abortController;

        const { location, leaf } = this.parseLocation(this.history.location);
        let matches = this.matchRoutes(location, leaf);
        let isPendingVisible = false;

        // При инвалидации перезагружаем и те маршруты, чьи данные уже на экране
        const loadIds = new Set(
            matches
                .filter((match) => invalidate || match.status === 'pending')
                .map((match) => match.id),
        );

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

        this.leaf = leaf;
        this.setState({ status: 'pending', location });

        try {
            let context = this.options.context ?? {};

            for (const [index, match] of matches.entries()) {
                const route = this.routesById[match.routeId]!;

                try {
                    if (match.status === 'error') throw match.error;

                    const extraContext = await route.options.beforeLoad?.({
                        params: match.params,
                        search: match.search,
                        context,
                        location,
                        abortController,
                    });
                    if (isStale()) return;

                    context = { ...context, ...extraContext };
                    // Маршруту без `loader` ждать нечего: его можно отрисовать, не дожидаясь
                    // `beforeLoad` потомков
                    patchMatch(
                        match.id,
                        route.options.loader ? { context } : { context, status: 'success' },
                    );
                } catch (thrown) {
                    if (isStale()) return;

                    const { target, error } = this.resolveThrown(thrown, redirectCount);
                    if (target) return await this.followRedirect(target, redirectCount);

                    // Маршруты глубже упавшего не отрисуются, загружать их незачем
                    matches = matches.slice(0, index + 1);
                    patchMatch(match.id, toFailure(error));
                    break;
                }
            }

            const redirects: RedirectTarget[] = [];

            await Promise.all(
                matches.map(async (match) => {
                    const hasFailed = match.status === 'error' || match.status === 'notFound';
                    if (hasFailed || !loadIds.has(match.id)) return;

                    try {
                        const loaderData = await this.routesById[match.routeId]!.options.loader?.({
                            params: match.params,
                            deps: match.loaderDeps,
                            context: match.context,
                            location,
                            abortController,
                        });
                        if (!isStale()) patchMatch(match.id, { status: 'success', loaderData });
                    } catch (thrown) {
                        if (isStale()) return;

                        const { target, error } = this.resolveThrown(thrown, redirectCount);
                        if (target) redirects.push(target);
                        else patchMatch(match.id, toFailure(error));
                    }
                }),
            );
            if (isStale()) return;
            if (redirects[0]) return await this.followRedirect(redirects[0], redirectCount);

            this.setState({ status: 'idle', resolvedLocation: location, matches });
        } finally {
            clearTimeout(pendingTimer);
        }
    }

    private commit(next: ParsedLocation, replace: boolean, redirectCount = 0): Promise<void> {
        if (replace) this.history.replace(next.href, next.state);
        else this.history.push(next.href, next.state);

        return this.load({ redirectCount });
    }

    private followRedirect(target: RedirectTarget, redirectCount: number): Promise<void> {
        return this.commit(target.location, target.replace, redirectCount + 1);
    }

    /**
     * Разбирает брошенное из `beforeLoad` или `loader`. Редирект, по которому нельзя перейти
     * (цикл или не хватает параметра пути), становится ошибкой бросившего его маршрута.
     * @param {unknown} thrown брошенное значение
     * @param {number} redirectCount сколько редиректов уже пройдено подряд
     * @returns {{ target?: RedirectTarget; error?: unknown }} `target` — куда перейти, либо `error`
     *     — ошибка маршрута
     */
    private resolveThrown(
        thrown: unknown,
        redirectCount: number,
    ): { target?: RedirectTarget; error?: unknown } {
        if (!isRedirect(thrown)) return { error: thrown };

        if (redirectCount >= MAX_REDIRECTS) {
            return {
                error: new Error(`Больше ${MAX_REDIRECTS} редиректов подряд: похоже на цикл`),
            };
        }

        try {
            const location = this.buildLocation(thrown.options);
            return { target: { location, replace: thrown.options.replace ?? true } };
        } catch (error) {
            return { error };
        }
    }

    private setState(patch: Partial<RouterState>): void {
        this.state = { ...this.state, ...patch };
        this.listeners.forEach((listener) => listener());
    }

    private registerRoute(route: AnyRoute, parent: AnyRoute | undefined): void {
        route.init(parent);

        if (this.routesById[route.id]) throw new Error(`Маршрут "${route.id}" объявлен дважды`);
        this.routesById[route.id] = route;

        // Корень тоже может оказаться листом: на `/` без индексного маршрута отрисуется он один
        if (route.options.path || route.isRoot) this.flatRoutes.push(route);
        route.children.forEach((child) => this.registerRoute(child, route));
    }

    private createLocation(
        pathname: string,
        search: Search,
        hash: string,
        state: unknown,
    ): ParsedLocation {
        const searchStr = stringifySearch(search);

        return {
            href: `${joinPaths(this.basepath, pathname)}${searchStr}${hash && `#${hash}`}`,
            pathname,
            search,
            searchStr,
            hash,
            state,
        };
    }

    private parseLocation({ pathname, search, hash, state }: HistoryLocation): {
        location: ParsedLocation;
        leaf: LeafMatch;
    } {
        const hasBasepath = pathname === this.basepath || pathname.startsWith(`${this.basepath}/`);
        const leaf = this.matchLeaf(hasBasepath ? pathname.slice(this.basepath.length) : pathname);
        const location = this.createLocation(
            leaf.pathname,
            parseSearch(search),
            hash.replace(/^#/, ''),
            state,
        );

        return { location, leaf };
    }

    /**
     * Ищет маршрут адреса и приводит путь к тому виду, в котором его собирает `buildLocation`:
     * иначе адрес из браузера (`/Notebooks`, `@` вместо `%40`) не совпал бы с адресом ссылки.
     * @param {string} pathname путь адреса без `basepath`
     * @returns {LeafMatch} маршрут, параметры пути и путь в едином виде
     */
    private matchLeaf(pathname: string): LeafMatch {
        for (const route of this.flatRoutes) {
            const params = matchPath(route.fullPath, pathname);
            if (!params) continue;

            return { route, params, pathname: joinPaths(interpolatePath(route.fullPath, params)) };
        }

        return { route: undefined, params: {}, pathname: normalizePath(pathname) };
    }

    /**
     * Строит цепочку совпадений от корня до маршрута, подошедшего адресу.
     * @param {ParsedLocation} location адрес
     * @param {LeafMatch} leaf маршрут адреса и параметры пути
     * @returns {RouteMatch[]} совпадения от корня к листу
     */
    private matchRoutes(location: ParsedLocation, leaf: LeafMatch): RouteMatch[] {
        const { params } = leaf;

        const branch: AnyRoute[] = [];
        let ancestor: AnyRoute | undefined = leaf.route ?? this.routeTree;
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
            // Уже загруженное совпадение остаётся на экране со своими данными и контекстом
            const loaded = this.state.matches.find(
                (match) => match.id === id && match.status === 'success',
            );

            return {
                id,
                routeId: route.id,
                pathname,
                params,
                search,
                context: loaded?.context ?? {},
                loaderDeps,
                loaderData: loaded?.loaderData,
                status: hasSearchError ? 'error' : loaded ? 'success' : 'pending',
                error,
                globalNotFound: !leaf.route,
            };
        });
    }
}

/**
 * Создаёт роутер.
 * @param {RouterOptions<TRouteTree>} options дерево маршрутов и настройки
 * @returns {Router<TRouteTree>} роутер
 */
export function createRouter<TRouteTree extends AnyRoute>(
    options: RouterOptions<TRouteTree>,
): Router<TRouteTree> {
    return new Router(options);
}

function toFailure(error: unknown): Partial<RouteMatch> {
    return { status: isNotFound(error) ? 'notFound' : 'error', error };
}
