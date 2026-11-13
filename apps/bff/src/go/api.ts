import {
    AddNotebookCellResponse,
    CreateRuntimeExecutionBatchResponse,
    CreateRuntimeExecutionResponse,
    GetActiveRuntimeSessionResponse,
    GetRuntimeExecutionResponse,
    GetRuntimeQueueResponse,
    GetRuntimeSessionResponse,
    ListRuntimeEventsResponse,
    StartRuntimeSessionResponse,
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

import type { Session } from '../session/session.ts';
import {
    addNotebookCell,
    changeCurrentUserPassword,
    confirmTwoFactorAuth,
    createNotebook,
    createRuntimeExecution,
    createRuntimeExecutionBatch,
    deleteNotebook,
    disableTwoFactorAuth,
    enableTwoFactorAuth,
    getActiveRuntimeSession,
    getRuntimeExecution,
    getRuntimeQueue,
    getRuntimeSession,
    listRuntimeEvents,
    startRuntimeSession,
    stopRuntimeSession,
    touchRuntimeSession,
    editNotebookCell,
    getCurrentUser,
    getNotebook,
    getNotebookContent,
    listNotebooks,
    loginUser,
    logoutAllUserSessions,
    logoutUser,
    moveNotebookCell,
    registerUser,
    removeNotebookCell,
    updateCurrentUser,
    uploadCurrentUserAvatar,
    type AddNotebookCellRequest,
    type ChangeCurrentUserPasswordRequest,
    type ConfirmTwoFactorRequest,
    type DisableTwoFactorRequest,
    type LoginRequest,
    type TwoFactorSetupResponse,
    type CreateNotebookRequest,
    type EditNotebookCellRequest,
    type MoveNotebookCellRequest,
    type Credentials,
    type Notebook,
    type NotebookCellChange,
    type NotebookContent,
    type NotebookContentChange,
    type ListNotebooksParams,
    type NotebookListPage,
    type RuntimeBatchExecuteRequest,
    type RuntimeBatchExecution,
    type RuntimeEventsResponse,
    type RuntimeExecuteRequest,
    type RuntimeExecution,
    type RuntimeQueueSnapshot,
    type RuntimeSession,
    type RuntimeStartRequest,
    type TokenPair,
    type UpdateCurrentUserRequest,
    type User,
} from './client.ts';
import { unwrap } from './errors.ts';

const withHeader = (init: RequestInit, name: string, value: string): RequestInit => {
    const headers = new Headers(init.headers);
    headers.set(name, value);
    return { ...init, headers };
};

/** `hash` — непрозрачная строка без кавычек: в Go уходит одним сильным ETag. */
const ifMatch = (init: RequestInit, hash: string): RequestInit =>
    withHeader(init, 'If-Match', `"${hash}"`);

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
    touchRuntimeSession(id: string): Promise<{ accepted: true }>;
};

/**
 * Клиент Go поверх сессии: токены, refresh и повтор после 401 — в `session.call`, кроме `logout`.
 * Заголовки браузера в Go не уходят: `init` собирает сессия.
 * @param session сессия текущего запроса
 * @param prefer заголовок `Prefer` для локального мока Prism, только в `dev:prism`
 */
export function createGo(session: Session, prefer?: string): Go {
    const call: Session['call'] = (fn, refused) =>
        session.call((init) => fn(prefer ? withHeader(init, 'Prefer', prefer) : init), refused);
    return {
        getCurrentUser: async () =>
            unwrap(await call(getCurrentUser), [200], GetCurrentUserResponse),
        updateCurrentUser: async (body) =>
            unwrap(
                await call((init) => updateCurrentUser(body, init)),
                [200],
                UpdateCurrentUserResponse,
            ),
        changeCurrentUserPassword: async (body) => {
            unwrap(await call((init) => changeCurrentUserPassword(body, init)), [204]);
        },
        uploadCurrentUserAvatar: async (avatar) =>
            unwrap(
                await call((init) => uploadCurrentUserAvatar({ avatar }, init)),
                [200],
                UploadCurrentUserAvatarResponse,
            ),
        listNotebooks: async (params) =>
            unwrap(await call((init) => listNotebooks(params, init)), [200], ListNotebooksResponse),
        getNotebook: async (id) =>
            unwrap(await call((init) => getNotebook(id, init)), [200], GetNotebookResponse),
        getNotebookContent: async (id) =>
            unwrap(
                await call((init) => getNotebookContent(id, init)),
                [200],
                GetNotebookContentResponse,
            ),
        createNotebook: async (body) =>
            unwrap(await call((init) => createNotebook(body, init)), [201], CreateNotebookResponse),
        addCell: async (id, hash, body) =>
            unwrap(
                await call((init) => addNotebookCell(id, body, ifMatch(init, hash))),
                [201],
                AddNotebookCellResponse,
            ),
        editCell: async (id, cellId, hash, body) =>
            unwrap(
                await call((init) => editNotebookCell(id, cellId, body, ifMatch(init, hash))),
                [200],
                EditNotebookCellResponse,
            ),
        moveCell: async (id, cellId, hash, body) =>
            unwrap(
                await call((init) => moveNotebookCell(id, cellId, body, ifMatch(init, hash))),
                [200],
                MoveNotebookCellResponse,
            ),
        removeCell: async (id, cellId, hash) =>
            unwrap(
                await call((init) => removeNotebookCell(id, cellId, ifMatch(init, hash))),
                [200],
                RemoveNotebookCellResponse,
            ),
        /** 204 без тела: JSON не читается. */
        deleteNotebook: async (id) => {
            unwrap(await call((init) => deleteNotebook(id, init)), [204]);
        },
        /** Мимо `call`: выход не обновляет токены и не повторяет запрос. */
        logout: async () => {
            const pair = session.revocation();
            if (!pair) return 'unconfirmed';
            const init = prefer ? withHeader(pair.init, 'Prefer', prefer) : pair.init;
            let status: number;
            try {
                ({ status } = await logoutUser({ refresh_token: pair.refresh }, init));
            } catch {
                return 'unknown';
            }
            if (status === 204) return 'confirmed';
            return status >= 400 && status < 500 ? 'unconfirmed' : 'unknown';
        },
        logoutAll: async () => {
            unwrap(await call((init) => logoutAllUserSessions(init)), [204]);
        },
        enableTwoFactor: async () =>
            unwrap(await call(enableTwoFactorAuth), [200], EnableTwoFactorAuthResponse),
        /** 401 invalid_totp — неверный код, а не истёкший токен: без refresh и повтора с ним. */
        confirmTwoFactor: async (body) => {
            unwrap(await call((init) => confirmTwoFactorAuth(body, init), isInvalidTotp), [200]);
        },
        disableTwoFactor: async (body) => {
            unwrap(await call((init) => disableTwoFactorAuth(body, init)), [200]);
        },
        getActiveRuntimeSession: async () =>
            unwrap(await call(getActiveRuntimeSession), [200], GetActiveRuntimeSessionResponse)
                .active_session,
        getRuntimeSession: async (id) =>
            unwrap(
                await call((init) => getRuntimeSession(id, init)),
                [200],
                GetRuntimeSessionResponse,
            ),
        getRuntimeQueue: async (id) =>
            unwrap(await call((init) => getRuntimeQueue(id, init)), [200], GetRuntimeQueueResponse),
        listRuntimeEvents: async (id, after) =>
            unwrap(
                await call((init) => listRuntimeEvents(id, { after }, init)),
                [200],
                ListRuntimeEventsResponse,
            ),
        getRuntimeExecution: async (id, executionId) =>
            unwrap(
                await call((init) => getRuntimeExecution(id, executionId, init)),
                [200],
                GetRuntimeExecutionResponse,
            ),
        startRuntimeSession: async (notebookId, body) =>
            unwrap(
                await call((init) => startRuntimeSession(notebookId, body, init)),
                [202],
                StartRuntimeSessionResponse,
            ),
        createRuntimeExecution: async (id, body) =>
            unwrap(
                await call((init) => createRuntimeExecution(id, body, init)),
                [202],
                CreateRuntimeExecutionResponse,
            ),
        createRuntimeExecutionBatch: async (id, body) =>
            unwrap(
                await call((init) => createRuntimeExecutionBatch(id, body, init)),
                [202],
                CreateRuntimeExecutionBatchResponse,
            ),
        stopRuntimeSession: async (id) =>
            unwrap(
                await call((init) => stopRuntimeSession(id, init)),
                [202],
                StopRuntimeSessionResponse,
            ),
        touchRuntimeSession: async (id) =>
            unwrap(
                await call((init) => touchRuntimeSession(id, init)),
                [200],
                TouchRuntimeSessionResponse,
            ),
    };
}

/** Пользователь и пара токенов после входа или регистрации. */
export type AuthResult = { user: User; tokens: TokenPair };

const withRequestId = (requestId?: string): RequestInit => ({
    headers: requestId ? { 'X-Request-ID': requestId } : {},
});

/** Вызовы Go без сессии — вход и регистрация. */
export const publicGo = {
    /**
     * Регистрация в Go.
     * @param body логин и пароль
     * @param requestId `X-Request-ID` для Go
     */
    register: async (body: Credentials, requestId?: string): Promise<AuthResult> =>
        unwrap(await registerUser(body, withRequestId(requestId)), [201], RegisterUserResponse),
    /**
     * Вход в Go.
     * @param body логин, пароль и при включённой 2FA — код `user_code`
     * @param requestId `X-Request-ID` для Go
     */
    login: async (body: LoginRequest, requestId?: string): Promise<AuthResult> =>
        unwrap(await loginUser(body, withRequestId(requestId)), [200], LoginUserResponse),
};
