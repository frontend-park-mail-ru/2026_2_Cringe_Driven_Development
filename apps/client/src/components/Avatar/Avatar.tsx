import { useState } from '@cdd-team/react';
import { clsx } from '@cdd-team/clsx';
import styles from './Avatar.module.css';

/** Свойства {@link Avatar}. */
interface AvatarProps {
    /** Логин: первая буква — на аватаре без фото */
    login: string;
    /** Публичный URL фото; null или ошибка загрузки — первая буква логина */
    src?: string | null;
    className?: string;
}

/**
 * Аватар пользователя 40×40 (Components → Avatar).
 * @param props свойства аватара
 * @returns аватар
 */
export function Avatar({ login, src, className }: AvatarProps) {
    const [failed, setFailed] = useState<string | null>(null);
    return (
        <span className={clsx(styles.avatar, className)} aria-hidden="true">
            {src && failed !== src ? (
                <img
                    key={src}
                    className={styles.image}
                    src={src}
                    alt=""
                    onError={() => setFailed(src)}
                />
            ) : (
                login.charAt(0).toUpperCase()
            )}
        </span>
    );
}
