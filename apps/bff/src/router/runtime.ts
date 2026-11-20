import {
    executeAllInput,
    executeInput,
    runtimeSessionInput,
    runtimeUpdatesInput,
    startRuntimeInput,
} from '@cdd/schemas/validate';

import { route } from '../http.ts';

/**
 * Окружение Python блокнота: команды — прокси в Go, чтение изменений — одна агрегирующая
 * `updates`. Отдельные чтения session/queue/events/execution браузеру не публикуются.
 */
export const runtime = [
    /** Запуск окружения блокнота: в интерфейсе только Python, язык выбирает BFF */
    route({
        method: 'POST',
        path: '/api/runtime/start',
        access: 'authed',
        input: { from: 'json', validate: startRuntimeInput },
        handle: ({ go }, input) =>
            go.startRuntimeSession(input.notebookId, {
                request_id: input.requestId,
                language: 'python',
            }),
    }),
    route({
        method: 'POST',
        path: '/api/runtime/execute',
        access: 'authed',
        input: { from: 'json', validate: executeInput },
        handle: ({ go }, { sessionId, ...body }) => go.createRuntimeExecution(sessionId, body),
    }),
    /** Запуск нескольких ячеек одним пакетным запросом Go, не циклом единичных */
    route({
        method: 'POST',
        path: '/api/runtime/execute-all',
        access: 'authed',
        input: { from: 'json', validate: executeAllInput },
        handle: ({ go }, { sessionId, ...body }) => go.createRuntimeExecutionBatch(sessionId, body),
    }),
    route({
        method: 'POST',
        path: '/api/runtime/stop',
        access: 'authed',
        input: { from: 'json', validate: runtimeSessionInput },
        handle: ({ go }, input) => go.stopRuntimeSession(input.sessionId),
    }),
    /** «Остановить всё»: прервать текущее исполнение и отменить очередь, окружение остаётся. */
    route({
        method: 'POST',
        path: '/api/runtime/stop-executions',
        access: 'authed',
        input: { from: 'json', validate: runtimeSessionInput },
        handle: ({ go }, input) => go.stopRuntimeExecutions(input.sessionId),
    }),
    /** Прервать текущее исполнение; итог — из событий, очередь продолжается. */
    route({
        method: 'POST',
        path: '/api/runtime/interrupt',
        access: 'authed',
        input: { from: 'json', validate: runtimeSessionInput },
        handle: ({ go }, input) => go.interruptRuntimeKernel(input.sessionId),
    }),
    /** Активная сессия пользователя в любом блокноте или null: допуск к удалению блокнота. */
    route({
        method: 'GET',
        path: '/api/runtime/active',
        access: 'authed',
        handle: ({ go }) => go.getActiveRuntimeSession(),
    }),
    route({
        method: 'POST',
        path: '/api/runtime/activity',
        access: 'authed',
        input: { from: 'json', validate: runtimeSessionInput },
        handle: ({ go }, input) => go.touchRuntimeSession(input.sessionId),
    }),
    /**
     * Шаг наблюдения, чтение без изменения состояния: POST, чтобы `executionIds` не упирались в
     * длину URL. Сессия, очередь и одна страница событий параллельно, затем снимки исполнений из
     * событий страницы и `executionIds` — по одному запросу на ID. Сбой любого чтения — ошибка
     * всего ответа: частичных данных клиент не получает.
     */
    route({
        method: 'POST',
        path: '/api/runtime/updates',
        access: 'authed',
        input: { from: 'json', validate: runtimeUpdatesInput },
        async handle({ go }, input) {
            const [current, queue, page] = await Promise.all([
                go.getRuntimeSession(input.sessionId),
                go.getRuntimeQueue(input.sessionId),
                go.listRuntimeEvents(input.sessionId, input.after),
            ]);
            const ids = new Set(input.executionIds);
            // ID code-исполнения — только непустой строковый body.execution_id; у инспекций его
            // нет, у событий агента без исполнения (session_state, kernel_started) он пустой
            for (const event of page.events) {
                const id = event.body.execution_id;
                if (typeof id === 'string' && id) ids.add(id);
            }
            const executions = await Promise.all(
                [...ids].map((id) => go.getRuntimeExecution(input.sessionId, id)),
            );
            return {
                session: current,
                runtime_queue: queue,
                events: page.events,
                executions,
                next_cursor: page.next_cursor,
                has_more: page.has_more,
            };
        },
    }),
] as const;
