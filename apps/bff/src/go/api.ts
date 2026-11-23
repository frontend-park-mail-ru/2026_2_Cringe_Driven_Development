import {
    AddNotebookCellResponse,
    CreateRuntimeExecutionBatchResponse,
    CreateRuntimeExecutionResponse,
    GetActiveRuntimeSessionResponse,
    GetRuntimeExecutionResponse,
    GetRuntimeQueueResponse,
    GetRuntimeSessionResponse,
    InterruptRuntimeKernelResponse,
    ListRuntimeEventsResponse,
    StartRuntimeSessionResponse,
    StopRuntimeExecutionsResponse,
    StopRuntimeSessionResponse,
    TouchRuntimeSessionResponse,
    EditNotebookCellResponse,
    MoveNotebookCellResponse,
    RemoveNotebookCellResponse,
    CreateNotebookResponse,
    EnableTwoFactorAuthResponse,
    GetCurrentUserResponse,
    GetNotebookContentResponse,
    GetNotebookResponse,
    ListNotebooksResponse,
    LoginUserResponse,
    RegisterUserResponse,
    UpdateCurrentUserResponse,
    UploadCurrentUserAvatarResponse,
} from '@cdd/schemas';

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
import { go, withRequestId } from './request.ts';

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
};

/**
 * Клиент Go поверх сессии: токены, refresh и повтор после 401 — в `session.call`, кроме `logout`.
 * Заголовки браузера в Go не уходят: `init` собирает сессия.
 * @param session сессия текущего запроса
 */
export function createGo(session: Session): Go {
    const call: Session['call'] = (fn, refused) => session.call(fn, refused);
    return {
        getCurrentUser: async () =>
            unwrap(
                await call((init) => go('GET', '/users/me', { init })),
                [200],
                GetCurrentUserResponse,
            ),
        updateCurrentUser: async (body) =>
            unwrap(
                await call((init) =>
                    go('PATCH', '/users/me', { contentType: 'application/json', body, init }),
                ),
                [200],
                UpdateCurrentUserResponse,
            ),
        changeCurrentUserPassword: async (body) => {
            unwrap(
                await call((init) =>
                    go('PUT', '/users/me/password', {
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
                    go('PUT', '/users/me/avatar', {
                        contentType: 'multipart/form-data',
                        body: { avatar },
                        init,
                    }),
                ),
                [200],
                UploadCurrentUserAvatarResponse,
            ),
        listNotebooks: async (params) =>
            unwrap(
                await call((init) => go('GET', '/notebooks', { params: { query: params }, init })),
                [200],
                ListNotebooksResponse,
            ),
        getNotebook: async (id) =>
            unwrap(
                await call((init) =>
                    go('GET', '/notebooks/{id}', { params: { path: { id } }, init }),
                ),
                [200],
                GetNotebookResponse,
            ),
        getNotebookContent: async (id) =>
            unwrap(
                await call((init) =>
                    go('GET', '/notebooks/{id}/content', { params: { path: { id } }, init }),
                ),
                [200],
                GetNotebookContentResponse,
            ),
        createNotebook: async (body) =>
            unwrap(
                await call((init) =>
                    go('POST', '/notebooks', { contentType: 'application/json', body, init }),
                ),
                [201],
                CreateNotebookResponse,
            ),
        addCell: async (id, hash, body) =>
            unwrap(
                await call((init) =>
                    go('POST', '/notebooks/{id}/content/cells', {
                        params: { path: { id }, header: ifMatch(hash) },
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [201],
                AddNotebookCellResponse,
            ),
        editCell: async (id, cellId, hash, body) =>
            unwrap(
                await call((init) =>
                    go('PATCH', '/notebooks/{id}/content/cells/{cell_id}', {
                        params: { path: { id, cell_id: cellId }, header: ifMatch(hash) },
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [200],
                EditNotebookCellResponse,
            ),
        moveCell: async (id, cellId, hash, body) =>
            unwrap(
                await call((init) =>
                    go('POST', '/notebooks/{id}/content/cells/{cell_id}/move', {
                        params: { path: { id, cell_id: cellId }, header: ifMatch(hash) },
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [200],
                MoveNotebookCellResponse,
            ),
        removeCell: async (id, cellId, hash) =>
            unwrap(
                await call((init) =>
                    go('DELETE', '/notebooks/{id}/content/cells/{cell_id}', {
                        params: { path: { id, cell_id: cellId }, header: ifMatch(hash) },
                        init,
                    }),
                ),
                [200],
                RemoveNotebookCellResponse,
            ),
        /** 204 без тела: JSON не читается. */
        deleteNotebook: async (id) => {
            unwrap(
                await call((init) =>
                    go('DELETE', '/notebooks/{id}', { params: { path: { id } }, init }),
                ),
                [204],
            );
        },
        renameNotebook: async (id, name) =>
            unwrap(
                await call((init) =>
                    go('PATCH', '/notebooks/{id}', {
                        params: { path: { id } },
                        contentType: 'application/json',
                        body: { name },
                        init,
                    }),
                ),
                [200],
                GetNotebookResponse,
            ),
        /** Мимо `call`: выход не обновляет токены и не повторяет запрос. */
        logout: async () => {
            const pair = session.revocation();
            if (!pair) return 'unconfirmed';
            let status: number;
            try {
                ({ status } = await go('POST', '/auth/logout', {
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
            unwrap(await call((init) => go('POST', '/auth/logout-all', { init })), [204]);
        },
        enableTwoFactor: async () =>
            unwrap(
                await call((init) => go('POST', '/auth/enable2fa', { init })),
                [200],
                EnableTwoFactorAuthResponse,
            ),
        /** 401 invalid_totp — неверный код, а не истёкший токен: без refresh и повтора с ним. */
        confirmTwoFactor: async (body) => {
            unwrap(
                await call(
                    (init) =>
                        go('POST', '/auth/confirm2fa', {
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
                    go('POST', '/auth/disable2fa', { contentType: 'application/json', body, init }),
                ),
                [200],
            );
        },
        getActiveRuntimeSession: async () =>
            unwrap(
                await call((init) => go('GET', '/runtime-sessions/active', { init })),
                [200],
                GetActiveRuntimeSessionResponse,
            ).active_session,
        getRuntimeSession: async (id) =>
            unwrap(
                await call((init) =>
                    go('GET', '/runtime-sessions/{id}', { params: { path: { id } }, init }),
                ),
                [200],
                GetRuntimeSessionResponse,
            ),
        getRuntimeQueue: async (id) =>
            unwrap(
                await call((init) =>
                    go('GET', '/runtime-sessions/{id}/queue', { params: { path: { id } }, init }),
                ),
                [200],
                GetRuntimeQueueResponse,
            ),
        listRuntimeEvents: async (id, after) =>
            unwrap(
                await call((init) =>
                    go('GET', '/runtime-sessions/{id}/events', {
                        params: { path: { id }, query: { after } },
                        init,
                    }),
                ),
                [200],
                ListRuntimeEventsResponse,
            ),
        getRuntimeExecution: async (id, executionId) =>
            unwrap(
                await call((init) =>
                    go('GET', '/runtime-sessions/{id}/executions/{execution_id}', {
                        params: { path: { id, execution_id: executionId } },
                        init,
                    }),
                ),
                [200],
                GetRuntimeExecutionResponse,
            ),
        startRuntimeSession: async (notebookId, body) =>
            unwrap(
                await call((init) =>
                    go('POST', '/notebooks/{id}/runtime-sessions', {
                        params: { path: { id: notebookId } },
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [202],
                StartRuntimeSessionResponse,
            ),
        createRuntimeExecution: async (id, body) =>
            unwrap(
                await call((init) =>
                    go('POST', '/runtime-sessions/{id}/executions', {
                        params: { path: { id } },
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [202],
                CreateRuntimeExecutionResponse,
            ),
        createRuntimeExecutionBatch: async (id, body) =>
            unwrap(
                await call((init) =>
                    go('POST', '/runtime-sessions/{id}/executions/batch', {
                        params: { path: { id } },
                        contentType: 'application/json',
                        body,
                        init,
                    }),
                ),
                [202],
                CreateRuntimeExecutionBatchResponse,
            ),
        stopRuntimeSession: async (id) =>
            unwrap(
                await call((init) =>
                    go('POST', '/runtime-sessions/{id}/stop', { params: { path: { id } }, init }),
                ),
                [202],
                StopRuntimeSessionResponse,
            ),
        stopRuntimeExecutions: async (id) =>
            unwrap(
                await call((init) =>
                    go('POST', '/runtime-sessions/{id}/executions/stop', {
                        params: { path: { id } },
                        init,
                    }),
                ),
                [200],
                StopRuntimeExecutionsResponse,
            ),
        interruptRuntimeKernel: async (id) =>
            unwrap(
                await call((init) =>
                    go('POST', '/runtime-sessions/{id}/kernel/interrupt', {
                        params: { path: { id } },
                        init,
                    }),
                ),
                [200],
                InterruptRuntimeKernelResponse,
            ),
        touchRuntimeSession: async (id) =>
            unwrap(
                await call((init) =>
                    go('POST', '/runtime-sessions/{id}/activity', {
                        params: { path: { id } },
                        init,
                    }),
                ),
                [200],
                TouchRuntimeSessionResponse,
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
            await go('POST', '/auth/register', {
                contentType: 'application/json',
                body,
                init: withRequestId(requestId),
            }),
            [201],
            RegisterUserResponse,
        ),
    /**
     * Вход в Go.
     * @param body логин, пароль и при включённой 2FA — код `user_code`
     * @param requestId `X-Request-ID` для Go
     */
    login: async (body: LoginRequest, requestId?: string): Promise<AuthResult> =>
        unwrap(
            await go('POST', '/auth/login', {
                contentType: 'application/json',
                body,
                init: withRequestId(requestId),
            }),
            [200],
            LoginUserResponse,
        ),
};
