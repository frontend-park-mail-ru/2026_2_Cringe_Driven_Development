import type { ReactNode } from '@maninthecoat/react';
import { Icon } from '@components/Icon/Icon';
import styles from './Chip.module.css';

/** Свойства {@link Chip}. */
interface ChipProps {
    /** Текст чипа */
    children: ReactNode;
    onClick: () => void;
}

/**
 * Чип «+ Код» / «+ Текст» (Components → Chip).
 * @param {ChipProps} props свойства чипа
 * @returns {JSX.Element} элемент button
 */
export function Chip({ children, onClick }: ChipProps) {
    return (
        <button className={styles.chip} type="button" onClick={onClick}>
            <Icon key="icon" name="plus" size={12} />
            <span key="label">{children}</span>
        </button>
    );
}
