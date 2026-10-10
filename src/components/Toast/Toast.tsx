import { Icon } from '@components/Icon/Icon';
import styles from './Toast.module.css';

/** Вид тоста (Components → Toast, Type). */
export type ToastType = 'success' | 'info';

/** Сообщение тоста. */
export interface ToastMessage {
    /** Уникален для каждого показа */
    id: number;
    /** Текст сообщения */
    text: string;
    /** Вид из макета: success — успех, info — нейтральное сообщение */
    type: ToastType;
}

/** Свойства {@link Toast}. */
interface ToastProps {
    /** Что показать; null — тоста нет */
    toast: ToastMessage | null;
}

/**
 * Тост внизу по центру экрана (Components → Toast).
 * @param {ToastProps} props свойства тоста
 * @returns {JSX.Element} область уведомлений
 */
export function Toast({ toast }: ToastProps) {
    return (
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        <div className={styles.region} role="status" aria-live="polite">
            {toast && (
                <div key={toast.id} className={styles.toast}>
                    <Icon
                        key="icon"
                        name={toast.type === 'info' ? 'info' : 'check'}
                        className={styles[toast.type]}
                    />
                    <p key="text" className={styles.text}>
                        {toast.text}
                    </p>
                </div>
            )}
        </div>
    );
}
