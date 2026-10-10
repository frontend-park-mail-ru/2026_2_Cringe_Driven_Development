import type { NotebookSummary } from '@api/client';
import { clsx } from '@modules/clsx';
import { Link } from '@modules/router';
import { timeAgo } from '@utils/date';
import { plural } from '@utils/plural';
import styles from './NotebookCard.module.css';

/** Свойства {@link NotebookCard}. */
interface NotebookCardProps {
    notebook: NotebookSummary;
}

/**
 * Превью кода из макета (NotebookCard → State=Default). В списке блокнотов кода нет,
 * поэтому превью у всех карточек одно.
 */
const PREVIEW_CODE = `def step(w, grad, lr=0.01):
    return w - lr * grad

for epoch in range(200):
    w = step(w, loss_grad(w, X, y))`;

/** Части превью. */
const PREVIEW_PARTS = PREVIEW_CODE.split(/\b(def|return|for|in|\d+(?:\.\d+)?)\b/);

/**
 * Свечение под курсором: координаты уходят в CSS-переменные карточки.
 * @param {PointerEvent} event движение указателя над карточкой
 */
function trackPointer(event: PointerEvent) {
    const card = event.currentTarget as HTMLElement;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    card.style.setProperty('--my', `${event.clientY - rect.top}px`);
}

/**
 * Карточка блокнота (Components → NotebookCard). Ведёт на страницу блокнота.
 * @param {NotebookCardProps} props свойства карточки
 * @returns {JSX.Element} карточка
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
                <pre className={styles.code}>
                    {PREVIEW_PARTS.map((part, index) =>
                        index % 2 === 0 ? (
                            part
                        ) : (
                            <span
                                key={index}
                                className={/\d/.test(part) ? styles.number : styles.keyword}
                            >
                                {part}
                            </span>
                        ),
                    )}
                </pre>
            </div>
            <div key="body" className={styles.body}>
                <h2 key="title" className={styles.title}>
                    {notebook.name}
                </h2>
                <p key="meta" className={styles.meta}>
                    {`${cells} · изменён ${timeAgo(notebook.updated_at)}`}
                </p>
            </div>
        </Link>
    );
}

/**
 * Карточка-скелетон, пока список загружается.
 * @returns {JSX.Element} скелетон карточки
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
