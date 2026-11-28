import type {
    AddNotebookCellRequest,
    ChangeCurrentUserPasswordRequest,
    ConfirmTwoFactorRequest,
    CreateNotebookRequest,
    Credentials,
    DisableTwoFactorRequest,
    EditNotebookCellRequest,
    ListNotebooksParams,
    LoginRequest,
    MoveNotebookCellRequest,
    Notebook,
    NotebookCellChange,
    NotebookContent,
    NotebookContentChange,
    NotebookListPage,
    OnlineConfKey,
    OnlineConfKeySummary,
    RuntimeBatchExecuteRequest,
    RuntimeBatchExecution,
    RuntimeEventsResponse,
    RuntimeExecuteRequest,
    RuntimeExecution,
    RuntimeQueueSnapshot,
    RuntimeSession,
    RuntimeStartRequest,
    TokenPair,
    TwoFactorSetupResponse,
    UpdateCurrentUserRequest,
    User,
} from '@cdd/schemas/types';

import type { Session } from '../session/session.ts';
import { unwrap } from './errors.ts';
import {
    acceptedResponse,
    activeRuntimeSessionResponse,
    authResponse,
    cellChangeResponse,
    contentChangeResponse,
    interruptResponse,
    notebookContentResponse,
    notebookListResponse,
    notebookResponse,
    onlineConfKeyResponse,
    onlineConfKeysResponse,
    runtimeBatchResponse,
    runtimeEventsResponse,
    runtimeExecutionResponse,
    runtimeQueueResponse,
    runtimeSessionResponse,
    stoppedResponse,
    twoFactorSetupResponse,
    userResponse,
} from './responses.ts';
import { identityRequest, onlineconfRequest, withRequestId, workspaceRequest } from './request.ts';

/**
 * Заголовок `If-Match` для правки содержимого блокнота.
 * @param hash хеш содержимого — непрозрачная строка без кавычек; в Go уходит одним сильным ETag
 * @returns `params.header` операции
 */
const ifMatch = (hash: string): { 'If-Match': string } => ({ 'If-Match': `"${hash}"` });

const isInvalidTotp = (res: { status: number }): boolean => {
    const { data } = res as { data?: unknown };
    return (
        typeof data === 'object' &&
        data !== null &&
        (data as { code?: unknown }).code === 'invalid_totp'
    );
};

/** Итог отзыва сессии в Go при выходе. */
export type ServerRevocation = 'confirmed' | 'unconfirmed' | 'unknown';

/** Вызовы Go от имени сессии. */
export type Go = {
    getCurrentUser(): Promise<User>;
    updateCurrentUser(body: UpdateCurrentUserRequest): Promise<User>;
    changeCurrentUserPassword(body: ChangeCurrentUserPasswordRequest): Promise<void>;
    uploadCurrentUserAvatar(avatar: Blob): Promise<User>;
    listNotebooks(
        params?: Pick<ListNotebooksParams, 'limit' | 'cursor'>,
    ): Promise<NotebookListPage>;
    getNotebook(id: number): Promise<Notebook>;
    getNotebookContent(id: number): Promise<NotebookContent>;
    createNotebook(body: CreateNotebookRequest): Promise<Notebook>;
    addCell(id: number, hash: string, body: AddNotebookCellRequest): Promise<NotebookCellChange>;
    editCell(
        id: number,
        cellId: string,
        hash: string,
        body: EditNotebookCellRequest,
    ): Promise<NotebookCellChange>;
    moveCell(
        id: number,
        cellId: string,
        hash: string,
        body: MoveNotebookCellRequest,
    ): Promise<NotebookContentChange>;
    removeCell(id: number, cellId: string, hash: string): Promise<NotebookContentChange>;
    deleteNotebook(id: number): Promise<void>;
    renameNotebook(id: number, name: string): Promise<Notebook>;
    logout(): Promise<ServerRevocation>;
    logoutAll(): Promise<void>;
    enableTwoFactor(): Promise<TwoFactorSetupResponse>;
    confirmTwoFactor(body: ConfirmTwoFactorRequest): Promise<void>;
    disableTwoFactor(body: DisableTwoFactorRequest): Promise<void>;
    getActiveRuntimeSession(): Promise<RuntimeSession | null>;
    getRuntimeSession(id: string): Promise<RuntimeSession>;
    getRuntimeQueue(id: string): Promise<RuntimeQueueSnapshot>;
    listRuntimeEvents(id: string, after: number): Promise<RuntimeEventsResponse>;
    getRuntimeExecution(id: string, executionId: string): Promise<RuntimeExecution>;
    startRuntimeSession(notebookId: number, body: RuntimeStartRequest): Promise<RuntimeSession>;
    createRuntimeExecution(id: string, body: RuntimeExecuteRequest): Promise<RuntimeExecution>;
    createRuntimeExecutionBatch(
        id: string,
        body: RuntimeBatchExecuteRequest,
    ): Promise<RuntimeBatchExecution>;
    stopRuntimeSession(id: string): Promise<{ accepted: true }>;
    stopRuntimeExecutions(id: string): Promise<{ stopped: true }>;
    interruptRuntimeKernel(id: string): Promise<{ interrupt_requested: true }>;
    touchRuntimeSession(id: string): Promise<{ accepted: true }>;
    getOnlineConfAccess(): Promise<void>;
    listOnlineConfKeys(query: {
        scope: string;
        search?: string;
    }): Promise<{ items: OnlineConfKeySummary[] }>;
    getOnlineConfKey(scope: string, name: string): Promise<OnlineConfKey>;
    createOnlineConfKey(key: OnlineConfKey): Promise<OnlineConfKey>;
    updateOnlineConfKey(key: OnlineConfKey): Promise<OnlineConfKey>;
};

/**
 * Клиент Go поверх сессии: токены, refresh и повтор после 401 — в `session.call`, кроме `logout`.
 * Заголовки браузера в Go не уходят: `init` собирает сессия.
 * @param session сессия текущего запроса
 */
export function createGo(session: Session): Go {
    const call: Session['call'] = (fn, refused) => session.call(fn, refused);
    const readNotebook: Session['call'] = (fn) =>
        session.active ? call(fn) : fn(withRequestId(session.requestId));
    return {
        getCurrentUser: async () =>
            unwrap(
                await call((init) => identityRequest('GET', '/users/me', { init })),
                [200],
                userResponse,
            ),
        updateCurrentUser: async (body) =>
            unwrap(
                await call((init) =>
                    identityRequest('PATCH', '/users/me', {
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [200],
                userResponse,
            ),
        changeCurrentUserPassword: async (body) => {
            unwrap(
                await call((init) =>
                    identityRequest('PUT', '/users/me/password', {
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [204],
            );
        },
        uploadCurrentUserAvatar: async (avatar) =>
            unwrap(
                await call((init) =>
                    identityRequest('PUT', '/users/me/avatar', {
                        contentType: 'multipart/form-data',
                        body: { avatar },
                        init,
                    }),
                ),
                [200],
                userResponse,
            ),
        listNotebooks: async (params) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('GET', '/notebooks', { params: { query: params }, init }),
                ),
                [200],
                notebookListResponse,
            ),
        getNotebook: async (id) =>
            unwrap(
                await readNotebook((init) =>
                    workspaceRequest('GET', '/notebooks/{id}', { params: { path: { id } }, init }),
                ),
                [200],
                notebookResponse,
            ),
        getNotebookContent: async (id) =>
            unwrap(
                await readNotebook((init) =>
                    workspaceRequest('GET', '/notebooks/{id}/content', {
                        params: { path: { id } },
                        init,
                    }),
                ),
                [200],
                notebookContentResponse,
            ),
        createNotebook: async (body) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('POST', '/notebooks', {
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [201],
                notebookResponse,
            ),
        addCell: async (id, hash, body) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('POST', '/notebooks/{id}/content/cells', {
                        params: { path: { id }, header: ifMatch(hash) },
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [201],
                cellChangeResponse,
            ),
        editCell: async (id, cellId, hash, body) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('PATCH', '/notebooks/{id}/content/cells/{cell_id}', {
                        params: { path: { id, cell_id: cellId }, header: ifMatch(hash) },
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [200],
                cellChangeResponse,
            ),
        moveCell: async (id, cellId, hash, body) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('POST', '/notebooks/{id}/content/cells/{cell_id}/move', {
                        params: { path: { id, cell_id: cellId }, header: ifMatch(hash) },
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [200],
                contentChangeResponse,
            ),
        removeCell: async (id, cellId, hash) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('DELETE', '/notebooks/{id}/content/cells/{cell_id}', {
                        params: { path: { id, cell_id: cellId }, header: ifMatch(hash) },
                        init,
                    }),
                ),
                [200],
                contentChangeResponse,
            ),
        /** 204 без тела: JSON не читается. */
        deleteNotebook: async (id) => {
            unwrap(
                await call((init) =>
                    workspaceRequest('DELETE', '/notebooks/{id}', {
                        params: { path: { id } },
                        init,
                    }),
                ),
                [204],
            );
        },
        renameNotebook: async (id, name) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('PATCH', '/notebooks/{id}', {
                        params: { path: { id } },
                        contentType: 'application/json',
                        body: { name },
                        init,
                    }),
                ),
                [200],
                notebookResponse,
            ),
        /** Мимо `call`: выход не обновляет токены и не повторяет запрос. */
        logout: async () => {
            const pair = session.revocation();
            if (!pair) return 'unconfirmed';
            let status: number;
            try {
                ({ status } = await identityRequest('POST', '/auth/logout', {
                    contentType: 'application/json',
                    body: { refresh_token: pair.refresh },
                    init: pair.init,
                }));
            } catch {
                return 'unknown';
            }
            if (status === 204) return 'confirmed';
            return status >= 400 && status < 500 ? 'unconfirmed' : 'unknown';
        },
        logoutAll: async () => {
            unwrap(
                await call((init) => identityRequest('POST', '/auth/logout-all', { init })),
                [204],
            );
        },
        enableTwoFactor: async () =>
            unwrap(
                await call((init) => identityRequest('POST', '/auth/enable2fa', { init })),
                [200],
                twoFactorSetupResponse,
            ),
        /** 401 invalid_totp — неверный код, а не истёкший токен: без refresh и повтора с ним. */
        confirmTwoFactor: async (body) => {
            unwrap(
                await call(
                    (init) =>
                        identityRequest('POST', '/auth/confirm2fa', {
                            contentType: 'application/json',
                            body,
                            init,
                        }),
                    isInvalidTotp,
                ),
                [200],
            );
        },
        disableTwoFactor: async (body) => {
            unwrap(
                await call((init) =>
                    identityRequest('POST', '/auth/disable2fa', {
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [200],
            );
        },
        getActiveRuntimeSession: async () =>
            unwrap(
                await call((init) => workspaceRequest('GET', '/runtime-sessions/active', { init })),
                [200],
                activeRuntimeSessionResponse,
            ).active_session,
        getRuntimeSession: async (id) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('GET', '/runtime-sessions/{id}', {
                        params: { path: { id } },
                        init,
                    }),
                ),
                [200],
                runtimeSessionResponse,
            ),
        getRuntimeQueue: async (id) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('GET', '/runtime-sessions/{id}/queue', {
                        params: { path: { id } },
                        init,
                    }),
                ),
                [200],
                runtimeQueueResponse,
            ),
        listRuntimeEvents: async (id, after) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('GET', '/runtime-sessions/{id}/events', {
                        params: { path: { id }, query: { after } },
                        init,
                    }),
                ),
                [200],
                runtimeEventsResponse,
            ),
        getRuntimeExecution: async (id, executionId) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('GET', '/runtime-sessions/{id}/executions/{execution_id}', {
                        params: { path: { id, execution_id: executionId } },
                        init,
                    }),
                ),
                [200],
                runtimeExecutionResponse,
            ),
        startRuntimeSession: async (notebookId, body) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('POST', '/notebooks/{id}/runtime-sessions', {
                        params: { path: { id: notebookId } },
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [202],
                runtimeSessionResponse,
            ),
        createRuntimeExecution: async (id, body) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('POST', '/runtime-sessions/{id}/executions', {
                        params: { path: { id } },
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [202],
                runtimeExecutionResponse,
            ),
        createRuntimeExecutionBatch: async (id, body) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('POST', '/runtime-sessions/{id}/executions/batch', {
                        params: { path: { id } },
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [202],
                runtimeBatchResponse,
            ),
        stopRuntimeSession: async (id) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('POST', '/runtime-sessions/{id}/stop', {
                        params: { path: { id } },
                        init,
                    }),
                ),
                [202],
                acceptedResponse,
            ),
        stopRuntimeExecutions: async (id) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('POST', '/runtime-sessions/{id}/executions/stop', {
                        params: { path: { id } },
                        init,
                    }),
                ),
                [200],
                stoppedResponse,
            ),
        interruptRuntimeKernel: async (id) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('POST', '/runtime-sessions/{id}/kernel/interrupt', {
                        params: { path: { id } },
                        init,
                    }),
                ),
                [200],
                interruptResponse,
            ),
        touchRuntimeSession: async (id) =>
            unwrap(
                await call((init) =>
                    workspaceRequest('POST', '/runtime-sessions/{id}/activity', {
                        params: { path: { id } },
                        init,
                    }),
                ),
                [200],
                acceptedResponse,
            ),
        getOnlineConfAccess: async () => {
            unwrap(
                await call((init) => onlineconfRequest('GET', '/admin/access', { init })),
                [204],
            );
        },
        listOnlineConfKeys: async (query) =>
            unwrap(
                await call((init) =>
                    onlineconfRequest('GET', '/admin/keys', { params: { query }, init }),
                ),
                [200],
                onlineConfKeysResponse,
            ),
        getOnlineConfKey: async (scope, name) =>
            unwrap(
                await call((init) =>
                    onlineconfRequest('GET', '/admin/keys/{scope}/{name}', {
                        params: { path: { scope, name } },
                        init,
                    }),
                ),
                [200],
                onlineConfKeyResponse,
            ),
        createOnlineConfKey: async (body) =>
            unwrap(
                await call((init) =>
                    onlineconfRequest('POST', '/admin/keys', {
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [201],
                onlineConfKeyResponse,
            ),
        updateOnlineConfKey: async ({ scope, name, ...body }) =>
            unwrap(
                await call((init) =>
                    onlineconfRequest('PUT', '/admin/keys/{scope}/{name}', {
                        params: { path: { scope, name } },
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [200],
                onlineConfKeyResponse,
            ),
    };
}

/** Пользователь и пара токенов после входа или регистрации. */
export type AuthResult = { user: User; tokens: TokenPair };

/** Вызовы Go без сессии — вход и регистрация. */
export const publicGo = {
    /**
     * Регистрация в Go.
     * @param body логин и пароль
     * @param requestId `X-Request-ID` для Go
     */
    register: async (body: Credentials, requestId?: string): Promise<AuthResult> =>
        unwrap(
            await identityRequest('POST', '/auth/register', {
                contentType: 'application/json',
                body,
                init: withRequestId(requestId),
            }),
            [201],
            authResponse,
        ),
    /**
     * Вход в Go.
     * @param body логин, пароль и при включённой 2FA — код `user_code`
     * @param requestId `X-Request-ID` для Go
     */
    login: async (body: LoginRequest, requestId?: string): Promise<AuthResult> =>
        unwrap(
            await identityRequest('POST', '/auth/login', {
                contentType: 'application/json',
                body,
                init: withRequestId(requestId),
            }),
            [200],
            authResponse,
        ),
};
