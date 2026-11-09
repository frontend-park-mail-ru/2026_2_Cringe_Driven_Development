import { clsx } from '@cdd-team/clsx';
import { Icon, type IconName } from '@components/Icon/Icon';
import styles from './IconButton.module.css';

/** Свойства {@link IconButton}. */
interface IconButtonProps {
    icon: IconName;
    /** Подпись для скринридера */
    label: string;
    /** Подсказка при наведении */
    title?: string;
    className?: string;
    /** Действие сейчас недоступно */
    disabled?: boolean;
    onClick: () => void;
}

/**
 * Кнопка-иконка 36×36 (Components → IconButton).
 * @param props свойства кнопки
 * @returns элемент button
 */
export function IconButton({ icon, label, title, className, disabled, onClick }: IconButtonProps) {
    return (
        <button
            className={clsx(styles.button, className)}
            type="button"
            aria-label={label}
            title={title}
            disabled={disabled}
            onClick={onClick}
        >
            <Icon name={icon} />
        </button>
    );
}
