// Поиск по блокноту: буквальная подстрока без учёта регистра, позиции — в исходнике ячейки.
import { expect, test } from 'bun:test';
import { findMatches, keepActive, stepActive } from '@modules/search/find';
import { splitByMarks } from '@modules/search/marks';

const cells = (...texts: string[]) => texts.map((text, index) => ({ id: `c${index}`, text }));
const at = (query: string, ...texts: string[]) =>
    findMatches(cells(...texts), query).map((range) => [range.cellId, range.from, range.to]);

test('буквальная подстрока без учёта регистра', () => {
    expect(at('GRAD', 'loss_grad(w)', 'Grad')).toEqual([
        ['c0', 5, 9],
        ['c1', 0, 4],
    ]);
    expect(at('.*', 'a.*b .* x')).toEqual([
        ['c0', 1, 3],
        ['c0', 5, 7],
    ]);
    expect(at('[', 'a[0][1]')).toHaveLength(2);
    expect(at('(', 'f(x)')).toEqual([['c0', 1, 2]]);
    // обратный слеш и n — два символа, не перенос строки
    expect(at('\\n', 'a\\nb\nc')).toEqual([['c0', 1, 3]]);
    expect(at(' x', 'a x')).toEqual([['c0', 1, 3]]);
    expect(at('', 'abc')).toEqual([]);
    expect(at('zzz', 'abc')).toEqual([]);
});

test('без перекрытий и не через границу ячеек', () => {
    expect(at('ana', 'banana')).toEqual([['c0', 1, 4]]);
    expect(at('ab', 'a', 'b')).toEqual([]);
});

test('позиции — в исходнике, Unicode их не сдвигает', () => {
    expect(at('x', '😀x')).toEqual([['c0', 2, 3]]);
    // 'İ'.toLowerCase() — две единицы UTF-16
    expect(at('x', 'İx')).toEqual([['c0', 1, 2]]);
    expect(at('i̇', 'İ')).toEqual([['c0', 0, 1]]);
    expect(at('python', 'Ок\n[Док](https://example.com/python)')).toEqual([['c0', 29, 35]]);
    expect(at('<b>', '<b>x</b>')).toEqual([['c0', 0, 3]]);
});

test('активное совпадение сохраняется, переходы — по кругу', () => {
    const matches = findMatches(cells('a a', 'a'), 'a');
    expect(matches).toHaveLength(3);
    expect(keepActive(matches, { cellId: 'c0', from: 2, to: 3 })).toEqual(matches[1]!);
    expect(keepActive(matches, { cellId: 'c9', from: 0, to: 1 })).toEqual(matches[0]!);
    expect(keepActive([], matches[0]!)).toBeNull();
    expect(stepActive(matches, matches[2]!, 1)).toEqual(matches[0]!);
    expect(stepActive(matches, matches[0]!, -1)).toEqual(matches[2]!);
    expect(stepActive(matches, null, -1)).toEqual(matches[2]!);
    expect(stepActive([], null, 1)).toBeNull();
});

test('разрезание по токенам и меткам: вхождение на стыке токенов — несколько кусков', () => {
    const segments = [
        { text: 'loss_', data: 'function' },
        { text: 'grad(', data: 'text' },
    ];
    const pieces = splitByMarks(segments, [{ from: 3, to: 7, current: true }]);
    expect(pieces.map((piece) => [piece.text, piece.data, piece.mark])).toEqual([
        ['los', 'function', undefined],
        ['s_', 'function', 'current'],
        ['gr', 'text', 'current'],
        ['ad(', 'text', undefined],
    ]);
    expect(pieces.map((piece) => piece.text).join('')).toBe('loss_grad(');
    expect(splitByMarks(segments, [])).toEqual([
        { text: 'loss_', data: 'function', mark: undefined },
        { text: 'grad(', data: 'text', mark: undefined },
    ]);
    expect(
        splitByMarks(
            [{ text: 'a a a', data: 0 }],
            [
                { from: 0, to: 1, current: false },
                { from: 4, to: 5, current: true },
            ],
        ).map((piece) => piece.mark),
    ).toEqual(['match', undefined, 'current']);
});
