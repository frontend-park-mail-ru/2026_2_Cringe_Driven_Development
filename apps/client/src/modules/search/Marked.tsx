import { clsx } from '@cdd-team/clsx';
import { splitByMarks, type Piece, type SourceMark } from './marks';
import styles from './Marked.module.css';

/** Селектор текущего совпадения (атрибут `data-search-current`): к нему прокручивает страница. */
export const CURRENT_SELECTOR = '[data-search-current]';

/** Свойства {@link MarkedPiece}. */
interface MarkedPieceProps {
    piece: Piece<unknown>;
    className?: string;
}

/**
 * Кусок текста: внутри совпадения — `<mark>`, вне — `<span>`. Текст — текстовым узлом.
 * @param props кусок и класс места использования
 * @returns элемент куска
 */
export function MarkedPiece({ piece, className }: MarkedPieceProps) {
    if (!piece.mark) return <span className={className}>{piece.text}</span>;
    return (
        <mark
            className={clsx(className, styles[piece.mark])}
            data-search-current={piece.mark === 'current' ? '' : undefined}
        >
            {piece.text}
        </mark>
    );
}

/** Свойства {@link Marked}. */
interface MarkedProps {
    /** Текст: черновик или подтверждённый source */
    text: string;
    marks: readonly SourceMark[];
}

/**
 * Обычный текст с совпадениями поиска в `<mark>`.
 * @param props текст и совпадения
 * @returns куски текста
 */
export function Marked({ text, marks }: MarkedProps) {
    if (marks.length === 0) return <>{text}</>;
    return (
        <>
            {splitByMarks([{ text }], marks).map((piece, index) => (
                <MarkedPiece key={index} piece={piece} />
            ))}
        </>
    );
}
