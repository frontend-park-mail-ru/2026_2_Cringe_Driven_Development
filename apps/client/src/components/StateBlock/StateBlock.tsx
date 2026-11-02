import type { ReactNode } from '@cdd-team/react';
import emptyPlanetUrl from '@assets/empty-planet.svg';
import { clsx } from '@cdd-team/clsx';
import { Icon } from '@components/Icon/Icon';
import styles from './StateBlock.module.css';

/** Свойства {@link StateBlock}. */
interface StateBlockProps {
    title: string;
    description: string;
    /** Type=Error: иконка ошибки вместо планеты */
    error?: boolean;
    /** Кнопки под описанием */
    children?: ReactNode;
    /** Класс блока кнопок */
    actionsClassName?: string;
}

/**
 * Заглушка пустого состояния (Components → StateBlock).
 * @param props свойства заглушки
 * @returns заглушка
 */
export function StateBlock({
    title,
    description,
    error = false,
    children,
    actionsClassName,
}: StateBlockProps) {
    return (
        <div className={styles.block}>
            {error ? (
                <Icon key="error" name="alert" size={32} className={styles.errorIcon} />
            ) : (
                <img key="icon" src={emptyPlanetUrl} alt="" width={56} height={56} />
            )}
            <h2 key="title" className={styles.title}>
                {title}
            </h2>
            <p key="description" className={styles.description}>
                {description}
            </p>
            {children && (
                <div key="actions" className={clsx(styles.actions, actionsClassName)}>
                    {children}
                </div>
            )}
        </div>
    );
}
