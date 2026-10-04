import { useEffect, type ReactNode } from '@maninthecoat/react';
import { IconButton } from '@components/IconButton/IconButton';
import './Modal.css';

const DIALOG_ID = 'modal';
const TITLE_ID = 'modal-title';

/** Свойства {@link Modal}. */
interface ModalProps {
    title: string;
    /** id элемента, который получает фокус при открытии */
    initialFocusId: string;
    onClose: () => void;
    children: ReactNode;
}

/**
 * @returns элемент модалки в DOM
 */
function getDialog() {
    const dialog = document.getElementById(DIALOG_ID);
    return dialog instanceof HTMLDialogElement ? dialog : null;
}

/**
 * Модалка по центру поверх затемнения (Components → Modal).
 * При открытии фокус уходит на initialFocusId, при закрытии возвращается туда, где был.
 * @param props свойства модалки
 * @returns модалка
 */
export function Modal({ title, initialFocusId, onClose, children }: ModalProps) {
    useEffect(() => {
        const dialog = getDialog();
        if (!dialog) return;
        const opener =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const reopen = () => dialog.showModal();
        dialog.showModal();
        dialog.addEventListener('close', reopen);
        document.getElementById(initialFocusId)?.focus();
        return () => {
            dialog.removeEventListener('close', reopen);
            dialog.close();
            opener?.focus();
        };
    }, [initialFocusId]);

    useEffect(() => {
        const dialog = getDialog();
        if (!dialog) return;
        const handleCancel = (event: Event) => {
            event.preventDefault();
            onClose();
        };
        dialog.addEventListener('cancel', handleCancel);
        return () => dialog.removeEventListener('cancel', handleCancel);
    }, [onClose]);

    return (
        <dialog id={DIALOG_ID} className="modal" aria-labelledby={TITLE_ID}>
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
    );
}
