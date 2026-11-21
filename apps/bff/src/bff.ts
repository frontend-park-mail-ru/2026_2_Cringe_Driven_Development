import { type App, createApp } from './app.ts';
import { createHtmlHandler } from './html.ts';

/**
 * BFF целиком для `Bun.serve`: HTTP API, HTML, публичные файлы.
 * @param template проверенный HTML-шаблон клиента
 * @param publicFiles публичные файлы по имени
 * @returns `routes` и `fetch` для `Bun.serve`
 */
export function createBff(template: string, publicFiles: Map<string, Bun.BunFile>): App {
    return createApp({ template, publicFiles, html: createHtmlHandler(template) });
}
