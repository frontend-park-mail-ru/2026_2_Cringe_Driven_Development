import type { NotebookSummary } from '@api/trpc';
import { clsx } from '@cdd-team/clsx';
import { Link } from '@cdd-team/router';
import { Icon } from '@components/Icon/Icon';
import { Python } from '@modules/python/Python';
import { timeAgo } from '@utils/date';
import { plural } from '@utils/plural';
import styles from './NotebookCard.module.css';

/** Свойства {@link NotebookCard}. */
interface NotebookCardProps {
    notebook: NotebookSummary;
}

/**
 * Свечение под курсором: координаты уходят в CSS-переменные карточки.
 * @param event движение указателя над карточкой
 */
function trackPointer(event: PointerEvent) {
    const card = event.currentTarget as HTMLElement;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    card.style.setProperty('--my', `${event.clientY - rect.top}px`);
}

/**
 * Карточка блокнота (Components → NotebookCard). Ведёт на страницу блокнота.
 * @param props свойства карточки
 * @returns карточка
 */
export function NotebookCard({ notebook }: NotebookCardProps) {
    const cells = plural(notebook.cells_count, 'ячейка', 'ячейки', 'ячеек');

    return (
        <Link
            to="/notebooks/$notebookId"
            params={{ notebookId: notebook.id }}
            className={styles.card}
            title={notebook.name}
            onPointerMove={trackPointer}
        >
            <div key="peek" className={styles.peek} aria-hidden="true">
                {notebook.preview_code === '' ? (
                    <p key="empty" className={styles.empty}>
                        Нет кода для превью
                    </p>
                ) : (
                    <pre key="code" className={styles.code}>
                        <Python key="code" source={notebook.preview_code} />
                    </pre>
                )}
            </div>
            <div key="body" className={styles.body}>
                <h2 key="title" className={styles.title}>
                    {notebook.name}
                </h2>
                <p key="meta" className={styles.meta}>
                    {`${cells} · изменён ${timeAgo(notebook.updated_at)}`}
                </p>
                {notebook.has_active_session && (
                    <p key="session" className={styles.session}>
                        <Icon key="icon" name="dot" size={12} />
                        <span key="label">Активная сессия</span>
                    </p>
                )}
            </div>
        </Link>
    );
}

/**
 * Карточка-скелетон, пока список загружается.
 * @returns скелетон карточки
 */
export function NotebookCardSkeleton() {
    return (
        <div className={clsx(styles.card, styles.skeleton)} aria-hidden="true">
            <div key="peek" className={styles.peek}>
                <span key="line-1" className={styles.bar} style={{ width: '200px' }} />
                <span key="line-2" className={styles.bar} style={{ width: '280px' }} />
                <span key="line-3" className={styles.bar} style={{ width: '160px' }} />
            </div>
            <div key="body" className={styles.body}>
                <span
                    key="title"
                    className={clsx(styles.bar, styles.titleBar)}
                    style={{ width: '240px' }}
                />
                <span key="meta" className={styles.bar} style={{ width: '120px' }} />
            </div>
        </div>
    );
}
