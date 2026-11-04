// Чистые функции снимка блокнота: применение подтверждённых операций и сравнение структуры
import { expect, test } from 'bun:test';
import type { Cell } from '@api/trpc';
import {
    applyCreate,
    applyDelete,
    applyMove,
    applyUpdate,
    sameStructure,
    utf8Bytes,
} from '@stores/notebook/snapshot';

const code: Cell = {
    id: 'a',
    kind: 'code',
    source: 'print(1)',
    outputs: [{ output_type: 'stream', name: 'stdout', text: '1' }],
    execution_count: 2,
    output_truncated: true,
};
const md: Cell = { id: 'b', kind: 'markdown', source: '# T' };
const snap = { hash: 'h1', cells: [code, md] };

test('utf8Bytes считает байты UTF-8, а не символы', () => {
    expect(utf8Bytes('я'.repeat(32_768))).toBe(65_536);
    expect(utf8Bytes('ab')).toBe(2);
});

test('applyUpdate кода сбрасывает результаты, markdown — только source', () => {
    const next = applyUpdate(snap, 'h2', 'a', 'x = 1');
    expect(next.hash).toBe('h2');
    expect(next.cells[0]).toEqual({
        id: 'a',
        kind: 'code',
        source: 'x = 1',
        outputs: [],
        execution_count: null,
        output_truncated: false,
    });
    expect(applyUpdate(snap, 'h3', 'b', 'y').cells[1]).toEqual({
        id: 'b',
        kind: 'markdown',
        source: 'y',
    });
});

test('applyUpdate неизвестной ячейки не воссоздаёт её', () => {
    expect(applyUpdate(snap, 'h2', 'zzz', 'x').cells).toEqual(snap.cells);
});

test('applyCreate добавляет пустую ячейку в конец, код — без результатов', () => {
    const next = applyCreate(snap, 'h2', { id: 'c', kind: 'code', source: '' });
    expect(next.cells.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(next.cells[2]).toEqual({
        id: 'c',
        kind: 'code',
        source: '',
        outputs: [],
        execution_count: null,
        output_truncated: false,
    });
});

test('applyMove ставит ячейку на итоговую позицию и сохраняет результаты', () => {
    const next = applyMove(snap, 'h2', 'a', 1);
    expect(next.cells.map((c) => c.id)).toEqual(['b', 'a']);
    expect(next.cells[1]).toEqual(code);
});

test('applyDelete убирает ячейку', () => {
    expect(applyDelete(snap, 'h2', 'a')).toEqual({ hash: 'h2', cells: [md] });
});

test('sameStructure игнорирует результаты и различает порядок и source', () => {
    const noOutputs = { hash: 'x', cells: [{ ...code, outputs: [], execution_count: null }, md] };
    expect(sameStructure(snap, noOutputs)).toBe(true);
    expect(sameStructure(snap, { hash: 'h1', cells: [md, code] })).toBe(false);
    expect(sameStructure(snap, { hash: 'h1', cells: [{ ...code, source: 'z' }, md] })).toBe(false);
});
