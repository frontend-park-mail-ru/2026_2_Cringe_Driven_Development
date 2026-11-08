import { useMemo } from '@cdd-team/react';
import { NO_MARKS, splitByMarks, type SourceMark } from '@modules/search/marks';
import { MarkedPiece } from '@modules/search/Marked';
import { tokenizePython, type PyTokenType } from './tokenize';
import styles from './Python.module.css';

/** Свойства {@link Python}. */
interface PythonProps {
    /** Исходник ячейки: черновик или подтверждённый source */
    source: string;
    /** Совпадения поиска: фон под текстом; цвет токена — кроме текущего, у него свой */
    marks?: readonly SourceMark[];
}

/** Класс цвета по типу токена; у обычного текста класса нет */
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
 * на месте `<span>`: совпадение на стыке токенов — несколько `<mark>`.
 * Обёртку (`<pre>`) и цвет обычного текста задаёт место использования.
 */
export function Python({ source, marks = NO_MARKS }: PythonProps) {
    const tokens = useMemo(() => tokenizePython(source), [source]);
    /**
     * Куски токенов по совпадениям. Каждый токен — `<span>`, и обычный текст тоже: при сдвиге
     * токенов от ввода узлы на тех же позициях обновляются, а не пересоздаются из-за смены текста
     * на элемент
     */
    const pieces = useMemo(() => splitByMarks(tokens, marks), [tokens, marks]);
    return (
        <>
            {pieces.map((piece, index) => (
                <MarkedPiece
                    key={index}
                    piece={piece}
                    className={
                        piece.mark === 'current' ? undefined : TOKEN_CLASS[piece.segment.type]
                    }
                />
            ))}
        </>
    );
}
