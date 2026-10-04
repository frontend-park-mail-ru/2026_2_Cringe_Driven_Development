import {
    useContext,
    useLayoutEffect,
    type AnchorHTMLAttributes,
    type MouseEvent,
    type ReactElement,
} from '@maninthecoat/react';

import { clsx } from '../clsx';
import { MatchContext, RouterContext } from './context';
import { useLocation, useMatches, useRouter } from './hooks';
import type { AnyRoute, ErrorRouteComponent } from './route';
import type { AnyRouter, NavigateOptions, NavigateTo, ParsedLocation, RouteMatch } from './router';

export const RouterProvider = ({ router }: { router: AnyRouter }) => {
    useLayoutEffect(() => router.mount(), [router]);

    return (
        <RouterContext value={router}>
            <Outlet />
        </RouterContext>
    );
};

/** Место, куда отрисовывается дочерний маршрут. Вне маршрутов отрисовывает корневой */
export const Outlet = () => {
    const router = useRouter();
    const routeId = useContext(MatchContext);
    const matches = useMatches();
    const index = matches.findIndex((match) => match.routeId === routeId);
    // Маршрут этого компонента уже ушёл из совпадений: отрисовывать под ним нечего
    if (routeId !== undefined && index === -1) return null;

    const child = matches[index + 1];
    if (child) return <MatchView key={child.routeId} match={child} />;
    if (matches[index]?.globalNotFound) return renderNotFound(router, router.routeTree);

    return null;
};

const MatchView = ({ match }: { match: RouteMatch }) => {
    const router = useRouter();
    const route = router.routesById[match.routeId];
    if (!route) return null;

    return <MatchContext value={match.routeId}>{renderMatch(router, route, match)}</MatchContext>;
};

function renderMatch(router: AnyRouter, route: AnyRoute, match: RouteMatch): ReactElement | null {
    switch (match.status) {
        case 'pending': {
            const Pending =
                route.options.pendingComponent ?? router.options.defaultPendingComponent;
            return Pending ? <Pending /> : null;
        }
        case 'error': {
            const ErrorComponent =
                route.options.errorComponent ??
                router.options.defaultErrorComponent ??
                DefaultError;
            return <ErrorComponent error={match.error} reset={router.invalidate} />;
        }
        case 'notFound':
            return renderNotFound(router, route);
        case 'success': {
            const Component = route.options.component ?? Outlet;
            return <Component />;
        }
    }
}

function renderNotFound(router: AnyRouter, route: AnyRoute): ReactElement {
    const NotFound =
        route.options.notFoundComponent ??
        router.options.defaultNotFoundComponent ??
        DefaultNotFound;
    return <NotFound />;
}

const DefaultNotFound = () => <p>Страница не найдена</p>;

const DefaultError: ErrorRouteComponent = ({ error }) => (
    <div role="alert">
        <p>Что-то пошло не так</p>
        <pre>{error instanceof Error ? error.message : String(error)}</pre>
    </div>
);

export interface ActiveOptions {
    /** Считать ссылку активной только при полном совпадении пути, а не по префиксу */
    exact?: boolean;
    /** Учитывать search-параметры ссылки. По умолчанию `true` */
    includeSearch?: boolean;
}

export type LinkProps<TTo extends string = string> = Omit<
    AnchorHTMLAttributes,
    'href' | 'children'
> &
    NavigateOptions<TTo> & {
        /** Атрибуты, которые добавляются активной ссылке */
        activeProps?: AnchorHTMLAttributes;
        inactiveProps?: AnchorHTMLAttributes;
        activeOptions?: ActiveOptions;
        disabled?: boolean;
        children?: ReactElement[];
    };

export const Link = <TTo extends NavigateTo = '.'>(props: LinkProps<TTo>) => {
    const {
        to,
        params,
        search,
        hash,
        state,
        replace,
        activeProps,
        inactiveProps,
        activeOptions,
        disabled,
        children,
        onClick,
        ...anchorProps
    } = props as LinkProps;
    const router = useRouter();
    const current = useLocation();

    const target = { to, params, search, hash, state };
    const next = router.buildLocation(target);
    const isActive = isLocationActive(current, next, activeOptions);
    const stateProps = (isActive ? activeProps : inactiveProps) ?? {};
    const className = clsx(
        anchorProps.class,
        anchorProps.className,
        stateProps.class,
        stateProps.className,
    );

    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);

        if (disabled) {
            event.preventDefault();
            return;
        }

        // Клики с модификаторами и ссылки в новую вкладку оставляем браузеру
        const opensElsewhere = anchorProps.target !== undefined && anchorProps.target !== '_self';
        const hasModifier = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (event.defaultPrevented || event.button !== 0 || hasModifier || opensElsewhere) return;

        event.preventDefault();
        void router.commitLocation({ ...target, replace });
    };

    // Свойства со значением `undefined` не передаём: рендерер записал бы их в DOM как строку
    const linkProps: AnchorHTMLAttributes = { ...anchorProps, ...stateProps, onClick: handleClick };
    delete linkProps.class;
    delete linkProps.className;
    if (className) linkProps.class = className;
    if (!disabled) linkProps.href = next.href;
    if (disabled) linkProps['aria-disabled'] = true;
    if (isActive) {
        linkProps['aria-current'] = 'page';
        linkProps['data-status'] = 'active';
    }

    return <a {...linkProps}>{children}</a>;
};

function isLocationActive(
    current: ParsedLocation,
    next: ParsedLocation,
    { exact = false, includeSearch = true }: ActiveOptions = {},
): boolean {
    const isSamePath = current.pathname === next.pathname;
    // `/` — префикс любого пути, поэтому ссылка на главную активна только на самой главной
    const isParentPath = next.pathname !== '/' && current.pathname.startsWith(`${next.pathname}/`);
    if (!isSamePath && (exact || !isParentPath)) return false;
    if (!includeSearch) return true;

    return Object.entries(next.search).every(
        ([key, value]) => JSON.stringify(current.search[key]) === JSON.stringify(value),
    );
}
