import { tokenizePython } from '@modules/python/tokenize';

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
export function indent(value: string, start: number, end: number): TextEdit {
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
export function outdent(value: string, start: number, end: number): TextEdit | null {
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

/**
 * Enter: перевод строки с отступом текущей строки, после строки на `:` — на отступ глубже.
 * Двоеточие в строке или комментарии не считается.
 * @param value текст поля
 * @param start начало выделения
 * @param end конец выделения
 * @returns правка поля
 */
export function newline(value: string, start: number, end: number): TextEdit {
    const before = value.slice(lineStart(value, start), start);
    let indentation = /^[ \t]*/.exec(before)![0];
    const code = tokenizePython(before).filter((token) => token.type !== 'comment');
    const last = code.at(-1);
    if (last?.type === 'text' && last.text.trimEnd().endsWith(':')) indentation += INDENT;
    const text = `\n${indentation}`;
    const caret = start + text.length;
    return { from: start, to: end, text, selectionStart: caret, selectionEnd: caret };
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
