import { Icon } from '@components/Icon/Icon';
import './Toast.css';

/** Сообщение тоста. */
export interface ToastMessage {
    /** Уникален для каждого показа */
    id: number;
    /** Текст сообщения */
    text: string;
}

/** Свойства {@link Toast}. */
interface ToastProps {
    /** Что показать; null — тоста нет */
    toast: ToastMessage | null;
}

/**
 * Тост об успехе внизу по центру экрана (Components → Toast, Type=Success).
 * @param props свойства тоста
 * @returns область уведомлений
 */
export function Toast({ toast }: ToastProps) {
    return (
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        <div className="toast-region" role="status" aria-live="polite">
            {toast && (
                <div key={toast.id} className="toast">
                    <Icon key="icon" name="check" className="toast__icon" />
                    <p key="text" className="toast__text">
                        {toast.text}
                    </p>
                </div>
            )}
        </div>
    );
}
