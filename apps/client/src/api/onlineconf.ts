import type { OnlineConfMe } from '@cdd/schemas/types';
import { takePreloadedSettings } from '@stores/preloaded';
import { useSessionStore } from '@stores/session';
import { api, BffError } from './bff';

/**
 * Публичные настройки продукта для пользователя текущей сессии (backend#158): лимит ячеек и
 * решение флага «Запустить всё», уже посчитанное OnlineConf. При исходном открытии страницы —
 * снимок из первого HTML без запроса, один раз и только для той же сессии и адреса; дальше —
 * `GET /api/onlineconf/me`. Кеша нет: ответ прежней сессии отсекает `api`. Сбой — ошибка, а не
 * `true`, `1000` или прошлое значение.
 * @param signal отмена запроса
 * @returns настройки
 * @throws {BffError} настройки недоступны или сбой запроса
 */
export async function readOnlineConf(signal?: AbortSignal): Promise<OnlineConfMe> {
    const preloaded = takePreloadedSettings(useSessionStore.getState().user, location.pathname);
    if (!preloaded) return api('GET', '/api/onlineconf/me', { init: { signal } });
    if (!preloaded.value) {
        throw new BffError('http', 'Настройки OnlineConf недоступны', {
            status: 502,
            code: 'BAD_GATEWAY',
        });
    }
    return preloaded.value;
}

/**
 * Значение конфига: `found: false` — ключа нет в ответе; `false`, `0` и `null` — найденные значения.
 * @param values настройки
 * @param key имя поля
 */
export function configValue<T extends object, K extends keyof T>(
    values: T,
    key: K,
): { found: true; value: T[K] } | { found: false } {
    return Object.hasOwn(values, key) ? { found: true, value: values[key] } : { found: false };
}
