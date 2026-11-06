/** Категория токена Python: цвет из макета (`code/*`) */
export type PyTokenType = 'text' | 'keyword' | 'string' | 'number' | 'comment' | 'function';

/**
 * Язык блока кода в Markdown — Python. Подсветка — только при явно названном языке, как в Jupyter.
 * @param lang первое слово после открывающих ``` или undefined
 * @returns `python`, `python3` или `py` в любом регистре
 */
export function isPythonLang(lang: string | undefined): boolean {
    return lang !== undefined && /^(?:python3?|py)$/i.test(lang);
}

/** Отрезок исходника одной категории. */
export interface PyToken {
    type: PyTokenType;
    text: string;
}

// Жёсткие ключевые слова Python 3.13. Мягкие (match, case, type, _) зависят от контекста: обычный текст
const KEYWORDS = new Set([
    'False',
    'None',
    'True',
    'and',
    'as',
    'assert',
    'async',
    'await',
    'break',
    'class',
    'continue',
    'def',
    'del',
    'elif',
    'else',
    'except',
    'finally',
    'for',
    'from',
    'global',
    'if',
    'import',
    'in',
    'is',
    'lambda',
    'nonlocal',
    'not',
    'or',
    'pass',
    'raise',
    'return',
    'try',
    'while',
    'with',
    'yield',
]);

const STRING_PREFIXES = new Set(['r', 'u', 'b', 'br', 'rb', 'f', 'fr', 'rf']);

const IDENTIFIER = /[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}]*/uy;
const NUMBER =
    /(?:0[xX](?:_?[\da-fA-F])+|0[oO](?:_?[0-7])+|0[bB](?:_?[01])+|(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?[jJ]?)/y;
const SPACE = /[ \t\f]*/y;

const matchAt = (pattern: RegExp, source: string, at: number): string | null => {
    pattern.lastIndex = at;
    return pattern.exec(source)?.[0] ?? null;
};

const isQuote = (char: string | undefined): boolean => char === '"' || char === "'";

// Глубже вложенные f-строки и поля разбираются как обычный текст строки: рекурсия не переполнит стек
const MAX_NESTING = 32;

/**
 * Конец строкового литерала, открытого в `at` (сразу после префикса). Незакрытая однострочная
 * строка кончается на переводе строки, тройная — в конце исходника.
 */
function stringEnd(source: string, at: number, formatted: boolean, nesting = 0): number {
    const quote = source.startsWith(source[at]!.repeat(3), at)
        ? source[at]!.repeat(3)
        : source[at]!;
    const fields = formatted && nesting < MAX_NESTING;
    let i = at + quote.length;
    while (i < source.length) {
        const char = source[i]!;
        if (char === '\\') {
            i += 2;
            continue;
        }
        if (quote.length === 1 && char === '\n') return i;
        if (source.startsWith(quote, i)) return i + quote.length;
        if (fields && char === '{') {
            if (source[i + 1] === '{') {
                i += 2;
                continue;
            }
            i = fieldEnd(source, i + 1, quote, nesting + 1);
            continue;
        }
        i++;
    }
    return source.length;
}

/**
 * Конец поля замены f-строки после `{`. В выражении бывают вложенные скобки, комментарии и строки
 * с теми же кавычками (Python 3.12+); после `:` верхнего уровня — спецификатор, где кавычки — просто
 * символы, а `{}` — вложенные поля. Для однострочной f-строки перевод строки обрывает поле —
 * незаконченный ввод не окрашивает строкой весь код ниже.
 */
function fieldEnd(source: string, at: number, quote: string, nesting: number): number {
    const single = quote.length === 1;
    let depth = 1;
    let spec = false;
    let i = at;
    while (i < source.length) {
        const char = source[i]!;
        if (single && char === '\n') return i;
        if (spec) {
            // кавычка внешней строки закрывает её и посреди спецификатора
            if (source.startsWith(quote, i) || char === '}') return char === '}' ? i + 1 : i;
            if (char === '{' && nesting < MAX_NESTING) {
                i = fieldEnd(source, i + 1, quote, nesting + 1);
                continue;
            }
            i++;
            continue;
        }
        if (isQuote(char)) {
            i = stringEnd(source, i, false);
            continue;
        }
        if (char === '#' && !single) {
            const end = source.indexOf('\n', i);
            i = end < 0 ? source.length : end;
            continue;
        }
        const name = matchAt(IDENTIFIER, source, i);
        if (name) {
            const end = i + name.length;
            // вложенная строка с префиксом: f"{f'{x}'}"
            const prefixed = STRING_PREFIXES.has(name.toLowerCase()) && isQuote(source[end]);
            i = prefixed ? stringEnd(source, end, isFormatPrefix(name), nesting) : end;
            continue;
        }
        if (char === ':' && depth === 1) spec = true;
        else if (char === '{' || char === '[' || char === '(') depth++;
        else if (char === '}' || char === ']' || char === ')') {
            depth--;
            if (depth === 0) return i + 1;
        }
        i++;
    }
    return source.length;
}

const isFormatPrefix = (prefix: string): boolean => {
    const lower = prefix.toLowerCase();
    return STRING_PREFIXES.has(lower) && lower.includes('f');
};

/**
 * Разбор исходника Python на токены для подсветки. Склейка текстов токенов всегда равна
 * исходнику: незавершённый или ошибочный код не теряет символов. Ничего не вычисляет.
 * f-строка — один токен строки целиком, с префиксом и выражениями.
 * @param source исходник ячейки
 * @returns токены по порядку
 */
export function tokenizePython(source: string): PyToken[] {
    const tokens: PyToken[] = [];
    const push = (type: PyTokenType, text: string) => {
        const last = tokens.at(-1);
        if (last && last.type === type) last.text += text;
        else tokens.push({ type, text });
    };
    // после def следующее имя — объявляемая функция
    let afterDef = false;
    let i = 0;
    while (i < source.length) {
        const char = source[i]!;

        if (char === '#') {
            const end = source.indexOf('\n', i);
            const stop = end < 0 ? source.length : end;
            push('comment', source.slice(i, stop));
            i = stop;
            continue;
        }

        if (isQuote(char)) {
            const end = stringEnd(source, i, false);
            push('string', source.slice(i, end));
            afterDef = false;
            i = end;
            continue;
        }

        const name = matchAt(IDENTIFIER, source, i);
        if (name) {
            const end = i + name.length;
            if (STRING_PREFIXES.has(name.toLowerCase()) && isQuote(source[end])) {
                const stop = stringEnd(source, end, isFormatPrefix(name));
                push('string', source.slice(i, stop));
                afterDef = false;
                i = stop;
                continue;
            }
            if (KEYWORDS.has(name)) push('keyword', name);
            else push(afterDef ? 'function' : 'text', name);
            afterDef = name === 'def';
            i = end;
            continue;
        }

        // имя с цифрами целиком разобрано выше: здесь число не продолжает идентификатор
        const number = matchAt(NUMBER, source, i);
        if (number) {
            push('number', number);
            afterDef = false;
            i += number.length;
            continue;
        }

        const space = matchAt(SPACE, source, i);
        if (space) {
            push('text', space);
            i += space.length;
            continue;
        }

        push('text', char);
        afterDef = false;
        i++;
    }
    return tokens;
}
