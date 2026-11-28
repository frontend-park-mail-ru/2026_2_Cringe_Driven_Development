type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonResult = { ok: true; value: JsonValue } | { ok: false; message: string };

// Управляющие символы в JSON-строке допустимы только в экранированном виде.
// oxlint-disable-next-line no-control-regex
const quotedString = /"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/.source;
const jsonNumber = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.source;
const numberTokens = new RegExp(quotedString + '|(' + jsonNumber + ')', 'g');
const colon = /[ \t\n\r]*:/.source;
const brackets = /[{}[\]]/.source;
// строка (с двоеточием после неё — это имя поля) или границы объектов и массивов
const keyTokens = new RegExp('(' + quotedString + ')(' + colon + ')?|' + brackets, 'g');

/** Разбирает JSON, сохраняя его тип, и возвращает строку первой синтаксической ошибки. */
export function checkJson(text: string): JsonResult {
    let unsafeNumber = false;
    try {
        const value: JsonValue = JSON.parse(text, (_key, item: unknown) => {
            if (
                typeof item === 'number' &&
                (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item)))
            ) {
                unsafeNumber = true;
            }
            return item;
        });
        if (unsafeNumber) {
            return {
                ok: false,
                message: 'Слишком большое число: значение изменится при сохранении',
            };
        }
        if (hasRoundedNumber(text)) {
            return { ok: false, message: 'Число потеряет точность при сохранении' };
        }
        const repeated = repeatedKey(text);
        return repeated === undefined
            ? { ok: true, value }
            : { ok: false, message: 'Поле «' + repeated + '» повторяется: сохранится только одно' };
    } catch (error) {
        if (error instanceof RangeError) {
            return { ok: false, message: 'Слишком глубокая вложенность JSON' };
        }
        return { ok: false, message: syntaxMessage(text) };
    }
}

/** Убирает различия в записи одного десятичного числа перед сравнением. */
function normalizedDecimal(token: string): string {
    const [mantissa = '', exponent = '0'] = token.split(/[eE]/);
    const [whole = '', fraction = ''] = mantissa.split('.');
    const digits = (whole + fraction).replace(/^-?0*/, '');
    let end = digits.length;
    while (digits[end - 1] === '0') end -= 1;
    if (end === 0) return '0';
    const power = Number(exponent) - fraction.length + digits.length - end;
    return (token.startsWith('-') ? '-' : '') + digits.slice(0, end) + 'e' + power;
}

/** Сравнивает запись числа с тем, что попадёт в JSON запроса после разбора. */
function hasRoundedNumber(text: string): boolean {
    for (const [, token] of text.matchAll(numberTokens)) {
        if (token && normalizedDecimal(token) !== normalizedDecimal(String(Number(token)))) {
            return true;
        }
    }
    return false;
}

/** Первое повторное имя поля в одном объекте валидного JSON: разбор оставил бы только одно. */
function repeatedKey(text: string): string | undefined {
    const open: Set<string>[] = [];
    for (const [token, quoted, isName] of text.matchAll(keyTokens)) {
        if (token === '{' || token === '[') open.push(new Set());
        else if (token === '}' || token === ']') open.pop();
        else if (quoted && isName) {
            const key = String(JSON.parse(quoted));
            const keys = open.at(-1);
            if (keys?.has(key)) return key;
            keys?.add(key);
        }
    }
}

/** Определяет позицию ошибки по грамматике JSON независимо от текста исключения браузера. */
function syntaxMessage(text: string): string {
    const whitespace = /[ \t\n\r]*/y;
    const string = new RegExp(quotedString, 'y');
    const primitive = new RegExp('true|false|null|' + jsonNumber, 'y');
    let position = 0;
    let reason = '';

    function consume(token: string): boolean {
        if (text[position] !== token) return false;
        position += 1;
        return true;
    }

    function match(pattern: RegExp): boolean {
        pattern.lastIndex = position;
        if (!pattern.test(text)) return false;
        position = pattern.lastIndex;
        return true;
    }

    function fail(message: string): false {
        reason = message;
        return false;
    }

    function readSequence(close: ']' | '}', readItem: () => boolean): boolean {
        match(whitespace);
        if (consume(close)) return true;
        do {
            match(whitespace);
            if (!readItem()) return false;
            match(whitespace);
            if (consume(close)) return true;
        } while (consume(','));
        return fail('ожидалась запятая');
    }

    function readProperty(depth: number): boolean {
        if (text[position] !== '"') return fail('ожидалось имя поля в кавычках');
        if (!match(string)) return fail('недопустимая строка');
        match(whitespace);
        if (!consume(':')) return fail('ожидалось двоеточие');
        return readValue(depth);
    }

    function readValue(depth: number): boolean {
        match(whitespace);
        if (depth === 512) return fail('слишком глубокая вложенность');
        if (consume('{')) return readSequence('}', () => readProperty(depth + 1));
        if (consume('[')) return readSequence(']', () => readValue(depth + 1));
        if (text[position] === '"') return match(string) || fail('недопустимая строка');
        return match(primitive) || fail('ожидалось значение');
    }

    if (readValue(0)) {
        match(whitespace);
        reason = 'лишний текст после значения';
    }
    const line = text.slice(0, position).split('\n').length;
    return 'Невалидный JSON: строка ' + line + ' — ' + reason;
}
