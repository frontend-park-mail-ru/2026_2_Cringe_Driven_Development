import { createClient } from '@cdd-team/http-client';
import type { GoPaths } from '@cdd/schemas/types';

import { env } from '../env.ts';
import { GoError } from './errors.ts';
import { createGoFetch, GO_TIMEOUT_MS } from './fetch.ts';

const client = createClient<GoPaths>({
    transport: createGoFetch(env.GO_API_URL, env.BFF_KEY, env.goTls),
});

/**
 * Ошибка вызова Go для вызывающего кода: таймаут - `GoError('timeout')`, внешняя отмена (`AbortError`)
 * — как есть, прочие сбои отправки и чтения тела - `GoError('network')`.
 * @param err исключение транспорта или чтения ответа
 * @returns ошибка, которую нужно бросить
 */
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
