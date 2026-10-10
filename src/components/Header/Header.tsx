import type { ReactNode } from '@maninthecoat/react';
import styles from './Header.module.css';

/** Свойства {@link Header}. */
interface HeaderProps {
    /** Содержимое строки шапки: логотип слева, действия справа */
    children: ReactNode;
    /** Панель под строкой шапки, отделена разделителем */
    toolbar?: ReactNode;
}

/**
 * Шапка (Components → Header).
 * @param {HeaderProps} props свойства шапки
 * @returns {JSX.Element} шапка
 */
export function Header({ children, toolbar }: HeaderProps) {
    return (
        <header className={styles.header}>
            <div key="row" className={styles.row}>
                {children}
            </div>
            {toolbar && <hr key="divider" className={styles.divider} />}
            {toolbar && (
                <div key="toolbar" className={styles.toolbar}>
                    {toolbar}
                </div>
            )}
        </header>
    );
}
