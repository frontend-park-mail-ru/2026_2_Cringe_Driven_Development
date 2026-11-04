import { create } from '@cdd-team/zustand';
import { isRpcError, trpc, type Cell, type NotebookPageData } from '@api/trpc';
import {
    applyCreate,
    applyDelete,
    applyMove,
    applyUpdate,
    sameStructure,
    utf8Bytes,
    type Snapshot,
} from './snapshot';

/** Лимит исходника ячейки — 64 КиБ в UTF-8. */
export const SOURCE_LIMIT_BYTES = 65_536;
/** Пауза ввода перед автосохранением. */
export const AUTOSAVE_DELAY_MS = 500;
/** Сколько видна подпись «Сохранено». */
export const SAVED_VISIBLE_MS = 4000;

/** Статус сохранения для шапки. */
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

/** Ошибка, о которой нужно сообщить на странице. */
export type NotebookError = 'save' | 'load' | 'notebook_gone' | 'too_many_cells';

/** Конфликт сохранения: пока он не разрешён, фронтовая очередь сохранения стоит. */
export type Conflict =
    | { phase: 'none' }
    | { phase: 'loading' }
    | { phase: 'failed' }
    | { phase: 'ready'; snapshot: Snapshot; dialogOpen: boolean }
    | { phase: 'resolving'; snapshot: Snapshot; choice: 'server' | 'mine' };

interface NotebookState {
    /** Открытый блокнот; null — страница блокнота не открыта */
    notebookId: number | null;
    meta: { name: string; created_at: string; updated_at: string } | null;
    /** Последнее подтверждённое сервером содержимое */
    confirmed: Snapshot | null;
    /** Текст ячеек, отличающийся от подтверждённого */
    drafts: Record<string, string>;
    /** Ячейки с исходником больше лимита: не сохраняются, пока их не сократят */
    tooLarge: Record<string, true>;
    status: SaveStatus;
    /** Идёт или ждёт структурная операция: добавление, перемещение, удаление */
    structureBusy: boolean;
    error: NotebookError | null;
    conflict: Conflict;
}

const empty = (): NotebookState => ({
    notebookId: null,
    meta: null,
    confirmed: null,
    drafts: {},
    tooLarge: {},
    status: 'idle',
    structureBusy: false,
    error: null,
    conflict: { phase: 'none' },
});

/** Стор открытого блокнота: снимок, черновики, очередь сохранения и её статус. */
export const useNotebookStore = create<NotebookState>()(() => empty());

const get = () => useNotebookStore.getState();
const set = (patch: Partial<NotebookState>) => useNotebookStore.setState(patch);

type Op =
    | { type: 'update'; cellId: string; source: string }
    | { type: 'create'; kind: Cell['kind'] }
    | { type: 'move'; cellId: string; index: number }
    | { type: 'delete'; cellId: string };

type Job = { op: Op; done: (result: string | boolean | undefined) => void };

// Поколение меняется при открытии и закрытии блокнота: ответы прежнего в стор не попадают
let generation = 0;
let queue: Job[] = [];
// Поколение, чья очередь сейчас выполняется; null — очередь стоит
let active: number | null = null;
// Операция, результат которой неизвестен после сбоя сети или 5xx: ждёт сверки со снимком
let pending: Job | null = null;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let savedTimer: ReturnType<typeof setTimeout> | undefined;

const clearTimers = (): void => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    clearTimeout(savedTimer);
};

const reset = (): void => {
    generation++;
    clearTimers();
    dropQueue();
};

// Сброс очереди: структурные операции не воспроизводятся, правки снова берутся из черновиков
function dropQueue(): void {
    for (const job of [...queue, ...(pending ? [pending] : [])]) job.done(undefined);
    queue = [];
    pending = null;
}

// Очередь стоит при конфликте и при ошибке, требующей перечитывания
const paused = (): boolean => {
    const { conflict, error } = get();
    return conflict.phase !== 'none' || error === 'save' || error === 'notebook_gone';
};

/**
 * Открывает блокнот: подтверждённый снимок — из bootstrap или `notebooks.get`.
 * @param page данные страницы блокнота
 */
export function openNotebook(page: NotebookPageData): void {
    reset();
    const { id, name, created_at, updated_at, hash, cells } = page.notebook;
    set({
        ...empty(),
        notebookId: id,
        meta: { name, created_at, updated_at },
        confirmed: { hash, cells },
    });
}

/** Закрывает блокнот: ожидающие и поздние ответы больше ничего не меняют. */
export function closeNotebook(): void {
    reset();
    set(empty());
}

const sourceOf = (cellId: string): string | undefined =>
    get().confirmed?.cells.find((c) => c.id === cellId)?.source;

// Статус шапки по текущему состоянию; saved — только когда сохранять больше нечего
const refreshStatus = (justSaved = false): void => {
    const { error, drafts, conflict } = get();
    if (conflict.phase !== 'none') return set({ status: 'conflict' });
    if (error === 'save' || error === 'notebook_gone') return set({ status: 'error' });
    if (active === generation || queue.length > 0) return set({ status: 'saving' });
    if (Object.keys(drafts).length > 0) return set({ status: 'dirty' });
    if (justSaved) {
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => {
            if (get().status === 'saved') set({ status: 'idle' });
        }, SAVED_VISIBLE_MS);
        return set({ status: 'saved' });
    }
    if (get().status !== 'saved') set({ status: 'idle' });
};

/**
 * Ввод пользователя в ячейке. Сохранение — через {@link AUTOSAVE_DELAY_MS} без ввода; во время
 * IME-композиции не отправляется.
 * @param cellId ячейка
 * @param text полный текст
 * @param composing идёт ли IME-композиция
 */
export function editSource(cellId: string, text: string, composing: boolean): void {
    const drafts = { ...get().drafts };
    if (text === sourceOf(cellId)) delete drafts[cellId];
    else drafts[cellId] = text;
    const tooLarge = { ...get().tooLarge };
    if (utf8Bytes(text) > SOURCE_LIMIT_BYTES) tooLarge[cellId] = true;
    else delete tooLarge[cellId];
    set({ drafts, tooLarge });
    clearTimeout(timers.get(cellId));
    timers.delete(cellId);
    if (!composing)
        timers.set(
            cellId,
            setTimeout(() => commitSource(cellId), AUTOSAVE_DELAY_MS),
        );
    refreshStatus();
}

/**
 * Немедленно ставит в очередь ожидающую правку ячейки: выход из редактора, конец IME.
 * @param cellId ячейка
 */
export function commitSource(cellId: string): void {
    clearTimeout(timers.get(cellId));
    timers.delete(cellId);
    const source = get().drafts[cellId];
    if (source === undefined || get().tooLarge[cellId]) return;
    const queued = queue.find((job) => job.op.type === 'update' && job.op.cellId === cellId);
    if (queued) queued.op = { type: 'update', cellId, source };
    else queue.push({ op: { type: 'update', cellId, source }, done: () => {} });
    void run();
}

const structural = (op: Op): Promise<string | boolean | undefined> => {
    const { promise, resolve } = Promise.withResolvers<string | boolean | undefined>();
    queue.push({ op, done: resolve });
    set({ structureBusy: true });
    void run();
    return promise;
};

/**
 * Добавляет пустую ячейку в конец. Ячейка появляется только после подтверждения сервером.
 * @param kind вид ячейки
 * @returns id новой ячейки или `undefined`, если добавить нельзя или не удалось
 */
export async function addCell(kind: Cell['kind']): Promise<string | undefined> {
    if (!get().confirmed || get().structureBusy || paused()) return undefined;
    if (get().error === 'too_many_cells') set({ error: null });
    const result = await structural({ type: 'create', kind });
    return typeof result === 'string' ? result : undefined;
}

/**
 * Перемещает ячейку на одну позицию.
 * @param cellId ячейка
 * @param direction -1 — выше, 1 — ниже
 * @returns подтвердил ли сервер перемещение
 */
export async function moveCell(cellId: string, direction: -1 | 1): Promise<boolean> {
    const cells = get().confirmed?.cells ?? [];
    const index = cells.findIndex((c) => c.id === cellId) + direction;
    if (
        get().structureBusy ||
        paused() ||
        index < 0 ||
        index >= cells.length ||
        index - direction < 0
    ) {
        return false;
    }
    return (await structural({ type: 'move', cellId, index })) === true;
}

/**
 * Удаляет ячейку; её несохранённый текст пропадает только после подтверждения сервером.
 * @param cellId ячейка
 * @returns подтвердил ли сервер удаление
 */
export async function deleteCell(cellId: string): Promise<boolean> {
    if (get().structureBusy || paused() || sourceOf(cellId) === undefined) return false;
    clearTimeout(timers.get(cellId));
    timers.delete(cellId);
    queue = queue.filter((job) => !(job.op.type === 'update' && job.op.cellId === cellId));
    return (await structural({ type: 'delete', cellId })) === true;
}

// Подтверждённая операция: новый снимок, черновик снимается, только если он равен отправленному
function commit(job: Job, confirmed: Snapshot, createdId?: string): void {
    const { op } = job;
    const drafts = { ...get().drafts };
    const tooLarge = { ...get().tooLarge };
    if (op.type === 'update' && drafts[op.cellId] === op.source) delete drafts[op.cellId];
    if (op.type === 'delete') {
        delete drafts[op.cellId];
        delete tooLarge[op.cellId];
    }
    set({ confirmed, drafts, tooLarge });
    job.done(op.type === 'create' ? createdId : true);
}

// Снимок после операции, если она применилась; для create — и id созданной ячейки
function expectedAfter(
    confirmed: Snapshot,
    op: Op,
    server: Snapshot,
): { snapshot: Snapshot; createdId?: string } | null {
    switch (op.type) {
        case 'update':
            return { snapshot: applyUpdate(confirmed, server.hash, op.cellId, op.source) };
        case 'move':
            return { snapshot: applyMove(confirmed, server.hash, op.cellId, op.index) };
        case 'delete':
            return { snapshot: applyDelete(confirmed, server.hash, op.cellId) };
        case 'create': {
            const known = new Set(confirmed.cells.map((c) => c.id));
            const added = server.cells.filter((c) => !known.has(c.id));
            if (added.length !== 1) return null;
            const cell = { id: added[0]!.id, kind: op.kind, source: '' };
            return { snapshot: applyCreate(confirmed, server.hash, cell), createdId: cell.id };
        }
    }
}

// Одна операция с текущим hash; ответ применяется, только если блокнот не сменился
async function execute(job: Job, notebookId: number, hash: string, live: () => boolean) {
    const { op } = job;
    switch (op.type) {
        case 'update': {
            const { cellId, source } = op;
            const res = await trpc.cells.update.mutate({ notebookId, hash, cellId, source });
            if (live()) commit(job, applyUpdate(get().confirmed!, res.hash, cellId, source));
            return;
        }
        case 'create': {
            const { kind } = op;
            const res = await trpc.cells.create.mutate({ notebookId, hash, kind, source: '' });
            const cell = { id: res.cell.id, kind, source: '' };
            if (live()) commit(job, applyCreate(get().confirmed!, res.hash, cell), cell.id);
            return;
        }
        case 'move': {
            const { cellId, index } = op;
            const res = await trpc.cells.move.mutate({ notebookId, hash, cellId, index });
            if (live()) commit(job, applyMove(get().confirmed!, res.hash, cellId, index));
            return;
        }
        case 'delete': {
            const { cellId } = op;
            const res = await trpc.cells.delete.mutate({ notebookId, hash, cellId });
            if (live()) commit(job, applyDelete(get().confirmed!, res.hash, cellId));
            return;
        }
    }
}

const structureQueued = (): boolean => queue.some((j) => j.op.type !== 'update');

// Очередь одного блокнота: строго по одной операции, каждая с hash предыдущего ответа
async function run(): Promise<void> {
    if (active === generation || paused()) return;
    const started = generation;
    const live = () => started === generation;
    active = started;
    refreshStatus();
    while (live() && !paused() && queue.length > 0) {
        const job = queue.shift()!;
        const { notebookId, confirmed } = get();
        if (notebookId === null || !confirmed) break;
        try {
            await execute(job, notebookId, confirmed.hash, live);
        } catch (error) {
            if (!live()) break;
            active = null;
            return failed(job, error);
        }
        if (live() && job.op.type !== 'update') set({ structureBusy: structureQueued() });
    }
    if (active !== started) return;
    active = null;
    if (live()) refreshStatus(!paused());
}

// Категории ошибок, после которых запись могла состояться
const UNKNOWN_RESULT = new Set([
    'BAD_GATEWAY',
    'INTERNAL_SERVER_ERROR',
    'TIMEOUT',
    'SERVICE_UNAVAILABLE',
]);

// Сбой операции. Сеть и 5xx: запись могла состояться — перечитать и сверить, вслепую не повторять
function failed(job: Job, error: unknown): void {
    const code = isRpcError(error) ? error.data?.code : undefined;
    const appCode = isRpcError(error) ? error.data?.appCode : undefined;
    if (appCode === 'too_many_cells') {
        job.done(undefined);
        set({ error: 'too_many_cells', structureBusy: structureQueued() });
        return void run();
    }
    if (appCode === 'notebook_conflict' || code === 'NOT_FOUND') {
        job.done(undefined);
        return void startConflict();
    }
    pending = code === undefined || UNKNOWN_RESULT.has(code) ? job : null;
    if (!pending) job.done(undefined);
    set({ error: 'save' });
    refreshStatus();
    void reconcile();
}

type Loaded = { snapshot: Snapshot } | { error: 'gone' | 'failed' };

// Свежий снимок блокнота; ошибка чтения не стирает экран
async function load(live: () => boolean): Promise<Loaded | null> {
    const id = get().notebookId;
    if (id === null) return null;
    try {
        const { notebook } = await trpc.notebooks.get.query({ id });
        return live() ? { snapshot: { hash: notebook.hash, cells: notebook.cells } } : null;
    } catch (error) {
        if (!live()) return null;
        const gone = isRpcError(error) && error.data?.code === 'NOT_FOUND';
        return { error: gone ? 'gone' : 'failed' };
    }
}

const loadFailed = (result: { error: 'gone' | 'failed' }): void => {
    set({ error: result.error === 'gone' ? 'notebook_gone' : 'save' });
    refreshStatus();
};

// Сверка после сбоя: применилась ли операция и нет ли на сервере чужих изменений
async function reconcile(): Promise<void> {
    const started = generation;
    const result = await load(() => started === generation);
    if (!result) return;
    if ('error' in result) return loadFailed(result);
    const server = result.snapshot;
    const confirmed = get().confirmed!;
    const job = pending;
    pending = null;
    const expected = job ? expectedAfter(confirmed, job.op, server) : null;
    if (job && expected && sameStructure(server, expected.snapshot)) {
        set({ error: null });
        commit(job, server, expected.createdId);
    } else if (sameStructure(server, confirmed)) {
        set({ error: null, confirmed: server });
        if (job) queue.unshift(job);
    } else {
        job?.done(undefined);
        set({ error: null });
        return enterConflict(server);
    }
    set({ structureBusy: structureQueued() });
    if (queue.length > 0) return void run();
    refreshStatus(true);
}

/** Повтор после ошибки сохранения или чтения: снова перечитать и сверить, без слепой записи. */
export async function retry(): Promise<void> {
    if (get().error === 'save') await reconcile();
}

// Конфликт с уже полученным снимком: диалог выбора версии открывается сразу
function enterConflict(snapshot: Snapshot): void {
    dropQueue();
    set({ conflict: { phase: 'ready', snapshot, dialogOpen: true }, structureBusy: false });
    refreshStatus();
}

// 409 notebook_conflict: очередь стоит, черновики остаются, загружается свежий снимок
async function startConflict(): Promise<void> {
    dropQueue();
    set({ conflict: { phase: 'loading' }, structureBusy: false });
    refreshStatus();
    const started = generation;
    const result = await load(() => started === generation);
    if (!result) return;
    if ('error' in result && result.error === 'gone') {
        set({ conflict: { phase: 'none' } });
        return loadFailed(result);
    }
    if ('error' in result) {
        set({ conflict: { phase: 'failed' } });
        return refreshStatus();
    }
    enterConflict(result.snapshot);
}
