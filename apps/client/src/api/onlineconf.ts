import type { OnlineConfScreen } from '@cdd/schemas/types';
import { api, BffError } from './bff';

/** Публичные значения OnlineConf по экранам (backend#158): решение флага уже посчитал сервер. */
export type ScreenConfig = {
    home: { notebook_max_cells: number };
    notebook: { notebook_max_cells: number; notebook_run_all: boolean };
};

/**
 * Значения OnlineConf экрана для пользователя текущей сессии. Без кеша: ответ прежней сессии
 * отсекает `api`, сбой (в том числе устаревшие данные OnlineConf) — {@link BffError}, а не
 * значение по умолчанию.
 * @param screen экран продукта
 * @param signal отмена запроса
 * @returns значения экрана
 * @throws {BffError} сбой запроса или ответ без решения флага
 */
export async function readScreenConfig<S extends OnlineConfScreen>(
    screen: S,
    signal?: AbortSignal,
): Promise<ScreenConfig[S]> {
    const data = await api('GET', '/api/onlineconf/me', {
        params: { query: { screen } },
        init: { signal },
    });
    // решение флага не подставляется: без него ответ не по протоколу
    if (screen === 'notebook' && typeof data.notebook_run_all !== 'boolean') {
        throw new BffError('protocol', 'Нет решения notebook_run_all');
    }
    return data as ScreenConfig[S];
}

/**
 * Значение конфига: `found: false` — ключа нет в ответе; `false`, `0` и `null` — найденные значения.
 * @param values значения экрана
 * @param key имя поля
 */
export function configValue<T extends object, K extends keyof T>(
    values: T,
    key: K,
): { found: true; value: T[K] } | { found: false } {
    return Object.hasOwn(values, key) ? { found: true, value: values[key] } : { found: false };
}
