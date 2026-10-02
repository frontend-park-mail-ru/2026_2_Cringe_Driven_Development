import { useLayoutEffect } from '@maninthecoat/react';
import { Placeholder } from './pages/Placeholder/Placeholder';
import { ROUTES, navigate, useRouter } from './router/router';

/** Экран приложения. */
type Screen = 'home' | 'login' | 'signup';

const SCREEN_BY_PATH: Record<string, Screen> = {
    [ROUTES.home]: 'home',
    [ROUTES.login]: 'login',
    [ROUTES.signup]: 'signup',
};

/**
 * Корень приложения: выбирает экран по адресу. Неизвестный адрес ведёт на главную.
 * @returns текущий экран
 */
export function App() {
    const path = useRouter((state) => state.path);
    const screen = SCREEN_BY_PATH[path];

    useLayoutEffect(() => {
        if (!screen) navigate(ROUTES.home, { replace: true });
    }, [screen]);

    if (screen === 'login') return <Placeholder title="Вход" />;
    if (screen === 'signup') return <Placeholder title="Регистрация" />;
    return <Placeholder title="Главная" />;
}
