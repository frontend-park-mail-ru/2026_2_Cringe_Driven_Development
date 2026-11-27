import styles from './EmbedPreviewPage.module.css';

/** Нейтральная страница из `/embed/*` для проверки встраивания через `Iframe`. */
export function EmbedPreviewPage() {
    return (
        <div className={styles.page}>
            <h1 key="title" className={styles.title}>
                Встроенная страница
            </h1>
            <p key="text" className={styles.text}>
                Эта страница приложения открыта во фрейме. Здесь мог бы быть отчёт по блокноту
                «Анализ продаж».
            </p>
        </div>
    );
}
