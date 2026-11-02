// Модуль без зависимостей: его импортируют и BFF, и маршруты клиента (`@cdd/bff/pages`)

/**
 * Пути страниц клиента — `path` маршрутов в `apps/client/src/routes`. Обёртки `_auth` и `_guest`
 * сегмента не добавляют, поэтому путь маршрута — он же путь адреса. Новая страница добавляется
 * сюда: по этому списку BFF решает, куда вести прямой запрос HTML (`html.ts`).
 */
export const PAGES = {
    index: '/',
    login: 'login',
    register: 'register',
    notebook: 'notebooks/$notebookId',
    profile: 'profile',
    notFound: '404',
} as const;

/** Страница клиента — ключ {@link PAGES}. */
export type Page = keyof typeof PAGES;

const segments = (path: string) => path.split('/').filter(Boolean);

/**
 * Сегмент адреса, декодированный как в роутере клиента; некорректное кодирование — как есть.
 * @param segment сегмент пути
 * @returns декодированный сегмент
 */
export function decodeSegment(segment: string): string {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

/**
 * Подходит ли адрес под путь страницы. Сопоставление как у роутера клиента: `$param` — любой
 * непустой сегмент, регистр статичных сегментов и завершающий слэш не учитываются.
 * @param page путь страницы из {@link PAGES}
 * @param pathname путь адреса
 * @returns `true`, если адрес — эта страница
 */
export function matchesPage(page: string, pathname: string): boolean {
    const pattern = segments(page);
    const path = segments(pathname).map(decodeSegment);
    return (
        pattern.length === path.length &&
        pattern.every(
            (segment, i) =>
                segment.startsWith('$') || segment.toLowerCase() === path[i]?.toLowerCase(),
        )
    );
}

/**
 * Страница клиента по адресу.
 * @param pathname путь адреса
 * @returns ключ страницы или `undefined` для неизвестного адреса
 */
export function pageOf(pathname: string): Page | undefined {
    return (Object.keys(PAGES) as Page[]).find((page) => matchesPage(PAGES[page], pathname));
}
