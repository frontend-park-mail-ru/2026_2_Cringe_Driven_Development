// Подсветка Python: категории токенов по макету, f-строка целиком и точный исходник.
import { expect, test } from 'bun:test';
import { tokenizePython, type PyToken } from '@modules/python/tokenize';

const join = (tokens: PyToken[]) => tokens.map((token) => token.text).join('');
const pick = (source: string, type: PyToken['type']) =>
    tokenizePython(source)
        .filter((token) => token.type === type)
        .map((token) => token.text);

test('ключевые слова, имена функций, числа и комментарии', () => {
    expect(tokenizePython('def step(w, lr=0.01):\n    return w - lr  # шаг')).toEqual([
        { type: 'keyword', text: 'def' },
        { type: 'text', text: ' ' },
        { type: 'function', text: 'step' },
        { type: 'text', text: '(w, lr=' },
        { type: 'number', text: '0.01' },
        { type: 'text', text: '):\n    ' },
        { type: 'keyword', text: 'return' },
        { type: 'text', text: ' w - lr  ' },
        { type: 'comment', text: '# шаг' },
    ]);
    expect(pick('import numpy as np\nfor epoch in range(200): pass', 'keyword')).toEqual([
        'import',
        'as',
        'for',
        'in',
        'pass',
    ]);
    // вызов функции и встроенные имена — обычный текст
    expect(pick('w = step(w, loss_grad(w, X, y))\nprint(w)', 'function')).toEqual([]);
    expect(pick('async def load(): ...', 'function')).toEqual(['load']);
    // мягкие ключевые слова зависят от контекста: не подсвечиваются
    expect(pick('match = case = type = 1', 'keyword')).toEqual([]);
});

test('числа Python 3.13', () => {
    expect(pick('a = 1_000 + 0x_ff + 0o17 + 0b1010 + 1.5e-3 + .5 + 1. + 3j', 'number')).toEqual([
        '1_000',
        '0x_ff',
        '0o17',
        '0b1010',
        '1.5e-3',
        '.5',
        '1.',
        '3j',
    ]);
    // цифры внутри имени — часть имени
    expect(pick('x1 = shape[1]', 'number')).toEqual(['1']);
});

test('строки с префиксами, тройные и экранирование', () => {
    expect(pick(`a = "x" + 'y' + r"\\d" + b'z' + Rb"q" + u"t"`, 'string')).toEqual([
        '"x"',
        "'y'",
        'r"\\d"',
        "b'z'",
        'Rb"q"',
        'u"t"',
    ]);
    expect(pick('s = "a\\"b" + "c"', 'string')).toEqual(['"a\\"b"', '"c"']);
    expect(pick('doc = """первая\n# не комментарий\n"""\nx = 1', 'string')).toEqual([
        '"""первая\n# не комментарий\n"""',
    ]);
    expect(pick('s = "# не комментарий"', 'comment')).toEqual([]);
    // перенос строки после обратной косой черты продолжает строку
    expect(pick('s = "a\\\nb"', 'string')).toEqual(['"a\\\nb"']);
    // имя перед кавычкой, не префикс: отдельный текст
    expect(pick('xf"a"', 'string')).toEqual(['"a"']);
});

test('f-строка — один токен строки целиком', () => {
    const source = 'print(f"Результат: {value + 1:.2f}")';
    expect(tokenizePython(source)).toEqual([
        { type: 'text', text: 'print(' },
        { type: 'string', text: 'f"Результат: {value + 1:.2f}"' },
        { type: 'text', text: ')' },
    ]);
    expect(pick('print(f"MSE = {mse:.4f}")', 'string')).toEqual(['f"MSE = {mse:.4f}"']);
    expect(pick(`F'{x!r}' + rf"{y}\\d" + fR'{{z}}'`, 'string')).toEqual([
        "F'{x!r}'",
        'rf"{y}\\d"',
        "fR'{{z}}'",
    ]);
    // Python 3.12+: те же кавычки и вложенная f-строка внутри выражения
    expect(pick('f"{d["k"]} {f\'{x}\'}" + 1', 'string')).toEqual(['f"{d["k"]} {f\'{x}\'}"']);
    expect(pick('f"{a:{width}}" + 1', 'string')).toEqual(['f"{a:{width}}"']);
    expect(pick('f"""итог\n{loss:.3f}\n""" + 1', 'string')).toEqual(['f"""итог\n{loss:.3f}\n"""']);
});

test('спецификатор и комментарии в поле f-строки', () => {
    // кавычка-заполнитель в спецификаторе — символ, не начало строки
    expect(tokenizePython(`f"{x:'^10}" + y\nz = 1`)).toEqual([
        { type: 'string', text: `f"{x:'^10}"` },
        { type: 'text', text: ' + y\nz = ' },
        { type: 'number', text: '1' },
    ]);
    expect(pick(`f"{x!r:>{w}}" + 1`, 'string')).toEqual([`f"{x!r:>{w}}"`]);
    // двоеточие внутри скобок выражения — не спецификатор
    expect(pick(`f"{a[1:'x']}" + 1`, 'string')).toEqual([`f"{a[1:'x']}"`]);
    // кавычка внешней строки закрывает её и посреди спецификатора
    expect(pick(`f"{x:"\ny = 1`, 'string')).toEqual([`f"{x:"`]);
    // комментарий в многострочном поле тройной f-строки (Python 3.12+)
    expect(pick(`f"""{x # it's\n}""" + 1`, 'string')).toEqual([`f"""{x # it's\n}"""`]);
    // кавычки в комментарии — не начало вложенной строки
    expect(tokenizePython('s = f"""{value # """ in comment\n}"""\nx = 1')).toEqual([
        { type: 'text', text: 's = ' },
        { type: 'string', text: 'f"""{value # """ in comment\n}"""' },
        { type: 'text', text: '\nx = ' },
        { type: 'number', text: '1' },
    ]);
});

test('глубокая вложенность f-строк не переполняет стек', () => {
    for (const source of [
        'f"{'.repeat(30_000),
        `f"{x:{`.repeat(20_000),
        'f\'{f"{'.repeat(15_000),
        // закрытая вложенность в пределах лимита ячейки: 65 001 байт
        'f"{'.repeat(13_000) + 'x' + '}"'.repeat(13_000),
    ]) {
        const tokens = tokenizePython(source);
        expect(join(tokens)).toBe(source);
    }
});

test('незавершённый ввод не теряет текст и не красит строкой весь код ниже', () => {
    expect(tokenizePython('s = "открыта\nx = 1')).toEqual([
        { type: 'text', text: 's = ' },
        { type: 'string', text: '"открыта' },
        { type: 'text', text: '\nx = ' },
        { type: 'number', text: '1' },
    ]);
    expect(pick('f"{value + \nx = 1', 'string')).toEqual(['f"{value + ']);
    expect(pick('f"{', 'string')).toEqual(['f"{']);
    expect(pick('s = """до конца\nx = 1', 'string')).toEqual(['"""до конца\nx = 1']);
    expect(pick('s = "\\', 'string')).toEqual(['"\\']);
    expect(pick('def ', 'function')).toEqual([]);
    expect(pick('def\nstep = 1', 'function')).toEqual([]);
});

test('HTML-подобный текст остаётся текстом токена', () => {
    const source = 's = "<img src=x onerror=alert(1)>"  # <script>alert(1)</script>';
    const tokens = tokenizePython(source);
    expect(tokens.map((token) => token.type)).toEqual(['text', 'string', 'text', 'comment']);
    expect(join(tokens)).toBe(source);
});

test('склейка токенов всегда равна исходнику', () => {
    const samples = [
        '',
        '\n\n',
        '\t\tx\r\n',
        'def loss_grad(w, X, y):\n    err = X @ w - y\n    return 2 * X.T @ err / len(y)\n',
        'f"{',
        'f"{x["',
        "rb'\\",
        '0x 1e 1_ 0b2 ..5 1..2',
        'λ = π * 2 # 🚀',
        '"""',
        "'''a''' '''",
        '@decorator\nclass A(B, metaclass=M): ...',
    ];
    for (const source of samples) expect(join(tokenizePython(source))).toBe(source);

    // случайный ввод из символов, на которых меняется состояние разбора
    const alphabet = [
        'f',
        'r',
        'b',
        'def',
        ' ',
        '\n',
        '"',
        "'",
        '"""',
        '{',
        '}',
        '#',
        '\\',
        '1',
        '.',
        'x',
        '(',
        ')',
        'e',
        '_',
    ];
    let seed = 1;
    const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (let run = 0; run < 2000; run++) {
        let source = '';
        const length = Math.floor(random() * 40);
        for (let i = 0; i < length; i++) source += alphabet[Math.floor(random() * alphabet.length)];
        const tokens = tokenizePython(source);
        expect(join(tokens)).toBe(source);
        expect(tokens.every((token) => token.text.length > 0)).toBe(true);
    }
});
