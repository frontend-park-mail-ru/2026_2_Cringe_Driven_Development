import { useEffect, useRef, useState } from '@cdd-team/react';

import { buttonClassName } from '@components/Button/Button';
import { Logo } from '@components/Logo/Logo';
import { Moon } from '@components/Moon/Moon';
import { Space } from '@components/Space/Space';
import { clsx } from '@cdd-team/clsx';
import { Link, useMatches, type RouteIds } from '@cdd-team/router';
import type { AuthMode } from '@utils/credentials';
import { AuthForm } from './AuthForm';
import styles from './AuthPage.module.css';

const REGISTER_ROUTE: RouteIds = '/_guest/register';

/** Текст на луне при входе: зовёт создать аккаунт */
const LOGIN_PITCH =
    'Cellestial — блокноты с Python прямо в браузере. Пишите код и заметки в ячейках, ' +
    'запускайте их и сразу видите результат. Ничего не нужно устанавливать.';

/** Текст на луне при регистрации: зовёт войти */
const REGISTER_PITCH =
    'Войдите, чтобы вернуться к своим блокнотам. Код и заметки сохраняются автоматически — ' +
    'продолжите с того места, где остановились.';

/** Длительность переезда луны, мс */
const SWEEP_MS = 700;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Вход и регистрация (экраны «01. Вход» и «02. Регистрация»): карточка с формой и луной. Режим
 * берётся из адреса: `/login` или `/register`. При смене режима луна сразу едет на другую сторону,
 * а содержимое гаснет и подменяется на середине пути, когда луна его накрывает. На телефоне луны
 * нет: под формой ссылка на другой режим. На шаге кода 2FA («08. Вход с 2FA») луна остаётся без
 * текста, на телефоне — только форма.
 */
export function AuthPage() {
    const isRegister = useMatches().some((match) => match.routeId === REGISTER_ROUTE);
    const mode: AuthMode = isRegister ? 'register' : 'login';

    const [shownMode, setShownMode] = useState(mode);
    const [fading, setFading] = useState(false);
    const [codeStep, setCodeStep] = useState(false);

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
    const card = useRef<HTMLDivElement>(null);
    const className = clsx(
        styles.auth,
        isRegister && styles.register,
        showRegister && styles.showRegister,
        fading && styles.fading,
        codeStep && styles.codeStep,
    );

    return (
        <div className={className} style={{ '--sweep': `${SWEEP_MS}ms` }}>
            <Space key="space" anchor={card} edge="below" />
            <Logo key="logo" />
            <div key="card" ref={card} className={styles.card}>
                <Moon key="moon" className={styles.moon} />
                <div key="form" className={styles.formPane}>
                    <AuthForm key={shownMode} mode={shownMode} onCodeStep={setCodeStep} />
                    <div key="switch" className={styles.switch}>
                        <p key="title" className={styles.switchTitle}>
                            {showRegister ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?'}
                        </p>
                        <Link
                            key="link"
                            to={showRegister ? '/login' : '/register'}
                            className={buttonClassName('secondary', true)}
                        >
                            {showRegister ? 'Войти' : 'Создать аккаунт'}
                        </Link>
                    </div>
                </div>
                <div key="side" className={styles.side}>
                    <div key="face" className={styles.face}>
                        <div key="copy" className={styles.faceCopy}>
                            <h2 key="title" className={styles.faceTitle}>
                                {showRegister ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?'}
                            </h2>
                            <p key="pitch" className={styles.facePitch}>
                                {showRegister ? REGISTER_PITCH : LOGIN_PITCH}
                            </p>
                        </div>
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
