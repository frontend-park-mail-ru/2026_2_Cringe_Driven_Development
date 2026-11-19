import type { Transport } from '@cdd-team/http-client';
import { fetchTracked } from '@stores/connection';

/**
 * Транспорт общего клиента к BFF своего origin: `X-CSRF: 1`, cookie сессии
 * (`credentials: 'same-origin'`) и учёт соединения через `fetchTracked`. Ответ не разбирает.
 * @param path путь BFF с query
 * @param init запрос от общего клиента
 * @returns ответ BFF как есть
 */
export const browserTransport: Transport = (path, init) => {
    const headers = new Headers(init.headers);
    headers.set('X-CSRF', '1');
    return fetchTracked(path, { ...init, headers, credentials: 'same-origin' });
};
