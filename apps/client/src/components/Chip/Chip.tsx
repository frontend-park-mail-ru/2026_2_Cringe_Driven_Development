import type { ReactNode } from '@cdd-team/react';
import { Icon } from '@components/Icon/Icon';
import styles from './Chip.module.css';

/** Свойства {@link Chip}. */
interface ChipProps {
    /** Текст чипа */
    children: ReactNode;
    /** Действие сейчас недоступно */
    disabled?: boolean;
    onClick: () => void;
}

/**
 * Чип «+ Код» / «+ Текст» (Components → Chip).
 * @param props свойства чипа
 * @returns элемент button
 */
export function Chip({ children, disabled, onClick }: ChipProps) {
    return (
        <button className={styles.chip} type="button" disabled={disabled} onClick={onClick}>
            <Icon key="icon" name="plus" size={12} />
            <span key="label">{children}</span>
        </button>
    );
}
