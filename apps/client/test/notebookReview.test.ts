// Находки итогового ревью: откат текста во время сохранения, ввод во время удаления, повтор сверки.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Cell, NotebookPageData } from '@api/trpc';
import {
    AUTOSAVE_DELAY_MS,
    closeNotebook,
    commitSource,
    deleteCell,
    editSource,
    openNotebook,
    retry,
    useNotebookStore,
} from '@stores/notebook';
import { fakeRpc, held, ok } from './fakeRpc';

const md = (id: string, source = ''): Cell => ({ id, kind: 'markdown', source });
const page = (cells: Cell[], hash = 'h0'): NotebookPageData => ({
    notebook: { id: 1, name: 'Блокнот', created_at: '', updated_at: '', hash, cells },
});

let rpc: ReturnType<typeof fakeRpc>;
const state = () => useNotebookStore.getState();
const paths = () => rpc.calls.map((c) => c.path);
const settle = () => Bun.sleep(10);
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
