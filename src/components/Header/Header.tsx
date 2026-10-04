import type { ReactNode } from '@maninthecoat/react';
import './Header.css';

/** Свойства {@link Header}. */
interface HeaderProps {
    /** Содержимое строки шапки: логотип слева, действия справа */
    children: ReactNode;
}

/**
 * Шапка (Components → Header).
 * @param props свойства шапки
 * @returns шапка
 */
export function Header({ children }: HeaderProps) {
    return <header className="header">{children}</header>;
}
