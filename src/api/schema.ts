// Сгенерировано из OpenAPI-спецификации. Не править руками.

export interface paths {
    "/auth/register": {
        post: operations["registerUser"];
    };
    "/auth/login": {
        post: operations["loginUser"];
    };
    "/auth/refresh": {
        post: operations["refreshToken"];
    };
    "/auth/logout": {
        post: operations["logoutUser"];
    };
    "/users/me": {
        get: operations["getCurrentUser"];
    };
    "/notebooks/{id}/cells": {
        post: operations["createCell"];
    };
    "/notebooks/{id}": {
        get: operations["getNotebook"];
    };
    "/notebooks": {
        get: operations["listNotebooks"];
        post: operations["createNotebook"];
    };
    "/notebooks/{id}/cells/{index}": {
        delete: operations["deleteCell"];
    };
}

export interface components {
    schemas: {
        User: {
            /** ID */
            id: number;
            login: string;
        };
        /** Блокнот (.ipynb) */
        Notebook: {
            /** ID */
            id: number;
            /** Название блокнота */
            name: string;
            /** Блоки в порядке блокнота */
            cells: components["schemas"]["Cell"][];
            created_at: string;
            updated_at: string;
        };
        NotebookSummary: {
            id: number;
            name: string;
            updated_at: string;
            /** Число блоков */
            cells_count: number;
        };
        Credentials: {
            login: string;
            password: string;
        };
        Error: {
            code: "validation_error" | "invalid_credentials" | "login_taken" | "unauthorized" | "not_found" | "not_implemented" | "internal";
            message: string;
        };
        /** Блок блокнота */
        Cell: {
            /** ID блока внутри блокнота */
            id: string;
            /** Вид блока */
            kind: "code" | "markdown";
            /** Содержимое блока */
            source: string;
        };
        CreateCellRequest: {
            /** Вид блока */
            kind: "code" | "markdown";
            /** Позиция нового блока, с нуля. Без поля блок добавляется в конец */
            index?: number;
        };
        CreateNotebookRequest: {
            name: string;
        };
    };
}

export interface operations {
    /** Регистрация */
    registerUser: {
        parameters: {};
        requestBody: { content: { "application/json": components["schemas"]["Credentials"] } };
        responses: {
            201: { content: { "application/json": components["schemas"]["User"] } };
            400: { content: { "application/json": components["schemas"]["Error"] } };
            409: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Вход */
    loginUser: {
        parameters: {};
        requestBody: { content: { "application/json": components["schemas"]["Credentials"] } };
        responses: {
            200: { content: { "application/json": components["schemas"]["User"] } };
            400: { content: { "application/json": components["schemas"]["Error"] } };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Обновление токенов */
    refreshToken: {
        parameters: {
            cookie?: {
                /** Refresh-токен (HttpOnly-cookie, Path=/api/v1/auth) */
                refresh_token?: string;
            };
        };
        responses: {
            204: { content?: never };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Выход */
    logoutUser: {
        parameters: {
            cookie?: {
                /** Refresh-токен (HttpOnly-cookie, Path=/api/v1/auth) */
                refresh_token?: string;
            };
        };
        responses: {
            204: { content?: never };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Текущий пользователь */
    getCurrentUser: {
        parameters: {};
        responses: {
            200: { content: { "application/json": components["schemas"]["User"] } };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Добавление блока */
    createCell: {
        parameters: {
            path: {
                /** ID блокнота */
                id: number;
            };
        };
        requestBody: { content: { "application/json": components["schemas"]["CreateCellRequest"] } };
        responses: {
            201: { content: { "application/json": components["schemas"]["Cell"] } };
            400: { content: { "application/json": components["schemas"]["Error"] } };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            404: { content: { "application/json": components["schemas"]["Error"] } };
            409: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Блокнот */
    getNotebook: {
        parameters: {
            path: {
                id: number;
            };
        };
        responses: {
            200: { content: { "application/json": components["schemas"]["Notebook"] } };
            400: { content: { "application/json": components["schemas"]["Error"] } };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            404: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Список блокнотов */
    listNotebooks: {
        parameters: {};
        responses: {
            200: { content: { "application/json": components["schemas"]["NotebookSummary"][] } };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Создание блокнота */
    createNotebook: {
        parameters: {};
        requestBody: { content: { "application/json": components["schemas"]["CreateNotebookRequest"] } };
        responses: {
            201: { content: { "application/json": components["schemas"]["Notebook"] } };
            400: { content: { "application/json": components["schemas"]["Error"] } };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
    /** Удаление блока */
    deleteCell: {
        parameters: {
            path: {
                /** ID блокнота */
                id: number;
                /** Порядковый номер блока в блокноте, с нуля */
                index: number;
            };
        };
        responses: {
            204: { content?: never };
            400: { content: { "application/json": components["schemas"]["Error"] } };
            401: { content: { "application/json": components["schemas"]["Error"] } };
            404: { content: { "application/json": components["schemas"]["Error"] } };
            500: { content: { "application/json": components["schemas"]["Error"] } };
        };
    };
}
