// Стор окружения: восстановление, опрос порциями, запуск после сохранения, итог запуска.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Cell, NotebookPageData } from '@api/trpc';
import {
    addCell,
    closeConflictDialog,
    closeNotebook,
    editSource,
    openNotebook,
    useNotebookStore,
} from '@stores/notebook';
import {
    closeRuntime,
    openRuntime,
    retryCommand,
    runAll,
    runCell,
    runStatus,
    sha256,
    startRuntime,
    stopRuntime,
    useRuntimeStore,
    type RuntimeExecution,
    type RuntimeSession,
} from '@stores/runtime';
import { fakeRpc, held, ok, rpcError, settle } from './fakeRpc';

const SID = '00000000-0000-4000-8000-000000000001';
const code = (id: string, source = ''): Cell => ({
    id,
    kind: 'code',
    source,
    outputs: [],
    execution_count: null,
    output_truncated: false,
});
const session = (patch: Partial<RuntimeSession> = {}): RuntimeSession => ({
    id: SID,
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
const page = (
    cells: Cell[],
    active: RuntimeSession | null = session(),
    items: NotebookPageData['runtime_queue'] extends infer Q
        ? Q extends { items: infer I }
            ? I
            : never
        : never = [],
): NotebookPageData => ({
    notebook: { id: 1, name: 'Блокнот', created_at: '', updated_at: '', hash: 'h0', cells },
    active_session: active,
    runtime_queue: active?.notebook_id === 1 ? { session_id: SID, items } : null,
});
const exec = async (
    id: string,
    cellId: string,
    source: string,
    patch: Partial<RuntimeExecution> = {},
): Promise<RuntimeExecution> => ({
    execution_id: id,
    session_id: SID,
    cell_id: cellId,
    source_hash: await sha256(source),
    timeout_seconds: 300,
    attempt: 1,
    state: 'SUCCEEDED',
    outputs: [{ output_type: 'stream', name: 'stdout', text: '42\n' }],
    execution_count: 1,
    output_truncated: false,
    projection: 'applied',
    ...patch,
});
type UpdatesInput = { sessionId: string; after: number; executionIds: string[] };
const updates = (
    executions: RuntimeExecution[] = [],
    patch: { items?: { execution_id: string; cell_id: string; state: 'QUEUED' | 'RUNNING' }[] } & {
        session?: RuntimeSession;
        next_cursor?: number;
        has_more?: boolean;
    } = {},
) =>
    ok({
        session: patch.session ?? session(),
        runtime_queue: { session_id: SID, items: patch.items ?? [] },
        events: [],
        executions,
        next_cursor: patch.next_cursor ?? 0,
        has_more: patch.has_more ?? false,
    });

let rpc: ReturnType<typeof fakeRpc>;
const state = () => useRuntimeStore.getState();
const inputs = (path: string) => rpc.calls.filter((c) => c.path === path).map((c) => c.input);
const open = (p: NotebookPageData) => {
    openNotebook(p);
    openRuntime(p);
};

beforeEach(() => {
    rpc = fakeRpc();
    rpc.on('runtime.activity', () => ok({ accepted: true }));
});
afterEach(() => {
    closeRuntime();
    closeNotebook();
    rpc.restore();
});

test('открытие: спиннеры из снимка очереди сразу, опрос с after=0 и ID очереди', async () => {
    rpc.on('runtime.updates', () => held(updates()).handler());
    open(
        page([code('a'), code('b')], session(), [
            { execution_id: 'e1', cell_id: 'a', state: 'RUNNING' },
            { execution_id: 'e2', cell_id: 'b', state: 'QUEUED' },
        ]),
    );
    expect(runStatus(state())).toBe('running');
    expect(state().latest).toEqual({ a: 'e1', b: 'e2' });
    await settle();
    expect(inputs('runtime.updates')).toEqual([
        { sessionId: SID, after: 0, executionIds: ['e1', 'e2'] },
    ]);
});

test('сессия другого блокнота: не привязывается и не опрашивается', async () => {
    open(page([code('a')], session({ notebook_id: 7 })));
    await settle();
    expect(state().session?.notebook_id).toBe(7);
    expect(rpc.calls).toEqual([]);
    await runCell('a');
    expect(rpc.calls).toEqual([]);
});

test('без сессии — опроса нет; запуск окружения переходит к наблюдению', async () => {
    rpc.on('runtime.start', () => ok(session({ state: 'PROVISIONING', stage: 'queued' })));
    rpc.on('runtime.updates', () => updates());
    open(page([code('a')], null));
    await settle();
    expect(rpc.calls).toEqual([]);
    await startRuntime();
    await settle();
    expect(inputs('runtime.start')).toEqual([{ notebookId: 1, requestId: expect.any(String) }]);
    expect(state().session?.state).toBe('READY');
    expect(state().ready).toBe(1);
});

test('запуск окружения: сбой сети — повтор с тем же request_id', async () => {
    rpc.on(
        'runtime.start',
        () => 'network',
        () => ok(session()),
    );
    rpc.on('runtime.updates', () => updates());
    open(page([code('a')], null));
    await startRuntime();
    expect(state().error).toBe('network');
    await retryCommand();
    const [first, second] = inputs('runtime.start') as { requestId: string }[];
    expect(second!.requestId).toBe(first!.requestId);
    expect(state().session?.id).toBe(SID);
    await settle();
});

test('409 active_session_exists: показана занятая сессия другого блокнота, она не заменяется', async () => {
    rpc.on('runtime.start', () => ({
        error: {
            code: 'CONFLICT',
            httpStatus: 409,
            appCode: 'active_session_exists',
            activeSession: session({ notebook_id: 9 }),
        } as never,
    }));
    open(page([code('a')], null));
    await startRuntime();
    await settle();
    expect(state().session?.notebook_id).toBe(9);
    expect(inputs('runtime.updates')).toEqual([]);
});

test('▶: ждёт сохранения, шлёт SHA-256 сохранённого исходника, результат — в ячейку', async () => {
    const result = await exec('x', 'a', 'print(42)');
    rpc.on('cells.update', () => ok({ hash: 'h1', cell: { id: 'a', kind: 'code', source: '' } }));
    rpc.on('runtime.execute', (input) =>
        ok({ ...result, execution_id: (input as { execution_id: string }).execution_id }),
    );
    rpc.on('runtime.updates', (input) =>
        updates([{ ...result, execution_id: (input as UpdatesInput).executionIds[0]! }]),
    );
    open(page([code('a')]));
    await settle();
    editSource('a', 'print(42)', false);
    await runCell('a');
    await settle();
    expect(rpc.calls.map((c) => c.path).indexOf('cells.update')).toBeLessThan(
        rpc.calls.map((c) => c.path).indexOf('runtime.execute'),
    );
    const [body] = inputs('runtime.execute');
    expect(body).toEqual({
        sessionId: SID,
        execution_id: expect.any(String),
        cell_id: 'a',
        source_hash: await sha256('print(42)'),
    });
    expect(state().outcome).toBe('succeeded');
    const cell = useNotebookStore.getState().confirmed?.cells[0];
    expect(cell).toMatchObject({ execution_count: 1, outputs: result.outputs });
    expect(useNotebookStore.getState().confirmed?.hash).toBe('h1');
});

test('известный конфликт: ▶ и «Выполнить всё» открывают диалог, команды не уходят', async () => {
    rpc.on('cells.update', () => rpcError('CONFLICT', 409, 'notebook_conflict'));
    rpc.on('notebooks.get', () => ok(page([code('a', 'чужое')])));
    rpc.on('runtime.updates', () => updates());
    open(page([code('a')]));
    editSource('a', 'x', false);
    await runCell('a');
    await settle();
    closeConflictDialog();
    await runAll();
    expect(useNotebookStore.getState().conflict).toMatchObject({ dialogOpen: true });
    expect(inputs('runtime.execute')).toEqual([]);
    expect(inputs('runtime.executeAll')).toEqual([]);
});

test('сбой сети на ▶: повтор с тем же execution_id и телом', async () => {
    const result = await exec('x', 'a', '1');
    rpc.on(
        'runtime.execute',
        () => 'network',
        (input) =>
            ok({ ...result, execution_id: (input as { execution_id: string }).execution_id }),
    );
    rpc.on('runtime.updates', () => updates());
    open(page([code('a', '1')]));
    await runCell('a');
    expect(state().error).toBe('network');
    await retryCommand();
    const [first, second] = inputs('runtime.execute');
    expect(second).toEqual(first);
    expect(state().run).toHaveLength(1);
});

test('429 queue_full и 409 conflict: запуска нет; конфликт source перечитывает блокнот', async () => {
    rpc.on(
        'runtime.execute',
        () => rpcError('TOO_MANY_REQUESTS', 429, 'queue_full'),
        () => rpcError('CONFLICT', 409, 'conflict'),
    );
    rpc.on('runtime.updates', () => updates());
    rpc.on('notebooks.get', () => ok(page([code('a', 'изменили')])));
    open(page([code('a', '1')]));
    await runCell('a');
    expect(state().error).toBe('queue_full');
    await runCell('a');
    await settle();
    expect(state().error).toBe('conflict');
    expect(state().run).toBeNull();
    expect(useNotebookStore.getState().conflict).toMatchObject({ phase: 'ready' });
    await retryCommand();
    expect(inputs('runtime.execute')).toHaveLength(2);
});

test('Run all: состав фиксируется при нажатии, ячейка добавленная во время сохранения не входит', async () => {
    const slow = held(ok({ hash: 'h1', cell: { id: 'a', kind: 'code', source: '' } }));
    rpc.on('cells.update', slow.handler);
    rpc.on('cells.create', () => ok({ hash: 'h2', cell: { id: 'b', kind: 'code', source: '' } }));
    rpc.on('runtime.executeAll', () =>
        ok({ request_id: 'r', session_id: SID, execution_ids: ['e1', 'e2'] }),
    );
    rpc.on('runtime.updates', () => updates());
    open(page([code('a'), code('c', 'c')]));
    editSource('a', 'a', false);
    const done = runAll();
    await settle();
    void addCell('code', 1);
    slow.release();
    await done;
    expect(inputs('runtime.executeAll')).toEqual([
        {
            sessionId: SID,
            request_id: expect.any(String),
            cells: [
                { cell_id: 'a', source_hash: await sha256('a') },
                { cell_id: 'c', source_hash: await sha256('c') },
            ],
        },
    ]);
    expect(state().run).toEqual(['e1', 'e2']);
    expect(state().latest).toEqual({ a: 'e1', c: 'e2' });
});

test('Run all: правка зафиксированной ячейки во время сохранения — запуска нет', async () => {
    const slow = held(ok({ hash: 'h1', cell: { id: 'a', kind: 'code', source: '' } }));
    rpc.on('cells.update', slow.handler, () =>
        ok({ hash: 'h2', cell: { id: 'a', kind: 'code', source: '' } }),
    );
    open(page([code('a')]));
    editSource('a', 'x', false);
    const done = runAll();
    await settle();
    editSource('a', 'xy', false);
    slow.release();
    await done;
    expect(inputs('runtime.executeAll')).toEqual([]);
    expect(state().busy).toBeNull();
});

test('150 исполнений: порции 100 + 50 подряд, итог не по первой порции; ошибка вне первых 100', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `e${i}`);
    const cells = ids.map((id) => code(`c${id}`, id));
    const snapshots = new Map<string, RuntimeExecution>();
    for (const [i, id] of ids.entries()) {
        snapshots.set(
            id,
            await exec(id, `c${id}`, id, {
                state: i === 120 ? 'FAILED' : 'SUCCEEDED',
                projection: 'pending',
            }),
        );
    }
    rpc.on('runtime.executeAll', () =>
        ok({ request_id: 'r', session_id: SID, execution_ids: ids }),
    );
    rpc.on('runtime.updates', (input) =>
        updates((input as UpdatesInput).executionIds.map((id) => snapshots.get(id)!)),
    );
    open(page(cells));
    await settle();
    rpc.calls.length = 0;
    await runAll();
    await settle();
    const chunks = (inputs('runtime.updates') as UpdatesInput[]).map((c) => c.executionIds);
    expect(chunks.slice(0, 2).map((c) => c.length)).toEqual([100, 50]);
    expect(new Set(chunks.slice(0, 2).flat())).toEqual(new Set(ids));
    expect(state().outcome).toBe('failed');
});

test('has_more — следующий вызов сразу с next_cursor; ошибка — тот же курсор, экран прежний', async () => {
    const running = [{ execution_id: 'e1', cell_id: 'a', state: 'RUNNING' as const }];
    rpc.on(
        'runtime.updates',
        () => updates([], { items: running, next_cursor: 5, has_more: true }),
        () => 'network',
        () => updates([], { items: running, next_cursor: 9 }),
    );
    open(page([code('a')], session(), [{ execution_id: 'e1', cell_id: 'a', state: 'RUNNING' }]));
    await settle();
    expect(state().linkLost).toBe(true);
    expect(runStatus(state())).toBe('running');
    await Bun.sleep(2100);
    await settle();
    expect((inputs('runtime.updates') as UpdatesInput[]).map((c) => c.after)).toEqual([0, 5, 5]);
    expect(state().linkLost).toBe(false);
});

test('итог: UNKNOWN важнее ошибки, ошибка — отмены; поздний ответ итог не меняет', async () => {
    const a = await exec('e1', 'a', '', { state: 'FAILED' });
    const b = await exec('e2', 'b', '', { state: 'UNKNOWN' });
    rpc.on('runtime.executeAll', () =>
        ok({ request_id: 'r', session_id: SID, execution_ids: ['e1', 'e2'] }),
    );
    rpc.on(
        'runtime.updates',
        () => updates(),
        () => updates([a, b]),
        () => updates([a, { ...b, state: 'SUCCEEDED' }]),
    );
    open(page([code('a'), code('b')]));
    await settle();
    await runAll();
    await settle();
    expect(state().outcome).toBe('unknown');
});

test('сессия завершилась, исполнение не дочитано — «Результат неизвестен», опрос прекращён', async () => {
    rpc.on('runtime.executeAll', () =>
        ok({ request_id: 'r', session_id: SID, execution_ids: ['e1'] }),
    );
    rpc.on(
        'runtime.updates',
        () => updates(),
        () => updates([], { session: session({ state: 'STOPPED', stage: 'stopped' }) }),
    );
    open(page([code('a')]));
    await settle();
    await runAll();
    await settle();
    expect(state().outcome).toBe('unknown');
    const count = inputs('runtime.updates').length;
    await Bun.sleep(2100);
    expect(inputs('runtime.updates')).toHaveLength(count);
});

test('stop: после принятия STOPPING и сразу опрос; исполнять нельзя', async () => {
    rpc.on('runtime.stop', () => ok({ accepted: true }));
    rpc.on(
        'runtime.updates',
        () => updates(),
        () => held(updates()).handler(),
    );
    open(page([code('a')]));
    await settle();
    await stopRuntime();
    expect(state().session?.state).toBe('STOPPING');
    await runCell('a');
    await settle();
    expect(inputs('runtime.execute')).toEqual([]);
    expect(inputs('runtime.updates')).toHaveLength(2);
});

test('поздний результат старого source не попадает в ячейку с новым исходником', async () => {
    const old = await exec('e1', 'a', 'старое', { state: 'RUNNING', projection: 'pending' });
    rpc.on('runtime.updates', () => updates([old]));
    open(
        page([code('a', 'новое')], session(), [
            { execution_id: 'e1', cell_id: 'a', state: 'RUNNING' },
        ]),
    );
    await settle();
    expect(useNotebookStore.getState().confirmed?.cells[0]).toMatchObject({ outputs: [] });
});

test('уход со страницы: поздний ответ не применяется, опрос прекращён', async () => {
    const late = held(
        updates([], { items: [{ execution_id: 'e9', cell_id: 'a', state: 'RUNNING' }] }),
    );
    rpc.on('runtime.updates', late.handler);
    open(page([code('a')]));
    await settle();
    closeRuntime();
    late.release();
    await settle();
    expect(state().queue).toEqual([]);
    expect(inputs('runtime.updates')).toHaveLength(1);
});

test('активность: только ввод, не чаще раза в 30 секунд, своей READY-сессии', async () => {
    rpc.on('runtime.updates', () => updates());
    rpc.on('cells.update', () => ok({ hash: 'h1', cell: { id: 'a', kind: 'code', source: '' } }));
    open(page([code('a')]));
    await settle();
    expect(inputs('runtime.activity')).toEqual([]);
    editSource('a', 'x', false);
    editSource('a', 'xy', false);
    await settle();
    expect(inputs('runtime.activity')).toEqual([{ sessionId: SID }]);
});
