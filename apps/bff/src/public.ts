import { join } from 'node:path';

/**
 * Публичные файлы клиента, которые BFF отдаёт по корневому пути (`/favicon.ico`). Тот же список
 * копирует в образ упаковка. JS и CSS сюда не входят: они на CDN.
 */
export const PUBLIC_FILES: readonly string[] = [
    'sw.js',
    'offline.html',
    'offline.css',
    'manifest.webmanifest',
    'pwa-192.png',
    'pwa-512.png',
    'pwa-maskable-512.png',
    'apple-touch-icon.png',
];

/**
 * Открывает JS и CSS сборки клиента для `bun run dev:pwa`: там нет CDN, на проде они туда и уходят.
 * Список собирается один раз, поэтому адрес запроса не становится путём на диске.
 * @param dir каталог сборки клиента
 * @returns файлы по имени
 */
export async function loadClientAssets(dir: string): Promise<Map<string, Bun.BunFile>> {
    const files = new Map<string, Bun.BunFile>();
    for await (const name of new Bun.Glob('assets/**').scan(dir)) {
        files.set(name, Bun.file(join(dir, name)));
    }
    return files;
}

/**
 * Открывает файлы из `PUBLIC_FILES`. Бросает, если какого-то нет: такой образ собран неверно.
 * @param dir каталог сборки клиента, в нём же лежит шаблон
 * @returns файлы по имени
 */
export async function loadPublicFiles(dir: string): Promise<Map<string, Bun.BunFile>> {
    const files = new Map<string, Bun.BunFile>();
    for (const name of PUBLIC_FILES) {
        const file = Bun.file(join(dir, name));
        if (!(await file.exists())) throw new Error(`Нет публичного файла: ${name}`);
        files.set(name, file);
    }
    return files;
}
