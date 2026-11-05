import {
    AddNotebookCellResponse,
    EditNotebookCellResponse,
    MoveNotebookCellResponse,
    RemoveNotebookCellResponse,
    CreateNotebookResponse,
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
    createNotebook,
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
    type CreateNotebookRequest,
    type EditNotebookCellRequest,
    type MoveNotebookCellRequest,
    type Credentials,
    type Notebook,
    type NotebookCellChange,
    type NotebookContent,
    type NotebookContentChange,
    type NotebookSummary,
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

// hash — непрозрачная строка без кавычек: в Go уходит одним сильным ETag
const ifMatch = (init: RequestInit, hash: string): RequestInit =>
    withHeader(init, 'If-Match', `"${hash}"`);

/** Итог отзыва сессии в Go при выходе. */
export type ServerRevocation = 'confirmed' | 'unconfirmed' | 'unknown';

/** Вызовы Go от имени сессии. */
export type Go = {
    getCurrentUser(): Promise<User>;
    updateCurrentUser(body: UpdateCurrentUserRequest): Promise<User>;
    changeCurrentUserPassword(body: ChangeCurrentUserPasswordRequest): Promise<void>;
    uploadCurrentUserAvatar(avatar: Blob): Promise<User>;
    listNotebooks(): Promise<NotebookSummary[]>;
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
    logout(): Promise<ServerRevocation>;
    logoutAll(): Promise<void>;
};

/**
 * Клиент Go поверх сессии: токены, refresh и повтор после 401 — в `session.call`; кроме `logout`. Заголовки
 * браузера в Go не уходят: `init` собирает сессия.
 * @param session сессия запроса
 * @param prefer заголовок `Prefer` для локального мока Prism, только в `dev:prism`
 * @returns вызовы Go
 */
export function createGo(session: Session, prefer?: string): Go {
    const call: Session['call'] = (fn) =>
        session.call((init) => fn(prefer ? withHeader(init, 'Prefer', prefer) : init));
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
        listNotebooks: async () => unwrap(await call(listNotebooks), [200], ListNotebooksResponse),
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
        // мимо call: выход не обновляет токены и не повторяет запрос
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
     * @returns пользователь и токены
     */
    register: async (body: Credentials, requestId?: string): Promise<AuthResult> =>
        unwrap(await registerUser(body, withRequestId(requestId)), [201], RegisterUserResponse),
    /**
     * Вход в Go.
     * @param body логин и пароль
     * @param requestId `X-Request-ID` для Go
     * @returns пользователь и токены
     */
    login: async (body: Credentials, requestId?: string): Promise<AuthResult> =>
        unwrap(await loginUser(body, withRequestId(requestId)), [200], LoginUserResponse),
};
