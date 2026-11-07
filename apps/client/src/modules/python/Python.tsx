import { useMemo } from '@cdd-team/react';
import { tokenizePython, type PyTokenType } from './tokenize';
import styles from './Python.module.css';

/** Свойства {@link Python}. */
interface PythonProps {
    /** Исходник ячейки: черновик или подтверждённый source */
    source: string;
}

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
 * HTML из исходника не создаётся, текст узлов совпадает с исходником.
 * Обёртку (`<pre>`) и цвет обычного текста задаёт место использования.
 * @param props исходник
 * @returns токены исходника
 */
export function Python({ source }: PythonProps) {
    const tokens = useMemo(() => tokenizePython(source), [source]);
    // Каждый токен — <span>, и обычный текст тоже: при сдвиге токенов от ввода узлы на тех же
    // позициях обновляются, а не пересоздаются из-за смены текста на элемент
    return (
        <>
            {tokens.map((token, index) => (
                <span key={index} className={TOKEN_CLASS[token.type]}>
                    {token.text}
                </span>
            ))}
        </>
    );
}
