import { clsx } from '@cdd-team/clsx';
import { embedSrc } from './embedSrc';
import styles from './Iframe.module.css';

/** Свойства {@link Iframe}. */
interface IframeProps {
    /** Локальный путь страницы из `/embed/*` */
    src: string;
    /** Название встроенной страницы для скринридера */
    title: string;
    className?: string;
}

/**
 * Встроенная страница приложения из `/embed/*` того же origin. Другой адрес не встраивается:
 * компонент ничего не показывает. Когда показывать, решает родитель.
 */
export function Iframe({ src, title, className }: IframeProps) {
    const url = embedSrc(src, location.origin);
    if (!url) return null;
    return (
        <iframe className={clsx(styles.iframe, className)} src={url} title={title} loading="lazy" />
    );
}
