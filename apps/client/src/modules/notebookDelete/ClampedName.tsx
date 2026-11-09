import { clsx } from '@cdd-team/clsx';
import { useEffect, useRef, useState } from '@cdd-team/react';
import styles from './DeleteNotebookDialog.module.css';

/** Свойства {@link ClampedName}. */
interface ClampedNameProps {
    name: string;
}

/**
 * Название блокнота в две строки с многоточием. «Показать полностью» появляется только при
 * обрезке: раскрывает название и переводит на него фокус. Полный текст всегда в DOM.
 */
export function ClampedName({ name }: ClampedNameProps) {
    const ref = useRef<HTMLParagraphElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [clamped, setClamped] = useState(false);

    useEffect(() => {
        if (expanded) return;
        const measure = () => {
            const el = ref.current;
            if (el) setClamped(el.scrollHeight > el.clientHeight);
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [name, expanded]);

    const expand = () => {
        setExpanded(true);
        // фокус — после рендера: кнопка уже скрыта, название раскрыто
        requestAnimationFrame(() => ref.current?.focus());
    };

    return (
        <>
            <p
                key="name"
                ref={ref}
                className={clsx(styles.name, !expanded && styles.clamped)}
                tabIndex={-1}
            >
                {name}
            </p>
            {clamped && !expanded && (
                <button key="expand" type="button" className={styles.expand} onClick={expand}>
                    Показать полностью
                </button>
            )}
        </>
    );
}
