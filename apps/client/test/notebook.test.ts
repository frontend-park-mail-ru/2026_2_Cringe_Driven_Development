// Стор блокнота на настоящем клиенте tRPC: черновики, очередь с hash, статусы сохранения.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Cell, NotebookPageData } from '@api/trpc';
import {
    AUTOSAVE_DELAY_MS,
    SAVED_VISIBLE_MS,
    addCell,
    closeNotebook,
    commitSource,
    deleteCell,
    editSource,
    moveCell,
    openNotebook,
    useNotebookStore,
} from '@stores/notebook';
import { fakeRpc, held, ok, settle } from './fakeRpc';

const code = (id: string, source = ''): Cell => ({
    id,
    kind: 'code',
    source,
    outputs: [{ output_type: 'stream', name: 'stdout', text: 'old' }],
    execution_count: 1,
    output_truncated: false,
});
const page = (cells: Cell[], id = 1, hash = 'h0'): NotebookPageData => ({
    notebook: { id, name: 'Блокнот', created_at: '', updated_at: '', hash, cells },
});

let rpc: ReturnType<typeof fakeRpc>;
const state = () => useNotebookStore.getState();
const inputs = (path: string) => rpc.calls.filter((c) => c.path === path).map((c) => c.input);
const wait = (ms: number) => Bun.sleep(ms);
const updated = (hash: string, id: string, source: string) => () =>
    ok({ hash, cell: { id, kind: 'code', source } });

beforeEach(() => {
    rpc = fakeRpc();
});
afterEach(() => {
    closeNotebook();
    rpc.restore();
});

test('ввод: dirty, через 500 мс один update с hash снимка, затем saved и idle', async () => {
    openNotebook(page([code('a', 'x')]));
    rpc.on('cells.update', updated('h1', 'a', 'x1'));
    editSource('a', 'x1', false);
    expect(state().status).toBe('dirty');
    await wait(AUTOSAVE_DELAY_MS - 100);
    expect(inputs('cells.update')).toHaveLength(0);
    await wait(150);
    expect(inputs('cells.update')).toEqual([
        { notebookId: 1, hash: 'h0', cellId: 'a', source: 'x1' },
    ]);
    expect(state().status).toBe('saved');
    expect(state().drafts).toEqual({});
    expect(state().confirmed?.hash).toBe('h1');
    expect(state().confirmed?.cells[0]).toMatchObject({ source: 'x1', outputs: [] });
    await wait(SAVED_VISIBLE_MS + 50);
    expect(state().status).toBe('idle');
});

test('во время IME не отправляется; commitSource отправляет сразу', async () => {
    openNotebook(page([code('a')]));
    rpc.on('cells.update', updated('h1', 'a', 'при'));
    editSource('a', 'при', true);
    await wait(AUTOSAVE_DELAY_MS + 50);
    expect(inputs('cells.update')).toHaveLength(0);
    commitSource('a');
    await settle();
    expect(inputs('cells.update')).toHaveLength(1);
});

test('правка во время запроса: старый ответ не стирает новый текст и не даёт saved', async () => {
    openNotebook(page([code('a')]));
    const first = held(ok({ hash: 'h1', cell: { id: 'a', kind: 'code', source: 'v1' } }));
    rpc.on('cells.update', first.handler, updated('h2', 'a', 'v2'));
    editSource('a', 'v1', false);
    commitSource('a');
    await settle();
    editSource('a', 'v2', false);
    first.release();
    await settle();
    expect(state().drafts).toEqual({ a: 'v2' });
    expect(state().status).not.toBe('saved');
    commitSource('a');
    await settle();
    expect(inputs('cells.update')[1]).toMatchObject({ hash: 'h1', source: 'v2' });
    expect(state().status).toBe('saved');
});

test('правки разных ячеек уходят по очереди с hash предыдущего ответа', async () => {
    openNotebook(page([code('a'), code('b')]));
    const first = held(ok({ hash: 'h1', cell: { id: 'a', kind: 'code', source: '1' } }));
    rpc.on('cells.update', first.handler, updated('h2', 'b', '2'));
    editSource('a', '1', false);
    editSource('b', '2', false);
    commitSource('a');
    commitSource('b');
    await settle();
    expect(inputs('cells.update')).toHaveLength(1);
    first.release();
    await settle();
    expect(inputs('cells.update').map((i) => (i as { hash: string }).hash)).toEqual(['h0', 'h1']);
});

test('ответ update со своим source не подменяет отправленный текст', async () => {
    openNotebook(page([code('a')]));
    rpc.on('cells.update', updated('h1', 'a', 'print(1)'));
    editSource('a', 'мой текст', false);
    commitSource('a');
    await settle();
    expect(state().confirmed?.cells[0]?.source).toBe('мой текст');
});

test('лимит 65 536 байт: больше — не отправляется, ровно — сохраняется', async () => {
    openNotebook(page([code('a')]));
    rpc.on('cells.update', updated('h1', 'a', ''));
    const big = 'я'.repeat(32_768) + 'я';
    editSource('a', big, false);
    commitSource('a');
    await settle();
    expect(inputs('cells.update')).toHaveLength(0);
    expect(state().tooLarge).toEqual({ a: true });
    expect(state().drafts.a).toBe(big);
    editSource('a', 'я'.repeat(32_768), false);
    expect(state().tooLarge).toEqual({});
    commitSource('a');
    await settle();
    expect(inputs('cells.update')).toHaveLength(1);
    expect(state().confirmed?.cells[0]?.source).toHaveLength(32_768);
});

test('addCell: ячейка появляется после ответа, повтор во время запроса не отправляется', async () => {
    openNotebook(page([code('a')]));
    const created = held(ok({ hash: 'h1', cell: { id: 'n1', kind: 'markdown', source: 'x' } }));
    rpc.on('cells.create', created.handler);
    const id = addCell('markdown');
    expect(state().structureBusy).toBe(true);
    expect(await addCell('code')).toBeUndefined();
    expect(state().confirmed?.cells).toHaveLength(1);
    created.release();
    expect(await id).toBe('n1');
    expect(inputs('cells.create')).toEqual([
        { notebookId: 1, hash: 'h0', kind: 'markdown', source: '' },
    ]);
    expect(state().confirmed?.cells.map((c) => [c.id, c.source])).toEqual([
        ['a', ''],
        ['n1', ''],
    ]);
    expect(state().structureBusy).toBe(false);
});

test('addCell с позицией вставляет ячейку между существующими', async () => {
    openNotebook(page([code('a'), code('b')]));
    rpc.on('cells.create', () => ok({ hash: 'h1', cell: { id: 'n1', kind: 'code', source: '' } }));
    expect(await addCell('code', 1)).toBe('n1');
    expect(inputs('cells.create')).toEqual([
        { notebookId: 1, hash: 'h0', kind: 'code', source: '', index: 1 },
    ]);
    expect(state().confirmed?.cells.map((c) => c.id)).toEqual(['a', 'n1', 'b']);
});

test('deleteCell снимает ожидающий update этой ячейки, удаляет черновик после ответа', async () => {
    openNotebook(page([code('a')]));
    rpc.on('cells.delete', () => ok({ hash: 'h1' }));
    rpc.on('cells.update', updated('h9', 'a', ''));
    editSource('a', 'черновик', false);
    expect(await deleteCell('a')).toBe(true);
    await wait(AUTOSAVE_DELAY_MS + 50);
    expect(inputs('cells.update')).toHaveLength(0);
    expect(inputs('cells.delete')).toEqual([{ notebookId: 1, hash: 'h0', cellId: 'a' }]);
    expect(state().confirmed?.cells).toEqual([]);
    expect(state().drafts).toEqual({});
});

test('moveCell: на границе — false без запроса, иначе итоговый индекс и результаты целы', async () => {
    openNotebook(page([code('a', '1'), code('b', '2')]));
    rpc.on('cells.move', () => ok({ hash: 'h1' }));
    expect(await moveCell('a', -1)).toBe(false);
    expect(await moveCell('b', 1)).toBe(false);
    expect(inputs('cells.move')).toHaveLength(0);
    expect(await moveCell('a', 1)).toBe(true);
    expect(inputs('cells.move')).toEqual([{ notebookId: 1, hash: 'h0', cellId: 'a', index: 1 }]);
    expect(state().confirmed?.cells.map((c) => c.id)).toEqual(['b', 'a']);
    expect(state().confirmed?.cells[1]).toMatchObject({ execution_count: 1 });
});

test('ответ после closeNotebook не меняет стор другого блокнота', async () => {
    openNotebook(page([code('a')]));
    const late = held(ok({ hash: 'h1', cell: { id: 'a', kind: 'code', source: 'x' } }));
    rpc.on('cells.update', late.handler);
    editSource('a', 'x', false);
    commitSource('a');
    await settle();
    closeNotebook();
    openNotebook(page([code('z', 'other')], 2, 'g0'));
    late.release();
    await settle();
    expect(state().notebookId).toBe(2);
    expect(state().confirmed).toEqual({ hash: 'g0', cells: [code('z', 'other')] });
    expect(state().status).toBe('idle');
});

test('висящий запрос прежнего блокнота не задерживает сохранение нового', async () => {
    openNotebook(page([code('a')]));
    const late = held(ok({ hash: 'h1', cell: { id: 'a', kind: 'code', source: 'x' } }));
    rpc.on('cells.update', late.handler, updated('g1', 'z', 'y'));
    editSource('a', 'x', false);
    commitSource('a');
    await settle();
    openNotebook(page([code('z')], 2, 'g0'));
    editSource('z', 'y', false);
    commitSource('z');
    await settle();
    expect(inputs('cells.update')[1]).toMatchObject({ notebookId: 2, hash: 'g0' });
    expect(state().confirmed?.hash).toBe('g1');
    late.release();
});
