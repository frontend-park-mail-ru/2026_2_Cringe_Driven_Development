import { createClient } from '@cdd-team/http-client';
import type { IdentityPaths, WorkspacePaths } from '@cdd/schemas/types';

import { env } from '../env.ts';
import { observeUpstream } from './metrics.ts';
import { GoError } from './errors.ts';
import { createGoFetch, GO_TIMEOUT_MS } from './fetch.ts';

const identity = createClient<IdentityPaths>({
    transport: observeUpstream(
        'identity',
        createGoFetch(env.IDENTITY_API_URL, env.BFF_KEY, env.identityTls),
    ),
});
const workspace = createClient<WorkspacePaths>({
    transport: observeUpstream(
        'workspace',
        createGoFetch(env.WORKSPACE_API_URL, env.BFF_KEY, env.workspaceTls),
    ),
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
export const identityRequest: typeof identity.request = (...args) =>
    identity.request(...args).catch(handleError);

/** Вызов Workspace с общей обработкой ошибок транспорта. */
export const workspaceRequest: typeof workspace.request = (...args) =>
    workspace.request(...args).catch(handleError);

function handleError(err: unknown): never {
    throw toGoError(err);
}

/**
 * `init` вызова Go без сессии: только `X-Request-ID`.
 * @param requestId `X-Request-ID` для Go
 * @returns `init` для `go`
 */
export const withRequestId = (requestId?: string): RequestInit => ({
    headers: requestId ? { 'X-Request-ID': requestId } : {},
});
