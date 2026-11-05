import type { NotebookPageData } from '@api/trpc';

// Блокнот из первого HTML: BFF кладёт его в bootstrap при прямом открытии своего блокнота
let preloaded: NotebookPageData | undefined;

/**
 * Запоминает данные блокнота из bootstrap до первого показа его страницы.
 * @param page данные блокнота из bootstrap или `undefined`
 */
export function setPreloadedNotebook(page: NotebookPageData | undefined): void {
    preloaded = page;
}

/**
 * Данные блокнота из первого HTML, если открыт именно он, без изъятия: для начального состояния
 * страницы.
 * @param id ID открытого блокнота
 * @returns данные блокнота или `undefined`
 */
export function peekPreloadedNotebook(id: number): NotebookPageData | undefined {
    return preloaded?.notebook.id === id ? preloaded : undefined;
}

/**
 * Данные блокнота из первого HTML, если открыт именно он. Отдаются один раз: дальше страница берёт
 * блокнот у `notebooks.get`.
 * @param id ID открытого блокнота
 * @returns данные блокнота или `undefined`
 */
export function takePreloadedNotebook(id: number): NotebookPageData | undefined {
    const page = preloaded;
    preloaded = undefined;
    return page?.notebook.id === id ? page : undefined;
}
