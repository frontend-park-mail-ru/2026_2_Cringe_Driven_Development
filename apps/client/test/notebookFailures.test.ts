// Стор блокнота: сбой сети и 5xx — сверка с перечитанным снимком, 404, too_many_cells.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Cell, NotebookPageData } from '@api/trpc';
import {
    addCell,
    closeNotebook,
    commitSource,
    editSource,
    openNotebook,
    retry,
    useNotebookStore,
} from '@stores/notebook';
import { fakeRpc, ok, rpcError, settle } from './fakeRpc';

const code = (id: string, source = ''): Cell => ({
    id,
    kind: 'code',
    source,
    outputs: [],
    execution_count: null,
    output_truncated: false,
});
const page = (cells: Cell[], hash = 'h0'): NotebookPageData => ({
    notebook: { id: 1, name: 'Блокнот', created_at: '', updated_at: '', hash, cells },
});

let rpc: ReturnType<typeof fakeRpc>;
const state = () => useNotebookStore.getState();
const inputs = (path: string) => rpc.calls.filter((c) => c.path === path).map((c) => c.input);
const network = () => 'network' as const;
const save = (cellId: string, text: string) => {
    editSource(cellId, text, false);
    commitSource(cellId);
};

beforeEach(() => {
    rpc = fakeRpc();
});
afterEach(() => {
    closeNotebook();
    rpc.restore();
});

test('сеть на update, на сервере ровно наша правка — подтверждено, hash снимка', async () => {
    openNotebook(page([code('a'), code('b')]));
    rpc.on('cells.update', network, () =>
        ok({ hash: 'h9', cell: { id: 'b', kind: 'code', source: '' } }),
    );
    rpc.on('notebooks.get', () => ok(page([code('a', 'x'), code('b')], 'h1')));
    save('a', 'x');
    await settle();
    expect(state().drafts).toEqual({});
    expect(state().confirmed?.hash).toBe('h1');
    expect(state().status).toBe('saved');
    save('b', 'y');
    await settle();
    expect(inputs('cells.update')[1]).toMatchObject({ hash: 'h1', cellId: 'b' });
});

test('сеть на update, на сервере ничего не изменилось — та же правка уходит снова', async () => {
    openNotebook(page([code('a')]));
    rpc.on('cells.update', network, () =>
        ok({ hash: 'h2', cell: { id: 'a', kind: 'code', source: 'x' } }),
    );
    rpc.on('notebooks.get', () => ok(page([code('a')], 'h1')));
    save('a', 'x');
    await settle();
    expect(inputs('cells.update')).toEqual([
        { notebookId: 1, hash: 'h0', cellId: 'a', source: 'x' },
        { notebookId: 1, hash: 'h1', cellId: 'a', source: 'x' },
    ]);
    expect(state().confirmed?.hash).toBe('h2');
});

test('500 на update, в снимке чужие правки — конфликт с готовым снимком, черновик цел', async () => {
    openNotebook(page([code('a'), code('b')]));
    rpc.on('cells.update', () => rpcError('BAD_GATEWAY', 502));
    const foreign = page([code('a'), code('b', 'чужое')], 'h5');
    rpc.on('notebooks.get', () => ok(foreign));
    save('a', 'x');
    await settle();
    expect(state().status).toBe('conflict');
    expect(state().conflict).toMatchObject({ phase: 'ready', dialogOpen: true });
    expect(state().drafts).toEqual({ a: 'x' });
    expect(inputs('notebooks.get')).toHaveLength(1);
});

test('сеть на create: одна новая пустая ячейка нужного вида — подтверждено, id из снимка', async () => {
    openNotebook(page([code('a')]));
    rpc.on('cells.create', network);
    rpc.on('notebooks.get', () => ok(page([code('a'), code('n7')], 'h1')));
    expect(await addCell('code')).toBe('n7');
    expect(state().confirmed?.cells.map((c) => c.id)).toEqual(['a', 'n7']);
    expect(inputs('cells.create')).toHaveLength(1);
});

test('сеть на create: две новые ячейки — конфликт, повтора нет', async () => {
    openNotebook(page([code('a')]));
    rpc.on('cells.create', network);
    rpc.on('notebooks.get', () => ok(page([code('a'), code('n7'), code('n8')], 'h1')));
    expect(await addCell('code')).toBeUndefined();
    expect(state().status).toBe('conflict');
    expect(inputs('cells.create')).toHaveLength(1);
});

test('ошибка перечитывания — error, экран и черновики целы; retry сверяет без слепого повтора', async () => {
    openNotebook(page([code('a')]));
    rpc.on('cells.update', network, () =>
        ok({ hash: 'h2', cell: { id: 'a', kind: 'code', source: 'x' } }),
    );
    rpc.on('notebooks.get', network, () => ok(page([code('a')], 'h1')));
    save('a', 'x');
    await settle();
    expect(state().status).toBe('error');
    expect(state().error).toBe('save');
    expect(state().drafts).toEqual({ a: 'x' });
    expect(state().confirmed?.cells).toEqual([code('a')]);
    expect(inputs('cells.update')).toHaveLength(1);
    await retry();
    await settle();
    expect(inputs('notebooks.get')).toHaveLength(2);
    expect(inputs('cells.update')[1]).toMatchObject({ hash: 'h1' });
    expect(state().error).toBeNull();
});

test('404 на мутацию — как конфликт; 404 блокнота — notebook_gone, черновики видимы', async () => {
    openNotebook(page([code('a')]));
    rpc.on('cells.update', () => rpcError('NOT_FOUND', 404, 'not_found'));
    rpc.on('notebooks.get', () => ok(page([], 'h1')));
    save('a', 'x');
    await settle();
    expect(state().status).toBe('conflict');
    closeNotebook();
    openNotebook(page([code('a')]));
    rpc.on('notebooks.get', () => rpcError('NOT_FOUND', 404, 'not_found'));
    save('a', 'y');
    await settle();
    expect(state().error).toBe('notebook_gone');
    expect(state().drafts).toEqual({ a: 'y' });
});

test('409 too_many_cells — ошибка добавления без конфликта, очередь продолжается', async () => {
    openNotebook(page([code('a')]));
    rpc.on('cells.create', () => rpcError('CONFLICT', 409, 'too_many_cells'));
    rpc.on('cells.update', () => ok({ hash: 'h1', cell: { id: 'a', kind: 'code', source: 'x' } }));
    expect(await addCell('code')).toBeUndefined();
    expect(state().error).toBe('too_many_cells');
    expect(state().conflict).toEqual({ phase: 'none' });
    save('a', 'x');
    await settle();
    expect(state().confirmed?.hash).toBe('h1');
});

test('постоянный 500 при работающем чтении — один автоповтор, дальше ошибка до «Повторить»', async () => {
    openNotebook(page([code('a')]));
    rpc.on('cells.update', () => rpcError('INTERNAL_SERVER_ERROR', 500));
    rpc.on('notebooks.get', () => ok(page([code('a')], 'h0')));
    save('a', 'x');
    await settle();
    expect(inputs('cells.update')).toHaveLength(2);
    expect(inputs('notebooks.get')).toHaveLength(2);
    expect(state().error).toBe('save');
    expect(state().status).toBe('error');
    expect(state().drafts).toEqual({ a: 'x' });
    await retry();
    await settle();
    expect(inputs('cells.update')).toHaveLength(3);
    expect(inputs('notebooks.get')).toHaveLength(4);
    expect(state().error).toBe('save');
    expect(state().drafts).toEqual({ a: 'x' });
});

test('413 и прежний снимок — ошибка и черновик остаются; «Повторить» снова сохраняет', async () => {
    openNotebook(page([code('a')]));
    rpc.on(
        'cells.update',
        () => rpcError('PAYLOAD_TOO_LARGE', 413, 'payload_too_large'),
        () => ok({ hash: 'h1', cell: { id: 'a', kind: 'code', source: 'y' } }),
    );
    rpc.on('notebooks.get', () => ok(page([code('a')], 'h0')));
    save('a', 'x');
    await settle();
    expect(inputs('cells.update')).toHaveLength(1);
    expect(state().error).toBe('save');
    expect(state().status).toBe('error');
    expect(state().drafts).toEqual({ a: 'x' });
    editSource('a', 'y', false);
    await retry();
    await settle();
    expect(inputs('cells.update')[1]).toMatchObject({ hash: 'h0', cellId: 'a', source: 'y' });
    expect(state().error).toBeNull();
    expect(state().drafts).toEqual({});
    expect(state().status).toBe('saved');
});
