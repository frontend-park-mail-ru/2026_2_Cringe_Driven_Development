import { TRPCError, initTRPC } from '@trpc/server';
import { z } from 'zod';

import type { Context } from './context.ts';
import { activeSessionOf, appCodeOf, toTrpcError } from './errors.ts';
import { createGo } from './go/api.ts';
import { mockPreferHeader } from './mockPrefer.ts';

const t = initTRPC.context<Context>().create({
    isDev: false,
    errorFormatter({ shape, error }) {
        const internal = error.code === 'INTERNAL_SERVER_ERROR';
        const { stack: _stack, ...data } = shape.data;
        return {
            ...shape,
            // детали неожиданных исключений клиенту не отдаются
            message: internal ? 'Internal Server Error' : shape.message,
            data: {
                ...data,
                appCode: appCodeOf(error),
                activeSession: activeSessionOf(error),
                zodError:
                    error.cause instanceof z.ZodError ? z.flattenError(error.cause) : undefined,
            },
        };
    },
});

/** Роутер tRPC. */
export const router = t.router;

// все процедуры: ошибки — в коды tRPC, Set-Cookie сессии — по итоговому решению
const base = t.procedure.use(async ({ ctx, next }) => {
    try {
        const result = await next();
        if (!result.ok) throw toTrpcError(result.error);
        return result;
    } finally {
        ctx.session.setCookies(ctx.resHeaders);
    }
});

/** Процедура без сессии: вход и регистрация. */
export const publicProcedure = base;

/** Процедура, которой сессия не обязательна: если она есть, `ctx.go` работает от её имени. */
export const optionalSessionProcedure = base.use(({ ctx, next }) =>
    next({ ctx: { go: createGo(ctx.session) } }),
);

/** Процедура с обязательной сессией: без неё — `UNAUTHORIZED`; даёт `ctx.go`. */
export const authedProcedure = base.use(({ ctx, next, path }) => {
    if (!ctx.session.active) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Нет сессии' });
    const prefer = ctx.mockPrefer ? mockPreferHeader(path, ctx.mockPrefer.get(path)) : undefined;
    return next({ ctx: { go: createGo(ctx.session, prefer) } });
});
