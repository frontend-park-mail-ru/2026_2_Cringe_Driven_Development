import { Avatar } from '@components/Avatar/Avatar';
import { Link } from '@cdd-team/router';
import { useSessionStore } from '@stores/session';
import styles from './ProfileLink.module.css';

/** Аватар вошедшего пользователя в шапке: ссылка на профиль. */
export function ProfileLink() {
    const user = useSessionStore((state) => state.user);
    return (
        <Link to="/profile" className={styles.link} aria-label="Профиль">
            <Avatar login={user?.login ?? ''} src={user?.avatar_url} className={styles.avatar} />
        </Link>
    );
}
