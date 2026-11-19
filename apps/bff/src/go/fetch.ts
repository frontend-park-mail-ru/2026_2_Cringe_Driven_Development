import type { Transport } from '@cdd-team/http-client';

import { env } from '../env.ts';

/** Таймаут вызова Go: до конца чтения тела ответа. */
export const GO_TIMEOUT_MS = 5000;

/**
 * Транспорт общего клиента к Go: дописывает адрес Go (`GO_API_URL`) к пути операции, ставит
 * `X-BFF-Key` (если задан `BFF_KEY`) и таймаут 5 с вместе с сигналом вызывающего кода. Ответ не
 * разбирает и HTTP-статусы не толкует. `Authorization` и `X-Request-ID` передаёт вызывающий код.
 * @param path путь операции с query, например `/notebooks/1/content`
 * @param init запрос от общего клиента
 * @returns ответ Go как есть
 */
export const bearerFetch: Transport = (path, init) => {
    const headers = new Headers(init.headers);
    if (env.BFF_KEY) headers.set('X-BFF-Key', env.BFF_KEY);
    const timeout = AbortSignal.timeout(GO_TIMEOUT_MS);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(`${env.GO_API_URL}${path}`, { ...init, headers, signal });
};
