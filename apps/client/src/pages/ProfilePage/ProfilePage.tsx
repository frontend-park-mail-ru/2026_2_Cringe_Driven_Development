import { useEffect, useState } from '@cdd-team/react';

import { trpc } from '@api/trpc';
import { Button } from '@components/Button/Button';
import { Header } from '@components/Header/Header';
import { Icon } from '@components/Icon/Icon';
import { Logo } from '@components/Logo/Logo';
import { ProfileLink } from '@components/ProfileLink/ProfileLink';
import { Space } from '@components/Space/Space';
import { StateBlock } from '@components/StateBlock/StateBlock';
import { Link } from '@cdd-team/router';
import { useSessionStore } from '@stores/session';
import { LoginForm } from './LoginForm';
import { LogoutAllSection } from './LogoutAllSection';
import { PasswordForm } from './PasswordForm';
import { ProfileSkeleton } from './ProfileSkeleton';
import { TwoFactorSection } from './TwoFactorSection';
import styles from './ProfilePage.module.css';

/**
 * Профиль (экран «05. Профиль»): данные из `users.me`, смена аватара, логина и пароля, 2FA, выход
 * со всех устройств. Загруженный пользователь попадает в стор сессии: страница и шапка показывают
 * один логин.
 */
export function ProfilePage() {
    const login = useSessionStore((state) => state.user?.login ?? '');
    const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let alive = true;
        trpc.users.me
            .query()
            .then((user) => {
                if (!alive) return;
                useSessionStore.setState({ user });
                setStatus('ready');
            })
            .catch(() => {
                if (alive) setStatus('error');
            });
        return () => {
            alive = false;
        };
    }, [attempt]);

    const retry = () => {
        setStatus('loading');
        setAttempt((current) => current + 1);
    };

    return (
        <div className={styles.page}>
            <Space key="space" variant="home" />
            <div key="content" className={styles.content}>
                <Header key="header">
                    <Link
                        key="home"
                        to="/"
                        className={styles.home}
                        aria-label="Cellestial — на главную"
                    >
                        <Logo />
                    </Link>
                    <ProfileLink key="profile" />
                </Header>
                <div key="profile" className={styles.profile}>
                    <div key="heading" className={styles.heading}>
                        <Link key="back" to="/" className={styles.back}>
                            <Icon key="icon" name="back" />
                            На главную
                        </Link>
                        <h1 key="title" className={styles.title}>
                            Профиль
                        </h1>
                    </div>
                    {status === 'loading' && <ProfileSkeleton key="skeleton" />}
                    {status === 'error' && (
                        <StateBlock
                            key="error"
                            error
                            title="Не удалось загрузить профиль"
                            description="Проверьте соединение и попробуйте ещё раз."
                        >
                            <Button variant="secondary" onClick={retry}>
                                Повторить
                            </Button>
                        </StateBlock>
                    )}
                    {status === 'ready' && <LoginForm key="login" login={login} />}
                    {status === 'ready' && <TwoFactorSection key="two-factor" />}
                    {status === 'ready' && <PasswordForm key="password" />}
                    {status === 'ready' && <LogoutAllSection key="logout-all" />}
                </div>
            </div>
        </div>
    );
}
