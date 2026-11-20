import {
    createNotebookInput,
    deleteNotebookInput,
    getNotebookInput,
    listNotebooksInput,
    renameNotebookInput,
} from '@cdd/schemas/validate';

import { route } from '../http.ts';
import { loadNotebook } from '../notebook.ts';

/** Блокноты пользователя. */
export const notebooks = [
    /** Страница списка: `limit` и `cursor` уходят в Go. */
    route({
        method: 'GET',
        path: '/api/notebooks/list',
        access: 'authed',
        input: { from: 'query', validate: listNotebooksInput },
        handle: ({ go }, input) => go.listNotebooks(input),
    }),
    route({
        method: 'GET',
        path: '/api/notebooks/get',
        access: 'authed',
        input: { from: 'query', validate: getNotebookInput },
        handle: ({ go }, input) => loadNotebook(go, input.id),
    }),
    route({
        method: 'POST',
        path: '/api/notebooks/create',
        access: 'authed',
        input: { from: 'json', validate: createNotebookInput },
        handle: ({ go }, input) => go.createNotebook(input),
    }),
    /** Переименование: имя по правилам создания, пробелы по краям обрезает Go. */
    route({
        method: 'POST',
        path: '/api/notebooks/rename',
        access: 'authed',
        input: { from: 'json', validate: renameNotebookInput },
        handle: ({ go }, input) => go.renameNotebook(input.id, input.name),
    }),
    /** Окончательное удаление: решение о занятом окружении (`409 notebook_in_use`) принимает Go. */
    route({
        method: 'POST',
        path: '/api/notebooks/delete',
        access: 'authed',
        input: { from: 'json', validate: deleteNotebookInput },
        handle: ({ go }, input) => go.deleteNotebook(input.id),
    }),
] as const;
