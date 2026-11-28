/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { checkJson } from '../src/keys/json';

test('every JSON type keeps its value', () => {
    for (const value of [{ a: [1] }, [1, 'x'], 'x', '', 1.5, 0, true, false, null]) {
        expect(checkJson(JSON.stringify(value, null, 2))).toEqual({ ok: true, value });
    }
});

test('syntax error names the line of the offending token', () => {
    expect(checkJson('{\n  "text": "a",\n  "level": "info"\n  "dismissible": true\n}')).toEqual({
        ok: false,
        message: 'Невалидный JSON: строка 4 — ожидалась запятая',
    });
});

test.each([
    ['', 1],
    ['{', 1],
    ['[1,\n]', 2],
    ['{\n"a" 1}', 2],
    ['{\n a: 1}', 2],
    ['"abc', 1],
    ['1\n2', 2],
    ['{"a":\n01}', 2],
    ["[\n'x']", 2],
    ['{"s": "a\nb"}', 1],
])('reports line for %j', (text, line) => {
    const result = checkJson(text);
    expect(result.ok ? '' : result.message).toStartWith('Невалидный JSON: строка ' + line + ' — ');
});

test.each(['9007199254740993', '{"id": -9007199254740992}', '[1e400]'])(
    'rejects numbers that would change: %s',
    (text) => expect(checkJson(text).ok).toBe(false),
);

test('boundary and fractional numbers are accepted', () => {
    for (const text of [
        '9007199254740991',
        '-9007199254740991',
        '0.1',
        '1e-7',
        '0.1000',
        '120.00E-3',
        '-0.000e10',
        '{"text":"9007199254740991.4"}',
    ]) {
        expect(checkJson(text).ok).toBe(true);
    }
});

test.each(['1e-324', '{"id": 9007199254740991.4}', '[0.10000000000000001]'])(
    'rejects a decimal that would be rounded when sent: %s',
    (text) => expect(checkJson(text).ok).toBe(false),
);

test('deep malformed JSON is reported without throwing', () => {
    expect(checkJson('['.repeat(20_000) + 'x').ok).toBe(false);
});
