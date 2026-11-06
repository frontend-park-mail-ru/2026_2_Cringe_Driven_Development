// Что показывает страница блокнота по состоянию окружения: шапка, баннер, кнопки, ячейка.
import { expect, test } from 'bun:test';
import {
    bannerKind,
    cellRun,
    runtimeButtons,
    runtimeStatus,
    saveStatus,
} from '@pages/NotebookPage/status';
import {
    useRuntimeStore,
    type QueueItem,
    type RuntimeExecution,
    type RuntimeSession,
} from '@stores/runtime';

type Runtime = ReturnType<typeof useRuntimeStore.getState>;

const session = (patch: Partial<RuntimeSession> = {}): RuntimeSession => ({
    id: '00000000-0000-4000-8000-000000000001',
    notebook_id: 1,
    language: 'python',
    state: 'READY',
    stage: 'ready',
    reason: null,
    generation: null,
    created_at: '2026-11-06T10:00:00Z',
    last_activity_at: '2026-11-06T10:00:00Z',
    public_seq: 0,
    journal_incomplete: false,
    cleanup_error: null,
    ...patch,
});

const execution = (
    id: string,
    cell: string,
    patch: Partial<RuntimeExecution> = {},
): RuntimeExecution => ({
    execution_id: id,
    session_id: session().id,
    cell_id: cell,
    source_hash: '0'.repeat(64),
    timeout_seconds: 60,
    attempt: 1,
    state: 'SUCCEEDED',
    outputs: [],
    execution_count: 1,
    output_truncated: false,
    projection: 'applied',
    ...patch,
});

const state = (patch: Partial<Runtime> = {}): Runtime => ({
    ...useRuntimeStore.getState(),
    notebookId: 1,
    session: session(),
    queue: [],
    executions: {},
    latest: {},
    run: null,
    outcome: null,
    busy: null,
    error: null,
    startFailed: false,
    linkLost: false,
    ...patch,
});

const queue = (...items: [string, string, QueueItem['state']][]): QueueItem[] =>
    items.map(([execution_id, cell_id, s]) => ({ execution_id, cell_id, state: s }));

const cell = (
    id: string,
    outputs: { output_type?: unknown }[] = [],
    count: number | null = null,
) => ({
    id,
    executionCount: count,
    outputs,
});

test('шапка: выполнение со ссылкой на ячейку, очередь, подготовка и итоги', () => {
    expect(
        runtimeStatus(state({ queue: queue(['e1', 'a', 'RUNNING'], ['e2', 'c', 'QUEUED']) })),
    ).toEqual({ tone: 'progress', text: 'Выполняется', cell: 'a' });
    expect(runtimeStatus(state({ queue: queue(['e2', 'c', 'QUEUED']) }))?.text).toBe('В очереди');
    expect(runtimeStatus(state({ session: session({ state: 'PROVISIONING' }) }))?.text).toBe(
        'Подготавливаем окружение…',
    );
    expect(runtimeStatus(state({ outcome: 'unknown' }))?.tone).toBe('warning');
    expect(runtimeStatus(state({ outcome: 'stopped' }))?.tone).toBe('neutral');
    // по умолчанию шапка без статуса
    expect(runtimeStatus(state())).toBeUndefined();
    expect(runtimeStatus(state({ session: null }))).toBeUndefined();
    // ошибку очистки показывает баннер, а не «Завершаем…»
    const cleanup = session({ state: 'STOPPING', cleanup_error: 'cleanup_pending' });
    expect(runtimeStatus(state({ session: cleanup }))).toBeUndefined();
});

test('шапка: несохранённое видно вместе с выполнением, «Сохранено» его не перекрывает', () => {
    const running = state({ queue: queue(['e1', 'a', 'RUNNING']) });
    expect(saveStatus('dirty', running)?.text).toBe('Изменения не сохранены');
    expect(saveStatus('saved', running)).toBeUndefined();
    expect(saveStatus('saved', state())?.text).toBe('Сохранено');
    expect(saveStatus('idle', state())).toBeUndefined();
});

test('шапка: результат ждёт сохранения или не сохранён из-за конфликта', () => {
    const pending = state({
        executions: { e1: execution('e1', 'a', { projection: 'pending' }) },
        latest: { a: 'e1' },
    });
    expect(saveStatus('idle', pending)?.text).toBe('Сохраняем результаты…');
    const conflict = state({
        executions: { e1: execution('e1', 'a', { projection: 'conflict' }) },
        latest: { a: 'e1' },
    });
    expect(saveStatus('saved', conflict)).toEqual({
        tone: 'error',
        text: 'Не удалось сохранить результаты',
    });
    // конфликт прежнего исполнения после нового запуска ячейки уже не актуален
    expect(saveStatus('idle', { ...conflict, latest: { a: 'e2' } })).toBeUndefined();
    // проблема исходников важнее
    expect(saveStatus('conflict', conflict)?.text).toMatch(/^Конфликт сохранения/);
});

test('баннер окружения по приоритету', () => {
    expect(bannerKind(state({ session: null }))).toBe('notStarted');
    expect(bannerKind(state())).toBeNull();
    expect(bannerKind(state({ session: session({ state: 'PROVISIONING' }) }))).toBeNull();
    expect(bannerKind(state({ linkLost: true }))).toBe('linkLost');
    expect(bannerKind(state({ session: session({ notebook_id: 7 }) }))).toBe('busy');
    // завершённая сессия другого блокнота слот не занимает
    expect(bannerKind(state({ session: session({ notebook_id: 7, state: 'STOPPED' }) }))).toBe(
        'notStarted',
    );
    expect(bannerKind(state({ session: session({ state: 'STOPPING', cleanup_error: 'x' }) }))).toBe(
        'cleanup',
    );
    // после STOPPED слот свободен: отложенная очистка — не ошибка для пользователя
    expect(bannerKind(state({ session: session({ state: 'STOPPED', cleanup_error: 'x' }) }))).toBe(
        'notStarted',
    );
    expect(bannerKind(state({ session: null, startFailed: true }))).toBe('startFailed');
    expect(bannerKind(state({ session: session({ state: 'FAILED' }) }))).toBe('startFailed');
    expect(
        bannerKind(state({ session: session({ state: 'STOPPED', reason: 'idle_timeout' }) })),
    ).toBe('idle');
    expect(bannerKind(state({ session: session({ state: 'STOPPED', reason: 'requested' }) }))).toBe(
        'notStarted',
    );
});

test('кнопки: завершить — у готовой сессии, «Запустить всё» скрыта во время запуска', () => {
    expect(runtimeButtons(state(), true)).toEqual({ stop: true, runAll: 'enabled' });
    expect(runtimeButtons(state(), false)).toEqual({ stop: true, runAll: 'disabled' });
    expect(runtimeButtons(state({ queue: queue(['e1', 'a', 'QUEUED']) }), true)).toEqual({
        stop: true,
        runAll: 'hidden',
    });
    expect(runtimeButtons(state({ session: session({ state: 'STARTING' }) }), true)).toEqual({
        stop: false,
        runAll: 'disabled',
    });
    expect(runtimeButtons(state({ session: null }), true)).toEqual({
        stop: false,
        runAll: 'disabled',
    });
    expect(runtimeButtons(state({ busy: 'execute' }), true).runAll).toBe('disabled');
});

test('ячейка: очередь скрывает прежний вывод, выполнение показывает только свой', () => {
    const q = queue(['e1', 'a', 'RUNNING'], ['e2', 'c', 'QUEUED']);
    expect(cellRun(state({ queue: q }), cell('c', [], 3))).toEqual({
        indicator: 'queued',
        result: null,
        message: 'В очереди',
        outputs: false,
    });
    expect(cellRun(state({ queue: q }), cell('a'))).toMatchObject({
        indicator: 'running',
        outputs: false,
    });
    const live = state({
        queue: q,
        executions: { e1: execution('e1', 'a', { state: 'RUNNING' }) },
        latest: { a: 'e1' },
    });
    expect(cellRun(live, cell('a')).outputs).toBe(true);
    // очередь чужой сессии к ячейкам этого блокнота не относится
    expect(
        cellRun(state({ queue: q, session: session({ notebook_id: 7 }) }), cell('a')).indicator,
    ).toBe('run');
});

test('ячейка: итог исполнения и сохранённый результат', () => {
    const run = (s: RuntimeExecution['state']) =>
        cellRun(
            state({ executions: { e: execution('e', 'a', { state: s }) }, latest: { a: 'e' } }),
            cell('a'),
        );
    expect(run('SUCCEEDED')).toMatchObject({ result: 'succeeded', message: null });
    expect(run('FAILED')).toMatchObject({ result: 'failed', message: null });
    expect(run('TIMED_OUT')).toMatchObject({
        result: 'failed',
        message: 'Превышено время выполнения',
    });
    expect(run('UNKNOWN').result).toBe('unknown');
    expect(run('CANCELLED')).toMatchObject({ result: null, message: 'Выполнение отменено' });
    // без исполнения на странице — по сохранённому выводу
    expect(cellRun(state(), cell('a', [{ output_type: 'error' }], 2)).result).toBe('failed');
    expect(cellRun(state(), cell('a', [{ output_type: 'stream' }], 2)).result).toBe('succeeded');
    expect(cellRun(state(), cell('a')).result).toBeNull();
});
