// Стор блокнота: конфликт сохранения, выбор версии, ожидание сохранения перед запуском.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Cell, NotebookPageData } from '@api/trpc';
import {
    addCell,
    closeConflictDialog,
    closeNotebook,
    commitSource,
    deleteCell,
    dismissOrphan,
    editSource,
    flush,
    moveCell,
    onEdit,
    onSaved,
    openConflictDialog,
    openNotebook,
    resolveConflict,
    retryConflictLoad,
    structureLocked,
    useNotebookStore,
} from '@stores/notebook';
import { fakeRpc, held, ok, rpcError, settle } from './fakeRpc';

const md = (id: string, source = ''): Cell => ({ id, kind: 'markdown', source });
const page = (cells: Cell[], hash = 'h0'): NotebookPageData => ({
    notebook: { id: 1, name: 'Блокнот', created_at: '', updated_at: '', hash, cells },
});

let rpc: ReturnType<typeof fakeRpc>;
const state = () => useNotebookStore.getState();
const inputs = (path: string) => rpc.calls.filter((c) => c.path === path).map((c) => c.input);
const conflict = () => rpcError('CONFLICT', 409, 'notebook_conflict');
const saved = (hash: string) => (input: unknown) =>
    ok({
        hash,
        cell: { id: (input as { cellId: string }).cellId, kind: 'markdown', source: '' },
    });
const save = (cellId: string, text: string) => {
    editSource(cellId, text, false);
    commitSource(cellId);
};
// Конфликт при сохранении a; на сервере b изменили, c удалили
const server = page([md('a'), md('b', 'чужое')], 'h5');
async function inConflict() {
    openNotebook(page([md('a'), md('b'), md('c')]));
    rpc.on('notebooks.get', () => ok(server));
    rpc.on('cells.update', conflict, saved('h6'), saved('h7'));
    editSource('c', 'черновик c', false);
    save('a', 'мой a');
    await settle();
}

beforeEach(() => {
    rpc = fakeRpc();
});
afterEach(() => {
    closeNotebook();
    rpc.restore();
});

test('409: загрузка снимка, затем диалог; очередь на паузе, черновики целы', async () => {
    openNotebook(page([md('a')]));
    const snapshot = held(ok(server));
    rpc.on('notebooks.get', snapshot.handler);
    rpc.on('cells.update', conflict);
    save('a', 'x');
    await settle();
    expect(state().conflict).toEqual({ phase: 'loading' });
    expect(state().status).toBe('conflict');
    save('a', 'xy');
    await settle();
    expect(inputs('cells.update')).toHaveLength(1);
    snapshot.release();
    await settle();
    expect(state().conflict).toMatchObject({ phase: 'ready', dialogOpen: true });
    expect(state().drafts).toEqual({ a: 'xy' });
});

test('ошибка снимка — failed; retryConflictLoad снова загружает', async () => {
    openNotebook(page([md('a')]));
    rpc.on(
        'notebooks.get',
        () => 'network',
        () => ok(server),
    );
    rpc.on('cells.update', conflict);
    save('a', 'x');
    await settle();
    expect(state().conflict).toEqual({ phase: 'failed' });
    await retryConflictLoad();
    expect(state().conflict).toMatchObject({ phase: 'ready' });
});

test('закрытие диалога без выбора: очередь стоит, открытие — снова диалог', async () => {
    await inConflict();
    closeConflictDialog();
    expect(state().conflict).toMatchObject({ phase: 'ready', dialogOpen: false });
    expect(state().status).toBe('conflict');
    save('a', 'ещё');
    await settle();
    expect(inputs('cells.update')).toHaveLength(1);
    openConflictDialog();
    expect(state().conflict).toMatchObject({ phase: 'ready', dialogOpen: true });
});

test('пока конфликт: структурные действия недоступны без запроса', async () => {
    await inConflict();
    expect(structureLocked(state())).toBe(true);
    expect(await addCell('code')).toBeUndefined();
    expect(await moveCell('a', 1)).toBe(false);
    expect(await deleteCell('a')).toBe(false);
    expect(
        rpc.calls.filter((c) => c.path !== 'cells.update' && c.path !== 'notebooks.get'),
    ).toEqual([]);
});

test('«Загрузить серверную версию»: снимок, черновики и очередь отброшены', async () => {
    await inConflict();
    expect(await resolveConflict('server')).toBe(true);
    expect(state().confirmed).toEqual({ hash: 'h5', cells: server.notebook.cells });
    expect(state().drafts).toEqual({});
    expect(state().orphans).toEqual([]);
    expect(state().conflict).toEqual({ phase: 'none' });
    await settle();
    expect(inputs('cells.update')).toHaveLength(1);
});

test('«Сохранить мой текст»: по очереди с hash снимка, удалённая ячейка — в orphans', async () => {
    await inConflict();
    const done = resolveConflict('mine');
    expect(state().conflict).toMatchObject({ phase: 'resolving' });
    expect(await done).toBe(true);
    expect(inputs('cells.update').slice(1)).toEqual([
        { notebookId: 1, hash: 'h5', cellId: 'a', source: 'мой a' },
    ]);
    expect(state().confirmed?.cells.map((c) => [c.id, c.source])).toEqual([
        ['a', 'мой a'],
        ['b', 'чужое'],
    ]);
    expect(state().orphans).toEqual([
        { cellId: 'c', kind: 'markdown', text: 'черновик c', index: 2 },
    ]);
    expect(state().conflict).toEqual({ phase: 'none' });
    dismissOrphan('c');
    expect(state().orphans).toEqual([]);
});

test('повторный 409 во время «Сохранить мой текст» — снова снимок и диалог, черновики целы', async () => {
    await inConflict();
    rpc.on('cells.update', conflict);
    rpc.on('notebooks.get', () => ok(page([md('a', 'ещё чужое'), md('b')], 'h8')));
    expect(await resolveConflict('mine')).toBe(false);
    await settle();
    expect(state().conflict).toMatchObject({ phase: 'ready', dialogOpen: true });
    expect(state().drafts.a).toBe('мой a');
});

test('старые move и delete после разрешения не уходят', async () => {
    openNotebook(page([md('a'), md('b')]));
    rpc.on('cells.move', conflict);
    rpc.on('notebooks.get', () => ok(page([md('a'), md('b')], 'h5')));
    expect(await moveCell('a', 1)).toBe(false);
    await settle();
    await resolveConflict('server');
    await settle();
    expect(inputs('cells.move')).toHaveLength(1);
});

test('flush: без правок — ok сразу; ожидающая правка уходит без 500 мс', async () => {
    openNotebook(page([md('a')]));
    expect(await flush()).toEqual({ ok: true });
    rpc.on('cells.update', saved('h1'));
    editSource('a', 'x', false);
    const started = Date.now();
    expect(await flush(['a'])).toEqual({ ok: true });
    expect(Date.now() - started).toBeLessThan(400);
    expect(inputs('cells.update')).toHaveLength(1);
});

test('flush: конфликт во время ожидания — отказ, разрешение его не возобновляет', async () => {
    openNotebook(page([md('a')]));
    rpc.on('cells.update', conflict);
    rpc.on('notebooks.get', () => ok(page([md('a')], 'h5')));
    editSource('a', 'x', false);
    let settled = 0;
    const result = flush(['a']).then((r) => {
        settled++;
        return r;
    });
    expect(await result).toEqual({ ok: false, reason: 'conflict' });
    await resolveConflict('server');
    await settle();
    expect(settled).toBe(1);
});

test('flush: новый ввод выбранной ячейки во время ожидания — edited', async () => {
    openNotebook(page([md('a')]));
    const slow = held(ok({ hash: 'h1', cell: { id: 'a', kind: 'markdown', source: 'x' } }));
    rpc.on('cells.update', slow.handler, saved('h2'));
    editSource('a', 'x', false);
    const result = flush(['a']);
    await settle();
    editSource('a', 'xy', false);
    slow.release();
    expect(await result).toEqual({ ok: false, reason: 'edited' });
});

test('flush: лимит — too_large; сбой без сверки — error', async () => {
    openNotebook(page([md('a'), md('b')]));
    editSource('a', 'я'.repeat(40_000), false);
    expect(await flush(['a'])).toEqual({ ok: false, reason: 'too_large' });
    rpc.on('cells.update', () => 'network');
    rpc.on('notebooks.get', () => 'network');
    editSource('b', 'y', false);
    expect(await flush(['b'])).toEqual({ ok: false, reason: 'error' });
});

test('onEdit — на ввод, не на открытие и снимок; onSaved — на каждое подтверждение', async () => {
    const edits: string[] = [];
    const saves: string[] = [];
    const offEdit = onEdit((cellId) => edits.push(cellId));
    const offSaved = onSaved((snapshot) => saves.push(snapshot.hash));
    openNotebook(page([md('a')]));
    rpc.on('cells.update', saved('h1'), saved('h2'));
    save('a', 'x');
    await settle();
    save('a', 'xy');
    await settle();
    expect(edits).toEqual(['a', 'a']);
    expect(saves).toEqual(['h1', 'h2']);
    offEdit();
    offSaved();
});

test('«Сохранить мой текст» с черновиком больше лимита — не успех, черновик цел и не отправлен', async () => {
    await inConflict();
    editSource('a', 'я'.repeat(40_000), false);
    expect(await resolveConflict('mine')).toBe(false);
    expect(inputs('cells.update')).toHaveLength(1);
    expect(state().conflict).toEqual({ phase: 'none' });
    expect(state().drafts.a).toHaveLength(40_000);
    expect(state().status).toBe('dirty');
});

test('«Сохранить мой текст»: обычная правка уходит, но большой черновик соседней ячейки — не успех', async () => {
    openNotebook(page([md('a'), md('b')]));
    rpc.on('notebooks.get', () => ok(page([md('a'), md('b', 'чужое')], 'h5')));
    rpc.on('cells.update', conflict, saved('h6'));
    editSource('b', 'я'.repeat(40_000), false);
    save('a', 'мой a');
    await settle();
    expect(await resolveConflict('mine')).toBe(false);
    expect(inputs('cells.update').slice(1)).toEqual([
        { notebookId: 1, hash: 'h5', cellId: 'a', source: 'мой a' },
    ]);
    expect(state().drafts.b).toHaveLength(40_000);
    expect(state().status).toBe('dirty');
});
