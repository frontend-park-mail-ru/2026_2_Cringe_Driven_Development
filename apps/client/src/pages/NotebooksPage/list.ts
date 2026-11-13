import type { NotebookListPage, NotebookSummary } from '@api/trpc';

/** Размер страницы списка на главной. */
export const PAGE_SIZE = 24;

/** Загруженная часть списка блокнотов. */
export type Loaded = {
    items: NotebookSummary[];
    /** `null` — страниц больше нет */
    nextCursor: string | null;
    /** Все блокноты пользователя, а не только загруженные */
    totalCount: number;
};

/**
 * Список из первой страницы ответа.
 * @param page первая страница
 */
export function fromFirstPage(page: NotebookListPage): Loaded {
    return { items: page.items, nextCursor: page.next_cursor, totalCount: page.total_count };
}

/**
 * Добавляет следующую страницу в конец, пропуская уже показанные блокноты.
 * @param loaded уже загруженное
 * @param page следующая страница
 */
export function appendPage(loaded: Loaded, page: NotebookListPage): Loaded {
    const seen = new Set(loaded.items.map((n) => n.id));
    return {
        items: [...loaded.items, ...page.items.filter((n) => !seen.has(n.id))],
        nextCursor: page.next_cursor,
        totalCount: page.total_count,
    };
}

/**
 * Убирает удалённый блокнот и уменьшает счётчик; незнакомый `id` список не меняет.
 * @param loaded уже загруженное
 * @param id идентификатор удалённого блокнота
 */
export function removeItem(loaded: Loaded, id: number): Loaded {
    if (!loaded.items.some((n) => n.id === id)) return loaded;
    return {
        ...loaded,
        items: loaded.items.filter((n) => n.id !== id),
        totalCount: Math.max(0, loaded.totalCount - 1),
    };
}
