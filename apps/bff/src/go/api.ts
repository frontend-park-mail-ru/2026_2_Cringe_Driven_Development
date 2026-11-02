import {
    CreateCellResponse,
    CreateNotebookResponse,
    GetCurrentUserResponse,
    GetNotebookResponse,
    ListNotebooksResponse,
    LoginUserResponse,
    RegisterUserResponse,
    UpdateCurrentUserResponse,
} from '@cdd/schemas';

import type { Session } from '../session/session.ts';
import {
    changeCurrentUserPassword,
    createCell,
    createNotebook,
    deleteCell,
    getCurrentUser,
    getNotebook,
    listNotebooks,
    loginUser,
    logoutUser,
    registerUser,
    updateCurrentUser,
    type Cell,
    type ChangeCurrentUserPasswordRequest,
    type CreateCellRequest,
    type CreateNotebookRequest,
    type Credentials,
    type Notebook,
    type NotebookSummary,
    type TokenPair,
    type UpdateCurrentUserRequest,
    type User,
} from './client.ts';
import { unwrap } from './errors.ts';

/** Вызовы Go от имени сессии. */
export type Go = {
    getCurrentUser(): Promise<User>;
    updateCurrentUser(body: UpdateCurrentUserRequest): Promise<User>;
    changeCurrentUserPassword(body: ChangeCurrentUserPasswordRequest): Promise<void>;
    listNotebooks(): Promise<NotebookSummary[]>;
    getNotebook(id: number): Promise<Notebook>;
    createNotebook(body: CreateNotebookRequest): Promise<Notebook>;
    createCell(id: number, body: CreateCellRequest): Promise<Cell>;
    deleteCell(id: number, index: number): Promise<void>;
    logout(): Promise<void>;
};

/**
 * Клиент Go поверх сессии: токены, refresh и повтор после 401 — в `session.call`. Заголовки
 * браузера в Go не уходят: `init` собирает сессия.
 * @param session сессия запроса
 * @returns вызовы Go
 */
export function createGo(session: Session): Go {
    return {
        getCurrentUser: async () =>
            unwrap(await session.call(getCurrentUser), [200], GetCurrentUserResponse),
        updateCurrentUser: async (body) =>
            unwrap(
                await session.call((init) => updateCurrentUser(body, init)),
                [200],
                UpdateCurrentUserResponse,
            ),
        changeCurrentUserPassword: async (body) => {
            unwrap(await session.call((init) => changeCurrentUserPassword(body, init)), [204]);
        },
        listNotebooks: async () =>
            unwrap(await session.call(listNotebooks), [200], ListNotebooksResponse),
        getNotebook: async (id) =>
            unwrap(await session.call((init) => getNotebook(id, init)), [200], GetNotebookResponse),
        createNotebook: async (body) =>
            unwrap(
                await session.call((init) => createNotebook(body, init)),
                [201],
                CreateNotebookResponse,
            ),
        createCell: async (id, body) =>
            unwrap(
                await session.call((init) => createCell(id, body, init)),
                [201],
                CreateCellResponse,
            ),
        deleteCell: async (id, index) => {
            unwrap(await session.call((init) => deleteCell(id, index, init)), [204]);
        },
        // refresh-токен читается в момент вызова: call мог его только что обновить
        logout: async () => {
            unwrap(
                await session.call((init) =>
                    logoutUser({ refresh_token: session.refreshToken ?? '' }, init),
                ),
                [204],
            );
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
