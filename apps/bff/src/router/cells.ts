import {
    createCellInput,
    deleteCellInput,
    moveCellInput,
    updateCellInput,
} from '@cdd/schemas/validate';

import { route } from '../http.ts';

/**
 * Ячейки блокнота: изменения по `cellId` с проверкой hash в `If-Match`. Входы строгие: лишнее
 * поле (опечатка) не должно молча теряться.
 */
export const cells = [
    route({
        method: 'POST',
        path: '/api/cells/create',
        access: 'authed',
        input: { from: 'json', validate: createCellInput },
        handle: ({ go }, { notebookId, hash, ...body }) => go.addCell(notebookId, hash, body),
    }),
    route({
        method: 'POST',
        path: '/api/cells/update',
        access: 'authed',
        input: { from: 'json', validate: updateCellInput },
        handle: ({ go }, { notebookId, hash, cellId, source }) =>
            go.editCell(notebookId, cellId, hash, { source }),
    }),
    route({
        method: 'POST',
        path: '/api/cells/move',
        access: 'authed',
        input: { from: 'json', validate: moveCellInput },
        handle: ({ go }, { notebookId, hash, cellId, index }) =>
            go.moveCell(notebookId, cellId, hash, { index }),
    }),
    route({
        method: 'POST',
        path: '/api/cells/delete',
        access: 'authed',
        input: { from: 'json', validate: deleteCellInput },
        handle: ({ go }, { notebookId, hash, cellId }) => go.removeCell(notebookId, cellId, hash),
    }),
] as const;
