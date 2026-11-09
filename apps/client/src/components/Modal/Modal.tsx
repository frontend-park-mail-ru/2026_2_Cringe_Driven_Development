import { createPortal, useEffect, type ReactNode } from '@cdd-team/react';
import { Icon } from '@components/Icon/Icon';
import { IconButton } from '@components/IconButton/IconButton';
import styles from './Modal.module.css';

const DIALOG_ID = 'modal';
const OVERLAY_ID = 'modal-overlay';
const TITLE_ID = 'modal-title';
const DESCRIPTION_ID = 'modal-description';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled])';

/** Свойства {@link Modal}. */
interface ModalProps {
    title: string;
    /** Текст под заголовком */
    description?: string;
    /** id элемента, который получает фокус при открытии */
    initialFocusId: string;
    /** Ссылка «Назад» над заголовком: возврат к предыдущему шагу */
    onBack?: () => void;
    /** Идёт необратимое действие: крестик недоступен, Escape и клик по затемнению не закрывают */
    locked?: boolean;
    onClose: () => void;
    children: ReactNode;
}

/**
 * Не даёт фокусу уйти из модалки по Tab: с последнего элемента — на первый и обратно.
 * @param event нажатие клавиши
 * @param dialog элемент модалки
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
 * Модалка по центру поверх затемнения (Components → Modal), порталом в `body`.
 * Закрывается крестиком, Escape и кликом по затемнению, если не `locked`. При открытии фокус уходит на initialFocusId, при закрытии возвращается туда, где был.
 * @param props свойства модалки
 * @returns модалка
 */
export function Modal({
    title,
    description,
    initialFocusId,
    onBack,
    locked = false,
    onClose,
    children,
}: ModalProps) {
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
                if (!locked) onClose();
                return;
            }
            const dialog = document.getElementById(DIALOG_ID);
            if (dialog) trapFocus(event, dialog);
        };
        const onOverlay = (event: MouseEvent) =>
            (event.target as Element | null)?.id === OVERLAY_ID;
        // нажали в окне и отпустили на затемнении (выделение текста) — click тоже придёт оверлею
        let pressedOnOverlay = false;
        const handleMouseDown = (event: MouseEvent) => {
            pressedOnOverlay = onOverlay(event);
        };
        // клик по затемнению, а не по самой модалке; с клавиатуры то же делает Escape
        const handleClick = (event: MouseEvent) => {
            if (!locked && pressedOnOverlay && onOverlay(event)) onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('click', handleClick);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('click', handleClick);
        };
    }, [onClose, locked]);

    return createPortal(
        <div id={OVERLAY_ID} className={styles.overlay}>
            <dialog
                id={DIALOG_ID}
                className={styles.modal}
                open
                aria-modal="true"
                aria-labelledby={TITLE_ID}
                aria-describedby={description ? DESCRIPTION_ID : undefined}
            >
                {onBack && (
                    <button key="back" type="button" className={styles.back} onClick={onBack}>
                        <Icon key="icon" name="back" />
                        Назад
                    </button>
                )}
                <div key="head" className={styles.head}>
                    <h2 key="title" id={TITLE_ID} className={styles.title}>
                        {title}
                    </h2>
                    {description && (
                        <p key="description" id={DESCRIPTION_ID} className={styles.description}>
                            {description}
                        </p>
                    )}
                </div>
                <IconButton
                    key="close"
                    icon="close"
                    label="Закрыть"
                    className={styles.close}
                    disabled={locked}
                    onClick={onClose}
                />
                <div key="body">{children}</div>
            </dialog>
        </div>,
        document.body,
    );
}
