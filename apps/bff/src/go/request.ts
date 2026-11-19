import { createClient, type Transport } from '@cdd-team/http-client';
import type { GoPaths } from '@cdd/schemas/types';

import { env } from '../env.ts';
import { GoError } from './errors.ts';

/** Таймаут вызова Go: до конца чтения тела ответа. */
const GO_TIMEOUT_MS = 5000;

/**
 * Транспорт общего клиента к Go: дописывает адрес Go (`GO_API_URL`) к пути операции, ставит
 * `X-BFF-Key` (если задан `BFF_KEY`) и таймаут 5 с вместе с сигналом вызывающего кода. Ответ не
 * разбирает и HTTP-статусы не толкует. `Authorization` и `X-Request-ID` передаёт вызывающий код.
 * @param path путь операции с query, например `/notebooks/1/content`
 * @param init запрос от общего клиента
 * @returns ответ Go как есть
 */
const bearerFetch: Transport = (path, init) => {
    const headers = new Headers(init.headers);
    if (env.BFF_KEY) headers.set('X-BFF-Key', env.BFF_KEY);
    const timeout = AbortSignal.timeout(GO_TIMEOUT_MS);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(`${env.GO_API_URL}${path}`, { ...init, headers, signal });
};

const client = createClient<GoPaths>({ transport: bearerFetch });

/** Сбой отправки или чтения ответа → `GoError`; внешняя отмена — как есть. */
const toGoError = (err: unknown): unknown => {
    const name = err instanceof Error ? err.name : '';
    if (name === 'AbortError') return err;
    if (name === 'TimeoutError') {
        return new GoError('timeout', `Go не ответил за ${GO_TIMEOUT_MS} мс`);
    }
    return new GoError('network', 'Go недоступен');
};

/**
 * Вызов операции Go общим клиентом: таймаут и сетевой сбой, в том числе при чтении тела, —
 * `GoError` вида `timeout` и `network`. HTTP-ошибки возвращаются результатом: их толкует `unwrap`.
 */
export const go: typeof client.request = (...args) =>
    client.request(...args).catch((err: unknown) => {
        throw toGoError(err);
    });

/**
 * `init` вызова Go без сессии: только `X-Request-ID`.
 * @param requestId `X-Request-ID` для Go
 * @returns `init` для `go`
 */
export const withRequestId = (requestId?: string): RequestInit => ({
    headers: requestId ? { 'X-Request-ID': requestId } : {},
});
