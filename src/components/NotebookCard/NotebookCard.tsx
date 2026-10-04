import type { NotebookSummary } from '@api/client';
import { Link } from '@modules/router';
import { timeAgo } from '@utils/date';
import { plural } from '@utils/plural';
import './NotebookCard.css';

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
            className="notebook-card"
            title={notebook.name}
            onPointerMove={trackPointer}
        >
            <div key="peek" className="notebook-card__peek" aria-hidden="true" />
            <div key="body" className="notebook-card__body">
                <h2 key="title" className="notebook-card__title">
                    {notebook.name}
                </h2>
                <p key="meta" className="notebook-card__meta">
                    {`${cells} · изменён ${timeAgo(notebook.updated_at)}`}
                </p>
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
        <div className="notebook-card notebook-card--skeleton" aria-hidden="true">
            <div key="peek" className="notebook-card__peek">
                <span key="line-1" className="notebook-card__bar" style={{ width: '200px' }} />
                <span key="line-2" className="notebook-card__bar" style={{ width: '280px' }} />
                <span key="line-3" className="notebook-card__bar" style={{ width: '160px' }} />
            </div>
            <div key="body" className="notebook-card__body">
                <span
                    key="title"
                    className="notebook-card__bar notebook-card__bar--title"
                    style={{ width: '240px' }}
                />
                <span key="meta" className="notebook-card__bar" style={{ width: '120px' }} />
            </div>
        </div>
    );
}
