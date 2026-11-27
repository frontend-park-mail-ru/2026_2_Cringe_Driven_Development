/**
 * Адрес страницы для встраивания: только тот же origin и пространство путей `/embed/`.
 * @param src локальный путь или полный адрес
 * @param origin origin приложения
 * @returns путь с query и hash; `undefined` — встраивать нельзя
 */
export function embedSrc(src: string, origin: string): string | undefined {
    let url: URL;
    try {
        url = new URL(src, origin);
    } catch {
        return undefined;
    }
    if (url.origin !== origin || !url.pathname.startsWith('/embed/')) return undefined;
    return url.pathname + url.search + url.hash;
}
