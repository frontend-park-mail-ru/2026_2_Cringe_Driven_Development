import type { ReactNode } from '@cdd-team/react';
import styles from './Header.module.css';

/** Свойства {@link Header}. */
interface HeaderProps {
    /** Содержимое строки шапки: логотип слева, действия справа */
    children: ReactNode;
    /** Панель под строкой шапки, отделена разделителем */
    toolbar?: ReactNode;
    /** Строка под панелью, например поиск по блокноту: прилипает вместе с шапкой */
    panel?: ReactNode;
}

/** Шапка (Components → Header): строка с содержимым, под ней необязательные панели. */
export function Header({ children, toolbar, panel }: HeaderProps) {
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
            {panel}
        </header>
    );
}
