import { clsx } from '@cdd-team/clsx';
import { IconButton } from '@components/IconButton/IconButton';
import styles from './DeleteButton.module.css';

/** Свойства {@link DeleteButton}. */
interface DeleteButtonProps {
    className?: string;
    onClick: () => void;
}

/**
 * Корзина «Удалить блокнот» на карточке главной: нейтральная, при наведении красная.
 */
export function DeleteButton({ className, onClick }: DeleteButtonProps) {
    return (
        <IconButton
            icon="trash"
            label="Удалить блокнот"
            title="Удалить блокнот"
            className={clsx(styles.trash, className)}
            onClick={onClick}
        />
    );
}
