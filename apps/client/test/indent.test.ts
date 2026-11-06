// Отступы в ячейке кода: Tab, Shift+Tab, Enter и Backspace. «|» — курсор, «[» и «]» — выделение.
import { expect, test } from 'bun:test';
import {
    backspace,
    indent,
    inPythonFence,
    newline,
    outdent,
    type TextEdit,
} from '@components/Cell/indent';

type Command = (value: string, start: number, end: number) => TextEdit | null;

// Текст с разметкой курсора → результат команды с той же разметкой; null — команда не сработала
function run(command: Command, marked: string): string | null {
    const caret = marked.indexOf('|');
    const start = caret >= 0 ? caret : marked.indexOf('[');
    const value = marked.replace(/[|[\]]/g, '');
    const end = caret >= 0 ? caret : marked.indexOf(']') - 1;
    const edit = command(value, start, end);
    if (!edit) return null;
    const result = value.slice(0, edit.from) + edit.text + value.slice(edit.to);
    if (edit.selectionStart === edit.selectionEnd)
        return `${result.slice(0, edit.selectionStart)}|${result.slice(edit.selectionStart)}`;
    return `${result.slice(0, edit.selectionStart)}[${result.slice(edit.selectionStart, edit.selectionEnd)}]${result.slice(edit.selectionEnd)}`;
}

test('Tab — пробелы до позиции, кратной 4', () => {
    expect(run(indent, '|x')).toBe('    |x');
    expect(run(indent, 'ab|c')).toBe('ab  |c');
    expect(run(indent, '    |')).toBe('        |');
    // выделение в одной строке заменяется отступом
    expect(run(indent, 'a[bc]d')).toBe('a   |d');
});

test('Tab с выделением нескольких строк сдвигает их', () => {
    expect(run(indent, 'de[f f():\n    retu]rn 1\nx')).toBe('    de[f f():\n        retu]rn 1\nx');
    // пустые строки не получают отступ; конец в начале строки её не захватывает
    expect(run(indent, '[a\n\nb\n]c')).toBe('[    a\n\n    b\n]c');
});

test('Shift+Tab снимает один отступ', () => {
    expect(run(outdent, '        re|turn')).toBe('    re|turn');
    expect(run(outdent, '  |x')).toBe('|x');
    expect(run(outdent, '\tx|')).toBe('x|');
    // курсор внутри снимаемого отступа остаётся в начале строки
    expect(run(outdent, '  |  x')).toBe('|x');
    expect(run(outdent, '[    a\n        b]')).toBe('[a\n    b]');
    // снимать нечего — правки нет, но Tab всё равно не уводит фокус (Cell)
    expect(run(outdent, 'x|')).toBeNull();
});

test('Enter сохраняет отступ и углубляет после двоеточия', () => {
    expect(run(newline, '    x = 1|')).toBe('    x = 1\n    |');
    expect(run(newline, 'def f():|')).toBe('def f():\n    |');
    expect(run(newline, '    if a:  # условие|')).toBe('    if a:  # условие\n        |');
    // двоеточие внутри строки не углубляет
    expect(run(newline, 's = "a:"|')).toBe('s = "a:"\n|');
    // перенос посреди строки: отступ — от начала строки до курсора
    expect(run(newline, '    a|b')).toBe('    a\n    |b');
    expect(run(newline, '  [sel]ected')).toBe('  \n  |ected');
});

// Enter в исходнике Markdown-ячейки, как в Cell
const markdown = (marked: string) =>
    run((value, start, end) => newline(value, start, end, inPythonFence(value, start)), marked);

test('Markdown: Enter углубляет отступ только в блоке Python', () => {
    expect(markdown('Пример:|')).toBe('Пример:\n|');
    expect(markdown('  - пункт|')).toBe('  - пункт\n  |');
    expect(markdown('```python\ndef f():|')).toBe('```python\ndef f():\n    |');
    expect(markdown('~~~ Py\nif x:|')).toBe('~~~ Py\nif x:\n    |');
    // другой язык, блок без языка и после закрытия — без углубления
    expect(markdown('```js\nif (x) {:|')).toBe('```js\nif (x) {:\n|');
    expect(markdown('```\nx:|')).toBe('```\nx:\n|');
    expect(markdown('```python\nx\n```\nИтог:|')).toBe('```python\nx\n```\nИтог:\n|');
    // закрывает только такой же маркер не короче открывающего
    expect(inPythonFence('````python\n```\nx', 16)).toBe(true);
    expect(inPythonFence('```python\n~~~\nx', 14)).toBe(true);
});

test('Backspace в начальных пробелах — до позиции, кратной 4', () => {
    expect(run(backspace, '        |x')).toBe('    |x');
    expect(run(backspace, '      |x')).toBe('    |x');
    expect(run(backspace, '  |')).toBe('|');
    // после кода и с выделением — обычное удаление
    expect(run(backspace, 'x   |')).toBeNull();
    expect(run(backspace, '[    ]x')).toBeNull();
    expect(run(backspace, '|x')).toBeNull();
});
