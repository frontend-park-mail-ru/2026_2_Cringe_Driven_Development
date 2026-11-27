import { embedSrc } from './embedSrc';
import styles from './Iframe.module.css';

/** Свойства {@link Iframe}. */
interface IframeProps {
    /** Локальный путь страницы из `/embed/*` */
    src: string;
    /** Название встроенной страницы для скринридера */
    title: string;
}

/**
 * Встроенная страница приложения из `/embed/*` того же origin. Другой адрес не встраивается:
 * компонент ничего не показывает. Когда показывать, решает родитель.
 */
export function Iframe({ src, title }: IframeProps) {
    const url = embedSrc(src, location.origin);
    if (!url) return null;
    return <iframe className={styles.iframe} src={url} title={title} />;
}
