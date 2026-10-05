import './Avatar.css';

/** Свойства {@link Avatar}. */
interface AvatarProps {
    /** Логин: на аватаре его первая буква */
    login: string;
}

/**
 * Аватар пользователя 40×40 (Components → Avatar).
 * @param {AvatarProps} props свойства аватара
 * @returns {JSX.Element} аватар
 */
export function Avatar({ login }: AvatarProps) {
    return (
        <span className="avatar" aria-hidden="true">
            {login.charAt(0).toUpperCase()}
        </span>
    );
}
