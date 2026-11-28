import type { NotebookPageData, User } from '@api/bff';
import type { OnlineConfMe } from '@cdd/schemas/types';

/** Блокнот из первого HTML: BFF кладёт его в bootstrap при прямом открытии своего блокнота. */
let preloaded: NotebookPageData | undefined;

/** Запоминает данные блокнота из bootstrap до первого показа его страницы. */
export function setPreloadedNotebook(page: NotebookPageData | undefined): void {
    preloaded = page;
}

/**
 * Данные блокнота из первого HTML, если открыт именно он, без изъятия: для начального состояния
 * страницы.
 * @param id ID открытого блокнота
 */
export function peekPreloadedNotebook(id: number): NotebookPageData | undefined {
    return preloaded?.notebook.id === id ? preloaded : undefined;
}

/**
 * Данные блокнота из первого HTML, если открыт именно он. Отдаются один раз: дальше страница берёт
 * блокнот у `notebooks.get`.
 * @param id ID открытого блокнота
 */
export function takePreloadedNotebook(id: number): NotebookPageData | undefined {
    const page = preloaded;
    preloaded = undefined;
    return page?.notebook.id === id ? page : undefined;
}

/** Настройки OnlineConf из первого HTML с сессией и адресом, для которых BFF их выдал. */
let settings: { value: OnlineConfMe | null; user: User; path: string } | undefined;

/**
 * Запоминает настройки OnlineConf из bootstrap до первого показа страницы.
 * @param value настройки, `null` — «настройки недоступны», `undefined` — BFF их не выдавал
 * @param user пользователь первого HTML: другой пользователь снимок не получит
 * @param path адрес первого HTML
 */
export function setPreloadedSettings(
    value: OnlineConfMe | null | undefined,
    user: User | null,
    path: string,
): void {
    settings = value === undefined || !user ? undefined : { value, user, path };
}

/**
 * Настройки OnlineConf из первого HTML, если их ещё не брали, сессия та же (тот же объект
 * пользователя: вход и выход его заменяют) и открыт тот же адрес. Отдаются один раз: дальше —
 * через BFF.
 * @param user текущий пользователь сессии
 * @param path текущий адрес
 * @returns `{ value }` или `undefined`, если снимок использовать нельзя
 */
export function takePreloadedSettings(
    user: User | null,
    path: string,
): { value: OnlineConfMe | null } | undefined {
    const taken = settings;
    settings = undefined;
    return taken && taken.user === user && taken.path === path ? { value: taken.value } : undefined;
}
