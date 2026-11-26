import type { Transport } from '@cdd-team/http-client';

/** Таймаут вызова Go до конца чтения ответа. */
export const GO_TIMEOUT_MS = 5000;

/**
 * Общий транспорт BFF к Go. Объединяет таймаут с отменой вызывающего кода,
 * добавляет ключ BFF и сохраняет заголовки запроса.
 * @param baseUrl адрес Go с префиксом API
 * @param key сервисный ключ BFF
 * @param tls настройки клиентского TLS
 */
export function createGoFetch(
    baseUrl: string,
    key?: string,
    tls?: BunFetchRequestInitTLS,
): Transport {
    const session = tls && new Bun.FetchSession({ tls });
    return (path, init) => {
        const headers = new Headers(init.headers);
        if (key) headers.set('X-BFF-Key', key);
        const timeout = AbortSignal.timeout(GO_TIMEOUT_MS);
        const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
        const url = `${baseUrl}${path}`;
        if (session) return session.fetch(url, { ...init, headers, signal, redirect: 'error' });
        return fetch(url, { ...init, headers, signal });
    };
}
