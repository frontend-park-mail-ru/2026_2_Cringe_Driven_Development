import type { Cell as CellData } from '@api/client';
import { clsx } from '@modules/clsx';
import './Cell.css';

/** Свойства {@link Cell}. */
interface CellProps {
    cell: CellData;
}

/**
 * Ячейка блокнота (Components → Cell). Пустая показывает подсказку.
 * @param props свойства ячейки
 * @returns ячейка
 */
export function Cell({ cell }: CellProps) {
    const isCode = cell.kind === 'code';
    const placeholder = isCode ? '# Код на Python' : 'Заголовок или описание — Markdown';

    return (
        <div id={cellDomId(cell.id)} className={clsx('cell', { 'cell--code': isCode })}>
            {cell.source === '' ? (
                <p className="cell__content cell__content--empty">{placeholder}</p>
            ) : (
                <pre className="cell__content">{cell.source}</pre>
            )}
        </div>
    );
}

/**
 * Id элемента ячейки: по нему страница прокручивает к новой ячейке.
 * @param id id ячейки внутри блокнота
 * @returns id элемента
 */
export function cellDomId(id: string): string {
    return `cell-${id}`;
}

/**
 * Ячейка-скелетон, пока блокнот загружается.
 * @returns скелетон ячейки
 */
export function CellSkeleton() {
    return (
        <div className="cell cell--skeleton" aria-hidden="true">
            <span key="line-1" className="cell__bar" style={{ width: '420px' }} />
            <span key="line-2" className="cell__bar" style={{ width: '280px' }} />
        </div>
    );
}
