import { useMemo } from '@cdd-team/react';
import { clsx } from '@cdd-team/clsx';
import { splitByMarks, type SourceMark } from '@modules/search/marks';
import { markClass } from '@modules/search/Marked';
import { tokenizePython, type PyTokenType } from './tokenize';
import styles from './Python.module.css';

/** Свойства {@link Python}. */
interface PythonProps {
    /** Исходник ячейки: черновик или подтверждённый source */
    source: string;
    /** Совпадения поиска: фон под текстом, цвет токена сохраняется */
    marks?: readonly SourceMark[];
}

// Один пустой список на все ячейки без совпадений: разрезание по меткам не пересчитывается
const NO_MARKS: readonly SourceMark[] = [];

const TOKEN_CLASS: Record<PyTokenType, string | undefined> = {
    text: undefined,
    keyword: styles.keyword,
    string: styles.string,
    number: styles.number,
    comment: styles.comment,
    function: styles.function,
};

/**
 * Подсвеченный код Python: токены из {@link tokenizePython} — текстовыми узлами в `<span>`.
 * HTML из исходника не создаётся, текст узлов совпадает с исходником. Совпадения поиска — `<mark>`
 * внутри токенов: совпадение на стыке токенов — несколько `<mark>`.
 * Обёртку (`<pre>`) и цвет обычного текста задаёт место использования.
 * @param props исходник
 * @returns токены исходника
 */
export function Python({ source, marks = NO_MARKS }: PythonProps) {
    const tokens = useMemo(() => tokenizePython(source), [source]);
    // Каждый токен — <span>, и обычный текст тоже: при сдвиге токенов от ввода узлы на тех же
    // позициях обновляются, а не пересоздаются из-за смены текста на элемент
    const pieces = useMemo(
        () =>
            splitByMarks(
                tokens.map((token) => ({ text: token.text, data: token.type })),
                marks,
            ),
        [tokens, marks],
    );
    return (
        <>
            {pieces.map((piece, index) =>
                piece.mark ? (
                    <mark
                        key={index}
                        className={clsx(TOKEN_CLASS[piece.data], markClass(piece.mark))}
                        data-search-current={piece.mark === 'current' ? '' : undefined}
                    >
                        {piece.text}
                    </mark>
                ) : (
                    <span key={index} className={TOKEN_CLASS[piece.data]}>
                        {piece.text}
                    </span>
                ),
            )}
        </>
    );
}
