import { clsx } from '@cdd-team/clsx';
import { useState } from '@cdd-team/react';
import { Modal } from '@components/Modal/Modal';
import styles from './ImagePreview.module.css';

/** Свойства {@link ImagePreview}. */
interface ImagePreviewProps {
    /** Префикс id увеличенного изображения: на него уходит фокус при открытии */
    id: string;
    /** URL готового растрового превью */
    src: string;
    /** Описание изображения */
    alt: string;
    className?: string;
}

/**
 * Миниатюра изображения. Нажатие мышью или с клавиатуры открывает увеличенное изображение в
 * {@link Modal}; при закрытии фокус возвращается на миниатюру.
 */
export function ImagePreview({ id, src, alt, className }: ImagePreviewProps) {
    const [open, setOpen] = useState(false);
    const fullId = `${id}-full`;
    return (
        <>
            <button
                key="thumb"
                type="button"
                className={clsx(styles.thumb, className)}
                aria-label={`Открыть: ${alt}`}
                onClick={() => setOpen(true)}
            >
                <img src={src} alt="" />
            </button>
            {open && (
                <Modal
                    key="modal"
                    title={alt}
                    initialFocusId={fullId}
                    onClose={() => setOpen(false)}
                >
                    <img id={fullId} className={styles.full} src={src} alt={alt} tabIndex={-1} />
                </Modal>
            )}
        </>
    );
}
