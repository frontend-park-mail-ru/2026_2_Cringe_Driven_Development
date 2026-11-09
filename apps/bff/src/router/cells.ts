import {
    AddNotebookCellBody,
    EditNotebookCellBody,
    EditNotebookCellParams,
    MoveNotebookCellBody,
} from '@cdd/schemas';
import { z } from 'zod';

import { authedProcedure, router } from '../trpc.ts';

/** Общие поля входа: блокнот и его `hash` — без HTTP-кавычек, их ставит BFF в `If-Match` */
const target = {
    notebookId: z.number().int().positive(),
    hash: z
        .string()
        .min(1)
        .regex(/^[^"\r\n]+$/),
};
const cellId = EditNotebookCellParams.shape.cell_id;

/**
 * Ячейки блокнота: изменения по `cell_id` с проверкой hash в `If-Match`. Входы — `strictObject`:
 * лишнее поле (опечатка) не должно молча теряться.
 */
export const cells = router({
    create: authedProcedure
        .input(z.strictObject({ ...target, ...AddNotebookCellBody.shape }))
        .mutation(({ ctx, input: { notebookId, hash, ...body } }) =>
            ctx.go.addCell(notebookId, hash, body),
        ),
    update: authedProcedure
        .input(z.strictObject({ ...target, cellId, ...EditNotebookCellBody.shape }))
        .mutation(({ ctx, input: { notebookId, hash, cellId: id, source } }) =>
            ctx.go.editCell(notebookId, id, hash, { source }),
        ),
    move: authedProcedure
        .input(z.strictObject({ ...target, cellId, ...MoveNotebookCellBody.shape }))
        .mutation(({ ctx, input: { notebookId, hash, cellId: id, index } }) =>
            ctx.go.moveCell(notebookId, id, hash, { index }),
        ),
    delete: authedProcedure
        .input(z.strictObject({ ...target, cellId }))
        .mutation(({ ctx, input: { notebookId, hash, cellId: id } }) =>
            ctx.go.removeCell(notebookId, id, hash),
        ),
});
