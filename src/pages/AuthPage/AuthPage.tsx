import { useEffect, useState } from '@maninthecoat/react';

import { buttonClassName } from '@components/Button/Button';
import { Logo } from '@components/Logo/Logo';
import { Moon } from '@components/Moon/Moon';
import { Space } from '@components/Space/Space';
import { clsx } from '@modules/clsx';
import { Link, useMatches, type RouteIds } from '@modules/router';
import type { AuthMode } from '@utils/credentials';
import { AuthForm } from './AuthForm';
import styles from './AuthPage.module.css';

const REGISTER_ROUTE: RouteIds = '/_guest/register';

/** Длительность переезда луны, мс */
const SWEEP_MS = 700;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Вход и регистрация (экраны «01. Вход» и «02. Регистрация»): карточка с формой и луной.
 * Режим берётся из адреса: /login или /register.
 * При смене режима луна сразу едет на другую сторону, а содержимое гаснет
 * и подменяется на середине пути, когда луна его накрывает.
 * @returns страница
 */
export function AuthPage() {
    const isRegister = useMatches().some((match) => match.routeId === REGISTER_ROUTE);
    const mode: AuthMode = isRegister ? 'register' : 'login';

    const [shownMode, setShownMode] = useState(mode);
    const [fading, setFading] = useState(false);

    useEffect(() => {
        if (mode === shownMode) return;
        if (prefersReducedMotion()) {
            setShownMode(mode);
            return;
        }
        setFading(true);
        const swap = setTimeout(() => setShownMode(mode), SWEEP_MS / 2);
        return () => clearTimeout(swap);
    }, [mode, shownMode]);

    useEffect(() => {
        if (!fading || mode !== shownMode) return;
        const show = setTimeout(() => setFading(false), SWEEP_MS / 10);
        return () => clearTimeout(show);
    }, [fading, mode, shownMode]);

    const showRegister = shownMode === 'register';
    const className = clsx(
        styles.auth,
        isRegister && styles.register,
        showRegister && styles.showRegister,
        fading && styles.fading,
    );

    return (
        <div className={className} style={{ '--sweep': `${SWEEP_MS}ms` }}>
            <Space key="space" />
            <Logo key="logo" />
            <div key="card" className={styles.card}>
                <Moon key="moon" className={styles.moon} />
                <div key="form" className={styles.formPane}>
                    <AuthForm key={shownMode} mode={shownMode} />
                </div>
                <div key="side" className={styles.side}>
                    <div key="face" className={styles.face}>
                        <h2 key="title" className={styles.faceTitle}>
                            {showRegister ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?'}
                        </h2>
                        <p key="pitch" className={styles.facePitch}>
                            {showRegister
                                ? 'Ваши блокноты ждут\nна орбите'
                                : 'Python прямо в браузере —\nбез установки окружения'}
                        </p>
                        <Link
                            key="switch"
                            to={showRegister ? '/login' : '/register'}
                            className={buttonClassName('inverse')}
                        >
                            {showRegister ? 'Войти' : 'Создать аккаунт'}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
