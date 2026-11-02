import { useEffect, useState } from '@cdd-team/react';

import { trpc } from '@api/trpc';
import { Button } from '@components/Button/Button';
import { Header } from '@components/Header/Header';
import { Logo } from '@components/Logo/Logo';
import { ProfileMenu } from '@components/ProfileMenu/ProfileMenu';
import { Space } from '@components/Space/Space';
import { StateBlock } from '@components/StateBlock/StateBlock';
import { Link } from '@cdd-team/router';
import { useSessionStore } from '@stores/session';
import { LoginForm } from './LoginForm';
import { PasswordForm } from './PasswordForm';
import { ProfileSkeleton } from './ProfileSkeleton';
import styles from './ProfilePage.module.css';

/**
 * Профиль (экран «05. Профиль»): данные из `users.me`, смена логина и пароля.
 * Загруженный пользователь попадает в стор сессии: страница и шапка показывают один логин.
 * @returns страница
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
                    <ProfileMenu key="profile" login={login} />
                </Header>
                <div key="profile" className={styles.profile}>
                    <h1 key="title" className={styles.title}>
                        Профиль
                    </h1>
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
                    {status === 'ready' && <PasswordForm key="password" />}
                </div>
            </div>
        </div>
    );
}
