import { clsx } from '@cdd-team/clsx';
import { Icon, type IconName } from '@components/Icon/Icon';
import styles from './IconButton.module.css';

/** Свойства {@link IconButton}. */
interface IconButtonProps {
    icon: IconName;
    /** Подпись для скринридера */
    label: string;
    className?: string;
    onClick: () => void;
}

/**
 * Кнопка-иконка 36×36 (Components → IconButton).
 * @param props свойства кнопки
 * @returns элемент button
 */
export function IconButton({ icon, label, className, onClick }: IconButtonProps) {
    return (
        <button
            className={clsx(styles.button, className)}
            type="button"
            aria-label={label}
            onClick={onClick}
        >
            <Icon name={icon} />
        </button>
    );
}
