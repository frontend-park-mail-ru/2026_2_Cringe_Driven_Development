// Одноразовые статусы локального мока (bun run dev:prism): команда mock() из консоли
import { expect, test } from 'bun:test';
import { mock, takeMockPrefer } from '@api/mockPrefer';

test('правило срабатывает один раз для своей процедуры', () => {
    mock('cells.update', 409);
    expect(takeMockPrefer(['notebooks.get'])).toBeUndefined();
    expect(takeMockPrefer(['notebooks.get', 'cells.update'])).toBe('cells.update=409');
    expect(takeMockPrefer(['cells.update'])).toBeUndefined();
});

test('несколько правил в одном батче', () => {
    mock('cells.update', 500);
    mock('notebooks.get', 404);
    expect(takeMockPrefer(['cells.update', 'notebooks.get'])).toBe(
        'cells.update=500,notebooks.get=404',
    );
});

test('код вне 100–599 и пустая процедура — RangeError', () => {
    expect(() => mock('cells.update', 42)).toThrow(RangeError);
    expect(() => mock('cells.update', 600)).toThrow(RangeError);
    expect(() => mock('', 409)).toThrow(RangeError);
});
