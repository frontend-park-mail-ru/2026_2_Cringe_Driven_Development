// Находки итогового ревью: откат текста во время сохранения, ввод во время удаления, повтор сверки.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Cell, NotebookPageData } from '@api/trpc';
import {
    AUTOSAVE_DELAY_MS,
    addCell,
    closeNotebook,
    leaveNotebook,
    structureLocked,
    commitSource,
    deleteCell,
    editSource,
    openNotebook,
    retry,
    useNotebookStore,
} from '@stores/notebook';
import { fakeRpc, held, ok, rpcError, settle } from './fakeRpc';

const md = (id: string, source = ''): Cell => ({ id, kind: 'markdown', source });
const page = (cells: Cell[], hash = 'h0'): NotebookPageData => ({
    notebook: { id: 1, name: 'Блокнот', created_at: '', updated_at: '', hash, cells },
    active_session: null,
    runtime_queue: null,
});

let rpc: ReturnType<typeof fakeRpc>;
const state = () => useNotebookStore.getState();
const paths = () => rpc.calls.map((c) => c.path);
const reply = (hash: string) => (input: unknown) =>
    ok({ hash, cell: { id: (input as { cellId: string }).cellId, kind: 'markdown', source: '' } });

beforeEach(() => {
    rpc = fakeRpc();
});
afterEach(() => {
    closeNotebook();
    rpc.restore();
});

test('откат к исходному тексту, пока update в полёте, — уходит следующим, без ложного «Сохранено»', async () => {
    openNotebook(page([md('a', 'X')]));
    const first = held(ok({ hash: 'h1', cell: { id: 'a', kind: 'markdown', source: 'Xa' } }));
    rpc.on('cells.update', first.handler, reply('h2'));
    editSource('a', 'Xa', false);
    commitSource('a');
    await settle();
    editSource('a', 'X', false);
    commitSource('a');
    first.release();
    await settle();
    expect(rpc.calls.filter((c) => c.path === 'cells.update').map((c) => c.input)).toEqual([
        { notebookId: 1, hash: 'h0', cellId: 'a', source: 'Xa' },
        { notebookId: 1, hash: 'h1', cellId: 'a', source: 'X' },
    ]);
    expect(state().confirmed?.cells[0]?.source).toBe('X');
    expect(state().drafts).toEqual({});
});

test('ввод в ячейку, пока её delete в полёте, — update после delete не уходит, конфликта нет', async () => {
    openNotebook(page([md('a')]));
    const removal = held(ok({ hash: 'h1' }));
    rpc.on('cells.delete', removal.handler);
    rpc.on('cells.update', reply('h9'));
    const deleted = deleteCell('a');
    await settle();
    editSource('a', 'поздний ввод', false);
    await Bun.sleep(AUTOSAVE_DELAY_MS + 50);
    removal.release();
    expect(await deleted).toBe(true);
    await settle();
    expect(paths()).toEqual(['cells.delete']);
    expect(state().conflict).toEqual({ phase: 'none' });
});

test('«Повторить» во время автоматической сверки не запускает вторую', async () => {
    openNotebook(page([md('a')]));
    const snapshot = held(ok(page([md('a', 'x')], 'h1')));
    rpc.on('cells.update', () => 'network');
    rpc.on('notebooks.get', snapshot.handler, () => ok(page([md('a', 'x')], 'h1')));
    editSource('a', 'x', false);
    commitSource('a');
    await settle();
    expect(state().error).toBe('save');
    await Promise.race([retry(), settle()]);
    snapshot.release();
    await settle();
    expect(paths().filter((p) => p === 'notebooks.get')).toHaveLength(1);
    expect(state().conflict).toEqual({ phase: 'none' });
    expect(state().confirmed?.hash).toBe('h1');
});

test('после too_many_cells следующая правка в полёте учитывается — откат не теряется', async () => {
    openNotebook(page([md('a', 'X')]));
    const update = held(ok({ hash: 'h1', cell: { id: 'a', kind: 'markdown', source: 'Xa' } }));
    rpc.on('cells.create', () => rpcError('CONFLICT', 409, 'too_many_cells'));
    rpc.on('cells.update', update.handler, reply('h2'));
    const created = addCell('markdown');
    editSource('a', 'Xa', false);
    commitSource('a');
    expect(await created).toBeUndefined();
    await settle();
    editSource('a', 'X', false);
    commitSource('a');
    update.release();
    await settle();
    expect(state().confirmed?.cells[0]?.source).toBe('X');
});

test('повторная ошибка чтения после «Повторить» снова сообщает об ошибке', async () => {
    openNotebook(page([md('a')]));
    rpc.on('cells.update', () => 'network');
    rpc.on('notebooks.get', () => 'network');
    editSource('a', 'x', false);
    commitSource('a');
    await settle();
    const first = state().failure;
    await retry();
    expect(state().error).toBe('save');
    expect(state().failure).toBeGreaterThan(first);
});

test('уход со страницы сразу отправляет несохранённые правки', async () => {
    openNotebook(page([md('a')]));
    rpc.on('cells.update', reply('h1'));
    editSource('a', 'не успел', false);
    leaveNotebook();
    await settle();
    expect(rpc.calls.filter((c) => c.path === 'cells.update')).toHaveLength(1);
});

test('удаление не прошло — черновик ячейки снова уходит на сохранение', async () => {
    openNotebook(page([md('a')]));
    rpc.on('cells.delete', () => rpcError('FORBIDDEN', 403, 'forbidden'));
    rpc.on('notebooks.get', () => ok(page([md('a')], 'h1')));
    rpc.on('cells.update', reply('h2'));
    editSource('a', 'черновик', false);
    expect(await deleteCell('a')).toBe(false);
    await retry();
    await settle();
    expect(rpc.calls.filter((c) => c.path === 'cells.update').map((c) => c.input)).toEqual([
        { notebookId: 1, hash: 'h1', cellId: 'a', source: 'черновик' },
    ]);
});

test('при ошибке сохранения структурные действия заблокированы', async () => {
    openNotebook(page([md('a')]));
    rpc.on('cells.update', () => 'network');
    rpc.on('notebooks.get', () => 'network');
    editSource('a', 'x', false);
    commitSource('a');
    await settle();
    expect(structureLocked(state())).toBe(true);
});

test('промис операции в полёте завершается при закрытии блокнота', async () => {
    openNotebook(page([md('a')]));
    const removal = held(ok({ hash: 'h1' }));
    rpc.on('cells.delete', removal.handler);
    const deleted = deleteCell('a');
    await settle();
    closeNotebook();
    expect(await deleted).toBe(false);
    removal.release();
});

const other = (): NotebookPageData => ({
    notebook: { id: 2, name: 'Другой', created_at: '', updated_at: '', hash: 'b0', cells: [] },
    active_session: null,
    runtime_queue: null,
});
const updates = () => rpc.calls.filter((c) => c.path === 'cells.update').map((c) => c.input);

test('черновик больше лимита переживает уход и возвращается при открытии блокнота', async () => {
    openNotebook(page([md('a', 'X')]));
    const big = 'a'.repeat(65_537);
    editSource('a', big, false);
    leaveNotebook();
    openNotebook(other());
    openNotebook(page([md('a', 'X')]));
    await settle();
    expect(state().drafts).toEqual({ a: big });
    expect(state().tooLarge).toEqual({ a: true });
    expect(state().status).toBe('dirty');
    expect(updates()).toEqual([]);
});

test('черновик при ошибке сохранения переживает уход и снова уходит при возвращении', async () => {
    openNotebook(page([md('a', 'X')]));
    rpc.on('cells.update', () => 'network', reply('h1'));
    rpc.on('notebooks.get', () => 'network');
    editSource('a', 'мой', false);
    commitSource('a');
    await settle();
    expect(state().error).toBe('save');
    leaveNotebook();
    openNotebook(other());
    openNotebook(page([md('a', 'X')]));
    await settle();
    const sent = { notebookId: 1, hash: 'h0', cellId: 'a', source: 'мой' };
    expect(updates()).toEqual([sent, sent]);
    expect(state().drafts).toEqual({});
});

test('черновик при конфликте переживает уход; блокнот изменился — снова выбор версии', async () => {
    openNotebook(page([md('a', 'X')]));
    rpc.on('cells.update', () => rpcError('CONFLICT', 409, 'notebook_conflict'));
    rpc.on('notebooks.get', () => ok(page([md('a', 'Y')], 'h1')));
    editSource('a', 'мой', false);
    commitSource('a');
    await settle();
    expect(state().conflict.phase).toBe('ready');
    leaveNotebook();
    openNotebook(other());
    openNotebook(page([md('a', 'Y')], 'h1'));
    expect(state().drafts).toEqual({ a: 'мой' });
    expect(state().confirmed?.hash).toBe('h0');
    expect(state().conflict.phase).toBe('ready');
});

test('блокнот без несохранённого при возвращении берётся свежим, без конфликта', () => {
    openNotebook(page([md('a', 'X')]));
    openNotebook(other());
    openNotebook(page([md('a', 'Y')], 'h5'));
    expect(state().confirmed?.hash).toBe('h5');
    expect(state().conflict.phase).toBe('none');
});
