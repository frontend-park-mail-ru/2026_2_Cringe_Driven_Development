// Отступы в ячейке кода: Tab, Shift+Tab, Enter и Backspace. «|» — курсор, «[» и «]» — выделение.
import { expect, test } from 'bun:test';
import {
    backspace,
    indentLines,
    newline,
    outdentLines,
    pythonBefore,
    type TextEdit,
} from '@components/Cell/indentation';

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
    expect(run(indentLines, '|x')).toBe('    |x');
    expect(run(indentLines, 'ab|c')).toBe('ab  |c');
    expect(run(indentLines, '    |')).toBe('        |');
    // колонка — визуальная: табуляция шириной до позиции, кратной 4
    expect(run(indentLines, '\t|print(1)')).toBe('\t    |print(1)');
    expect(run(indentLines, '\t  |x')).toBe('\t    |x');
    expect(run(indentLines, 'ab\t|x')).toBe('ab\t    |x');
    // начало поля, за которым пустая строка
    expect(run(indentLines, '|\nprint(1)')).toBe('    |\nprint(1)');
    // выделение в одной строке заменяется отступом
    expect(run(indentLines, 'a[bc]d')).toBe('a   |d');
});

test('Tab с выделением нескольких строк сдвигает их', () => {
    expect(run(indentLines, 'de[f f():\n    retu]rn 1\nx')).toBe(
        '    de[f f():\n        retu]rn 1\nx',
    );
    // пустые строки не получают отступ; конец в начале строки её не захватывает
    expect(run(indentLines, '[a\n\nb\n]c')).toBe('[    a\n\n    b\n]c');
});

test('Shift+Tab снимает один отступ', () => {
    expect(run(outdentLines, '        re|turn')).toBe('    re|turn');
    expect(run(outdentLines, '  |x')).toBe('|x');
    expect(run(outdentLines, '\tx|')).toBe('x|');
    // курсор внутри снимаемого отступа остаётся в начале строки
    expect(run(outdentLines, '  |  x')).toBe('|x');
    expect(run(outdentLines, '[    a\n        b]')).toBe('[a\n    b]');
    // снимать нечего — правки нет, но Tab всё равно не уводит фокус (Cell)
    expect(run(outdentLines, 'x|')).toBeNull();
});

// Enter, как в Cell: в ячейке кода и в исходнике Markdown-ячейки
const code = (marked: string) =>
    run(
        (value, start, end) => newline(value, start, end, pythonBefore(value, start, false)),
        marked,
    );
const markdown = (marked: string) =>
    run(
        (value, start, end) => newline(value, start, end, pythonBefore(value, start, true)),
        marked,
    );

test('Enter сохраняет отступ и углубляет после двоеточия', () => {
    expect(code('    x = 1|')).toBe('    x = 1\n    |');
    expect(code('def f():|')).toBe('def f():\n    |');
    expect(code('    if a:  # условие|')).toBe('    if a:  # условие\n        |');
    // двоеточие внутри строки не углубляет
    expect(code('s = "a:"|')).toBe('s = "a:"\n|');
    // перенос посреди строки: отступ — от начала строки до курсора
    expect(code('    a|b')).toBe('    a\n    |b');
    expect(code('  [sel]ected')).toBe('  \n  |ected');
    // двоеточие предыдущей строки не углубляет пустую
    expect(code('if a:\n|')).toBe('if a:\n\n|');
});

test('Enter: двоеточие в многострочной строке — не код', () => {
    expect(code('x = """text:\ninside:|')).toBe('x = """text:\ninside:\n|');
    expect(code('x = """a\n  b""" if c else {\n  1:|')).toBe(
        'x = """a\n  b""" if c else {\n  1:\n      |',
    );
    expect(code("f'''{x}\n:'''|")).toBe("f'''{x}\n:'''\n|");
});

test('Markdown: Enter углубляет отступ только в блоке Python', () => {
    expect(markdown('Пример:|')).toBe('Пример:\n|');
    expect(markdown('  - пункт|')).toBe('  - пункт\n  |');
    expect(markdown('```python\ndef f():|')).toBe('```python\ndef f():\n    |');
    expect(markdown('~~~ Py\nif x:|')).toBe('~~~ Py\nif x:\n    |');
    expect(markdown('```python\ns = """a\nb:|')).toBe('```python\ns = """a\nb:\n|');
    // другой язык, блок без языка и после закрытия — без углубления
    expect(markdown('```js\nif (x) {:|')).toBe('```js\nif (x) {:\n|');
    expect(markdown('```\nx:|')).toBe('```\nx:\n|');
    expect(markdown('```python\nx\n```\nИтог:|')).toBe('```python\nx\n```\nИтог:\n|');
    // закрывает только такой же маркер не короче открывающего
    expect(markdown('````python\n```\nif x:|')).toBe('````python\n```\nif x:\n    |');
    expect(markdown('```python\n~~~\nif x:|')).toBe('```python\n~~~\nif x:\n    |');
    // «```python```» — inline-code, блок не открывает
    expect(markdown('```python```\nif x:|')).toBe('```python```\nif x:\n|');
});

test('Markdown: блок Python в цитате и пункте списка', () => {
    // префикс цитаты переносится, иначе строка выйдет из цитаты
    expect(markdown('> ```python\n> if x:|')).toBe('> ```python\n> if x:\n>     |');
    expect(markdown('> ```python\n>     y = 1|')).toBe('> ```python\n>     y = 1\n>     |');
    expect(markdown('10. item\n    ```python\n    if x:|')).toBe(
        '10. item\n    ```python\n    if x:\n        |',
    );
    expect(markdown('- ```python\n  for i in a:|')).toBe('- ```python\n  for i in a:\n      |');
    // блок в цитате закрыт — дальше не код
    expect(markdown('> ```python\n> x\n> ```\n> Итог:|')).toBe(
        '> ```python\n> x\n> ```\n> Итог:\n|',
    );
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
