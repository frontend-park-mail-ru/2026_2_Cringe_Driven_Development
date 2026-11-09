import { clsx } from '@cdd-team/clsx';
import { IconButton } from '@components/IconButton/IconButton';
import styles from './DeleteNotebookDialog.module.css';

/** Свойства {@link DeleteButton}. */
interface DeleteButtonProps {
    className?: string;
    onClick: () => void;
}

/**
 * Корзина «Удалить блокнот» на карточке и в шапке редактора: нейтральная, при наведении красная.
 * @param props свойства кнопки
 * @returns кнопка-иконка
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
