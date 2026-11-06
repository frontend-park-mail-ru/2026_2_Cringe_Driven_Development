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
 * Подсвеченный код Python: токены из {@link tokenizePython} — текстовыми узлами в `<span>`,
 * обычный текст — без обёртки. HTML из исходника не создаётся, текст узлов совпадает с исходником.
 * Обёртку (`<pre>`) и цвет обычного текста задаёт место использования.
 * @param props исходник
 * @returns токены исходника
 */
export function Python({ source }: PythonProps) {
    const tokens = useMemo(() => tokenizePython(source), [source]);
    // список перестраивается целиком на каждый ввод: ключ — позиция токена
    return (
        <>
            {tokens.map((token, index) => {
                const className = TOKEN_CLASS[token.type];
                return className ? (
                    <span key={index} className={className}>
                        {token.text}
                    </span>
                ) : (
                    token.text
                );
            })}
        </>
    );
}
