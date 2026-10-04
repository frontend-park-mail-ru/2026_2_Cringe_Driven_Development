import type { ReactNode } from '@maninthecoat/react';
import './Header.css';

/** Свойства {@link Header}. */
interface HeaderProps {
    /** Содержимое строки шапки: логотип слева, действия справа */
    children: ReactNode;
    /** Панель под строкой шапки, отделена разделителем */
    toolbar?: ReactNode;
}

/**
 * Шапка (Components → Header).
 * @param props свойства шапки
 * @returns шапка
 */
export function Header({ children, toolbar }: HeaderProps) {
    return (
        <header className="header">
            <div key="row" className="header__row">
                {children}
            </div>
            {toolbar && <hr key="divider" className="header__divider" />}
            {toolbar && (
                <div key="toolbar" className="header__toolbar">
                    {toolbar}
                </div>
            )}
        </header>
    );
}
