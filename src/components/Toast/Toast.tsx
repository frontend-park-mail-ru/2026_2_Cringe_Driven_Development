import { Icon } from '../Icon/Icon';
import './Toast.css';

/** Тип тоста. */
export type ToastType = 'success' | 'error';

/** Сообщение тоста. */
export interface ToastMessage {
    /** Уникален для каждого показа */
    id: number;
    type: ToastType;
    /** Текст сообщения */
    text: string;
}

const ICONS = { success: 'check', error: 'alert' } as const;

/** Свойства {@link Toast}. */
interface ToastProps {
    /** Что показать; null — тоста нет */
    toast: ToastMessage | null;
}

/**
 * Тост внизу по центру экрана (Components → Toast).
 * @param props свойства тоста
 * @returns область уведомлений
 */
export function Toast({ toast }: ToastProps) {
    return (
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        <div className="toast-region" role="status" aria-live="polite">
            {toast ? (
                <div key={toast.id} className={`toast toast--${toast.type}`}>
                    <Icon key="icon" name={ICONS[toast.type]} className="toast__icon" />
                    <p key="text" className="toast__text">
                        {toast.text}
                    </p>
                </div>
            ) : null}
        </div>
    );
}
