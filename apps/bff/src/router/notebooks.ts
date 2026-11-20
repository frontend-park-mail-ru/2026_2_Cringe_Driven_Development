import { CreateNotebookBody } from '@cdd/schemas';
import { z } from 'zod';

import { loadNotebook } from '../notebook.ts';
import { authedProcedure, router } from '../trpc.ts';

/** Блокноты пользователя. */
export const notebooks = router({
    /** Страница списка: `limit` и `cursor` уходят в Go, `search` — нет. */
    list: authedProcedure
        .input(
            z
                .object({
                    limit: z.number().int().min(1).max(100).optional(),
                    cursor: z.string().min(1).optional(),
                })
                .optional(),
        )
        .query(({ ctx, input }) => ctx.go.listNotebooks(input)),
    get: authedProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .query(({ ctx, input }) => loadNotebook(ctx.go, input.id)),
    create: authedProcedure
        .input(CreateNotebookBody)
        .mutation(({ ctx, input }) => ctx.go.createNotebook(input)),
    /** Переименование: имя по правилам создания, пробелы по краям обрезает Go. */
    rename: authedProcedure
        .input(z.strictObject({ id: z.number().int().positive(), ...CreateNotebookBody.shape }))
        .mutation(({ ctx, input }) => ctx.go.renameNotebook(input.id, input.name)),
    /** Окончательное удаление: решение о занятом окружении (`409 notebook_in_use`) принимает Go. */
    delete: authedProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .mutation(({ ctx, input }) => ctx.go.deleteNotebook(input.id)),
});
