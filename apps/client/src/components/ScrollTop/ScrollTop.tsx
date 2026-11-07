import { createPortal, useEffect, useState } from '@cdd-team/react';
import { IconButton } from '@components/IconButton/IconButton';
import styles from './ScrollTop.module.css';

// Показывать, когда страница прокручена хотя бы на один экран
const visible = (): boolean => window.scrollY >= window.innerHeight;

const toTop = (): void => {
    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: instant ? 'instant' : 'smooth' });
};

/**
 * Кнопка «Наверх» справа снизу: появляется после прокрутки на один экран. Рисуется порталом в
 * `body`, чтобы `position: fixed` не зависел от трансформаций и слоёв страницы.
 * @returns портал с кнопкой или ничего
 */
export function ScrollTop() {
    const [shown, setShown] = useState(false);
    useEffect(() => {
        const update = () => setShown(visible());
        update();
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
        };
    }, []);
    if (!shown) return null;
    return createPortal(
        <IconButton icon="up" label="Наверх" className={styles.button} onClick={toTop} />,
        document.body,
    );
}
