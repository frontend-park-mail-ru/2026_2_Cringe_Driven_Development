import { codeBlockAt } from '@modules/markdown/parse';
import { isPythonLang, tokenizePython } from '@modules/python/tokenize';

/** Отступ Python по PEP 8 */
const INDENT = '    ';

/** Правка поля: заменить `[from, to)` на `text` и поставить выделение. */
export interface TextEdit {
    from: number;
    to: number;
    text: string;
    selectionStart: number;
    selectionEnd: number;
}

const lineStart = (value: string, at: number): number => value.lastIndexOf('\n', at - 1) + 1;

const lineEnd = (value: string, at: number): number => {
    const end = value.indexOf('\n', at);
    return end < 0 ? value.length : end;
};

// Строки, которых касается выделение. Конец в начале следующей строки её не захватывает
function selectedLines(value: string, start: number, end: number): { from: number; to: number } {
    const last = end > start && lineStart(value, end) === end ? end - 1 : end;
    return { from: lineStart(value, start), to: lineEnd(value, last) };
}

// Новый текст строк `[from, to)`: change получает строку и позицию её начала в поле
function mapLines(
    value: string,
    lines: { from: number; to: number },
    change: (line: string, at: number) => string,
): string {
    let at = lines.from;
    return value
        .slice(lines.from, lines.to)
        .split('\n')
        .map((line) => {
            const result = change(line, at);
            at += line.length + 1;
            return result;
        })
        .join('\n');
}

// Сдвиг позиции после правки строк: shifts — [начало строки, изменение длины в её начале]
function mapPosition(position: number, shifts: [number, number][]): number {
    let result = position;
    for (const [start, delta] of shifts) {
        if (position <= start) break;
        // снятый отступ не уводит позицию левее начала строки
        result += delta < 0 ? -Math.min(-delta, position - start) : delta;
    }
    return result;
}

/**
 * Tab: без выделения нескольких строк — пробелы до следующей позиции, кратной 4, вместо
 * выделенного; при выделении нескольких строк — отступ каждой непустой строки.
 * @param value текст поля
 * @param start начало выделения
 * @param end конец выделения
 * @returns правка поля
 */
export function indentLines(value: string, start: number, end: number): TextEdit {
    if (!value.slice(start, end).includes('\n')) {
        const column = start - lineStart(value, start);
        const text = ' '.repeat(INDENT.length - (column % INDENT.length));
        const caret = start + text.length;
        return { from: start, to: end, text, selectionStart: caret, selectionEnd: caret };
    }
    const lines = selectedLines(value, start, end);
    const shifts: [number, number][] = [];
    const text = mapLines(value, lines, (line, at) => {
        if (!line) return line;
        shifts.push([at, INDENT.length]);
        return INDENT + line;
    });
    return {
        ...lines,
        text,
        selectionStart: mapPosition(start, shifts),
        selectionEnd: mapPosition(end, shifts),
    };
}

/**
 * Shift+Tab: снимает у строк выделения (или строки курсора) один отступ — до 4 пробелов или
 * табуляцию в начале.
 * @param value текст поля
 * @param start начало выделения
 * @param end конец выделения
 * @returns правка поля или null, если снимать нечего
 */
export function outdentLines(value: string, start: number, end: number): TextEdit | null {
    const lines = selectedLines(value, start, end);
    const shifts: [number, number][] = [];
    const text = mapLines(value, lines, (line, at) => {
        const removed = line.startsWith('\t') ? 1 : /^ {0,4}/.exec(line)![0].length;
        if (removed) shifts.push([at, -removed]);
        return line.slice(removed);
    });
    if (!shifts.length) return null;
    return {
        ...lines,
        text,
        selectionStart: mapPosition(start, shifts),
        selectionEnd: mapPosition(end, shifts),
    };
}

/** Python-код перед курсором: префикс строки до кода и код от его начала до курсора. */
export interface PythonBefore {
    /** Префиксы цитат и отступ пункта списка Markdown; в ячейке кода — пусто */
    prefix: string;
    code: string;
}

/**
 * Python-код перед курсором. В Markdown — только внутри блока ```python (```py, ~~~python3), в том
 * числе в цитате и пункте списка: блоки — по правилам parseMarkdown.
 * @param value текст поля
 * @param at позиция курсора
 * @param markdown поле — исходник Markdown
 * @returns код перед курсором или null, если курсор не в коде Python
 */
export function pythonBefore(value: string, at: number, markdown: boolean): PythonBefore | null {
    if (!markdown) return { prefix: '', code: value.slice(0, at) };
    const block = codeBlockAt(value, at);
    return block && isPythonLang(block.lang) ? { prefix: block.prefix, code: block.before } : null;
}

/**
 * Enter: перевод строки с отступом текущей строки. В коде Python после строки на `:` — на отступ
 * глубже. Код токенизируется от начала, поэтому двоеточие в строке (и многострочной) или
 * комментарии не считается.
 * @param value текст поля
 * @param start начало выделения
 * @param end конец выделения
 * @param python код Python перед курсором или null — курсор не в коде
 * @returns правка поля
 */
export function newline(
    value: string,
    start: number,
    end: number,
    python: PythonBefore | null,
): TextEdit {
    let indentation: string;
    if (python) {
        const { prefix, code } = python;
        const from = code.lastIndexOf('\n') + 1;
        indentation = prefix + /^[ \t]*/.exec(code.slice(from))![0];
        if (endsWithColon(code, from)) indentation += INDENT;
    } else indentation = /^[ \t]*/.exec(value.slice(lineStart(value, start), start))![0];
    const text = `\n${indentation}`;
    const caret = start + text.length;
    return { from: start, to: end, text, selectionStart: caret, selectionEnd: caret };
}

// Последний значимый символ кода — `:` вне строк и комментариев, и стоит он не раньше from
function endsWithColon(code: string, from: number): boolean {
    let colon = false;
    let offset = 0;
    for (const token of tokenizePython(code)) {
        const significant = token.text.trimEnd();
        if (token.type !== 'comment' && significant.trim())
            colon =
                token.type === 'text' &&
                significant.endsWith(':') &&
                offset + significant.length > from;
        offset += token.text.length;
    }
    return colon;
}

/**
 * Backspace в начальных пробелах строки: удаляет их до предыдущей позиции, кратной 4.
 * @param value текст поля
 * @param start начало выделения
 * @param end конец выделения
 * @returns правка поля или null — обычное удаление
 */
export function backspace(value: string, start: number, end: number): TextEdit | null {
    if (start !== end) return null;
    const before = value.slice(lineStart(value, start), start);
    if (!/^ +$/.test(before)) return null;
    const from = start - (before.length % INDENT.length || INDENT.length);
    return { from, to: start, text: '', selectionStart: from, selectionEnd: from };
}
