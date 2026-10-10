import { clsx } from '@modules/clsx';
import { Icon } from '@components/Icon/Icon';
import type { IconName } from '@components/Icon/icons';
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
 * @param {IconButtonProps} props свойства кнопки
 * @returns {JSX.Element} элемент button
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
