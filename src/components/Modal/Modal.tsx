import { useEffect, type ReactNode } from '@maninthecoat/react';
import { IconButton } from '@components/IconButton/IconButton';
import './Modal.css';

const DIALOG_ID = 'modal';
const TITLE_ID = 'modal-title';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled])';

/** Свойства {@link Modal}. */
interface ModalProps {
    title: string;
    /** id элемента, который получает фокус при открытии */
    initialFocusId: string;
    onClose: () => void;
    children: ReactNode;
}

/**
 * Не даёт фокусу уйти из модалки по Tab: с последнего элемента — на первый и обратно.
 * @param {KeyboardEvent} event нажатие клавиши
 * @param {HTMLElement} dialog элемент модалки
 */
function trapFocus(event: KeyboardEvent, dialog: HTMLElement) {
    if (event.key !== 'Tab') return;
    const items = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (!dialog.contains(active)) {
        event.preventDefault();
        first.focus();
    } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
    }
}

/**
 * Модалка по центру поверх затемнения (Components → Modal).
 * При открытии фокус уходит на initialFocusId, при закрытии возвращается туда, где был.
 * @param {ModalProps} props свойства модалки
 * @returns {JSX.Element} модалка
 */
export function Modal({ title, initialFocusId, onClose, children }: ModalProps) {
    useEffect(() => {
        const opener =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        document.getElementById(initialFocusId)?.focus();
        return () => opener?.focus();
    }, [initialFocusId]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            const dialog = document.getElementById(DIALOG_ID);
            if (dialog) trapFocus(event, dialog);
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div className="modal-overlay">
            <dialog
                id={DIALOG_ID}
                className="modal"
                open
                aria-modal="true"
                aria-labelledby={TITLE_ID}
            >
                <h2 key="title" id={TITLE_ID} className="modal__title">
                    {title}
                </h2>
                <IconButton
                    key="close"
                    icon="close"
                    label="Закрыть"
                    className="modal__close"
                    onClick={onClose}
                />
                <div key="body">{children}</div>
            </dialog>
        </div>
    );
}
