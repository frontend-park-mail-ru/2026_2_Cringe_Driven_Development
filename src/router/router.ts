import { create } from '@maninthecoat/zustand';

/**
 * Маршрутизация SPA на History API: страница меняется без перезагрузки,
 * адресная строка и кнопки «Назад»/«Вперёд» работают как у обычного сайта.
 * @module router/router
 */

/** Адреса приложения. */
export const ROUTES = {
    home: '/',
    login: '/login',
    signup: '/signup',
} as const;

/** Один из известных адресов. */
export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

/** Параметры перехода. */
export interface NavigateOptions {
    /** Заменить текущую запись истории вместо добавления новой */
    replace?: boolean;
}

interface RouterState {
    /** Текущий pathname */
    path: string;
    /**
     * Перейти по адресу внутри приложения.
     * @param to путь, начинающийся с «/»
     * @param options параметры перехода
     */
    navigate: (to: string, options?: NavigateOptions) => void;
}

/** Стор текущего адреса. */
export const useRouter = create<RouterState>()((set, get) => ({
    path: window.location.pathname,
    navigate: (to, options = {}) => {
        if (to === get().path && !options.replace) return;
        if (options.replace) {
            window.history.replaceState(null, '', to);
        } else {
            window.history.pushState(null, '', to);
        }
        set({ path: to });
    },
}));

window.addEventListener('popstate', () => {
    useRouter.setState({ path: window.location.pathname });
});

/**
 * Переход вне компонентов (из сторов, обработчиков).
 * @param to путь внутри приложения
 * @param options параметры перехода
 */
export function navigate(to: string, options?: NavigateOptions): void {
    useRouter.getState().navigate(to, options);
}
