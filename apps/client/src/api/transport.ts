import type { Transport } from '@cdd-team/http-client';
import { fetchTracked } from '@stores/connection';
import { takeMockPrefer } from './mockPrefer';

/**
 * Транспорт общего клиента к BFF своего origin: `X-CSRF: 1`, cookie сессии
 * (`credentials: 'same-origin'`) и учёт соединения через `fetchTracked`; `signal` из `init`
 * отменяет fetch. В `bun run dev:prism` добавляет одноразовый статус мока маршрута. Ответ не
 * разбирает.
 * @param path путь BFF с query
 * @param init запрос от общего клиента
 * @returns ответ BFF как есть
 */
export const browserTransport: Transport = (path, init) => {
    const headers = new Headers(init.headers);
    headers.set('X-CSRF', '1');
    if (import.meta.env.VITE_MOCK_PREFER === '1') {
        const prefer = takeMockPrefer(path.split('?')[0]!);
        if (prefer) headers.set('X-Mock-Prefer', prefer);
    }
    return fetchTracked(path, { ...init, headers, credentials: 'same-origin' });
};
