import { splitByMarks, type Piece, type SourceMark } from './marks';
import styles from './Marked.module.css';

/** Селектор текущего совпадения (атрибут `data-search-current`): к нему прокручивает страница. */
export const CURRENT_SELECTOR = '[data-search-current]';

/**
 * Класс совпадения для `<mark>`.
 * @param mark метка куска
 * @returns класс или undefined вне совпадения
 */
export function markClass(mark: Piece<unknown>['mark']): string | undefined {
    return mark && styles[mark];
}

/** Свойства {@link Marked}. */
interface MarkedProps {
    /** Текст: черновик или подтверждённый source */
    text: string;
    marks: readonly SourceMark[];
}

/**
 * Обычный текст с совпадениями поиска в `<mark>`. Текст — только текстовыми узлами.
 * @param props текст и совпадения
 * @returns куски текста
 */
export function Marked({ text, marks }: MarkedProps) {
    if (marks.length === 0) return <>{text}</>;
    return (
        <>
            {splitByMarks([{ text, data: undefined }], marks).map((piece, index) =>
                piece.mark ? (
                    <mark
                        key={index}
                        className={markClass(piece.mark)}
                        data-search-current={piece.mark === 'current' ? '' : undefined}
                    >
                        {piece.text}
                    </mark>
                ) : (
                    <span key={index}>{piece.text}</span>
                ),
            )}
        </>
    );
}
