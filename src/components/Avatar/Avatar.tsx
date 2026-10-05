import { clsx } from '@modules/clsx';
import styles from './Avatar.module.css';

/** Свойства {@link Avatar}. */
interface AvatarProps {
    /** Логин: на аватаре его первая буква */
    login: string;
    className?: string;
}

/**
 * Аватар пользователя 40×40 (Components → Avatar).
 * @param props свойства аватара
 * @returns аватар
 */
export function Avatar({ login, className }: AvatarProps) {
    return (
        <span className={clsx(styles.avatar, className)} aria-hidden="true">
            {login.charAt(0).toUpperCase()}
        </span>
    );
}
