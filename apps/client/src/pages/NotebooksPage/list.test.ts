/// <reference types="bun" />
import { expect, test } from 'bun:test';
import type { NotebookListPage, NotebookSummary } from '@api/trpc';
import { appendPage, fromFirstPage, removeItem } from './list';

const item = (id: number, updated_at = '2026-01-01T00:00:00Z'): NotebookSummary => ({
    id,
    name: `n${id}`,
    updated_at,
    cells_count: 0,
    preview_code: '',
    has_active_session: false,
});

const page = (
    items: NotebookSummary[],
    next_cursor: string | null,
    total_count = items.length,
): NotebookListPage => ({ items, next_cursor, matched_count: total_count, total_count });

test('fromFirstPage: порядок backend не меняется', () => {
    const items = [item(1, '2026-01-01T00:00:00Z'), item(2, '2026-02-01T00:00:00Z')];
    const loaded = fromFirstPage(page(items, 'c1', 30));
    expect(loaded.items.map((n) => n.id)).toEqual([1, 2]);
    expect(loaded.nextCursor).toBe('c1');
    expect(loaded.totalCount).toBe(30);
});

test('appendPage: дубли по id не добавляются', () => {
    const first = fromFirstPage(page([item(1), item(2)], 'c1', 4));
    const next = appendPage(first, page([item(2), item(3)], 'c2', 4));
    expect(next.items.map((n) => n.id)).toEqual([1, 2, 3]);
    expect(next.nextCursor).toBe('c2');
});

test('appendPage: курсор null завершает список', () => {
    const first = fromFirstPage(page([item(1)], 'c1', 2));
    expect(appendPage(first, page([item(2)], null, 2)).nextCursor).toBeNull();
});

test('removeItem: карточка убирается, счётчик уменьшается', () => {
    const loaded = fromFirstPage(page([item(1), item(2)], 'c1', 30));
    const next = removeItem(loaded, 1);
    expect(next.items.map((n) => n.id)).toEqual([2]);
    expect(next.totalCount).toBe(29);
});

test('removeItem: неизвестный id ничего не меняет', () => {
    const loaded = fromFirstPage(page([item(1)], null, 1));
    expect(removeItem(loaded, 9)).toBe(loaded);
});
