import { Icon } from '../Icon/Icon';
import './Toast.css';

/** Тип тоста из макета (Components → Toast, Type). */
export type ToastType = 'success' | 'info';

/** Сообщение тоста. */
export interface ToastMessage {
    /** Уникален для каждого показа: повтор того же текста снова проигрывает появление */
    id: number;
    /** Success — действие удалось, Info — просто сообщение */
    type: ToastType;
    /** Текст сообщения */
    text: string;
}

const ICONS = { success: 'check', info: 'info' } as const;

/** Свойства {@link Toast}. */
interface ToastProps {
    /** Что показать; null — тоста нет */
    toast: ToastMessage | null;
}

/**
 * Тост внизу по центру экрана (Components → Toast). Когда скрывать — решает тот, кто показывает.
 * Область role="status" смонтирована всегда: так скринридер озвучивает каждое новое сообщение.
 * @param props свойства тоста
 * @returns область уведомлений
 */
export function Toast({ toast }: ToastProps) {
    return (
        // Тега output, который советует линтер, нет в JSX-типах @maninthecoat/react
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
