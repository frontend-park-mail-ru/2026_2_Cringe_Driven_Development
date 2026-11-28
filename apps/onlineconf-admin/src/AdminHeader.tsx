import { useEffect, useState } from '@cdd-team/react';
import { api, type User } from '@api/bff';
import { Avatar } from '@components/Avatar/Avatar';
import { Badge } from '@components/Badge/Badge';
import { Header } from '@components/Header/Header';
import { Logo } from '@components/Logo/Logo';
import styles from './AdminHeader.module.css';

/** Шапка OnlineConf с аватаром после проверки доступа. */
export function AdminHeader({ granted }: { granted: boolean }) {
    const [user, setUser] = useState<User | undefined>(undefined);

    useEffect(() => {
        if (!granted) return;
        const controller = new AbortController();
        void api('GET', '/api/users/me', { init: { signal: controller.signal } }).then(
            (profile) => {
                if (!controller.signal.aborted) setUser(profile);
            },
            () => {},
        );
        return () => controller.abort();
    }, [granted]);

    return (
        <Header>
            <div key="brand" className={styles.brand}>
                <a key="logo" href="/" aria-label="Главная Cellestial">
                    <Logo />
                </a>
                {granted && <Badge key="admin">Admin</Badge>}
            </div>
            {granted && user && <Avatar key="avatar" login={user.login} src={user.avatar_url} />}
        </Header>
    );
}
