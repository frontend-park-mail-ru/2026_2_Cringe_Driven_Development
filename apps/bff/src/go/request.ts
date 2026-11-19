import { createClient } from '@cdd-team/http-client';
import type { GoPaths } from '@cdd/schemas/types';

import { GoError } from './errors.ts';
import { GO_TIMEOUT_MS, bearerFetch } from './fetch.ts';

const client = createClient<GoPaths>({ transport: bearerFetch });

/** Сбой отправки или чтения ответа → `GoError`; внешняя отмена — как есть. */
const toGoError = (err: unknown): unknown => {
    const name = err instanceof Error ? err.name : '';
    if (name === 'AbortError') return err;
    if (name === 'TimeoutError')
        return new GoError('timeout', `Go не ответил за ${GO_TIMEOUT_MS} мс`);
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
