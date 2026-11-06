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
    /** Нет соединения: снекбар «Нет подключения к интернету» без действия и таймера */
    offline?: boolean;
}

/**
 * Ошибка внизу по центру экрана (Components → Snackbar, Type=Error); над ней — предупреждение о сети.
 * @param props свойства снекбара
 * @returns область снекбара
 */
export function Snackbar({ snackbar, offline = false }: SnackbarProps) {
    return (
        <div className={styles.region}>
            {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
            <div key="offline" role="status" aria-live="polite">
                {offline && (
                    <div className={styles.snackbar}>
                        <Icon key="icon" name="alert" className={styles.icon} />
                        <p key="text" className={styles.text}>
                            Нет подключения к интернету
                        </p>
                    </div>
                )}
            </div>
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
