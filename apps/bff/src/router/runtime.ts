import {
    CreateRuntimeExecutionBatchBody,
    CreateRuntimeExecutionBody,
    GetRuntimeExecutionParams,
    ListRuntimeEventsQueryParams,
    StartRuntimeSessionBody,
} from '@cdd/schemas';
import { z } from 'zod';

import { authedProcedure, router } from '../trpc.ts';

const sessionId = GetRuntimeExecutionParams.shape.id;
const session = z.strictObject({ sessionId });

const MAX_TRACKED = 100;

/**
 * Окружение Python блокнота: команды — прокси в Go, чтение изменений — одна агрегирующая
 * `updates`. Отдельные чтения session/queue/events/execution браузеру не публикуются.
 */
export const runtime = router({
    // в интерфейсе только Python: язык выбирает BFF
    start: authedProcedure
        .input(
            z.strictObject({
                notebookId: z.number().int().positive(),
                requestId: StartRuntimeSessionBody.shape.request_id,
            }),
        )
        .mutation(({ ctx, input }) =>
            ctx.go.startRuntimeSession(input.notebookId, {
                request_id: input.requestId,
                language: 'python',
            }),
        ),
    execute: authedProcedure
        .input(z.strictObject({ sessionId, ...CreateRuntimeExecutionBody.shape }))
        .mutation(({ ctx, input: { sessionId: id, ...body } }) =>
            ctx.go.createRuntimeExecution(id, body),
        ),
    // один пакетный запрос Go, не цикл единичных запусков
    executeAll: authedProcedure
        .input(z.strictObject({ sessionId, ...CreateRuntimeExecutionBatchBody.shape }))
        .mutation(({ ctx, input: { sessionId: id, ...body } }) =>
            ctx.go.createRuntimeExecutionBatch(id, body),
        ),
    stop: authedProcedure
        .input(session)
        .mutation(({ ctx, input }) => ctx.go.stopRuntimeSession(input.sessionId)),
    activity: authedProcedure
        .input(session)
        .mutation(({ ctx, input }) => ctx.go.touchRuntimeSession(input.sessionId)),
    /**
     * Шаг наблюдения: сессия, очередь и одна страница событий параллельно, затем снимки исполнений
     * из событий страницы и `executionIds` — по одному запросу на ID. Сбой любого чтения — ошибка
     * всего ответа: частичных данных клиент не получает.
     */
    updates: authedProcedure
        .input(
            z.strictObject({
                sessionId,
                after: ListRuntimeEventsQueryParams.shape.after,
                executionIds: z
                    .array(GetRuntimeExecutionParams.shape.execution_id)
                    .max(MAX_TRACKED)
                    .default([]),
            }),
        )
        .query(async ({ ctx, input }) => {
            const [current, queue, page] = await Promise.all([
                ctx.go.getRuntimeSession(input.sessionId),
                ctx.go.getRuntimeQueue(input.sessionId),
                ctx.go.listRuntimeEvents(input.sessionId, input.after),
            ]);
            const ids = new Set(input.executionIds);
            // ID code-исполнения — только строковый body.execution_id; у инспекций его нет
            for (const event of page.events) {
                const id = event.body.execution_id;
                if (typeof id === 'string') ids.add(id);
            }
            const executions = await Promise.all(
                [...ids].map((id) => ctx.go.getRuntimeExecution(input.sessionId, id)),
            );
            return {
                session: current,
                runtime_queue: queue,
                events: page.events,
                executions,
                next_cursor: page.next_cursor,
                has_more: page.has_more,
            };
        }),
});
