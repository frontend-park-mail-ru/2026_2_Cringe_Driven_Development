import { Icon } from '@components/Icon/Icon';
import styles from './Snackbar.module.css';

/** Сообщение снекбара. */
export interface SnackbarMessage {
    /** Уникален для каждого показа */
    id: number;
    /** Текст ошибки */
    text: string;
    /** Действие справа от текста, например «Повторить» */
    action?: { label: string; onClick: () => void };
}

/** Свойства {@link Snackbar}. */
interface SnackbarProps {
    /** Что показать; null — снекбара нет */
    snackbar: SnackbarMessage | null;
}

/**
 * Ошибка отправки формы внизу по центру экрана (Components → Snackbar, Type=Error).
 * @param {SnackbarProps} props свойства снекбара
 * @returns {JSX.Element} область снекбара
 */
export function Snackbar({ snackbar }: SnackbarProps) {
    return (
        <div className={styles.region}>
            {snackbar && (
                <div key={snackbar.id} className={styles.snackbar} role="alert">
                    <Icon key="icon" name="alert" className={styles.icon} />
                    <p key="text" className={styles.text}>
                        {snackbar.text}
                    </p>
                    {snackbar.action && (
                        <button
                            key="action"
                            className={styles.action}
                            type="button"
                            onClick={snackbar.action.onClick}
                        >
                            {snackbar.action.label}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
