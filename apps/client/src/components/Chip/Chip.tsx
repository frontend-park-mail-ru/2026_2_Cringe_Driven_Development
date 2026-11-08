import type { ReactNode } from '@cdd-team/react';
import { Icon } from '@components/Icon/Icon';
import styles from './Chip.module.css';

/** Свойства {@link Chip}. */
interface ChipProps {
    /** Текст чипа */
    children: ReactNode;
    id?: string;
    /** Действие сейчас недоступно */
    disabled?: boolean;
    onClick: () => void;
}

/** Чип «+ Код» / «+ Текст» (Components → Chip). */
export function Chip({ children, id, disabled, onClick }: ChipProps) {
    return (
        <button id={id} className={styles.chip} type="button" disabled={disabled} onClick={onClick}>
            <Icon key="icon" name="plus" size={12} />
            <span key="label">{children}</span>
        </button>
    );
}
