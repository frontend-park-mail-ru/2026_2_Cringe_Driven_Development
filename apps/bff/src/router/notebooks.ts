import { CreateNotebookBody } from '@cdd/schemas';
import { z } from 'zod';

import { loadNotebook } from '../notebook.ts';
import { authedProcedure, router } from '../trpc.ts';

/** Блокноты пользователя. */
export const notebooks = router({
    list: authedProcedure.query(({ ctx }) => ctx.go.listNotebooks()),
    get: authedProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .query(({ ctx, input }) => loadNotebook(ctx.go, input.id)),
    create: authedProcedure
        .input(CreateNotebookBody)
        .mutation(({ ctx, input }) => ctx.go.createNotebook(input)),
    // окончательное удаление: решение о занятом окружении (409 notebook_in_use) принимает Go
    delete: authedProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .mutation(({ ctx, input }) => ctx.go.deleteNotebook(input.id)),
});
